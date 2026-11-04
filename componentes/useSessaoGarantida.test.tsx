import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const sessao = vi.hoisted(() => ({ usuario: null as { id: string } | null, renovar: vi.fn() }));
vi.mock("@/lib/sessao", () => ({
  assinarSessao: () => () => undefined,
  usuarioAtual: () => sessao.usuario,
  renovarSessao: sessao.renovar,
}));

import { useSessaoGarantida } from "./useSessaoGarantida";

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockReset();
  sessao.renovar.mockReset();
  sessao.usuario = null;
});
afterEach(() => vi.useRealTimers());

describe("useSessaoGarantida", () => {
  it("falha de rede tenta de novo em 3 s, sem mandar ao login", async () => {
    sessao.renovar.mockResolvedValueOnce("falha").mockImplementationOnce(async () => {
      sessao.usuario = { id: "u" };
      return "ok";
    });
    const { result, rerender } = renderHook(() => useSessaoGarantida());
    await act(async () => undefined);
    expect(result.current).toBeNull();
    expect(sessao.renovar).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(3000));
    rerender();
    expect(sessao.renovar).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ id: "u" });
    expect(replace).not.toHaveBeenCalled();
  });

  it("renovação recusada vai ao login", async () => {
    sessao.renovar.mockResolvedValue("negado");
    const { result } = renderHook(() => useSessaoGarantida());
    await act(async () => undefined);
    expect(result.current).toBeNull();
    expect(replace).toHaveBeenCalledWith("/entrar");
  });
});
