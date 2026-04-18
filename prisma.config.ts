import { defineConfig } from "prisma/config";
import "dotenv/config";

// Prisma 7 moved datasource URLs out of schema.prisma and into this file.
// The CLI (`db push`, `migrate`) reads `datasource.url`. The runtime client
// gets its connection from `new PrismaPg({ connectionString: ... })` in
// src/lib/db.ts — see https://pris.ly/d/prisma7-client-config
//
// We point the CLI at DIRECT_URL (un-pooled) so DDL isn't routed through
// PgBouncer.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
