import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.183",
    "postcard-units-did-desktop.trycloudflare.com",
  ],
};

export default nextConfig;
