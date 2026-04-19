// Assemble everything a report template needs in one DB roundtrip set.
// Shape here is the contract: anything a PDF or HTML email renders pulls
// from ReportData. New display options → new fields here, never inline
// Prisma queries in templates.

import { db } from "./db";
import type {
  PropertyController,
  PropertyPart,
  PropertySystem,
  PropertyWaterSource,
  PropertyZone,
  Property,
  Org,
} from "@prisma/client";

export type ReportSections = {
  zones: boolean;
  parts: boolean;
  auditFindings: boolean;
  photos: boolean;
};

export const DEFAULT_SECTIONS: ReportSections = {
  zones: true,
  parts: true,
  auditFindings: true,
  photos: true,
};

export type ReportOptions = {
  systemId: string;
  auditId?: string; // optional audit to pull findings/photos from
  sections: ReportSections;
  title?: string; // override the default "Irrigation System Report"
};

export type ReportData = {
  title: string;
  generatedAt: Date;

  org: Pick<
    Org,
    "name" | "primaryLogoUrl" | "brandColorPrimary" | "brandColorSecondary"
  >;

  property: Pick<
    Property,
    | "name"
    | "address"
    | "city"
    | "state"
    | "zip"
    | "propertyManagerName"
    | "propertyManagerEmail"
    | "propertyManagerPhone"
  >;

  system: PropertySystem & {
    controllers: PropertyController[];
    waterSources: PropertyWaterSource[];
  };

  zones: PropertyZone[];
  parts: PropertyPart[];

  audit: {
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    status: string;
    auditorName: string | null;
    findings: Array<{
      id: string;
      zoneNumber: number | null;
      zoneName: string | null;
      issueType: string;
      componentCategory: string;
      componentSubtype: string | null;
      severity: string;
      solutionAction: string;
      quantity: string | null;
      unitOfMeasure: string;
      description: string | null;
      recommendation: string | null;
      photoUrls: string[];
    }>;
  } | null;

  sections: ReportSections;
};

export async function loadReportData(
  orgId: string,
  opts: ReportOptions,
): Promise<ReportData | null> {
  const system = await db.propertySystem.findFirst({
    where: { id: opts.systemId, orgId },
    include: {
      controllers: { orderBy: { sortOrder: "asc" } },
      waterSources: { orderBy: { sortOrder: "asc" } },
      zones: { orderBy: { zoneNumber: "asc" } },
      parts: { orderBy: { createdAt: "asc" } },
      property: true,
      org: {
        select: {
          name: true,
          primaryLogoUrl: true,
          brandColorPrimary: true,
          brandColorSecondary: true,
        },
      },
    },
  });
  if (!system) return null;

  const audit = opts.auditId
    ? await db.audit.findFirst({
        where: { id: opts.auditId, orgId, propertyId: system.propertyId },
        select: {
          id: true,
          startedAt: true,
          completedAt: true,
          status: true,
          auditor: { select: { name: true, email: true } },
          findings: {
            orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
            select: {
              id: true,
              issueType: true,
              componentCategory: true,
              componentSubtype: true,
              severity: true,
              solutionAction: true,
              quantity: true,
              unitOfMeasure: true,
              description: true,
              recommendation: true,
              photoUrls: true,
              zone: {
                select: { zoneNumber: true, zoneName: true },
              },
            },
          },
        },
      })
    : null;

  return {
    title: opts.title?.trim() || "Irrigation System Report",
    generatedAt: new Date(),

    org: system.org,
    property: system.property,
    system: {
      ...system,
      controllers: system.controllers,
      waterSources: system.waterSources,
    },
    zones: system.zones,
    parts: system.parts,

    audit: audit
      ? {
          id: audit.id,
          startedAt: audit.startedAt,
          completedAt: audit.completedAt,
          status: audit.status,
          auditorName: audit.auditor?.name ?? audit.auditor?.email ?? null,
          findings: audit.findings.map((f) => ({
            id: f.id,
            zoneNumber: f.zone?.zoneNumber ?? null,
            zoneName: f.zone?.zoneName ?? null,
            issueType: f.issueType,
            componentCategory: f.componentCategory,
            componentSubtype: f.componentSubtype,
            severity: f.severity,
            solutionAction: f.solutionAction,
            quantity: f.quantity !== null ? f.quantity.toString() : null,
            unitOfMeasure: f.unitOfMeasure,
            description: f.description,
            recommendation: f.recommendation,
            photoUrls: f.photoUrls,
          })),
        }
      : null,

    sections: opts.sections,
  };
}
