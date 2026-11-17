/**
 * A linha do tempo do Resumo: as etapas da obra na ordem das abas, cada uma feita, atual, pedindo atenção ou ainda por
 * vir. Sai só do status da obra e do GET /obras/{id}/resumo (os números vêm prontos da API); aqui só se decide o estado
 * e a frase curta embaixo de cada etapa.
 */
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { telaNoModo, type Modo } from "../sessoes";

export type TelaEtapa = "projeto" | "orcamento" | "cronograma" | "suprimentos" | "gastos";
export type EstadoEtapa = "feita" | "atual" | "atencao" | "depois";
export interface Etapa {
  tela: TelaEtapa;
  rotulo: string;
  estado: EstadoEtapa;
  /** A frase curta embaixo do nome; vazia quando não há o que dizer. */
  detalhe: string;
}

/** Centavos → "R$ 482 mil": na linha do tempo cabe só a ordem de grandeza (o valor exato está no Placar). */
export function reaisCurto(c: number): string {
  const r = c / 100;
  if (r >= 1_000_000) return `R$ ${(r / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (r >= 1_000) return `R$ ${Math.round(r / 1_000).toLocaleString("pt-BR")} mil`;
  return `R$ ${Math.round(r).toLocaleString("pt-BR")}`;
}

/** "2027-06" → "jun/27". */
function mesCurto(m: string): string {
  const nome = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m.slice(5, 7)) - 1];
  return nome ? `${nome}/${m.slice(2, 4)}` : m;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * `null` enquanto o resumo desta obra não chegou: sem ele não dá para saber se há orçamento, e chutar "comece pelo
 * projeto" numa obra em andamento seria afirmar o que não se sabe.
 */
export function etapasDaObra(obra: Obra, r: ResumoDaObra | null, modo: Modo): Etapa[] | null {
  if (!r || r.obra.id !== obra.id) return null;
  const { financeiro: f, cronograma: c } = r;
  const concluida = obra.status === "concluida";
  const aprovada = concluida || obra.status === "em_andamento";
  const desfazendo = obra.status === "desfazendo_aprovacao";
  const tem = f.tem_orcamento || aprovada || desfazendo;

  const projeto: Etapa = tem ? { tela: "projeto", rotulo: "Projeto", estado: "feita", detalhe: "ok" } : { tela: "projeto", rotulo: "Projeto", estado: "atual", detalhe: "comece por aqui" };

  const orcamento: Etapa = aprovada
    ? { tela: "orcamento", rotulo: "Orçamento", estado: "feita", detalhe: f.orcado_atual ? `${reaisCurto(f.orcado_atual)} aprovado` : "aprovado" }
    : desfazendo
      ? { tela: "orcamento", rotulo: "Orçamento", estado: "atencao", detalhe: "desfazendo a aprovação" }
      : tem
        ? { tela: "orcamento", rotulo: "Orçamento", estado: "atual", detalhe: "para aprovar" }
        : { tela: "orcamento", rotulo: "Orçamento", estado: "depois", detalhe: "" };

  const termino = c.termino_projetado ?? c.termino_contratual;
  // O cronograma pode nascer ainda na fase de orçamento (o Gerar com IA prevê a obra toda): montado é feito, em qualquer fase.
  const cronograma: Etapa = c.cadastrado
    ? { tela: "cronograma", rotulo: "Cronograma", estado: "feita", detalhe: termino ? `término ${mesCurto(termino)}` : "montado" }
    : aprovada
      ? { tela: "cronograma", rotulo: "Cronograma", estado: concluida ? "feita" : "atual", detalhe: concluida ? "" : "falta montar" }
      : { tela: "cronograma", rotulo: "Cronograma", estado: "depois", detalhe: "" };

  // Na execução, Compras e Gastos andam juntos: as duas ficam "atuais" até a obra acabar.
  const atrasadas = r.entregas?.atrasadas?.length ?? 0;
  const compras: Etapa = concluida
    ? { tela: "suprimentos", rotulo: "Compras", estado: "feita", detalhe: "" }
    : aprovada
      ? { tela: "suprimentos", rotulo: "Compras", estado: atrasadas ? "atencao" : "atual", detalhe: atrasadas ? plural(atrasadas, "entrega atrasada", "entregas atrasadas") : "em andamento" }
      : { tela: "suprimentos", rotulo: "Compras", estado: "depois", detalhe: "" };

  const estouradas = f.etapas_estouradas?.length ?? 0;
  const pct = f.realizado_pct != null ? `${(f.realizado_pct / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do orçado` : "em andamento";
  const gastos: Etapa = concluida
    ? { tela: "gastos", rotulo: "Gastos", estado: "feita", detalhe: pct === "em andamento" ? "" : pct }
    : aprovada
      ? { tela: "gastos", rotulo: "Gastos", estado: estouradas ? "atencao" : "atual", detalhe: estouradas ? `${pct} · ${plural(estouradas, "etapa estourada", "etapas estouradas")}` : pct }
      : { tela: "gastos", rotulo: "Gastos", estado: "depois", detalhe: "" };

  // Tela que não existe no modo (Gastos na demonstração, Compras sem pedidos) some da linha, como some das abas.
  return [projeto, orcamento, cronograma, compras, gastos].filter((e) => telaNoModo(e.tela, modo));
}
