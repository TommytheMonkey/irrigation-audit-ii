// PDF template rendered with @react-pdf/renderer. Pure server-side;
// consumed by /api/property-systems/[id]/generate-report via
// renderToBuffer(). Styling uses brand colors from the org.
//
// Keep visual logic here; data-shape logic in report-data.ts. New report
// sections = new sub-components here + a toggle in ReportSections.

import React from "react";
import path from "node:path";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  Font,
} from "@react-pdf/renderer";
import type { ReportData } from "./report-data";

// Takeo attribution icon for the footer. Lives in public/ so it ships
// with the deploy; @react-pdf reads it from disk at render time, no HTTP
// fetch needed.
const TAKEO_FOOTER_ICON = path.join(
  process.cwd(),
  "public",
  "takeo-footer-icon.jpg",
);

Font.register({
  family: "Helvetica",
  fonts: [
    { src: "Helvetica", fontWeight: "normal" },
    { src: "Helvetica-Bold", fontWeight: "bold" },
  ],
});

type BrandColors = { primary: string; primaryFg: string; secondary: string };

function resolveColors(
  brandColorPrimary: string | null,
  brandColorSecondary: string | null,
): BrandColors {
  const primary = brandColorPrimary ?? "#00391F";
  const secondary = brandColorSecondary ?? "#F5ED60";
  return {
    primary,
    secondary,
    primaryFg: foregroundFor(primary),
  };
}

function foregroundFor(hex: string): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 140 ? "#000000" : "#ffffff";
}

