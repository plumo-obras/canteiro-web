"use client";
/**
 * Moldura das páginas fora do workspace (/inicio e /conta): garante a sessão de login como a Casca faz (renova pelo
 * cookie depois de recarregar, volta ao login se cair) e põe um topo simples com Início, Conta, o workspace e o menu do
 * avatar (o mesmo do workspace: Conta e créditos, tema, Sair).
 * É a própria área de rolagem: a casca trava a rolagem do body no desktop.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import type { Usuario } from "@/lib/contrato";
import { ProvedorCasca } from "../contexto";
import { Icone, Logo } from "../Icone";
import { MenuPerfil } from "../MenuPerfil";
import { useSessaoGarantida } from "../useSessaoGarantida";
import s from "./moldura.module.css";

export type Rota = "inicio" | "conta";

export function Moldura({ demo, rota, children }: { demo: boolean; rota: Rota; children: (u: Usuario) => ReactNode }) {
  const usuario = useSessaoGarantida();

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
          <div className={s.topoIn}>
            <Link href="/inicio" className={s.marca} aria-label="Plumo, início">
              <Logo />
              <span className={s.marcaT}>Plumo</span>
            </Link>
            {demo ? <span className={s.demo}>demonstração</span> : null}
            <nav className={s.navs} aria-label="Principal">
              {item("inicio", "/inicio", "Início")}
              {item("conta", "/conta", "Conta")}
            </nav>
            <Link href="/" className={`btn ${s.work}`}>
              <Icone nome="message" tam={15} />
              <span className={s.workT}>Abrir workspace</span>
            </Link>
            <MenuPerfil usuario={usuario} />
          </div>
        </header>
        <main className={s.conteudo}>{children(usuario)}</main>
      </div>
    </ProvedorCasca>
  );
}
