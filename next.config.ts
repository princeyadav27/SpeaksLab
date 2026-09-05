import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Development only: Next.js blocks cross-origin requests to dev assets by
  // default, which breaks proxied/sandboxed preview hosts. This setting has no
  // effect on production builds. Remove it if you never use a preview proxy.
  allowedDevOrigins: ["*.e2b.app"],
};

export default nextConfig;
