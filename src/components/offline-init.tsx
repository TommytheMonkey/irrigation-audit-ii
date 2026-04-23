"use client";

// Mounts once in the root layout and kicks off client-side offline
// bootstrap — currently just the one-shot localStorage → IndexedDB
// draft migration. Renders nothing. Safe to ship on every route,
// including unauthenticated pages (the migration is a no-op if
// there's no matching localStorage data).
//
// Subsequent phases will hang the write-queue replayer and any
// proactive sync off this same mount point.

import { useEffect } from "react";
import { migrateLocalStorageDraftsToDexie } from "@/lib/offline/migrate";

export function OfflineInit() {
  useEffect(() => {
    migrateLocalStorageDraftsToDexie().catch((e) => {
      console.warn("[offline] draft migration failed:", e);
    });
  }, []);
  return null;
}
