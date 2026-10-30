"use client";
/**
 * Moldura das páginas fora do workspace (/inicio e /conta): garante a sessão de login como a Casca faz (renova pelo
 * cookie depois de recarregar, volta ao login se cair) e põe um topo simples com Início, Conta e o workspace.
 * É a própria área de rolagem: a casca trava a rolagem do body no desktop.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Usuario } from "@/lib/contrato";
import { assinarSessao, renovar, usuarioAtual } from "@/lib/sessao";
import { ProvedorCasca } from "../contexto";
import { Icone, Logo } from "../Icone";
import s from "./moldura.module.css";

export type Rota = "inicio" | "conta";

export function Moldura({ demo, rota, children }: { demo: boolean; rota: Rota; children: (u: Usuario) => ReactNode }) {
  const router = useRouter();
  const usuario = useSyncExternalStore(assinarSessao, usuarioAtual, () => null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (usuarioAtual() ? Promise.resolve(true) : renovar()).then((ok) => {
      if (!vivo) return;
      if (ok) setPronto(true);
      else router.replace("/entrar");
    });
    return () => {
      vivo = false;
    };
  }, [router]);

  useEffect(() => {
    if (pronto && !usuario) router.replace("/entrar");
  }, [pronto, usuario, router]);

  if (!pronto || !usuario) {
    return (
      <div className="abrindo" role="status">
        Abrindo o Canteiro…
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
            <Link href="/inicio" className={s.marca} aria-label="Canteiro, início">
              <Logo />
              <span className={s.marcaT}>Canteiro</span>
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
          </div>
        </header>
        <main className={s.conteudo}>{children(usuario)}</main>
      </div>
    </ProvedorCasca>
  );
}
