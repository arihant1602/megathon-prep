import type { Metadata } from "next";
import {
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_Gujarati,
  Noto_Sans_Gurmukhi,
  Noto_Sans_Kannada,
  Noto_Sans_Malayalam,
  Noto_Sans_Oriya,
  Noto_Sans_Tamil,
  Noto_Sans_Telugu,
  Outfit,
} from "next/font/google";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
// Indic scripts load only when a page actually renders those glyphs.
const deva = Noto_Sans_Devanagari({ variable: "--font-deva", subsets: ["devanagari"], preload: false, display: "swap" });
const telu = Noto_Sans_Telugu({ variable: "--font-telu", subsets: ["telugu"], preload: false, display: "swap" });
const taml = Noto_Sans_Tamil({ variable: "--font-taml", subsets: ["tamil"], preload: false, display: "swap" });
const beng = Noto_Sans_Bengali({ variable: "--font-beng", subsets: ["bengali"], preload: false, display: "swap" });
const knda = Noto_Sans_Kannada({ variable: "--font-knda", subsets: ["kannada"], preload: false, display: "swap" });
const mlym = Noto_Sans_Malayalam({ variable: "--font-mlym", subsets: ["malayalam"], preload: false, display: "swap" });
const gujr = Noto_Sans_Gujarati({ variable: "--font-gujr", subsets: ["gujarati"], preload: false, display: "swap" });
const guru = Noto_Sans_Gurmukhi({ variable: "--font-guru", subsets: ["gurmukhi"], preload: false, display: "swap" });
const orya = Noto_Sans_Oriya({ variable: "--font-orya", subsets: ["oriya"], preload: false, display: "swap" });

const fonts = [outfit, deva, telu, taml, beng, knda, mlym, gujr, guru, orya].map((f) => f.variable).join(" ");

export const metadata: Metadata = {
  title: "Boli - ask in your language",
  description: "A voice assistant that listens and answers in 13 Indian languages, built on Bhashini.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fonts} antialiased`}>
      <body className="min-h-[100dvh] font-sans">{children}</body>
    </html>
  );
}
