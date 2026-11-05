import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComprovanteDetalhe, EtapaNaArvore, GastoObra, Obra, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "../contexto";
import { Gastos } from "../Gastos";
import { Revisao } from "./Revisao";

const OBRA = { id: "o1", nome: "Edifício Teste", status: "em_andamento" } as Obra;
const ARVORE: EtapaNaArvore[] = [
  { chave: "eletrica", nome: "Instalações elétricas", inclui: "fios", fixa: true, topicos: [{ id: "t1", nome: "Quadro geral" }] },
  { chave: "pisos", nome: "Pisos", inclui: "", fixa: true, topicos: [] },
];
const op = (valor: number | string, rotulo: string, motivo = "lido", fornecedor_id: string | null = null) => ({ valor, rotulo, motivo, fornecedor_id });

function detalhe(parcial: Partial<ComprovanteDetalhe["revisao"]> = {}): ComprovanteDetalhe {
  return {
    id: "c1",
    obra_id: "o1",
    tipo_conteudo: "image/jpeg",
    tamanho: 10,
    legenda: "eletricista",
    quem: "Rizzi",
    status: "a_revisar",
    leitura: {},
    erro_leitura: null,
    lido_em: null,
    gasto_id: null,
    motivo_descarte: "",
    criado_em: "2026-11-05T13:00:00Z",
    revisao: {
      valor: { estado: "lido", escolhido: 0, opcoes: [op(35000, "R$ 350,00", "valor do Pix")] },
      data_pagamento: { estado: "conferir", escolhido: null, opcoes: [op("2026-11-03", "03/11/2026", "data do Pix"), op("2026-10-28", "28/10/2026", "emissão")] },
      favorecido: { estado: "lido", escolhido: 0, opcoes: [op("Elétrica Central", "Elétrica Central", "CNPJ", "f1")] },
      descricao: { estado: "vazio", escolhido: null, opcoes: [] },
      classificacao: { estado: "lido", escolhido: 0, opcoes: [{ etapa: "eletrica", topico_id: "t1", rotulo: "Instalações elétricas › Quadro geral", motivo: "legenda" }] },
      tipo_documento: "comprovante_pix",
      situacao_pagamento: "pago",
      avisos: [],
      observacoes: null,
      ...parcial,
    },
  };
}

function rede(d = detalhe(), extra: Parameters<typeof criarRede>[0] = {}) {
  return criarRede({
    "POST /srv/auth/renovar": renovarOk,
    "GET /srv/api/comprovantes/c1": () => json(d),
    "GET /srv/api/obras/o1/arvore": () => json(ARVORE),
    "GET /srv/api/obras/o1/pedidos": () => json([]),
    "GET /srv/api/comprovantes/c1/arquivo": () => new Response(new Blob(["foto"], { type: "image/jpeg" })),
    ...extra,
  });
}

const abrir = (usuario: Usuario = USUARIO, fechar = vi.fn()) => {
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Revisao comprovanteId="c1" obra={OBRA} fechar={fechar} />
    </ProvedorCasca>,
  );
  return fechar;
};
const grupo = (nome: string) => screen.getByRole("radiogroup", { name: nome });

