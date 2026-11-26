import type { NextConfig } from "next";
import path from "node:path";

const tiles = "https://server.arcgisonline.com https://tile.openstreetmap.org";

const config: NextConfig = {
  devIndicators: false,
  outputFileTracingRoot: path.join(__dirname, ".."),
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Content-Security-Policy", value: [
          "default-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline'",
          `img-src 'self' data: blob: ${tiles}`, "connect-src 'self' ws://127.0.0.1:3000", "font-src 'self'",
          "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ") },
      ],
    }];
  },
};
export default config;
