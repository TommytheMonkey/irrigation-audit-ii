import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mockConfigPath, readMockConfig } from "@/lib/config-mock";
import { SettingsTabs, isValidTab, type SettingsTabId } from "./settings-tabs";
import { CompanyTab } from "./company-tab";
import { IntegrationsTab } from "./integrations-tab";
import { UsersTab } from "./users-tab";
import { ConfigTab } from "./config-tab";

export const dynamic = "force-dynamic";

// Org settings — tab dispatcher driven by ?tab=. Each tab is a small client
// island that calls the corresponding /api/settings/* route. Non-admin users
// can read everything but the forms are disabled (and the server enforces
// admin-only on the actual mutations).
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  const tab: SettingsTabId = isValidTab(params.tab) ? params.tab : "company";
  const canEdit = user.role === "admin";

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Org-level configuration.
          </p>
        </div>

        <SettingsTabs current={tab} />

        {tab === "company" && <CompanyTabPanel orgId={user.orgId} canEdit={canEdit} />}
        {tab === "integrations" && (
          <IntegrationsTabPanel orgId={user.orgId} canEdit={canEdit} />
        )}
        {tab === "users" && <UsersTabPanel orgId={user.orgId} currentUserId={user.id} canEdit={canEdit} />}
        {tab === "config" && <ConfigTabPanel orgId={user.orgId} />}
      </main>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tab data fetchers. Kept inline so the page is one file to read; each
// tab only loads what its panel needs (no over-fetching).
// ─────────────────────────────────────────────────────────────────────────────

async function CompanyTabPanel({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, emailDomain: true },
  });
  return <CompanyTab initial={{ name: org.name, emailDomain: org.emailDomain }} canEdit={canEdit} />;
}

async function IntegrationsTabPanel({
  orgId,
  canEdit,
}: {
  orgId: string;
  canEdit: boolean;
}) {
  const [org, propertyCount] = await Promise.all([
    db.org.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        mondayApiKeyEnc: true,
        mondayBoardId: true,
        mondayColumnMapping: true,
        propertiesSyncedAt: true,
        googleConnectedEmail: true,
        brandColorPrimary: true,
        brandColorSecondary: true,
        primaryLogoUrl: true,
        fontFamily: true,
      },
    }),
    db.property.count({
      where: { orgId, mondayItemId: { not: null }, syncStatus: "active" },
    }),
  ]);
  return (
    <IntegrationsTab
      canEdit={canEdit}
      initial={{
        hasMondayKey: org.mondayApiKeyEnc !== null,
        mondayBoardId: org.mondayBoardId,
        mondayMapping:
          (org.mondayColumnMapping as Record<string, string> | null) ?? null,
        propertiesSyncedAt: org.propertiesSyncedAt
          ? org.propertiesSyncedAt.toISOString()
          : null,
        propertyCount,
        googleConnectedEmail: org.googleConnectedEmail,
        brandingPrimary: org.brandColorPrimary,
        brandingSecondary: org.brandColorSecondary,
        brandingLogo: org.primaryLogoUrl,
        brandingFont: org.fontFamily,
      }}
    />
  );
}

async function UsersTabPanel({
  orgId,
  currentUserId,
  canEdit,
}: {
  orgId: string;
  currentUserId: string;
  canEdit: boolean;
}) {
  const users = await db.user.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return <UsersTab initialUsers={users} currentUserId={currentUserId} canEdit={canEdit} />;
}

async function ConfigTabPanel({ orgId }: { orgId: string }) {
  const [org, mockJson, componentCount, quickPickCount, severityCount] =
    await Promise.all([
      db.org.findUniqueOrThrow({
        where: { id: orgId },
        select: { configSheetId: true, configSyncedAt: true },
      }),
      readMockConfig(orgId),
      db.componentType.count({ where: { orgId, isActive: true } }),
      db.quickPickFinding.count({ where: { orgId, isActive: true } }),
      db.severityLevel.count({ where: { orgId, isActive: true } }),
    ]);
  const initialized = org.configSheetId !== null;
  const isMock = org.configSheetId === "mock";
  return (
    <ConfigTab
      initialized={initialized}
      isMock={isMock}
      syncedAt={org.configSyncedAt}
      mockPath={isMock ? mockConfigPath(orgId) : null}
      hasMockFile={mockJson !== null}
      componentCount={componentCount}
      quickPickCount={quickPickCount}
      severityCount={severityCount}
    />
  );
}
