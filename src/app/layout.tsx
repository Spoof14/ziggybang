import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Ziggybang",
  description: "직방과 네이버 부동산 매물을 한 지도에서 모아봅니다.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${GeistSans.variable}`}>
      <body className="bg-slate-950">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
