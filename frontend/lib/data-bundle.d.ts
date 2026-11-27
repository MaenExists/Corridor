// Resolved by the webpack alias in next.config.ts: an empty stub locally, a data snapshot in Cloudflare builds.
declare module "@nt/data-bundle" {
  const BUNDLE: Record<string, unknown> | null;
  export default BUNDLE;
}
