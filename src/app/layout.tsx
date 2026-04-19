import type { Metadata, Viewport } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { brandCss } from "@/lib/brand-theme";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Irrigation Audit | Takeo",
  description: "Field-first irrigation audits for landscape teams",
};

export const viewport: Viewport = {
  themeColor: "#00391F",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Apply the signed-in org's brand colors app-wide. No-op on public routes
  // (login) where getCurrentUser returns null — default Takeo palette stays.
  const user = await getCurrentUser();
  const org = user
    ? await db.org.findUnique({
        where: { id: user.orgId },
        select: { brandColorPrimary: true, brandColorSecondary: true },
      })
    : null;
  const css = org
    ? brandCss(org.brandColorPrimary, org.brandColorSecondary)
    : null;

  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background">
        {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
