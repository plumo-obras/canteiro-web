"use client";
import { useSyncExternalStore } from "react";

/** Uma media query como estado do React (false no servidor). */
export function useMidia(q: string) {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof matchMedia !== "function") return () => undefined;
      const m = matchMedia(q);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => typeof matchMedia === "function" && matchMedia(q).matches,
    () => false,
  );
}

/**
 * Celular (≤ 760 px): barra inferior no lugar das abas, editor do cronograma em lista. Decidido por JS, e não só por
 * CSS: no portal (WebKit com texto ampliado) as duas versões chegaram a aparecer juntas; renderizando uma ou outra, não.
 */
export const useCelular = () => useMidia("(max-width: 760px)");
