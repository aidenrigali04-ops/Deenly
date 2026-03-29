import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Avoid picking a parent-folder lockfile (e.g. ~/pnpm-lock.yaml) for output file tracing.
  outputFileTracingRoot: path.resolve(process.cwd())
};

export default nextConfig;
