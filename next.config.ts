import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// PWA / service worker. Disabled in dev so HMR isn't poisoned by an
// aggressive cache-first SW — we only want it active on the production
// Vercel build. swSrc lives at src/app/sw.ts and compiles into
// public/sw.js at build time (gitignored — see .gitignore).
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  // Only register / activate on production builds.
  disable: process.env.NODE_ENV !== "production",
  // Don't auto-reload every time the user comes back online — the
  // offline indicator will handle that surfacing visibly.
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.183",
    "postcard-units-did-desktop.trycloudflare.com",
  ],
};

export default withSerwist(nextConfig);
