import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds a plain static site (Phase 1 has no server code) that any static
// host can serve. NEXT_PUBLIC_BASE_PATH is the sub-folder it will live in, e.g. "/equilibrar-map"
// on GitHub Pages; leave it empty on a domain of its own.
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(basePath ? { basePath } : {}),
  ...(staticExport ? { output: "export" as const, trailingSlash: true, distDir: ".next-export", images: { unoptimized: true } } : {}),
};

export default nextConfig;
