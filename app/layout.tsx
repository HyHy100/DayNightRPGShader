import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daylight — Cinematic Grade",
  description: "A daylight-aware, GPU-accelerated cinematic color grading studio.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
