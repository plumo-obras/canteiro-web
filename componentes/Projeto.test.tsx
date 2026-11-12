import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Obra, Usuario } from "@/lib/contrato";
import { limparSessao } from "@/lib/sessao";
import type { Projeto as ProjetoT } from "@/lib/tradutor";
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";
import { ProvedorCasca } from "./contexto";
import { Projeto } from "./Projeto";

// o 3D (WebGL) e o CAD (WASM num iframe) não rodam no jsdom: aqui só importa o que a tela faz em volta deles
vi.mock("./projeto/Vista3D", () => ({ Vista3D: () => <div>vista 3d</div> }));
vi.mock("./projeto/EditorCad", () => ({ EditorCad: ({ visivel }: { visivel: boolean }) => (visivel ? <div>editor cad</div> : null) }));

const OBRA = { id: "o-1", nome: "Casa Inventada" } as Obra;
const montar = (usuario: Usuario = USUARIO) =>
  render(
    <ProvedorCasca usuario={usuario} demo={false}>
      <Projeto obra={OBRA} />
    </ProvedorCasca>,
  );
const FOLHAS = [{ id: "f1", nome: "locacao.pdf" }, { id: "f2", nome: "formas.pdf" }];

const PROJETO: ProjetoT = {
  traducoes: ["f1"],
  obra: { cliente: "Cliente Inventado", local: null, responsavel: null },
  pacote: [
    { papel: "locacao", nome: "Locação de pilares e fundações", responsavel_por: "posição de cada pilar", obrigatorio_para_3d: true, situacao: "coberto",
      arquivos: [{ id: "f1", arquivo: "locacao.pdf", folha: "01", detalhes: [] }], faltam_pavimentos: [] },
    { papel: "vigas", nome: "Armação das vigas", responsavel_por: "o aço das vigas", obrigatorio_para_3d: false, situacao: "parcial",
      arquivos: [], faltam_pavimentos: ["Cobertura"] },
  ],
  nao_lidos_ainda: [],
  conferencias: [
    { ok: true, texto: "Todas as folhas são do mesmo projeto" },
    { ok: false, texto: "Vigas da cobertura sem armação: V24" },
  ],
  quantitativos: { aco_kg: {}, aco_total_kg: 1129.2, concreto_m3: { "C-25": 20 }, concreto_total_m3: 25.61, forma_m2: 0, por_folha: [] },
  modelo3d: {
    versao_contrato: "1.0", id: "m1", niveis: [], limites: { x0: 0, y0: 0, x1: 100, y1: 100, z0: 0, z1: 300 },
    elementos: [], resumo: { pilar: 31, laje: 13 }, calibracao_formas: [], avisos: [],
  },
  pronto_para_3d: true,
  edicoes_cad: null,
  em_andamento: [],
  nao_encontradas: [],
};

beforeEach(() => {
  limparSessao();
  localStorage.clear();
});
afterEach(() => {
  limparSessao();
  vi.unstubAllGlobals();
});

