import type { Metadata } from "next";
import { Literata, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
const literata = Literata({ variable: "--font-literata", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Margin - write together, even offline",
  description: "A collaborative document editor with live cursors, roles and offline edits that merge on reconnect.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${literata.variable} antialiased`}>
      <body className="min-h-[100dvh] font-sans">{children}</body>
    </html>
  );
}
