import type { MetadataRoute } from "next";

/** Makes NarcoTrace installable on phones and computers. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NarcoTrace",
    short_name: "NarcoTrace",
    description: "Kerala's 28-day seizure outlook for enforcement, and where de-addiction help is far away for the public.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["government", "health", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Find help", short_name: "Help", url: "/public", description: "Nearest de-addiction centres" },
      { name: "Report", short_name: "Report", url: "/public?tab=report", description: "Tell us what you noticed, safely" },
      { name: "Enforcement outlook", short_name: "Outlook", url: "/enforcement" },
    ],
  };
}
