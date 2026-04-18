import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export async function AppHeader() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("AppHeader rendered without an authenticated user");
  }
  const org = await db.org.findUniqueOrThrow({
    where: { id: user.orgId },
    select: { primaryLogoUrl: true, brandColorPrimary: true },
  });
  const initials = user.name
    ? user.name
        .split(/\s+/)
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.email.slice(0, 2).toUpperCase();
  const swatch = org.brandColorPrimary ?? "#1e6f3a";

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          {org.primaryLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.primaryLogoUrl}
              alt={`${user.org.name} logo`}
              className="h-7 w-7 rounded-md object-contain"
            />
          ) : (
            <div
              className="h-7 w-7 rounded-md"
              style={{ backgroundColor: swatch }}
              aria-hidden
            />
          )}
          <span className="text-base font-semibold tracking-tight sm:text-lg">
            {user.org.name}
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <SignOutButton />
          <Link
            href="/settings"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            title={user.name ?? user.email}
            aria-label="Settings"
          >
            {initials}
          </Link>
        </div>
      </div>
    </header>
  );
}
