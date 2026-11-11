import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nordic Equity Risk Analyzer",
  description: "Screen Nordic large caps on risk-adjusted return, in SEK, and build a max-Sharpe portfolio.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
