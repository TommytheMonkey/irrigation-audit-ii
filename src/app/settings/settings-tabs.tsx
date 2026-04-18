import Link from "next/link";

// Server-rendered tab strip. Driven by ?tab=… so the back button works and
// links can be deep-linked from elsewhere (e.g. onboarding's "skip to
// settings" eventually).
const TABS = [
  { id: "company", label: "Company" },
  { id: "integrations", label: "Integrations" },
  { id: "users", label: "Users" },
  { id: "config", label: "Config" },
] as const;

export type SettingsTabId = (typeof TABS)[number]["id"];

export function isValidTab(s: string | undefined): s is SettingsTabId {
  return TABS.some((t) => t.id === s);
}

export function SettingsTabs({ current }: { current: SettingsTabId }) {
  return (
    <nav className="mb-6 -mx-4 overflow-x-auto sm:mx-0">
      <ul className="flex gap-1 border-b border-zinc-200 px-4 dark:border-zinc-800 sm:px-0">
        {TABS.map((t) => {
          const active = t.id === current;
          return (
            <li key={t.id}>
              <Link
                href={`/settings?tab=${t.id}`}
                className={`inline-block whitespace-nowrap px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-b-2 border-primary font-semibold text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
