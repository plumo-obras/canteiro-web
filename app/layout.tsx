import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--fonte-plex", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--fonte-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: "Canteiro",
  description: "Agente de IA para gestão de obras",
  robots: { index: false, follow: false },
};

// cover: o app desenha até a borda e respeita a área segura no CSS; resizes-content: o teclado encolhe o 100dvh e o
// campo da conversa sobe junto, em vez de ficar escondido atrás dele.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#e7eaea" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plex.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
