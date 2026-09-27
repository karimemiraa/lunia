import type { MetadataRoute } from "next";

// Installable web app ("Add to Home Screen" on iPhone/iPad/Android, install
// on desktop Chrome/Edge). Customers land on the Arabic site; staff install
// the admin separately via /admin.webmanifest (linked from the admin layout).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lunia Skin Quality Center",
    short_name: "Lunia",
    description: "Skin, hair & scalp and post-surgery care in Riyadh.",
    start_url: "/ar",
    scope: "/",
    display: "standalone",
    background_color: "#f3f7f6",
    theme_color: "#2b4d47",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
