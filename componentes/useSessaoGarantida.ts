"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Usuario } from "@/lib/contrato";
import { assinarSessao, renovarSessao, usuarioAtual } from "@/lib/sessao";

/**
 * Garante a sessão de login antes de montar a página (a Casca e a Moldura das páginas fora do workspace): depois de
 * recarregar, a sessão volta pelo cookie de renovação; recusada, vai ao login. Devolve o usuário só quando está pronto.
 */
export function useSessaoGarantida(): Usuario | null {
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

  // Sessão caiu no meio do uso (renovação recusada): volta ao login.
  useEffect(() => {
    if (pronto && !usuario) router.replace("/entrar");
  }, [pronto, usuario, router]);

  return pronto ? usuario : null;
}
