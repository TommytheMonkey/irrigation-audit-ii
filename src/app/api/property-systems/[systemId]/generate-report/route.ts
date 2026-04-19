import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { db } from "@/lib/db";
import { assertSystemInOrg, requireEditor } from "@/lib/system-profile-auth";
import { loadReportData, DEFAULT_SECTIONS, type ReportOptions } from "@/lib/report-data";
import { ReportDocument } from "@/lib/report-pdf";

export const runtime = "nodejs";
// Rendering a PDF with photos + multi-page sections + Claude-sized audits
// can hit ~20-30s. Give it room.
export const maxDuration = 60;

// POST /api/property-systems/[systemId]/generate-report
// Body: { auditId?: string, sections?: ReportSections, title?: string }
//
// Builds report data, renders a PDF via @react-pdf/renderer, uploads to
// Vercel Blob, then drops a SystemFile row so the report appears in the
// Files tab alongside everything else. Returns the Blob URL for an
// immediate download in the client.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ systemId: string }> },
) {
  const { systemId } = await params;
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }
  const owns = await assertSystemInOrg(systemId, auth.user.orgId);
  if (owns !== true) {
    return NextResponse.json(owns.body, { status: owns.status });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "not_configured", message: "Blob storage isn't configured." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    auditId?: string;
    sections?: Partial<ReportOptions["sections"]>;
    title?: string;
  };

  const opts: ReportOptions = {
    systemId,
    auditId: body.auditId,
    sections: { ...DEFAULT_SECTIONS, ...(body.sections ?? {}) },
    title: body.title,
  };

  const data = await loadReportData(auth.user.orgId, opts);
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let pdfBuffer: Buffer;
  try {
    // renderToBuffer expects a <Document> element. ReportDocument returns
    // one at runtime, but TS only sees the wrapper's prop type — cast so
    // the library signature accepts it.
    const element = ReportDocument({ data }) as ReactElement<DocumentProps>;
    pdfBuffer = await renderToBuffer(element);
  } catch (e) {
    console.error("[generate-report] render failed:", e);
    return NextResponse.json(
      {
        error: "render_failed",
        message: e instanceof Error ? e.message : "PDF render failed.",
      },
      { status: 500 },
    );
  }

  const filename = buildFilename(data.property.name, data.system.name);
  const blobKey = `orgs/${auth.user.orgId}/reports/${Date.now()}-${filename}`;

  let blob;
  try {
    blob = await put(blobKey, pdfBuffer, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: false,
    });
  } catch (e) {
    console.error("[generate-report] blob put failed:", e);
    return NextResponse.json(
      { error: "upload_failed", message: "Couldn't save the PDF." },
      { status: 502 },
    );
  }

  const tags = ["report"];
  if (opts.auditId) tags.push("audit");

  const file = await db.systemFile.create({
    data: {
      systemId,
      uploadedById: auth.user.id,
      filename,
      mimeType: "application/pdf",
      sizeBytes: pdfBuffer.length,
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      tags,
      description: opts.auditId
        ? `Report generated from audit ${opts.auditId}`
        : "Report generated from system profile",
    },
  });

  return NextResponse.json({
    ok: true,
    fileId: file.id,
    url: blob.url,
    filename,
    sizeBytes: pdfBuffer.length,
  });
}

function buildFilename(propertyName: string, systemName: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `${slug(propertyName)}-${slug(systemName)}-${date}.pdf`;
}
