import "~/styles/globals.css";

import { Analytics } from "@vercel/analytics/next";
import { GeistSans } from "geist/font/sans";
import { type Metadata, type Viewport } from "next";

import { headers } from "next/headers";
import { LANG_HEADER, parseLang, DEFAULT_LANG } from "~/lib/i18n/lang";
import { LangProvider } from "~/lib/i18n/react";
import { TRPCReactProvider } from "~/trpc/react";
import { canonicalSiteUrl } from "~/lib/site-url";

const SITE_URL = canonicalSiteUrl();
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolved by middleware from ?lang= / the lang cookie.
  const lang = parseLang((await headers()).get(LANG_HEADER)) ?? DEFAULT_LANG;
  return (
    <html lang={lang} className={`${GeistSans.variable}`}>
      <body className="bg-slate-950">
        <LangProvider initialLang={lang}>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </LangProvider>
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  );
}
