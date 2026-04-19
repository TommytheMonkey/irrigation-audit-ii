import { AppHeader } from "@/components/app-header";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { readMockConfig } from "@/lib/config-mock";
import { sheetEditUrl } from "@/lib/config-sheet";
import { SettingsTabs, isValidTab, type SettingsTabId } from "./settings-tabs";
import { CompanyTab } from "./company-tab";
import { IntegrationsTab } from "./integrations-tab";
import { UsersTab } from "./users-tab";
import { ConfigTab } from "./config-tab";

export const dynamic = "force-dynamic";

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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage your organization&apos;s configuration
          </p>
        </div>

        <SettingsTabs current={tab} />

        <div className="mt-6">
          {tab === "company" && (
            <CompanyTabPanel orgId={user.orgId} canEdit={canEdit} />
          )}
          {tab === "integrations" && (
            <IntegrationsTabPanel orgId={user.orgId} canEdit={canEdit} />
          )}
          {tab === "users" && (
            <UsersTabPanel
              orgId={user.orgId}
              currentUserId={user.id}
              canEdit={canEdit}
            />
          )}
          {tab === "config" && <ConfigTabPanel orgId={user.orgId} />}
        </div>
      </main>
    </>
  );
}

async function CompanyTabPanel({
  orgId,
  canEdit,
}: {
  orgId: string;
  canEdit: boolean;
}) {
  const org = await db.org.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true, emailDomain: true },
  });
  return (
    <CompanyTab
      initial={{ name: org.name, emailDomain: org.emailDomain }}
      canEdit={canEdit}
    />
  );
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
        googleDriveFolderId: true,
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
        googleDriveFolderId: org.googleDriveFolderId,
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
  return (
    <UsersTab
      initialUsers={users}
      currentUserId={currentUserId}
      canEdit={canEdit}
    />
  );
}

async function ConfigTabPanel({ orgId }: { orgId: string }) {
  const [org, mockJson, componentCount, quickPickCount, severityCount] =
    await Promise.all([
      db.org.findUniqueOrThrow({
        where: { id: orgId },
        select: {
          configSheetId: true,
          configSyncedAt: true,
          googleCredentialsEnc: true,
        },
      }),
      readMockConfig(orgId),
      db.componentType.count({ where: { orgId, isActive: true } }),
      db.quickPickFinding.count({ where: { orgId, isActive: true } }),
      db.severityLevel.count({ where: { orgId, isActive: true } }),
    ]);
  const initialized = org.configSheetId !== null;
  const isMock = org.configSheetId === "mock";
  const sheetUrl =
    initialized && !isMock && org.configSheetId
      ? sheetEditUrl(org.configSheetId)
      : null;
  return (
    <ConfigTab
      initialized={initialized}
      isMock={isMock}
      syncedAt={org.configSyncedAt}
      sheetUrl={sheetUrl}
      googleConnected={org.googleCredentialsEnc !== null}
      hasMockFile={mockJson !== null}
      componentCount={componentCount}
      quickPickCount={quickPickCount}
      severityCount={severityCount}
    />
  );
}
