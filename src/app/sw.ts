/// <reference lib="webworker" />
// Service worker entry — compiled by @serwist/next at build time into
// public/sw.js. Runs in the ServiceWorker global scope, not the window;
// do not import React, Prisma, or anything that expects DOM / Node.
//
// Strategy (Phase 1, read-side offline only):
//   - Static assets (JS, CSS, fonts, icons): cache-first, long-lived.
//   - HTML routes: network-first, falling back to the last cached copy.
//   - API GETs: passthrough — we do NOT proxy API responses through the
//     SW cache. Offline reads go through IndexedDB instead (see
//     src/lib/offline/). If we cached GET /api/audits/[id] here we'd
//     end up with two competing staleness models and race conditions
//     with Dexie. IndexedDB wins; API requests pass through.
//   - Mutations (POST/PUT/PATCH/DELETE): passthrough. Write-side
//     queueing lands in Phase 2.
//
// defaultCache covers items 1 and 2 with Serwist's recommended rules.
// We bolt on a pair of explicit passthrough matchers so nothing slips
// into cache by accident on a Next.js upgrade that changes URL shapes.

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by Serwist at build time with the list of precached URLs.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Explicit passthrough for anything under /api/* and /_next/data/*.
    // NetworkOnly means we don't serve stale bytes and don't poison the
    // cache with 401s from an expired session, and we don't race Dexie.
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/_next/data/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
