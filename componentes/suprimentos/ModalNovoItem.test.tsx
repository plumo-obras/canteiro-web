import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { ModalNovoItem } from "./ModalNovoItem";

const BUSCA = {
  consulta: { contem: ["ACO"], nao_contem: [] },
  uf: "MG",
  desonerado: false,
  carregando: [],
  itens: [
    { base: "sinapi", tipo: "insumo", codigo: "34", descricao: "ACO CA-50, 10,0 MM, VERGALHAO", unidade: "KG", grupo: "MATERIAL", mes: "2026-09", preco_centavos: 669 },
  ],
};

function montar() {
  return render(
    <ProvedorCasca usuario={USUARIO} demo={false}>
      <ModalNovoItem obraId="o-1" uf="MG" fechar={() => {}} />
    </ProvedorCasca>,
  );
}

beforeEach(() => limparSessao());
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("ModalNovoItem — busca na tabela oficial", () => {
  it("sem o serviço ligado (503), a busca some e o cadastro manual segue", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/produtos/bases": () => json({ detail: "não ligado" }, 503) });
    montar();
    expect(await screen.findByLabelText("Nome")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByLabelText(/Buscar na tabela oficial/)).not.toBeInTheDocument();
  });

  it("escolher um produto preenche nome, unidade e o preço de referência, e cadastra com valor_unitario", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/produtos/bases": () => json([{ base: "sinapi", nome: "SINAPI", orgao: "Caixa", abrangencia: "nacional", fonte_url: "", meses: ["2026-09"] }]),
      "GET /srv/produtos/itens": () => json(BUSCA),
      "POST /srv/api/obras/o-1/insumos": () => json({ id: "i1", nome: "ACO CA-50, 10,0 MM, VERGALHAO", registro_id: "r1" }, 201),
    });
    const u = userEvent.setup();
    montar();

    await u.type(await screen.findByLabelText(/Buscar na tabela oficial/), "aco 10");
    const opcao = await screen.findByRole("option", { name: /ACO CA-50, 10,0 MM/ });
    expect(opcao).toHaveTextContent("SINAPI");
    expect(opcao).toHaveTextContent("R$ 6,69");
    await u.click(within(opcao).getByRole("button"));

    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("ACO CA-50, 10,0 MM, VERGALHAO");
    expect((screen.getByLabelText("Unidade") as HTMLSelectElement).value).toBe("kg");
    expect(screen.getByText(/Preço de referência/)).toHaveTextContent("R$ 6,69");
    expect(screen.getByText(/Preço de referência/)).toHaveTextContent("SINAPI 34");

    await u.click(screen.getByRole("button", { name: "Cadastrar material" }));
    const envio = rede.chamadas.find((c) => c.caminho === "/srv/api/obras/o-1/insumos")!;
    expect(envio.corpo).toMatchObject({ nome: "ACO CA-50, 10,0 MM, VERGALHAO", unidade: "kg", valor_unitario: 669 });
  });

  it("a UF da obra vai na busca", async () => {
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/produtos/bases": () => json([{ base: "sinapi", nome: "SINAPI", orgao: "", abrangencia: "", fonte_url: "", meses: ["2026-09"] }]),
      "GET /srv/produtos/itens": () => json(BUSCA),
    });
    const u = userEvent.setup();
    montar();
    await u.type(await screen.findByLabelText(/Buscar na tabela oficial/), "concreto");
    await screen.findByRole("option", { name: /ACO CA-50/ });
    expect(rede.chamadas.find((c) => c.caminho === "/srv/produtos/itens")!.url.searchParams.get("uf")).toBe("MG");
  });
});
