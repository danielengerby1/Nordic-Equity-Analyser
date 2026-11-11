import "./globals.css";
import type { Metadata } from "next";

const description =
  "Screens 21 Nordic large caps on risk-adjusted return in SEK, builds a max-Sharpe portfolio, and tests it out of sample.";

export const metadata: Metadata = {
  metadataBase: new URL("https://nordic-equity-analyser.vercel.app"),
  title: "Nordic Equity Risk Analyzer",
  description,
  openGraph: { title: "Nordic Equity Risk Analyzer", description, type: "website", url: "/" },
  twitter: { card: "summary_large_image", title: "Nordic Equity Risk Analyzer", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
