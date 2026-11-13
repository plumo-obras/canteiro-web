"use client";
/**
 * Moldura das páginas fora do workspace (/inicio, /conta e /obras/nova): garante a sessão de login como a Casca faz
 * (renova pelo cookie depois de recarregar, volta ao login se cair) e põe o topo do protótipo: a marca, Obras e Conta
 * logo ao lado, o sino das aprovações e o menu do avatar (o mesmo do workspace: Conta e créditos, tema, Sair).
 * No celular o topo é só a marca, o sino e o avatar; na Conta, "voltar" e o título, como uma tela de ajustes.
 * É a própria área de rolagem: a casca trava a rolagem do body no desktop.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import type { ResumoObra, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { ProvedorCasca } from "../contexto";
import { Icone, Logo } from "../Icone";
import { MenuPerfil } from "../MenuPerfil";
import { useCelular } from "../midia";
import { useCarregar } from "../useCarregar";
import { useSessaoGarantida } from "../useSessaoGarantida";
import s from "./moldura.module.css";

export type Rota = "inicio" | "conta";

export function Moldura({ demo, rota, children }: { demo: boolean; rota: Rota; children: (u: Usuario) => ReactNode }) {
  const usuario = useSessaoGarantida();
  const celular = useCelular();

  if (!usuario) {
    return (
      <div className="abrindo" role="status">
        Abrindo o Plumo…
      </div>
    );
  }

  const item = (k: Rota, href: string, rotulo: string) => (
    <Link href={href} className={s.nav} aria-current={rota === k ? "page" : undefined}>
      {rotulo}
    </Link>
  );

  return (
    <ProvedorCasca usuario={usuario} demo={demo}>
      <div className={s.pagina}>
        <header className={s.topo}>
          {celular && rota === "conta" ? (
            <div className={`${s.topoIn} ${s.topoAjustes}`}>
              <Link href="/inicio" className={s.voltar} aria-label="Voltar às obras">
                <Icone nome="chevRight" tam={20} className={s.voltarIc} />
              </Link>
              <span className={s.titulo}>Conta</span>
            </div>
          ) : (
            <div className={s.topoIn}>
              <Link href="/inicio" className={s.marca} aria-label="Plumo, início">
                <Logo />
                <span className={s.marcaT}>Plumo</span>
              </Link>
              {demo ? <span className={s.demo}>demonstração</span> : null}
              {celular ? null : (
                <nav className={s.navs} aria-label="Principal">
                  {item("inicio", "/inicio", "Obras")}
                  {item("conta", "/conta", "Conta")}
                </nav>
              )}
              <span className={s.sp} />
              <Sino />
              <MenuPerfil usuario={usuario} />
            </div>
          )}
        </header>
        <main className={s.conteudo}>{children(usuario)}</main>
      </div>
    </ProvedorCasca>
  );
}

/**
 * O sino do topo: as aprovações de todas as obras somadas (o mesmo número do sino do workspace). Com uma obra só
 * esperando, leva direto às Aprovações dela; com várias, às obras, onde cada etiqueta diz qual.
 * Falhar aqui não pode derrubar a página: sem o resumo, o sino fica sem número.
 */
function Sino() {
  const { dado } = useCarregar(() => api.resumoObras().catch(() => [] as ResumoObra[]), []);
  const comPendencia = (dado ?? []).filter((r) => r.pendencias > 0);
  const n = comPendencia.reduce((t, r) => t + r.pendencias, 0);
  const href = comPendencia.length === 1 ? `/?obra=${encodeURIComponent(comPendencia[0]!.obra.id)}&tela=aprovacoes` : "/inicio";
  return (
    <Link
      href={href}
      className="topo-sino"
      aria-label={`Aprovações: ${n === 0 ? "nada esperando você" : n === 1 ? "1 coisa esperando você" : `${n} coisas esperando você`}`}
      title="Aprovações"
    >
      <Icone nome="sino" tam={18} />
      {n ? (
        <span className="topo-sino-n" aria-hidden="true">
          {n}
        </span>
      ) : null}
    </Link>
  );
}
