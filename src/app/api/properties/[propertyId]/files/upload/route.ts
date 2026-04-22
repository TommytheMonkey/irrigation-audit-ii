import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import type { FileCategory } from "@prisma/client";

export const runtime = "nodejs";

const VALID_CATEGORIES = new Set([
  "DRAWINGS",
  "CUTSHEET",
  "MANUAL",
  "PHOTO",
  "OTHER",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ propertyId: string }> },
): Promise<Response> {
  const { propertyId } = await params;
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const auth = await requireEditor();
        if (!auth.ok) throw new Error("unauthorized");

        const prop = await db.property.findFirst({
          where: { id: propertyId, orgId: auth.user.orgId },
          select: { id: true },
        });
        if (!prop) throw new Error("property_not_found");

        const payload = parsePayload(clientPayload);

        return {
          allowedContentTypes: [
            "image/*",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "text/plain",
            "text/csv",
          ],
          maximumSizeInBytes: 100 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId: auth.user.id,
            propertyId,
            category: payload.category ?? "OTHER",
            filename: _pathname.split("/").pop() ?? _pathname,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        const p = JSON.parse(tokenPayload) as {
          userId: string;
          propertyId: string;
          category: string;
          filename: string;
        };
        try {
          await db.propertyFile.create({
            data: {
              propertyId: p.propertyId,
              uploadedById: p.userId,
              fileName: p.filename,
              mimeType: blob.contentType ?? "application/octet-stream",
              fileSize: 0,
              category: (VALID_CATEGORIES.has(p.category)
                ? p.category
                : "OTHER") as FileCategory,
              blobUrl: blob.url,
              blobPathname: blob.pathname,
            },
          });
        } catch (e) {
          console.error("[property-files/upload] persist failed:", e);
        }
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[property-files/upload] handshake failed:", e);
    return NextResponse.json(
      {
        error: "upload_failed",
        message: e instanceof Error ? e.message : "Upload failed",
      },
      { status: 400 },
    );
  }
}

function parsePayload(raw: string | null): { category?: string } {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { category?: string };
  } catch {
    return {};
  }
}
