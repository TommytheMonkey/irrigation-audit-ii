"use client";

// Online/offline status pill shown in AppHeader.
//
// Visibility rules (Phase 1 spec):
//   - Mobile: always visible.
//   - Desktop: only visible when offline. Implemented with Tailwind's
//     `sm:hidden` toggle so the layout doesn't shift when the state
//     flips back online.
//
// Tap/click opens a bottom sheet with the current status. Phase 2
// will expand this sheet with the write-queue summary (pending/failed
// finding counts, last-sync timestamp). For now it's informational.

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function OfflineIndicator() {
  // SSR-safe initial state — navigator isn't defined server-side so
  // the first paint assumes online, then a useEffect snaps to reality.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <Sheet>
      <SheetTrigger
        aria-label={online ? "Online — view sync status" : "Offline — view sync status"}
        className={[
          "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors",
          online
            ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400 sm:hidden"
            : "bg-red-500/10 text-red-700 hover:bg-red-500/15 dark:text-red-400",
        ].join(" ")}
      >
        {online ? (
          <>
            <span
              className="h-2 w-2 rounded-full bg-emerald-500"
              aria-hidden
            />
            <span className="hidden xs:inline">Online</span>
          </>
        ) : (
          <>
            <span
              className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse"
              aria-hidden
            />
            <span>Offline</span>
          </>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl p-0">
        <SheetHeader className="px-5 pt-5">
          <SheetTitle className="flex items-center gap-2">
            {online ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600" />
            )}
            {online ? "You're online" : "You're offline"}
          </SheetTitle>
          <SheetDescription>
            {online
              ? "Audits you add will save to the server in real time."
              : "Findings you add will be saved to this device. Sync will happen automatically once you're back online."}
          </SheetDescription>
        </SheetHeader>

        <div className="border-t border-border/50 px-5 py-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sync status
          </h3>
          <p className="text-sm text-muted-foreground">
            Detailed sync state (pending writes, last-synced timestamps)
            will land in the next offline update.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
