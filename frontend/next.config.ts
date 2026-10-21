import type { NextConfig } from "next"

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000"

const nextConfig: NextConfig = {
  // Same-origin proxy to FastAPI so the httpOnly auth cookie is first-party.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }]
  },
  // Standalone server for the Docker image only (it needs symlinks, which Windows blocks by default).
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
}

export default nextConfig
