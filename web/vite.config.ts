import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true,
    fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.wrangler/**", "**/.venv/**",
      "**/training_dataset/**", "**/ml/data/real/**", "**/reports/real/**", "**/artifacts/**", "**/*_real*",
      "**/DATA_AUDIT_REAL.md", "**/*.sqlite*", "**/*.db", "**/*.joblib", "**/*.pkl"] },
    proxy: { "/api": "http://127.0.0.1:8787" } }
});
