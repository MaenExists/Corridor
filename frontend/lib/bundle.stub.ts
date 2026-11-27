/**
 * Data bundled into the Cloudflare build. Locally this stays empty (null) and the server reads files from disk;
 * `npm run deploy:cf` points the "@nt/data-bundle" alias at a generated snapshot instead (see scripts/cf-bundle.mjs).
 */
const BUNDLE: Record<string, unknown> | null = null;
export default BUNDLE;
