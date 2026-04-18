import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import type { AuditStatus, Severity } from "@prisma/client";
import { AuditActions } from "./audit-actions";

export const dynamic = "force-dynamic";

export default async function AuditSummaryPage({
  params,
}: {
  params: Promise<{ auditId: string }>;
}) {
  const { auditId } = await params;
  const user = await requireAuth();

  const [audit, org] = await Promise.all([
    db.audit.findFirst({
      where: { id: auditId, orgId: user.orgId },
      include: {
        property: true,
        auditor: { select: { name: true, email: true } },
        systems: {
          orderBy: { createdAt: "asc" },
          include: {
            zones: {
              orderBy: { zoneNumber: "asc" },
              include: {
                findings: { orderBy: { createdAt: "asc" } },
              },
            },
          },
        },
        findings: true,
      },
    }),
    db.org.findUniqueOrThrow({
      where: { id: user.orgId },
      select: { googleConnectedEmail: true, googleCredentialsEnc: true },
    }),
  ]);
  if (!audit) notFound();

  // Aggregate stats — JS rather than SQL since we already have the findings.
  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  const byCategory: Record<string, number> = {};
  for (const f of audit.findings) {
    bySeverity[f.severity]++;
    byCategory[f.componentCategory] = (byCategory[f.componentCategory] ?? 0) + 1;
  }
  const totalFindings = audit.findings.length;

  // Pricing rollup. Only meaningful once an export + sync has happened, but
  // we always compute it because the cost is trivial.
  const pricedFindings = audit.findings.filter((f) => f.unitPrice !== null);
  const pricedCount = pricedFindings.length;
  const grandTotal = audit.findings.reduce(
    (sum, f) => sum + (f.extPrice ? Number(f.extPrice) : 0),
    0,
  );
  const fullyPriced = pricedCount === totalFindings && totalFindings > 0;
  // Show pricing UI as soon as the audit has been exported (sheet exists),
  // even if no prices have been pulled yet — gives the auditor a placeholder.
  const showPricing = audit.googleSheetId !== null;
  const googleConnected =
    org.googleConnectedEmail !== null && org.googleCredentialsEnc !== null;

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href={`/properties/${audit.property.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {audit.property.name}
          </Link>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Audit summary
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {audit.property.name} ·{" "}
            {formatDate(audit.completedAt ?? audit.startedAt)} ·{" "}
            {audit.auditor.name ?? audit.auditor.email}
          </p>
        </div>

        {/* Status step indicator */}
        <StatusSteps status={audit.status} />

        {/* Severity stats */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatCard label="Critical" value={bySeverity.high} tone="high" />
          <StatCard label="Moderate" value={bySeverity.medium} tone="medium" />
          <StatCard label="Minor" value={bySeverity.low} tone="low" />
        </div>

        {/* Total + (if priced) grand total */}
        <Card className="mb-6">
          <CardContent className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Total findings
              </div>
              <div className="text-3xl font-semibold tabular-nums">
                {totalFindings}
              </div>
            </div>
            {showPricing && (
              <div>
                <div className="text-right text-xs uppercase tracking-wide text-muted-foreground">
                  Estimated total
                </div>
                <div className="text-right text-3xl font-semibold tabular-nums">
                  {formatCurrency(grandTotal)}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {pricedCount} of {totalFindings} priced
                </div>
              </div>
            )}
            {!showPricing && (
              <div className="text-right text-xs text-muted-foreground">
                <div>
                  {audit.systems.length}{" "}
                  {audit.systems.length === 1 ? "system" : "systems"}
                </div>
                <div>
                  {audit.systems.reduce((n, s) => n + s.zones.length, 0)} zones
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* By category */}
        {Object.keys(byCategory).length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">By component category</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5 text-sm">
                {Object.entries(byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => (
                    <li
                      key={cat}
                      className="flex items-center justify-between"
                    >
                      <span>{cat}</span>
                      <span className="font-medium tabular-nums">{count}</span>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Zone-by-zone */}
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Findings by zone
        </h2>
        <div className="mb-6 flex flex-col gap-3">
          {audit.systems.flatMap((sys) =>
            sys.zones.map((z) => {
              const zoneTotal = z.findings.reduce(
                (s, f) => s + (f.extPrice ? Number(f.extPrice) : 0),
                0,
              );
              return (
                <Card key={z.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        Zone {z.zoneNumber}
                        {z.zoneName && (
                          <span className="ml-2 font-normal text-muted-foreground">
                            {z.zoneName}
                          </span>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {showPricing && zoneTotal > 0 && (
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            {formatCurrency(zoneTotal)}
                          </span>
                        )}
                        <Badge variant="secondary">
                          {z.findings.length}{" "}
                          {z.findings.length === 1 ? "finding" : "findings"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  {z.findings.length > 0 && (
                    <CardContent>
                      <ul className="flex flex-col gap-2 text-sm">
                        {z.findings.map((f) => (
                          <li key={f.id} className="flex items-start gap-2">
                            <SeverityDot severity={f.severity} />
                            <div className="flex-1 min-w-0">
                              <div className="truncate">
                                {f.description ??
                                  `${f.componentSubtype ?? f.componentCategory}${
                                    f.componentSize ? ` ${f.componentSize}` : ""
                                  } — ${f.issueType}`}
                              </div>
                              {showPricing && (
                                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                                  {f.unitPrice !== null ? (
                                    <>
                                      <span className="tabular-nums">
                                        {formatCurrency(Number(f.unitPrice))} ×{" "}
                                        {f.quantity ? Number(f.quantity) : 1}
                                      </span>
                                      <span>=</span>
                                      <span className="font-medium tabular-nums text-foreground">
                                        {formatCurrency(
                                          f.extPrice ? Number(f.extPrice) : 0,
                                        )}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                      Needs pricing
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                              {f.quantity ? Number(f.quantity) : 1}{" "}
                              {f.unitOfMeasure}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  )}
                </Card>
              );
            }),
          )}
        </div>

        <AuditActions
          auditId={audit.id}
          initialSheetUrl={audit.googleSheetUrl}
          googleConnected={googleConnected}
          fullyPriced={fullyPriced}
        />
      </main>
    </>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "high" | "medium" | "low";
}) {
  const styles: Record<typeof tone, string> = {
    high: "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50",
    medium: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/50",
    low: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/50",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${styles[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-semibold tabular-nums sm:text-3xl">
        {value}
      </div>
    </div>
  );
}

function SeverityDot({ severity }: { severity: Severity }) {
  const c =
    severity === "high"
      ? "bg-red-500"
      : severity === "medium"
      ? "bg-amber-500"
      : "bg-emerald-500";
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${c}`} />;
}

// 5-step indicator: in_progress → completed → exported → priced → reported
const STATUS_STEPS: { id: AuditStatus; label: string }[] = [
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "exported", label: "Exported" },
  { id: "priced", label: "Priced" },
  { id: "report_generated", label: "Reported" },
];

function StatusSteps({ status }: { status: AuditStatus }) {
  const currentIdx = STATUS_STEPS.findIndex((s) => s.id === status);
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
      <ol className="flex items-center justify-between gap-1 sm:gap-2">
        {STATUS_STEPS.map((step, i) => {
          const done = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <li key={step.id} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full rounded-full ${
                  done
                    ? "bg-emerald-500"
                    : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
              <span
                className={`text-[10px] uppercase tracking-wide sm:text-xs ${
                  isCurrent
                    ? "font-semibold text-foreground"
                    : done
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