describe("Projeto 3D", () => {
  it("sem prancha: a vista vira o lugar de soltar e o pacote mostra tudo o que falta", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    montar();
    expect(screen.getByRole("button", { name: /Arraste aqui as pranchas/ })).toBeInTheDocument();
    // o pacote abre numa gaveta a partir do cartão da estrutura
    await userEvent.setup().click(screen.getByRole("button", { name: "Pacote" }));
    const pacote = screen.getByRole("list", { name: "Partes do pacote" });
    expect(within(pacote).getAllByText("Falta").length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: "3D" })).not.toBeInTheDocument();
  });

  it("com o modelo: a estrutura ao lado do 3D; no CAD a coluna recolhe e volta pelo botão", async () => {
    localStorage.setItem("canteiro:projeto:o-1:folhas", JSON.stringify(FOLHAS.slice(0, 1)));
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos": () => json(PROJETO),
    });
    const u = userEvent.setup();
    montar();

    expect(await screen.findByText("vista 3d")).toBeInTheDocument();
    expect(rede.chamadas.find((c) => c.caminho === "/srv/tradutor/projetos")?.url.searchParams.get("ids")).toBe("f1");
    // o que falta e os números ficam na gaveta do pacote, aberta pelo cartão da estrutura
    await u.click(screen.getByRole("button", { name: /^Pacote/ }));
    expect(screen.getByText("1.129,2 kg")).toBeInTheDocument();
    expect(screen.getByText(/Para completar o modelo, falta/)).toBeInTheDocument();

    // conferências: o que pede verificação vem primeiro
    await u.click(screen.getByRole("tab", { name: /Conferências/ }));
    const itens = within(screen.getByRole("tabpanel", { name: /Conferências/ })).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("Verificar");
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fechar" }));

    await u.click(screen.getByRole("tab", { name: "CAD" }));
    expect(screen.getByText("editor cad")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Disciplinas do projeto" })).not.toBeInTheDocument();
    const mostrar = screen.getByRole("button", { name: "Mostrar o pacote" });
    expect(mostrar).toHaveAttribute("aria-expanded", "false");
    await u.click(mostrar);
    expect(screen.getByRole("group", { name: "Disciplinas do projeto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esconder o pacote" })).toHaveAttribute("aria-expanded", "true");
  });

  it("lado a lado: o 3D e o CAD juntos, e a coluna da estrutura recolhe", async () => {
    localStorage.setItem("canteiro:projeto:o-1:folhas", JSON.stringify(FOLHAS.slice(0, 1)));
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/tradutor/projetos": () => json(PROJETO) });
    const u = userEvent.setup();
    montar();
    await screen.findByText("vista 3d");
    expect(screen.getByRole("group", { name: "Disciplinas do projeto" })).toBeInTheDocument();
    await u.click(screen.getByRole("tab", { name: "Lado a lado" }));
    expect(screen.getByText("vista 3d")).toBeInTheDocument();
    expect(screen.getByText("editor cad")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Disciplinas do projeto" })).not.toBeInTheDocument();
    // de volta ao 3D, o CAD sai de vista e a coluna volta
    await u.click(screen.getByRole("tab", { name: "3D" }));
    expect(screen.queryByText("editor cad")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Disciplinas do projeto" })).toBeInTheDocument();
  });

  it("no celular não há CAD: só o 3D, com o aviso de onde editar", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width: 760px"), addEventListener() {}, removeEventListener() {} }));
    localStorage.setItem("canteiro:projeto:o-1:folhas", JSON.stringify(FOLHAS.slice(0, 1)));
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/tradutor/projetos": () => json(PROJETO) });
    montar();
    await screen.findByText("vista 3d");
    expect(screen.getByText("Editar no CAD: só no computador")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "CAD" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Lado a lado" })).not.toBeInTheDocument();
  });

  it("outras disciplinas (simuladas): um cartão cada, e a escolha só muda a tela", async () => {
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    montar();
    for (const nome of ["Hidráulica", "Elétrica", "Prevenção de incêndio"]) expect(screen.getByRole("heading", { name: nome })).toBeInTheDocument();
    const eletrica = screen.getByRole("heading", { name: "Elétrica" }).closest("section")!;
    const vaiTer = within(eletrica).getByRole("button", { name: "Vai ter" });
    expect(vaiTer).toHaveAttribute("aria-pressed", "false");
    await userEvent.setup().click(vaiTer);
    expect(vaiTer).toHaveAttribute("aria-pressed", "true");
    expect(within(eletrica).getByText("Vai ter", { selector: "span" })).toBeInTheDocument();
  });

  it("próximo passo só com pranchas lidas: nem no vazio, nem com folha sendo lida", async () => {
    const passo = { name: "Próximo passo" };
    criarRede({ "POST /srv/auth/renovar": renovarOk });
    const { unmount } = montar();
    expect(screen.queryByRole("region", passo)).toBeNull();
    unmount();

    localStorage.setItem("canteiro:projeto:o-1:folhas", JSON.stringify(FOLHAS.slice(0, 1)));
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos": () => json({ ...PROJETO, em_andamento: [{ id: "f2", status: "processando" }] }),
    });
    const lendo = montar();
    await screen.findByText("vista 3d");
    expect(screen.queryByRole("region", passo)).toBeNull();
    lendo.unmount();

    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/tradutor/projetos": () => json(PROJETO) });
    montar();
    expect(within(await screen.findByRole("region", passo)).getByRole("link", { name: "Ver o orçamento" })).toHaveAttribute("href", "/?obra=o-1&tela=orcamento");
    // o passo vem antes da mesa, e o Enviar pranchas deixa de ser o dourado da tela
    const passoNaTela = screen.getByRole("region", passo);
    expect(passoNaTela.compareDocumentPosition(screen.getByRole("region", { name: "Modelo da obra" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar pranchas" })).not.toHaveClass("amb");
  });

  it("apagar o projeto pede confirmação, apaga cada leitura no tradutor e esvazia o pacote", async () => {
    localStorage.setItem("canteiro:projeto:o-1:folhas", JSON.stringify(FOLHAS));
    const rede = criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos": () => json(PROJETO),
      "DELETE /srv/tradutor/traducoes/f1": () => new Response(null, { status: 204 }),
      "DELETE /srv/tradutor/traducoes/f2": () => json({ detail: "não encontrada" }, 404), // já expirou: conta como apagada
    });
    const u = userEvent.setup();
    montar();
    await screen.findByText("vista 3d");

    await u.click(screen.getByRole("button", { name: "Mais ações do Projeto" }));
    await u.click(screen.getByRole("menuitem", { name: "Apagar o projeto" }));
    const dialogo = screen.getByRole("dialog", { name: "Apagar o projeto desta obra?" });
    // Voltar não apaga nada
    await u.click(within(dialogo).getByRole("button", { name: "Voltar" }));
    expect(rede.chamadas.some((c) => c.metodo === "DELETE")).toBe(false);

    await u.click(screen.getByRole("button", { name: "Mais ações do Projeto" }));
    await u.click(screen.getByRole("menuitem", { name: "Apagar o projeto" }));
    await u.click(screen.getByRole("button", { name: "Apagar 2 pranchas" }));

    expect(await screen.findByText("Projeto apagado: 2 pranchas removidas.")).toBeInTheDocument();
    expect(rede.chamadas.filter((c) => c.metodo === "DELETE").map((c) => c.caminho)).toEqual(["/srv/tradutor/traducoes/f1", "/srv/tradutor/traducoes/f2"]);
    expect(localStorage.getItem("canteiro:projeto:o-1:folhas")).toBe("[]");
    expect(screen.queryByText("vista 3d")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Arraste aqui as pranchas/ })).toBeInTheDocument();
  });

  it("erro do tradutor ao apagar aparece no diálogo e o pacote fica como estava", async () => {
    localStorage.setItem("canteiro:projeto:o-1:folhas", JSON.stringify(FOLHAS.slice(0, 1)));
    criarRede({
      "POST /srv/auth/renovar": renovarOk,
      "GET /srv/tradutor/projetos": () => json(PROJETO),
      "DELETE /srv/tradutor/traducoes/f1": () => json({ detail: "O tradutor de pranchas não respondeu." }, 502),
    });
    const u = userEvent.setup();
    montar();
    await screen.findByText("vista 3d");
    await u.click(screen.getByRole("button", { name: "Mais ações do Projeto" }));
    await u.click(screen.getByRole("menuitem", { name: "Apagar o projeto" }));
    await u.click(screen.getByRole("button", { name: "Apagar 1 prancha" }));
    expect(await within(screen.getByRole("dialog")).findByText("O tradutor de pranchas não respondeu.")).toBeInTheDocument();
    expect(localStorage.getItem("canteiro:projeto:o-1:folhas")).toContain("f1");
  });

  it("viewer vê o projeto, mas sem enviar, tirar ou apagar", async () => {
    localStorage.setItem("canteiro:projeto:o-1:folhas", JSON.stringify(FOLHAS.slice(0, 1)));
    criarRede({ "POST /srv/auth/renovar": renovarOk, "GET /srv/tradutor/projetos": () => json(PROJETO) });
    const u = userEvent.setup();
    montar({ ...USUARIO, papel: "viewer" });
    await screen.findByText("vista 3d");
    expect(screen.queryByRole("button", { name: /Enviar pranchas/ })).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Mais ações do Projeto" }));
    expect(screen.queryByRole("menuitem", { name: "Apagar o projeto" })).not.toBeInTheDocument();
    await u.keyboard("{Escape}");
    await u.click(screen.getByRole("button", { name: /^Folhas/ }));
    expect(screen.queryByRole("button", { name: /Tirar/ })).not.toBeInTheDocument();
  });

  it("prancha acima de 4 MB nem sai do navegador e a pessoa sabe o que fazer", async () => {
    const rede = criarRede({ "POST /srv/auth/renovar": renovarOk });
    const u = userEvent.setup();
    montar();
    const grande = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "foto-da-prancha.png", { type: "image/png" });
    await u.upload(screen.getByLabelText("Pranchas do projeto estrutural"), grande);
    expect(await screen.findByRole("alert")).toHaveTextContent("foto-da-prancha.png: passa de 4 MB");
    expect(rede.chamadas.some((c) => c.caminho === "/srv/tradutor/traducoes")).toBe(false);
  });
});
