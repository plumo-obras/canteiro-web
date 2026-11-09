import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { NovaObra } from "./NovaObra";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  limparSessao();
  push.mockClear();
});
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("Nova obra", () => {
  it("cria a obra numa tela só e abre a tela Projeto dela", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/api/obras": () => json({ id: "o-9", nome: "Galpão Inventado" }, 201),
    });
    const u = userEvent.setup();
    render(<NovaObra usuario={USUARIO} />);

    await u.type(screen.getByLabelText("Nome da obra"), "Galpão Inventado");
    await u.type(screen.getByLabelText("Cidade"), "Cidade Inventada");
    await u.selectOptions(screen.getByLabelText("UF"), "RS");
    await u.click(screen.getByRole("radio", { name: "Galpão" }));
    await u.type(screen.getByLabelText("Área construída (m²)"), "530");
    await u.type(screen.getByLabelText("Valor fechado com o cliente (opcional)"), "520.000");
    await u.click(screen.getByRole("button", { name: "Criar obra" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/?obra=o-9&tela=projeto"));
    expect(rede.chamadas.find((c) => c.caminho === "/srv/api/obras")!.corpo).toMatchObject({
      nome: "Galpão Inventado",
      cidade: "Cidade Inventada",
      uf: "RS",
      tipologia: "galpao",
      area_construida: 530000,
      verba: 52000000,
    });
  });

  it("só o nome é obrigatório e os campos do contrato não aparecem aqui", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk });
    const u = userEvent.setup();
    render(<NovaObra usuario={USUARIO} />);
    expect(screen.queryByLabelText(/BDI/)).toBeNull();
    expect(screen.queryByLabelText(/Endereço/)).toBeNull();

    await u.click(screen.getByRole("button", { name: "Criar obra" }));
    expect(await screen.findByText(/Dê um nome para a obra/)).toBeInTheDocument();
    expect(rede.chamadas.some((c) => c.caminho === "/srv/api/obras")).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("viewer não cadastra", () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    render(<NovaObra usuario={{ ...USUARIO, papel: "viewer" }} />);
    expect(screen.getByRole("heading", { name: "Seu papel não cadastra obras" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar obra" })).toBeNull();
  });
});
