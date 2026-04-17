import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.figma.com",
        pathname: "/api/mcp/asset/**"
      }
    ]
  },
  // Allow imports from repo `shared/` (onboarding copy, etc.).
  experimental: {
    externalDir: true
  },
  // Avoid picking a parent-folder lockfile (e.g. ~/pnpm-lock.yaml) for output file tracing.
  outputFileTracingRoot: path.resolve(process.cwd()),
  async redirects() {
    return [{ source: "/dhikr", destination: "/home", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }]
      }
    ];
  }
};

export default nextConfig;
