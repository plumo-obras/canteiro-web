import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { NovaObra, destinoDe } from "./NovaObra";

const push = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push }) }));

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
    // o contrato vem recolhido: abre para lançar o valor
    await u.click(screen.getByText("Contrato"));
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

  it("só o nome é obrigatório e o contrato vem recolhido", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk });
    const u = userEvent.setup();
    render(<NovaObra usuario={USUARIO} />);
    expect(screen.getByLabelText(/BDI/).closest("details")!.open).toBe(false);

    await u.click(screen.getByRole("button", { name: "Criar obra" }));
    expect(await screen.findByText(/Dê um nome para a obra/)).toBeInTheDocument();
    expect(rede.chamadas.some((c) => c.caminho === "/srv/api/obras")).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("erro num campo do contrato abre o bloco recolhido", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    const u = userEvent.setup();
    render(<NovaObra usuario={USUARIO} />);
    const contrato = screen.getByLabelText(/BDI/).closest("details")!;
    await u.click(screen.getByText("Contrato"));
    await u.type(screen.getByLabelText(/BDI/), "300");
    await u.click(screen.getByText("Contrato"));
    expect(contrato.open).toBe(false);
    await u.type(screen.getByLabelText("Nome da obra"), "Obra Inventada");
    await u.click(screen.getByRole("button", { name: "Criar obra" }));
    expect(await screen.findByText(/BDI em %/)).toBeInTheDocument();
    expect(contrato.open).toBe(true);
  });

  it("o começo escolhido decide aonde a tela vai depois de criar", async () => {
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "POST /srv/api/obras": () => json({ id: "o-7", nome: "Obra Inventada" }, 201),
    });
    const u = userEvent.setup();
    render(<NovaObra usuario={USUARIO} />);
    await u.type(screen.getByLabelText("Nome da obra"), "Obra Inventada");
    await u.click(screen.getByRole("radio", { name: /Já tenho a planilha do orçamento/ }));
    await u.click(screen.getByRole("button", { name: "Criar obra" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/?obra=o-7&tela=orcamento"));
    expect(destinoDe("o-7", "cadastrar")).toBe("/inicio");
  });

  it("viewer não cadastra", () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    render(<NovaObra usuario={{ ...USUARIO, papel: "viewer" }} />);
    expect(screen.getByRole("heading", { name: "Seu papel não cadastra obras" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Criar obra" })).toBeNull();
  });
});
