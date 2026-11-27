import type { Metadata, Viewport } from "next";
import { ServiceWorker } from "@/components/ServiceWorker";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/noto-sans-malayalam";
import "./globals.css";

export const metadata: Metadata = {
  title: "NarcoTrace",
  description: "Where drug seizures are likely next in Kerala, and where help is far away.",
  applicationName: "NarcoTrace",
  appleWebApp: { capable: true, title: "NarcoTrace", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32" }, { url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        {children}
        <ServiceWorker />
        <div className="grain" aria-hidden />
      </body>
    </html>
  );
}
