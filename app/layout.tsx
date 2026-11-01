import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./casca.css";
import { SCRIPT_TEMA } from "@/lib/tema";

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
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content", themeColor: "#0d1016" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // o script troca data-tema antes da hidratação: sem o aviso, o React reclamaria do atributo que ele não pôs
    <html lang="pt-BR" data-tema="escuro" suppressHydrationWarning className={`${figtree.variable} ${bricolage.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