function buildStyles(colors: BrandColors) {
  return StyleSheet.create({
    page: {
      padding: 48,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#1a1a1a",
    },

    // Cover
    coverPage: {
      padding: 48,
      fontFamily: "Helvetica",
    },
    coverBanner: {
      backgroundColor: colors.primary,
      padding: 24,
      borderRadius: 8,
      marginBottom: 32,
    },
    coverLogo: { width: 80, height: 80, objectFit: "contain", marginBottom: 16 },
    coverTitle: { color: colors.primaryFg, fontSize: 28, fontWeight: "bold", marginBottom: 4 },
    coverSubtitle: { color: colors.primaryFg, fontSize: 14, opacity: 0.85 },

    coverInfoRow: { flexDirection: "row", marginBottom: 12 },
    coverInfoLabel: { width: 100, fontSize: 10, color: "#666", textTransform: "uppercase" },
    coverInfoValue: { fontSize: 11, flex: 1 },

    // Sections
    sectionTitle: {
      fontSize: 14,
      fontWeight: "bold",
      marginTop: 20,
      marginBottom: 10,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      borderBottomStyle: "solid",
    },
    subsectionTitle: {
      fontSize: 11,
      fontWeight: "bold",
      marginTop: 10,
      marginBottom: 6,
      color: colors.primary,
    },

    // Summary grid
    summaryGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
    summaryCell: { width: "50%", paddingRight: 8, marginBottom: 8 },
    fieldLabel: { fontSize: 8, color: "#666", textTransform: "uppercase", marginBottom: 2 },
    fieldValue: { fontSize: 10 },

    // Tables
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f5f5f5",
      paddingVertical: 6,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      borderBottomStyle: "solid",
      fontSize: 9,
      fontWeight: "bold",
      textTransform: "uppercase",
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 5,
      paddingHorizontal: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: "#e5e5e5",
      borderBottomStyle: "solid",
      fontSize: 9,
    },
    tableCell: { paddingRight: 4 },

    // Findings
    findingBlock: {
      marginBottom: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderLeftWidth: 3,
      borderLeftStyle: "solid",
      borderLeftColor: colors.primary,
      backgroundColor: "#fafafa",
    },
    findingTitle: { fontSize: 11, fontWeight: "bold", marginBottom: 2 },
    findingMeta: { fontSize: 9, color: "#555", marginBottom: 4 },
    findingBody: { fontSize: 10 },
    severityChip: {
      fontSize: 8,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 2,
      textTransform: "uppercase",
      marginLeft: 6,
    },
    severityHigh: { backgroundColor: "#fee2e2", color: "#991b1b" },
    severityMedium: { backgroundColor: "#fef3c7", color: "#92400e" },
    severityLow: { backgroundColor: "#ecfccb", color: "#365314" },

    photoGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
    photo: { width: 110, height: 110, marginRight: 6, marginBottom: 6, objectFit: "cover" },

    // Header (pages 2+, not cover)
    header: {
      position: "absolute",
      top: 18,
      left: 48,
      right: 48,
      paddingBottom: 8,
      borderBottomWidth: 0.5,
      borderBottomStyle: "solid",
      borderBottomColor: "#d4d4d4",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
    headerLogo: { width: 20, height: 20, objectFit: "contain" },
    headerTitle: { fontSize: 9, fontWeight: "bold", color: "#333" },
    headerMeta: { fontSize: 8, color: "#777", textAlign: "right" },

    // Footer
    footer: {
      position: "absolute",
      bottom: 20,
      left: 48,
      right: 48,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    footerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
    footerIcon: { width: 16, height: 16, marginRight: 6 },
    footerText: { flexDirection: "column" },
    footerOrg: { fontSize: 8, color: "#777" },
    footerPoweredBy: {
      fontSize: 7,
      color: "#aaa",
      fontFamily: "Helvetica-Oblique",
      marginTop: 1,
    },
    footerPage: { fontSize: 8, color: "#777" },
  });
}

type Styles = ReturnType<typeof buildStyles>;

// ─────────────────────────────────────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────────────────────────────────────

export function ReportDocument({ data }: { data: ReportData }) {
  const colors = resolveColors(
    data.org.brandColorPrimary,
    data.org.brandColorSecondary,
  );
  const s = buildStyles(colors);

  return (
    <Document
      title={data.title}
      author={data.org.name}
      subject={`${data.property.name} — ${data.system.name}`}
    >
      <Page size="LETTER" style={s.coverPage}>
        <Cover data={data} styles={s} />
        <Footer data={data} styles={s} />
      </Page>

      <Page size="LETTER" style={[s.page, { paddingTop: 56 }]}>
        <Header data={data} styles={s} />
        <SystemSummary data={data} styles={s} />
        {data.sections.zones && <ZonesTable data={data} styles={s} />}
        {data.sections.parts && <PartsTable data={data} styles={s} />}
        <Footer data={data} styles={s} />
      </Page>

      {data.audit && data.sections.auditFindings && (
        <Page size="LETTER" style={[s.page, { paddingTop: 56 }]}>
          <Header data={data} styles={s} />
          <AuditFindings data={data} styles={s} />
          <Footer data={data} styles={s} />
        </Page>
      )}
    </Document>
  );
}

function Header({ data, styles }: { data: ReportData; styles: Styles }) {
  return (
    <View style={styles.header} fixed>
      <View style={styles.headerLeft}>
        {data.org.primaryLogoUrl && (
          <Image src={data.org.primaryLogoUrl} style={styles.headerLogo} />
        )}
        <Text style={styles.headerTitle}>
          {data.property.name} · {data.system.name}
        </Text>
      </View>
      <Text style={styles.headerMeta}>{data.title}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────────────────

function Cover({ data, styles }: { data: ReportData; styles: Styles }) {
  return (
    <>
      <View style={styles.coverBanner}>
        {data.org.primaryLogoUrl && (
          <Image src={data.org.primaryLogoUrl} style={styles.coverLogo} />
        )}
        <Text style={styles.coverTitle}>{data.title}</Text>
        <Text style={styles.coverSubtitle}>
          {data.property.name} · {data.system.name}
        </Text>
      </View>

      <View style={{ marginTop: 20 }}>
        {data.property.address && (
          <InfoRow
            styles={styles}
            label="Address"
            value={[
              data.property.address,
              data.property.city,
              data.property.state,
              data.property.zip,
            ]
              .filter(Boolean)
              .join(", ")}
          />
        )}
        {data.property.propertyManagerName && (
          <InfoRow
            styles={styles}
            label="PM"
            value={`${data.property.propertyManagerName}${data.property.propertyManagerEmail ? ` (${data.property.propertyManagerEmail})` : ""}`}
          />
        )}
        {data.system.onSiteContactName && (
          <InfoRow
            styles={styles}
            label="On-site"
            value={`${data.system.onSiteContactName}${data.system.onSiteContactRole ? ` — ${data.system.onSiteContactRole}` : ""}`}
          />
        )}
        <InfoRow
          styles={styles}
          label="Generated"
          value={data.generatedAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        />
        <InfoRow
          styles={styles}
          label="Prepared by"
          value={data.org.name}
        />
        {data.audit && (
          <InfoRow
            styles={styles}
            label="Audit"
            value={`${data.audit.startedAt.toLocaleDateString()} — ${data.audit.auditorName ?? "unknown"}`}
          />
        )}
      </View>
    </>
  );
}

function InfoRow({
  styles,
  label,
  value,
}: {
  styles: Styles;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.coverInfoRow}>
      <Text style={styles.coverInfoLabel}>{label}</Text>
      <Text style={styles.coverInfoValue}>{value}</Text>
    </View>
  );
}

function SystemSummary({ data, styles }: { data: ReportData; styles: Styles }) {
  const { system } = data;
  return (
    <View>
      <Text style={styles.sectionTitle}>System summary</Text>

      {system.controllers.length > 0 && (
        <>
          <Text style={styles.subsectionTitle}>
            Controllers ({system.controllers.length})
          </Text>
          {system.controllers.map((c) => (
            <View key={c.id} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 10 }}>
                {c.name ?? "Controller"}
                {c.brand ? ` — ${c.brand}` : ""}
                {c.model ? ` ${c.model}` : ""}
                {c.stationCount ? ` · ${c.stationCount} stations` : ""}
                {c.wiringType ? ` · ${c.wiringType.replace("_", "-")}` : ""}
                {c.location ? ` · ${c.location}` : ""}
              </Text>
            </View>
          ))}
        </>
      )}

      {system.waterSources.length > 0 && (
        <>
          <Text style={styles.subsectionTitle}>
            Water sources ({system.waterSources.length})
          </Text>
          {system.waterSources.map((w) => (
            <View key={w.id} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 10 }}>
                {w.label ?? w.sourceType}
                {w.gpm ? ` · ${w.gpm} GPM` : ""}
                {w.psi ? ` · ${w.psi} PSI` : ""}
                {!w.permanent ? " · Temporary" : ""}
              </Text>
            </View>
          ))}
        </>
      )}

      {(system.backflowType ||
        system.backflowStatus ||
        system.backflowLastTestedAt) && (
        <>
          <Text style={styles.subsectionTitle}>Backflow / RPZ</Text>
          <View style={styles.summaryGrid}>
            {system.backflowType && (
              <Field
                styles={styles}
                label="Type"
                value={system.backflowType}
              />
            )}
            {system.backflowSize && (
              <Field
                styles={styles}
                label="Size"
                value={system.backflowSize}
              />
            )}
            {system.backflowStatus && (
              <Field
                styles={styles}
                label="Status"
                value={system.backflowStatus}
              />
            )}
            {system.backflowLastTestedAt && (
              <Field
                styles={styles}
                label="Last tested"
                value={system.backflowLastTestedAt.toLocaleDateString()}
              />
            )}
          </View>
        </>
      )}

      {system.notes && (
        <>
          <Text style={styles.subsectionTitle}>Notes</Text>
          <Text style={{ fontSize: 10 }}>{system.notes}</Text>
        </>
      )}
    </View>
  );
}

