import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NavProgress } from "@/components/layout/NavProgress";
import { SiteFooter, SiteHeader } from "@/components/layout/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

// League data changes whenever a result is entered, so always render fresh.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Tournament Management System", template: "%s · Tournament Management System" },
  description: "League tables, fixtures, results and stats for every tournament.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d3b66" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Suspense>
          <NavProgress />
        </Suspense>
        <SiteHeader user={await getCurrentUser()} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:py-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
