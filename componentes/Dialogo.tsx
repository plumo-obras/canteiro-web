"use client";
/**
 * Modal × drawer, como no protótipo: o modal GRAVA (clicar fora não fecha, para não perder o que foi digitado) e o
 * drawer CONSULTA (clicar fora fecha). Os dois: role=dialog, X, Esc, foco preso enquanto abertos e devolvido ao fechar.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icone } from "./Icone";

const FOCAVEIS = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function useFocoPreso(caixa: React.RefObject<HTMLElement | null>, fechar: () => void, focoInicial?: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    (focoInicial?.current ?? caixa.current)?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== "Tab" || !caixa.current) return;
      const fs = [...caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (!fs.length) return;
      const primeiro = fs[0]!;
      const ultimo = fs[fs.length - 1]!;
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === caixa.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      if (antes && document.contains(antes)) antes.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Modal(props: { titulo: string; fechar: () => void; children: ReactNode; rodape: ReactNode; focoInicial?: React.RefObject<HTMLElement | null> }) {
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocoPreso(caixa, props.fechar, props.focoInicial);
  return createPortal(
    <div className="modal">
      <div ref={caixa} className="box" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <button type="button" className="iconbtn dlg-x" aria-label="Fechar" onClick={props.fechar}>
          <Icone nome="x" tam={18} />
        </button>
        <h2 id={id}>{props.titulo}</h2>
        {props.children}
        <div className="rodape">{props.rodape}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Drawer(props: { titulo: ReactNode; fechar: () => void; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocoPreso(caixa, props.fechar);
  return createPortal(
    <div className="drawer" onMouseDown={(e) => e.target === e.currentTarget && props.fechar()}>
      <div ref={caixa} className="pane" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <button type="button" className="iconbtn dlg-x" aria-label="Fechar" onClick={props.fechar}>
          <Icone nome="x" tam={18} />
        </button>
        <h2 id={id}>{props.titulo}</h2>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
