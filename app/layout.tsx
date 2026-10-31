import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--fonte-figtree", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--fonte-geist-mono", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--fonte-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: "Plumo",
  description: "Agente de IA para gestão de obras",
  robots: { index: false, follow: false },
};

// cover: o app desenha até a borda e respeita a área segura no CSS; resizes-content: o teclado encolhe o 100dvh e o
// campo da conversa sobe junto, em vez de ficar escondido atrás dele.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#eceeeb" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${figtree.variable} ${bricolage.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
