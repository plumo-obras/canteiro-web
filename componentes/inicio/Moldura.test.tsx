import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USUARIO } from "@/testes/rede";
import { Moldura } from "./Moldura";

const replace = vi.hoisted(() => vi.fn());
const caminho = vi.hoisted(() => ({ atual: "/inicio" }));
const sair = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/navigation", () => ({ usePathname: () => caminho.atual, useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/lib/sessao", () => ({ sair, comAcesso: (u: string, i: RequestInit) => fetch(u, i) }));
vi.mock("../useSessaoGarantida", () => ({ useSessaoGarantida: () => USUARIO }));

const montar = (rota: "inicio" | "conta" = "inicio") =>
  render(
    <Moldura demo={false} rota={rota}>
      {() => <p>conteúdo</p>}
    </Moldura>,
  );
const avatar = () => screen.getByRole("button", { name: "Rizzi, admin" });

beforeEach(() => {
  caminho.atual = "/inicio";
});

describe("topo de /inicio e /conta", () => {
  it("o menu do avatar tem Sair, sem precisar abrir uma obra", async () => {
    montar();
    await userEvent.click(avatar());
    expect(screen.getByRole("menuitem", { name: "Conta e créditos" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Tema/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: "Sair" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/entrar"));
    expect(sair).toHaveBeenCalledOnce();
  });

  it("teclado: Enter abre com foco no primeiro item, setas andam, Esc fecha e devolve o foco ao avatar", async () => {
    montar();
    avatar().focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Conta e créditos" }));
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /Tema/ }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(avatar());
  });

  it("já em /conta, Conta e créditos fecha o menu e aparece como a página atual", async () => {
    caminho.atual = "/conta";
    montar("conta");
    await userEvent.click(avatar());
    const item = screen.getByRole("menuitem", { name: "Conta e créditos" });
    expect(item.getAttribute("aria-current")).toBe("page");
    await userEvent.click(item);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
