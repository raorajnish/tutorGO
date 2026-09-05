import type { MetadataRoute } from "next";

/**
 * Web app manifest (changes-phase11.md §11.3). Next's typed manifest route —
 * generated at `/manifest.webmanifest`, not a hand-written JSON file, so it's
 * typechecked the same as everything else here.
 *
 * Colours match the app's own light theme (see backend's emailTemplates.ts
 * COLORS, which already mirrors this) rather than inventing a second palette.
 *
 * Icons are generated from `public/icons/logo-source.svg` — a monogram
 * designed for this app (a "T" whose crossbar bends into a rising chevron),
 * not a placeholder. The mark sits inside the maskable "safe zone" already,
 * so the same source produces both the plain and maskable PNGs with no
 * separate padding pass. Regenerate with the small sharp script used when
 * these were first rendered if the mark itself ever changes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TutorGO",
    short_name: "TutorGO",
    description: "Multi-tenant ERP for coaching institutes, schools and colleges.",
    start_url: "/",
    display: "standalone",
    background_color: "#e8f1f5",
    theme_color: "#132238",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // A maskable icon lets Android crop it into its own shape (circle,
      // squircle, ...) instead of letterboxing a square icon into a white box.
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
