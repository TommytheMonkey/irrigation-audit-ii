import Link from "next/link";

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
    <nav className="-mx-4 overflow-x-auto sm:mx-0">
      <ul className="flex gap-1 rounded-xl bg-muted/50 p-1 sm:inline-flex">
        {TABS.map((t) => {
          const active = t.id === current;
          return (
            <li key={t.id}>
              <Link
                href={`/settings?tab=${t.id}`}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card/50 hover:text-foreground"
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
