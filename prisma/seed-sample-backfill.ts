// Backfill the sample property into every existing org that doesn't
// already have one.
//
// New-org sign-ins auto-seed via /api/auth/verify, so this script only
// needs to catch the orgs that were created before the auto-seed shipped
// (i.e. Tommy's own takeoffmonkey.com org, Tyler's Strata Landscape
// dev org, and anyone else who'd signed up previously).
//
// Idempotent: seedSampleProject bails if a sample property already
// exists on the org, so running this twice is a no-op.
//
// Usage:
//   npm run db:seed:sample-backfill
//
// Reads DATABASE_URL from .env — same env Prisma Studio + db:push use.

import { db } from "../src/lib/db";
import { seedSampleProject } from "../src/lib/sample-seed";

async function main() {
  try {
    const orgs = await db.org.findMany({
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    console.log(`[sample-backfill] scanning ${orgs.length} orgs`);

    for (const org of orgs) {
      // Pick an admin user on the org to own the seeded rows (Property
      // files, audits, etc. all need an uploadedBy / auditor user id).
      // Fall back to any user on the org if there's no admin yet.
      const user =
        (await db.user.findFirst({
          where: { orgId: org.id, role: "admin" },
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true },
        })) ??
        (await db.user.findFirst({
          where: { orgId: org.id },
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true },
        }));

      if (!user) {
        console.warn(
          `[sample-backfill] org ${org.id} (${org.name}) has no users — skipping`,
        );
        continue;
      }

      const existing = await db.property.findFirst({
        where: {
          orgId: org.id,
          metadata: { path: ["isSample"], equals: true },
        },
        select: { id: true },
      });
      if (existing) {
        console.log(
          `[sample-backfill] ${org.name}: sample already present, skipping`,
        );
        continue;
      }

      await seedSampleProject(db, org.id, user.id);
      console.log(
        `[sample-backfill] ${org.name}: seeded (owner ${user.email})`,
      );
    }

    console.log("[sample-backfill] done");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
