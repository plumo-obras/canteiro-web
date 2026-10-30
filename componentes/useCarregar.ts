"use client";
import { useEffect, useState } from "react";
import { mensagemDe } from "./contexto";

/**
 * Busca ao montar e sempre que as dependências mudam (inclusive a "versão" da casca, que sobe depois de cada escrita).
 * Mantém o dado anterior na tela enquanto recarrega, para a lista não piscar.
 */
export function useCarregar<T>(buscar: () => Promise<T>, deps: unknown[]) {
  const [dado, setDado] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    buscar()
      .then((d) => {
        if (!vivo) return;
        setDado(d);
        setErro(null);
      })
      .catch((e) => vivo && setErro(mensagemDe(e)))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { dado, erro, carregando };
}
