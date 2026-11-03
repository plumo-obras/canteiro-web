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
import { assinarSessao, renovarSessao, usuarioAtual } from "@/lib/sessao";
import { ProvedorCasca } from "../contexto";
import { Icone, Logo } from "../Icone";
import { BotaoTema } from "../tema";
import s from "./moldura.module.css";

export type Rota = "inicio" | "conta";

export function Moldura({ demo, rota, children }: { demo: boolean; rota: Rota; children: (u: Usuario) => ReactNode }) {
  const router = useRouter();
  const usuario = useSyncExternalStore(assinarSessao, usuarioAtual, () => null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    // Falha de rede ou da API (acordando no plano gratuito) não é sessão acabada: tenta de novo em vez de ir ao login.
    const tentar = () =>
      (usuarioAtual() ? Promise.resolve("ok" as const) : renovarSessao()).then((r) => {
        if (!vivo) return;
        if (r === "ok") setPronto(true);
        else if (r === "negado") router.replace("/entrar");
        else espera = setTimeout(tentar, 3000);
      });
    void tentar();
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [router]);

  useEffect(() => {
    if (pronto && !usuario) router.replace("/entrar");
  }, [pronto, usuario, router]);

  if (!pronto || !usuario) {
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
            <BotaoTema className={`btn ${s.tema}`} />
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
