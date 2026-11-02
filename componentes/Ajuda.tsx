"use client";
/**
 * O "?" ao lado de um rótulo (ou, com `gatilho`, uma pílula ou valor que abre o detalhe): a explicação que só serve na primeira vez sai da tela e fica a um toque. É um botão de
 * verdade (Tab alcança, Enter/Espaço abrem, Esc fecha, toque abre e fecha), com aria-label dizendo do que é a ajuda
 * e aria-expanded; o balão é um popover pequeno ancorado no botão, que fecha ao clicar fora.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Ajuda({ rotulo, children, gatilho, classe }: { rotulo: string; children: ReactNode; gatilho?: ReactNode; classe?: string }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const caixa = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [aberto]);
  return (
    <span className="ajuda" ref={caixa}>
      <button
        type="button"
        className={gatilho ? `ajuda-g${classe ? ` ${classe}` : ""}` : "ajuda-b"}
        aria-label={gatilho ? undefined : `O que é ${rotulo}?`}
        title={gatilho ? rotulo : undefined}
        aria-expanded={aberto}
        aria-controls={id}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
      >
        {gatilho ?? "?"}
      </button>
      {aberto ? (
        <span id={id} role="note" className="ajuda-pop">
          {children}
        </span>
      ) : null}
    </span>
  );
}
