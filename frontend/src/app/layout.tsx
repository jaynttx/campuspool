import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth";
import { PrefsProvider, THEME_BOOT_SCRIPT } from "@/lib/prefs";
import { SecureChatProvider } from "@/lib/secure-chat";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

// Self-hosted (from Fontsource, SIL Open Font License), so builds do not need to reach Google Fonts.
const grotesk = localFont({ src: "../fonts/schibsted-grotesk-latin-wght-normal.woff2", variable: "--font-grotesk", display: "swap", weight: "400 900" });
const fraunces = localFont({ src: "../fonts/fraunces-latin-opsz-normal.woff2", variable: "--font-fraunces", display: "swap", weight: "100 900" });

export const metadata: Metadata = {
  title: "CampusPool | Thapar student rides and company",
  description: "Find your people. Share the ride. Split the fare. A student network for Thapar.",
};

export const viewport: Viewport = {
  themeColor: "#F1F5EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme before React loads, so the server and client markup differ on purpose.
    <html lang="en" className={`${grotesk.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <PrefsProvider>
          <AuthProvider>
            <StoreProvider>
              <SecureChatProvider>
                <AppShell>{children}</AppShell>
              </SecureChatProvider>
            </StoreProvider>
          </AuthProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
