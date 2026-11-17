"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Usuario } from "@/lib/contrato";
import { assinarSessao, renovarSessao, usuarioAtual } from "@/lib/sessao";

/** Intervalo entre as tentativas de renovar quando a API não responde. */
export const ESPERA_NOVA_TENTATIVA_MS = 3000;

export type SessaoGarantida = {
  /** O usuário, só quando a sessão está pronta. */
  usuario: Usuario | null;
  /** A última renovação falhou por rede ou API fora: a tela diz isso em vez de ficar só em "Abrindo…". */
  semServidor: boolean;
  /** Tenta de novo já, sem esperar o próximo ciclo. */
  tentarAgora: () => void;
};

/**
 * Garante a sessão de login antes de montar a página (a Casca e a Moldura das páginas fora do workspace): depois de
 * recarregar, a sessão volta pelo cookie de renovação; recusada, vai ao login.
 */
export function useSessaoGarantida(): SessaoGarantida {
  const router = useRouter();
  const usuario = useSyncExternalStore(assinarSessao, usuarioAtual, () => null);
  const [pronto, setPronto] = useState(false);
  const [semServidor, setSemServidor] = useState(false);
  const tentarRef = useRef<() => void>(() => undefined);
  // O ciclo de tentativas roda uma vez por montagem: o aviso "sem servidor" re-renderiza, e um router novo a cada
  // render (como em testes) não pode reiniciar o ciclo.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    let vivo = true;
    let espera: ReturnType<typeof setTimeout> | undefined;
    // Falha de rede ou da API (acordando no plano gratuito) não é sessão acabada: tenta de novo em vez de ir ao login.
    const tentar = () => {
      clearTimeout(espera);
      void (usuarioAtual() ? Promise.resolve("ok" as const) : renovarSessao()).then((r) => {
        if (!vivo) return;
        setSemServidor(r === "falha");
        if (r === "ok") setPronto(true);
        else if (r === "negado") routerRef.current.replace("/entrar");
        else espera = setTimeout(tentar, ESPERA_NOVA_TENTATIVA_MS);
      });
    };
    tentarRef.current = tentar;
    tentar();
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, []);

  // Sessão caiu no meio do uso (renovação recusada): volta ao login.
  useEffect(() => {
    if (pronto && !usuario) router.replace("/entrar");
  }, [pronto, usuario, router]);

  const tentarAgora = useCallback(() => tentarRef.current(), []);
  return { usuario: pronto ? usuario : null, semServidor, tentarAgora };
}
