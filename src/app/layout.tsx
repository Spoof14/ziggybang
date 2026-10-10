import "~/styles/globals.css";

import { Analytics } from "@vercel/analytics/next";
import { GeistSans } from "geist/font/sans";
import { type Metadata, type Viewport } from "next";

import { TRPCReactProvider } from "~/trpc/react";

const SITE_URL = "https://ziggybang.vercel.app";
const SITE_TITLE = "Ziggybang";
const SITE_DESCRIPTION =
  "English map of Zigbang, Peterpan, and Naver Korea rentals, with KRW prices and jeonse vs monthly rent explained.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Ziggybang — Korea rentals, in English",
    template: "%s | Ziggybang",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_TITLE,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_TITLE,
    title: "Ziggybang — Korea rentals, in English",
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ziggybang — Korea rentals, in English",
    description: SITE_DESCRIPTION,
  },
  icons: [
    { rel: "icon", url: "/favicon.svg", type: "image/svg+xml" },
    { rel: "icon", url: "/favicon.ico" },
  ],
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body className="bg-slate-950">
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Analytics />
      </body>
    </html>
  );
}
