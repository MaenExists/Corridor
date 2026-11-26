import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const portOr = (value: string | undefined, fallback: number) => {
  const valueAsNumber=Number(value);
  return /^\d+$/.test(value??"") && valueAsNumber>=1024 && valueAsNumber<=65535 ? valueAsNumber : fallback;
};
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: { host: "127.0.0.1", port: portOr(process.env.NARCOTRACE_WEB_PORT,5173), strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.wrangler/**", "**/.venv/**",
      "**/training_dataset/**", "**/ml/data/real/**", "**/reports/real/**", "**/artifacts/**", "**/*_real*",
      "**/DATA_AUDIT_REAL.md", "**/*.sqlite*", "**/*.db", "**/*.joblib", "**/*.pkl"] },
    proxy: { "/api": `http://127.0.0.1:${portOr(process.env.NARCOTRACE_API_PORT,8787)}` } },
  build: { rollupOptions: { input: { main: fileURLToPath(new URL("index.html", import.meta.url)),
    recovery: fileURLToPath(new URL("recovery.html", import.meta.url)),
    hotspots: fileURLToPath(new URL("hotspots.html", import.meta.url)) },
    output: { manualChunks: { leaflet: ["leaflet"] } } } }
});
