import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pins the trace root to this project. Without it, Next.js walks up from
  // here and can pick up an unrelated package-lock.json sitting in a parent
  // directory (e.g. a stray lockfile in the Windows user profile folder) as
  // the inferred workspace root, which nests the standalone output under an
  // extra directory instead of landing server.js at .next/standalone/ root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
