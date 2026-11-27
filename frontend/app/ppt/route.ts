// /ppt opens the pitch deck, which is served as static files from public/ppt (see scripts/sync-ppt.mjs).
// A relative Location keeps whatever host the visitor used (local address or the public domain).
export function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/ppt/index.html", "X-Robots-Tag": "noindex, nofollow" },
  });
}
