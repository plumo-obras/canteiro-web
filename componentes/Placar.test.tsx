import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { Placar, celulasPlacar } from "./Placar";

type Fin = ResumoDaObra["financeiro"];
type Cro = ResumoDaObra["cronograma"];
const fin = (f: Partial<Fin> = {}): Fin => ({ tem_orcamento: true, orcado_atual: 44044500, comprometido: 2133730, realizado: 2133730, saldo: 41910770, falta_gastar: 41910770, realizado_pct: 480, ...f });
const cro = (c: Partial<Cro> = {}): Cro => ({ cadastrado: true, termino_contratual: "2027-03", termino_projetado: null, atraso_decimos: null, ...c });
const r = (f?: Partial<Fin>, c?: Partial<Cro>) => ({ obra: {}, financeiro: fin(f), cronograma: cro(c) }) as ResumoDaObra;
const valores = (...a: Parameters<typeof celulasPlacar>) => celulasPlacar(...a).map((c) => [c.valor, c.sub]);

describe("o placar da obra", () => {
  it("com orçamento mostra o que a API mandou, sem conta na tela", () => {
    expect(valores({ verba: 52000000 }, r(), false)).toEqual([
      ["R$ 520.000,00", "fechado com o cliente"],
      ["R$ 21.337,30", "4,8% do orçado"],
      ["R$ 419.107,70", "de R$ 440.445,00 orçados"],
      ["Sem medição", "entrega 03/2027"],
    ]);
  });

  it("sem orçamento e sem cronograma: — com o texto do protótipo", () => {
    const sem = r({ tem_orcamento: false, realizado: 0, orcado_atual: 0, falta_gastar: 0, realizado_pct: null }, { cadastrado: false, termino_contratual: null });
    expect(valores({ verba: 0 }, sem, false)).toEqual([
      ["—", "não informado"],
      ["R$ 0,00", "nenhum gasto lançado"],
      ["—", "aparece com o orçamento"],
      ["—", "aparece com o cronograma"],
    ]);
  });

  it("API antiga, sem os campos novos: — no Falta e sem o %", () => {
    const c = valores({ verba: 1 }, r({ falta_gastar: undefined, realizado_pct: undefined }), false);
    expect(c[1]).toEqual(["R$ 21.337,30", ""]);
    expect(c[2]).toEqual(["—", ""]);
  });

  it("medição define o prazo; só ela diz se está no prazo", () => {
    expect(valores({ verba: 1 }, r({}, { atraso_decimos: 0 }), false)[3]).toEqual(["No prazo", "entrega 03/2027"]);
    expect(valores({ verba: 1 }, r({}, { atraso_decimos: 14, termino_projetado: "2027-05" }), false)[3]).toEqual(["Atrasada 1,4 mês", "previsão entrega 05/2027"]);
    expect(valores({ verba: 1 }, r({}, { atraso_decimos: 30 }), false)[3]![0]).toBe("Atrasada 3 meses");
  });

  it("sem resposta da API não inventa R$ 0,00", () => {
    expect(celulasPlacar({ verba: 1 }, null, true).slice(1).map((c) => c.valor)).toEqual(["—", "—", "—"]);
    expect(celulasPlacar({ verba: 1 }, null, true)[1]!.sub).toBe("não carregou");
  });
});

describe("o placar no celular", () => {
  const obra = (id: string) => ({ id, verba: 52000000 }) as Obra;
  const celular = () =>
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("760"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const montar = (id = "o-1") => render(<Placar key={id} obra={obra(id)} resumo={r()} falhou={false} />);
  const linha = () => screen.getByRole("button", { expanded: false });
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("recolhido numa linha: gasto e falta", () => {
    celular();
    montar();
    expect(linha().textContent).toBe("Gasto R$ 21.337,30 · Falta R$ 419.107,70");
    expect(document.querySelector("dl")).toBeNull();
  });

  it("um toque mostra os 4 números, e outro recolhe", () => {
    celular();
    montar();
    fireEvent.click(linha());
    expect(screen.getByRole("button", { expanded: true }).getAttribute("aria-controls")).toBe(document.querySelector("dl")!.id);
    expect(document.querySelectorAll("dl>div")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { expanded: true }));
    expect(document.querySelector("dl")).toBeNull();
    expect(localStorage.getItem("plumo.placar.o-1")).toBeNull();
  });

  it("lembra por obra", () => {
    celular();
    const { unmount } = montar("o-1");
    fireEvent.click(linha());
    unmount();
    const outra = montar("o-2");
    expect(document.querySelector("dl")).toBeNull();
    outra.unmount();
    montar("o-1");
    expect(document.querySelectorAll("dl>div")).toHaveLength(4);
  });

  it("sem localStorage continua abrindo e recolhendo", () => {
    celular();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    montar();
    fireEvent.click(linha());
    expect(document.querySelectorAll("dl>div")).toHaveLength(4);
  });

  it("sem resposta da API, a linha não inventa valor", () => {
    celular();
    render(<Placar obra={obra("o-1")} resumo={null} falhou />);
    expect(linha().textContent).toBe("Gasto — · Falta —");
  });

  it("no desktop continua com os 4 números, sem o toque", () => {
    montar();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelectorAll("dl>div")).toHaveLength(4);
  });
});