function Field({
  styles,
  label,
  value,
}: {
  styles: Styles;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function ZonesTable({ data, styles }: { data: ReportData; styles: Styles }) {
  if (data.zones.length === 0) return null;
  return (
    <View wrap={false}>
      <Text style={styles.sectionTitle}>Zones ({data.zones.length})</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCell, { width: 30 }]}>#</Text>
        <Text style={[styles.tableCell, { flex: 2 }]}>Name</Text>
        <Text style={[styles.tableCell, { width: 50 }]}>Type</Text>
        <Text style={[styles.tableCell, { flex: 2 }]}>Valve</Text>
        <Text style={[styles.tableCell, { width: 40, textAlign: "right" }]}>
          Heads
        </Text>
        <Text style={[styles.tableCell, { flex: 1.5 }]}>Coverage</Text>
      </View>
      {data.zones.map((z) => (
        <View key={z.id} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: 30 }]}>{z.zoneNumber}</Text>
          <Text style={[styles.tableCell, { flex: 2 }]}>
            {z.zoneName ?? "—"}
          </Text>
          <Text style={[styles.tableCell, { width: 50 }]}>{z.zoneType}</Text>
          <Text style={[styles.tableCell, { flex: 2 }]}>
            {[z.valveBrand, z.valveModel, z.valveSize]
              .filter(Boolean)
              .join(" ") || "—"}
          </Text>
          <Text style={[styles.tableCell, { width: 40, textAlign: "right" }]}>
            {z.headCount ?? "—"}
          </Text>
          <Text style={[styles.tableCell, { flex: 1.5 }]}>
            {z.coverage ?? "—"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PartsTable({ data, styles }: { data: ReportData; styles: Styles }) {
  if (data.parts.length === 0) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Parts in use ({data.parts.length})</Text>
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCell, { width: 80 }]}>Category</Text>
        <Text style={[styles.tableCell, { flex: 1.5 }]}>Brand</Text>
        <Text style={[styles.tableCell, { flex: 2 }]}>Model</Text>
        <Text style={[styles.tableCell, { width: 50 }]}>Size</Text>
        <Text style={[styles.tableCell, { width: 50, textAlign: "right" }]}>
          Qty
        </Text>
      </View>
      {data.parts.map((p) => (
        <View key={p.id} style={styles.tableRow}>
          <Text style={[styles.tableCell, { width: 80 }]}>
            {p.category ?? "—"}
          </Text>
          <Text style={[styles.tableCell, { flex: 1.5 }]}>
            {p.brand ?? "—"}
          </Text>
          <Text style={[styles.tableCell, { flex: 2 }]}>{p.model ?? "—"}</Text>
          <Text style={[styles.tableCell, { width: 50 }]}>{p.size ?? "—"}</Text>
          <Text style={[styles.tableCell, { width: 50, textAlign: "right" }]}>
            {p.quantity ?? "—"}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AuditFindings({ data, styles }: { data: ReportData; styles: Styles }) {
  if (!data.audit) return null;
  const { findings } = data.audit;
  if (findings.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Audit findings</Text>
        <Text style={{ fontSize: 10, color: "#555" }}>
          No findings recorded in this audit.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>
        Audit findings ({findings.length})
      </Text>
      {findings.map((f) => (
        <View key={f.id} style={styles.findingBlock} wrap={false}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.findingTitle}>
              {f.zoneNumber !== null
                ? `Zone ${f.zoneNumber}${f.zoneName ? ` · ${f.zoneName}` : ""}: `
                : "System-level: "}
              {f.componentCategory}
              {f.componentSubtype ? ` — ${f.componentSubtype}` : ""}
            </Text>
            <Text
              style={[
                styles.severityChip,
                f.severity === "high"
                  ? styles.severityHigh
                  : f.severity === "medium"
                    ? styles.severityMedium
                    : styles.severityLow,
              ]}
            >
              {f.severity}
            </Text>
          </View>
          <Text style={styles.findingMeta}>
            Issue: {f.issueType.replace("_", " ")} · Action:{" "}
            {f.solutionAction}
            {f.quantity ? ` · Qty ${f.quantity} ${f.unitOfMeasure}` : ""}
          </Text>
          {f.description && (
            <Text style={styles.findingBody}>{f.description}</Text>
          )}
          {f.recommendation && (
            <Text style={[styles.findingBody, { marginTop: 3 }]}>
              <Text style={{ fontWeight: "bold" }}>Recommendation: </Text>
              {f.recommendation}
            </Text>
          )}
          {data.sections.photos && f.photoUrls.length > 0 && (
            <View style={styles.photoGrid}>
              {f.photoUrls.slice(0, 4).map((url, i) => (
                <Image key={i} src={url} style={styles.photo} />
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function Footer({ data, styles }: { data: ReportData; styles: Styles }) {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerLeft}>
        <Image src={TAKEO_FOOTER_ICON} style={styles.footerIcon} />
        <View style={styles.footerText}>
          <Text style={styles.footerOrg}>{data.org.name}</Text>
          <Text style={styles.footerPoweredBy}>
            Powered by Takeo by Takeoff Monkey
          </Text>
        </View>
      </View>
      <Text
        style={styles.footerPage}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}
