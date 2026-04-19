import Link from "next/link";
import Image from "next/image";
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

  return (
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
          <Image
            src="/takeo-icon.jpg"
            alt="Takeo"
            width={36}
            height={36}
            className="rounded-lg"
            priority
          />
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
              Irrigation Audit
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              by Takeo
            </span>
          </div>
        </Link>
        
        <nav className="flex items-center gap-4 sm:gap-6">
          <SignOutButton />
          <Link
            href="/settings"
            className="group relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-all hover:scale-105 hover:shadow-lg active:scale-95 sm:h-10 sm:w-10"
            title={user.name ?? user.email}
            aria-label="Settings"
          >
            {initials}
          </Link>
        </nav>
      </div>
    </header>
  );
}
