import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USUARIO } from "@/testes/rede";
import { Moldura } from "./Moldura";

const replace = vi.hoisted(() => vi.fn());
const sair = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/lib/sessao", () => ({ sair, comAcesso: (u: string, i: RequestInit) => fetch(u, i) }));
vi.mock("../useSessaoGarantida", () => ({ useSessaoGarantida: () => USUARIO }));

describe("topo de /inicio e /conta", () => {
  it("o menu do avatar tem Sair, sem precisar abrir uma obra", async () => {
    render(
      <Moldura demo={false} rota="inicio">
        {() => <p>conteúdo</p>}
      </Moldura>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Rizzi, admin" }));
    expect(screen.getByRole("menuitem", { name: "Conta e créditos" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Tema/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sair" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/entrar"));
    expect(sair).toHaveBeenCalledOnce();
  });
});
