import type { NextConfig } from "next";
import path from "node:path";

const tiles = "https://server.arcgisonline.com https://tile.openstreetmap.org";

const config: NextConfig = {
  devIndicators: false,
  // Cloudflare builds (npm run deploy:cf) bundle a data snapshot, since Workers have no disk to read from.
  webpack(cfg) {
    cfg.resolve.alias["@nt/data-bundle"] = process.env.NT_BUNDLE
      ? path.join(__dirname, ".cf/bundle.json")
      : path.join(__dirname, "lib/bundle.stub.ts");
    // Keep the local and Cloudflare builds apart in webpack's cache, or one reuses the other's data choice.
    if (cfg.cache && typeof cfg.cache === "object") cfg.cache.version = `${cfg.cache.version ?? ""}|nt-${process.env.NT_BUNDLE ? "cf" : "local"}`;
    return cfg;
  },
  // Locally the server reads model outputs from the repository root; the Cloudflare build carries them bundled.
  outputFileTracingRoot: process.env.NT_BUNDLE ? __dirname : path.join(__dirname, ".."),
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