beforeEach(() => {
  limparSessao();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:foto", revokeObjectURL: () => {} }));
});
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("revisão do comprovante", () => {
  it("lido vem marcado, em dúvida nada vem marcado, e Confirmar diz o que falta", async () => {
    rede();
    abrir();
    await screen.findByRole("radiogroup", { name: "Valor pago" });
    expect(within(grupo("Valor pago")).getByRole("radio", { name: /R\$ 350,00/ })).toBeChecked();
    expect(within(grupo("Valor pago")).getByText("Lido")).toBeInTheDocument();
    expect(within(grupo("Data do pagamento")).getByText("Confira")).toBeInTheDocument();
    for (const r of within(grupo("Data do pagamento")).getAllByRole("radio")) expect(r).not.toBeChecked();
    expect(within(grupo("O que foi pago")).getByText("Em branco")).toBeInTheDocument();
    expect(within(grupo("Quem recebeu")).getByText("fornecedor cadastrado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar gasto" })).toBeDisabled();
    expect(screen.getByText(/Para confirmar, falta:/)).toHaveTextContent("falta: data do pagamento, o que foi pago.");
  });

  it("escolhida a data e digitado o que foi pago, confirma com o corpo certo e fecha", async () => {
    const r = rede(detalhe(), {
      "POST /srv/api/comprovantes/c1/confirmar": () =>
        json({ gasto: { id: "g1", valor: 35000 } as GastoObra, comprovante: { id: "c1" }, registro_id: "r1" }, 201),
    });
    const fechar = abrir();
    await userEvent.click(await screen.findByRole("radio", { name: /28\/10\/2026/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "O que foi pago (outro)" }), "mão de obra do eletricista");
    const confirmar = screen.getByRole("button", { name: "Confirmar gasto" });
    expect(confirmar).toBeEnabled();
    await userEvent.click(confirmar);
    await waitFor(() => expect(fechar).toHaveBeenCalled());
    const enviado = r.chamadas.find((c) => c.caminho.endsWith("/confirmar"))!.corpo;
    expect(enviado).toEqual({
      valor: 35000,
      data_pagamento: "2026-10-28",
      favorecido: "Elétrica Central",
      descricao: "mão de obra do eletricista",
      etapa: "eletrica",
      topico_id: "t1",
      fornecedor_id: "f1",
      pedido_id: null,
    });
  });

  it("passar pelo campo próprio com Tab não desmarca a opção da IA; digitar escolhe a própria", async () => {
    rede();
    abrir();
    const lida = await screen.findByRole("radio", { name: /R\$ 350,00/ });
    const campo = screen.getByRole("textbox", { name: "Valor pago (outro)" });
    // navega como no teclado: da opção lida até o campo próprio, só com Tab
    await userEvent.click(lida);
    for (let i = 0; i < 6 && document.activeElement !== campo; i++) await userEvent.tab();
    expect(campo).toHaveFocus();
    expect(lida).toBeChecked();
    await userEvent.type(campo, "360,00");
    expect(lida).not.toBeChecked();
    expect(within(grupo("Valor pago")).getByRole("radio", { name: "Outra resposta" })).toBeChecked();
  });

  it("Ler de novo avisa antes de trocar o que a pessoa já escolheu", async () => {
    const r = rede(detalhe(), { "POST /srv/agente/leitura": () => json({ ok: true }) });
    abrir();
    await userEvent.click(await screen.findByRole("radio", { name: /03\/11\/2026/ }));
    await userEvent.click(screen.getByRole("button", { name: "Ler de novo" }));
    expect(screen.getByText("Ler de novo troca o que você já escolheu ou digitou.")).toBeInTheDocument();
    expect(r.chamadas.some((c) => c.caminho === "/srv/agente/leitura")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Ler mesmo assim" }));
    await waitFor(() => expect(r.chamadas.some((c) => c.caminho === "/srv/agente/leitura")).toBe(true));
  });

  it("sem nada escolhido, Ler de novo lê na hora", async () => {
    const r = rede(detalhe(), { "POST /srv/agente/leitura": () => json({ ok: true }) });
    abrir();
    await userEvent.click(await screen.findByRole("button", { name: "Ler de novo" }));
    await waitFor(() => expect(r.chamadas.some((c) => c.caminho === "/srv/agente/leitura")).toBe(true));
  });

  it("quem só lê vê a revisão, mas não confirma nem descarta", async () => {
    rede();
    abrir({ ...USUARIO, papel: "viewer" });
    await screen.findByRole("radiogroup", { name: "Valor pago" });
    expect(screen.getByText("Só quem opera a obra confirma o gasto.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar gasto" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Não é gasto" })).toBeNull();
  });

  it("avisos da leitura aparecem antes dos campos", async () => {
    rede(detalhe({ avisos: ["Este documento não comprova pagamento."] }));
    abrir();
    expect(await screen.findByRole("list", { name: "Atenção" })).toHaveTextContent("não comprova pagamento");
  });
});

describe("gastos lançados", () => {
  const gasto = (n: number): GastoObra => ({
    id: `g${n}`,
    obra_id: "o1",
    comprovante_id: null,
    valor: 1000 + n,
    data_pagamento: "2026-11-03",
    favorecido: "João",
    fornecedor_id: null,
    descricao: `gasto ${n}`,
    etapa: "pisos",
    topico_id: null,
    pedido_id: null,
    quem: "Rizzi",
    estornado: false,
    criado_em: new Date(Date.UTC(2026, 10, 5, 12, 0, 0) - n * 60_000).toISOString(),
  });

  it("mostra 50 por vez e carrega os mais antigos pelo cursor até acabar", async () => {
    const pagina1 = Array.from({ length: 50 }, (_, i) => gasto(i));
    const pagina2 = Array.from({ length: 7 }, (_, i) => gasto(50 + i));
    const r = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/api/obras/o1/comprovantes": () => json([]),
      "GET /srv/api/obras/o1/gastos/resumo": () => json({ total: 0, pagamentos_de_pedidos: 0, a_revisar: 0, etapas: [] }),
      "GET /srv/api/obras/o1/arvore": () => json(ARVORE),
      "GET /srv/api/obras/o1/gastos": ({ url }) => json(url.searchParams.get("antes_de") ? pagina2 : pagina1),
    });
    render(
      <ProvedorCasca usuario={USUARIO} demo={false}>
        <Gastos obra={OBRA} />
      </ProvedorCasca>,
    );
    await userEvent.click(await screen.findByRole("tab", { name: "Lançados" }));
    const lista = await screen.findByRole("list", { name: "Gastos lançados" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "Carregar gastos mais antigos" }));
    await waitFor(() => expect(within(lista).getAllByRole("listitem")).toHaveLength(57));
    const mais = r.chamadas.filter((c) => c.caminho === "/srv/api/obras/o1/gastos");
    expect(mais.at(-1)!.url.searchParams.get("antes_de")).toBe(pagina1.at(-1)!.criado_em);
    expect(mais.at(-1)!.url.searchParams.get("limite")).toBe("50");
    // a 2ª página veio menor que 50: acabou, o botão some
    expect(screen.queryByRole("button", { name: "Carregar gastos mais antigos" })).toBeNull();
  });
});
