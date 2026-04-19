import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/lib/db";
import {
  assertSystemInOrg,
  assertSubInOrg,
  requireEditor,
} from "@/lib/system-profile-auth";

export const runtime = "nodejs";

// POST /api/property-files/upload
//
// Handles the @vercel/blob/client upload handshake in one route:
//   1. Client calls `upload()` which first POSTs here with type=blob.generate-client-token
//   2. We validate the user + system, return a short-lived upload token
//   3. Client uploads directly to Blob (bypassing Vercel's 4.5 MB body limit)
//   4. Blob calls back here with type=blob.upload-completed; we persist the
//      SystemFile row tied to the systemId/zoneId embedded in tokenPayload
//
// `clientPayload` comes from the browser — never trust it for auth; we
// re-verify systemId/zoneId ownership every time.
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const auth = await requireEditor();
        if (!auth.ok) throw new Error("unauthorized");

        const payload = parseClientPayload(clientPayload);
        if (!payload.systemId) throw new Error("missing systemId");

        const ownsSystem = await assertSystemInOrg(
          payload.systemId,
          auth.user.orgId,
        );
        if (ownsSystem !== true) throw new Error("system_not_found");

        if (payload.zoneId) {
          const ownsZone = await assertSubInOrg(
            "zone",
            payload.zoneId,
            auth.user.orgId,
          );
          if (ownsZone !== true) throw new Error("zone_not_found");
        }

        return {
          allowedContentTypes: [
            "image/*",
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.ms-excel",
            "text/plain",
            "text/csv",
            "application/zip",
            "message/rfc822",
          ],
          // 100 MB — Blob's hard limit is far higher but this keeps one
          // rogue upload from eating the quota.
          maximumSizeInBytes: 100 * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId: auth.user.id,
            systemId: payload.systemId,
            zoneId: payload.zoneId ?? null,
            tags: payload.tags ?? [],
            description: payload.description ?? null,
            filename: pathname.split("/").pop() ?? pathname,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) return;
        const p = JSON.parse(tokenPayload) as {
          userId: string;
          systemId: string;
          zoneId: string | null;
          tags: string[];
          description: string | null;
          filename: string;
        };
        try {
          await db.systemFile.create({
            data: {
              systemId: p.systemId,
              zoneId: p.zoneId,
              uploadedById: p.userId,
              filename: p.filename,
              mimeType: blob.contentType ?? "application/octet-stream",
              sizeBytes: 0, // Blob's onUploadCompleted doesn't include size in all SDK versions.
              blobUrl: blob.url,
              blobPathname: blob.pathname,
              tags: p.tags,
              description: p.description,
            },
          });
        } catch (e) {
          // The upload webhook MUST return 200 quickly or Blob retries. If
          // persistence fails we log and swallow — the client will see the
          // file missing on refresh and can re-upload.
          console.error("[property-files/upload] persist failed:", e);
        }
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[property-files/upload] handshake failed:", e);
    return NextResponse.json(
      { error: "upload_failed", message: e instanceof Error ? e.message : "Upload failed" },
      { status: 400 },
    );
  }
}

function parseClientPayload(raw: string | null): {
  systemId?: string;
  zoneId?: string;
  tags?: string[];
  description?: string;
} {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ReturnType<typeof parseClientPayload>;
  } catch {
    return {};
  }
}
