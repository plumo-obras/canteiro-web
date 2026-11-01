"use client";
/**
 * Tema escuro (padrão) ou claro. A escolha fica no navegador e é aplicada por um script no <head> antes da primeira
 * pintura (lib/tema.ts, no app/layout.tsx), para a página não piscar clara e depois escurecer. Aqui só se lê e se troca.
 */
import { useSyncExternalStore } from "react";
import { CHAVE_TEMA } from "@/lib/tema";
import { Icone } from "./Icone";

export type Tema = "escuro" | "claro";
const COR_BARRA: Record<Tema, string> = { escuro: "#0d1016", claro: "#eceeeb" };

const ouvintes = new Set<() => void>();
const ler = (): Tema => (typeof document !== "undefined" && document.documentElement.dataset.tema === "claro" ? "claro" : "escuro");

export function trocarTema(t: Tema) {
  document.documentElement.dataset.tema = t;
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    // sem armazenamento: vale até recarregar
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COR_BARRA[t]);
  ouvintes.forEach((f) => f());
}

export function useTema(): Tema {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    ler,
    () => "escuro",
  );
}

export function BotaoTema({ className = "" }: { className?: string }) {
  const tema = useTema();
  const outro = tema === "escuro" ? "claro" : "escuro";
  return (
    <button type="button" className={className} aria-label={`Usar o tema ${outro}`} title={`Tema ${outro}`} onClick={() => trocarTema(outro)}>
      <Icone nome={tema === "escuro" ? "sol" : "lua"} tam={17} />
    </button>
  );
}
