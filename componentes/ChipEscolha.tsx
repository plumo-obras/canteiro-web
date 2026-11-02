"use client";
/**
 * Chip de filtro com menu pequeno ("Curva: Todas ▾"): escolha única sem ocupar uma linha inteira como o segmentado.
 * O menu vai num portal com position:fixed (como o "⋯"): flutua por cima de tudo, alinhado à direita do botão e virando
 * para cima ou para dentro da tela quando não cabe. Assim não estoura a borda de um contêiner com overflow (o Gantt)
 * nem cria barra de rolagem. Menu do ARIA (menuitemradio): ↑↓ navegam, Enter/Espaço escolhem, Esc fecha e devolve o
 * foco; clique fora, rolagem ou redimensionar fecham.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icone } from "./Icone";

export function ChipEscolha<K extends string | null>(props: { rotulo: string; valor: K; opcoes: { k: K; rotulo: string }[]; mudar: (k: K) => void }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const id = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const atual = props.opcoes.find((o) => o.k === props.valor) ?? props.opcoes[0]!;

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
    // alinhado à direita do botão, preso dentro da janela
    setPos({ left: Math.max(8, Math.min(innerWidth - w - 8, r.right - w)), top: cima ? r.top - 6 - h : r.bottom + 6 });
    pop.current.querySelector<HTMLElement>("[aria-checked=true]")?.focus({ preventScroll: true });
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

  const tecla = (e: React.KeyboardEvent) => {
    const itens = [...(pop.current?.querySelectorAll<HTMLElement>("[role=menuitemradio]") ?? [])];
    const i = itens.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      fechar(true);
    } else if (e.key === "Tab") fechar();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      itens[(i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length]?.focus();
    }
  };

  return (
    <>
      <button
        ref={botao}
        type="button"
        className={`chip-esc-b${props.valor !== props.opcoes[0]!.k ? " ativo" : ""}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => (aberto ? fechar() : setAberto(true))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !aberto) {
            e.preventDefault();
            setAberto(true);
          }
        }}
      >
        <span className="mut">{props.rotulo}:</span> {atual.rotulo}
        <Icone nome="chevDown" tam={13} />
      </button>
      {aberto
        ? createPortal(
            <div
              ref={pop}
              id={id}
              role="menu"
              aria-label={props.rotulo}
              className="ca-menu-pop chip-esc-pop"
              style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? "visible" : "hidden" }}
              onKeyDown={tecla}
            >
              {props.opcoes.map((o) => (
                <button
                  key={String(o.k)}
                  type="button"
                  role="menuitemradio"
                  aria-checked={o.k === props.valor}
                  tabIndex={-1}
                  onClick={() => {
                    props.mudar(o.k);
                    fechar(true);
                  }}
                >
                  {o.k === props.valor ? <Icone nome="check" tam={14} /> : <span className="chip-esc-vazio" />}
                  {o.rotulo}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
