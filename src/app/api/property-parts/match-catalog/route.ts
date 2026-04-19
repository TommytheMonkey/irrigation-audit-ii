import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/system-profile-auth";
import { matchPart } from "@/lib/catalog-matcher";

// POST /api/property-parts/match-catalog
// Body: { systemId?: string }
//
// Re-run the catalog matcher across property parts in the caller's org.
// Optional systemId narrows to a single system. Only fills in parts that
// don't already have a catalogSymbol set — so an admin who manually
// adjusted a match won't have it clobbered.
export async function POST(req: Request) {
  const auth = await requireEditor();
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const body = (await req.json().catch(() => ({}))) as { systemId?: string };

  const parts = await db.propertyPart.findMany({
    where: {
      catalogSymbol: null,
      system: {
        orgId: auth.user.orgId,
        ...(body.systemId ? { id: body.systemId } : {}),
      },
    },
    select: { id: true, brand: true, model: true, size: true },
  });

  let matched = 0;
  for (const p of parts) {
    const hit = matchPart(p.brand, p.model, p.size);
    if (!hit) continue;
    await db.propertyPart.update({
      where: { id: p.id },
      data: {
        catalogSource: hit.source,
        catalogSymbol: hit.symbol,
      },
    });
    matched++;
  }

  return NextResponse.json({
    ok: true,
    scanned: parts.length,
    matched,
    unmatched: parts.length - matched,
  });
}
