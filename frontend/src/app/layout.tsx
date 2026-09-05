import type { Metadata } from "next";
import { Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-plus-jakarta" });

export const metadata: Metadata = {
  title: "TutorGO",
  description: "Multi-tenant ERP for coaching institutes, schools and colleges.",
  // iOS Safari ignores manifest.ts almost entirely (no install prompt, no
  // theme_color) — these two are the only iOS-specific hooks that exist:
  // apple-touch-icon for the home-screen icon, apple-mobile-web-app-* for how
  // the launched app looks. See public/icons/logo-source.svg for the mark.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TutorGO",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

// Applies a persisted theme choice before first paint. Default is always light —
// we deliberately do not check prefers-color-scheme.
const NO_FLASH_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem("tutorgo_theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${plusJakarta.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <PwaRegister />
            <InstallPrompt />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
