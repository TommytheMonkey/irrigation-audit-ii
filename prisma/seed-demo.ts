// DEV-ONLY demo seed: a single org, a single auditor, and three realistic
// properties so we can build the audit flow without auth/Monday integration.
//
// Run with:  npm run db:seed:demo
//
// Idempotent — re-running upserts the same rows. Strip this (and the matching
// db:seed:demo script) once real auth + Monday sync land. Search the repo for
// "DEMO_" or "DEV-ONLY" before shipping to find anything that needs ripping out.

import { db } from "../src/lib/db";

const DEMO_ORG_DOMAIN = "stratalandscape.com";
const DEMO_USER_EMAIL = "tyler@stratalandscape.com";

async function main() {
  console.log("Seeding demo org…");
  const org = await db.org.upsert({
    where: { emailDomain: DEMO_ORG_DOMAIN },
    update: { name: "Strata Landscape", onboardingComplete: true },
    create: {
      name: "Strata Landscape",
      emailDomain: DEMO_ORG_DOMAIN,
      brandColorPrimary: "#1e6f3a",
      // Demo org skips the wizard so /login → / works without detour.
      onboardingComplete: true,
    },
  });
  console.log(`  ✓ org ${org.id}`);

  console.log("Seeding demo user…");
  // Tyler is the demo org owner — admin so he can hit settings tabs.
  const user = await db.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: "Tyler Demo", orgId: org.id, role: "admin" },
    create: {
      orgId: org.id,
      email: DEMO_USER_EMAIL,
      name: "Tyler Demo",
      role: "admin",
    },
  });
  console.log(`  ✓ user ${user.id}`);

  console.log("Seeding demo properties…");
  const properties = [
    {
      mondayItemId: "demo-1",
      name: "Austin Oaks HOA",
      address: "123 Live Oak Dr, Austin TX",
      propertyManagerName: "Sarah Chen",
      propertyManagerEmail: "sarah@austinpm.com",
      propertyManagerPhone: "512-555-0142",
    },
    {
      mondayItemId: "demo-2",
      name: "Lakewood Business Park",
      address: "4500 Lakewood Blvd, Dallas TX",
      propertyManagerName: "Mike Torres",
      propertyManagerEmail: "mike@lakewoodmgmt.com",
      propertyManagerPhone: "214-555-0188",
    },
    {
      mondayItemId: "demo-3",
      name: "Riverside Townhomes",
      address: "890 River Rd, San Antonio TX",
      propertyManagerName: "Lisa Park",
      propertyManagerEmail: "lisa@riversidepm.com",
      propertyManagerPhone: "210-555-0167",
    },
  ];
  for (const p of properties) {
    await db.property.upsert({
      where: { orgId_mondayItemId: { orgId: org.id, mondayItemId: p.mondayItemId } },
      update: {
        name: p.name,
        address: p.address,
        propertyManagerName: p.propertyManagerName,
        propertyManagerEmail: p.propertyManagerEmail,
        propertyManagerPhone: p.propertyManagerPhone,
      },
      create: { orgId: org.id, ...p },
    });
  }
  console.log(`  ✓ ${properties.length} properties`);

  console.log("Demo seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
