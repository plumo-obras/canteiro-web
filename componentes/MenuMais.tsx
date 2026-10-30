"use client";
/**
 * Menu "⋯": guarda as ações secundárias (uma ação à vista por linha; o resto aqui). Abre por clique ou teclado
 * (↓/Enter/Espaço focam o 1º item), ↑↓ Home End navegam, Esc fecha e devolve o foco, Tab ou clique fora fecham.
 * Vai num portal com position:fixed para escapar do overflow das listas e do transform dos cartões.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icone } from "./Icone";

export interface ItemMenu {
  rotulo: string;
  acao: () => void;
}

export function MenuMais({ itens, rotulo = "Mais ações" }: { itens: ItemMenu[]; rotulo?: string }) {
  const [aberto, setAberto] = useState<false | "inicio" | "fim" | "sem-foco">(false);
  const [pos, setPos] = useState<{ left: number; top: number; cima: boolean } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const id = useId();

  const fechar = (devolver = false) => {
    setAberto(false);
    setPos(null);
    if (devolver) botao.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!aberto || !botao.current || !pop.current) return;
    const r = botao.current.getBoundingClientRect();
    const w = pop.current.offsetWidth;
    const h = pop.current.offsetHeight;
    const cima = r.bottom + 6 + h > innerHeight - 8 && r.top - 6 - h > 8;
    setPos({ left: Math.max(8, Math.min(innerWidth - w - 8, r.right - w)), top: cima ? r.top - 6 - h : r.bottom + 6, cima });
    const its = pop.current.querySelectorAll<HTMLButtonElement>("[role=menuitem]");
    if (aberto === "inicio") its[0]?.focus({ preventScroll: true });
    if (aberto === "fim") its[its.length - 1]?.focus({ preventScroll: true });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !botao.current?.contains(t)) fechar();
    };
    const rolou = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) fechar();
    };
    const redim = () => fechar();
    document.addEventListener("pointerdown", fora, true);
    addEventListener("scroll", rolou, true);
    addEventListener("resize", redim);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      removeEventListener("scroll", rolou, true);
      removeEventListener("resize", redim);
    };
  }, [aberto]);

  if (!itens.length) return null;

  const teclaBotao = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAberto(e.key === "ArrowUp" ? "fim" : "inicio");
    }
  };
  const teclaMenu = (e: React.KeyboardEvent) => {
    const its = [...(pop.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = its.indexOf(document.activeElement as HTMLButtonElement);
    const ir = (k: number) => {
      e.preventDefault();
      its[(k + its.length) % its.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
    } else if (e.key === "Tab") fechar();
    else if (e.key === "ArrowDown") ir(i + 1);
    else if (e.key === "ArrowUp") ir(i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(its.length - 1);
  };

  return (
    <span className="mm">
      <button
        ref={botao}
        type="button"
        className="mm-b sm"
        aria-haspopup="menu"
        aria-expanded={!!aberto}
        aria-controls={aberto ? id : undefined}
        aria-label={rotulo}
        title={rotulo}
        onClick={(e) => (aberto ? fechar() : setAberto(e.detail === 0 ? "inicio" : "sem-foco"))}
        onKeyDown={teclaBotao}
      >
        <Icone nome="more" />
      </button>
      {aberto &&
        createPortal(
          <div
            ref={pop}
            id={id}
            role="menu"
            aria-label={rotulo}
            className={`mm-pop${pos?.cima ? " cima" : ""}`}
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
            onKeyDown={teclaMenu}
          >
            {itens.map((it) => (
              <button
                key={it.rotulo}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  fechar();
                  it.acao();
                }}
              >
                {it.rotulo}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
