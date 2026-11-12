"use client";
/**
 * O menu do avatar (Conta e créditos, tema, Sair) e o hook de menu suspenso que ele usa. Mora fora da casca porque as
 * páginas fora do workspace (/inicio, /conta) também precisam dele: sair não pode depender de abrir uma obra.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Usuario } from "@/lib/contrato";
import { sair } from "@/lib/sessao";
import { Icone } from "./Icone";
import { trocarTema, useTema } from "./tema";

const iniciais = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** Abre e fecha um menu suspenso: foco no primeiro item, fecha com clique fora, Esc e Tab, setas navegam. */
export function useMenu() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    caixa.current?.querySelector<HTMLElement>("[data-foco], [role=menuitem]")?.focus();
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener("pointerdown", fora, true);
    return () => document.removeEventListener("pointerdown", fora, true);
  }, [aberto]);
  const tecla = (e: React.KeyboardEvent) => {
    if (!aberto) return;
    const its = [...(caixa.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = its.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
      caixa.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      its[(i + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length]?.focus();
    } else if (e.key === "Tab") setAberto(false);
  };
  return { aberto, setAberto, caixa, tecla };
}

/** O tema saiu do trilho e do topo: no desktop fica no menu do avatar (no celular, no Mais). */
function ItemTemaMenu() {
  const tema = useTema();
  const outro = tema === "escuro" ? "claro" : "escuro";
  return (
    <button type="button" role="menuitem" tabIndex={-1} onClick={() => trocarTema(outro)}>
      <Icone nome={tema === "escuro" ? "sol" : "lua"} tam={15} />
      Tema {outro}
    </button>
  );
}

/** Sair mora aqui (e não numa prop) para nenhuma tela esquecer de voltar ao login depois de encerrar a sessão. */
export function MenuPerfil({ usuario }: { usuario: Usuario }) {
  const { aberto, setAberto, caixa, tecla } = useMenu();
  const router = useRouter();
  const naConta = usePathname() === "/conta";
  const PAPEL = { viewer: "leitura", admin: "admin", master: "master" } as const;
  return (
    <div className="perfil" ref={caixa} onKeyDown={tecla}>
      <button
        type="button"
        className="av-bt"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`${usuario.nome}, ${PAPEL[usuario.papel]}`}
        onClick={() => setAberto((a) => !a)}
      >
        <span className="av" aria-hidden="true">
          {iniciais(usuario.nome)}
        </span>
      </button>
      {aberto ? (
        <div className="ca-menu-pop perfil-pop" role="menu" aria-label="Conta">
          <div className="pop-sec" aria-hidden="true">
            {usuario.nome} · {PAPEL[usuario.papel]}
          </div>
          {/* já em /conta a navegação não desmonta o menu: fecha à mão */}
          <Link href="/conta" role="menuitem" tabIndex={-1} aria-current={naConta ? "page" : undefined} onClick={() => setAberto(false)}>
            <Icone nome="user" tam={15} />
            Conta e créditos
          </Link>
          <ItemTemaMenu />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={async () => {
              await sair();
              router.replace("/entrar");
            }}
          >
            <Icone nome="logout" tam={15} />
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
