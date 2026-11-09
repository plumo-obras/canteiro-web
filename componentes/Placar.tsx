"use client";
/**
 * O placar fixo no topo de toda tela da obra: Contrato · Gasto até hoje · Falta gastar · Prazo. É onde o "gasto" é um
 * número só no app: o realizado do orçamento, igual ao da API para o agente. A casca busca o resumo; aqui só formata.
 */
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { fmtReais } from "@/lib/formato";
import type { AbaAtiva } from "./sessoes";

export type Tom = "mut" | "ok" | "neg";
export interface Celula {
  rotulo: string;
  valor: string;
  sub: string;
  tom?: Tom;
}

/** "2027-03" → "03/2027" (o cronograma é mensal: a API não tem o dia da entrega). */
const mes = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

function prazo(c: ResumoDaObra["cronograma"]): Celula {
  const rotulo = "Prazo";
  if (!c.cadastrado) return { rotulo, valor: "—", sub: "aparece com o cronograma", tom: "mut" };
  const entrega = c.termino_projetado ?? c.termino_contratual;
  const quando = entrega ? `entrega ${mes(entrega)}` : "sem data de entrega";
  // Sem medição, ninguém sabe se está no prazo: dizer "No prazo" seria afirmar o que não foi medido.
  if (c.atraso_decimos === null) return { rotulo, valor: "Sem medição", sub: quando, tom: "mut" };
  if (c.atraso_decimos <= 0) return { rotulo, valor: "No prazo", sub: quando, tom: "ok" };
  const meses = (c.atraso_decimos / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return { rotulo, valor: `Atrasada ${meses} ${c.atraso_decimos < 20 ? "mês" : "meses"}`, sub: `previsão ${quando}`, tom: "neg" };
}

/** As quatro células. `r` null = ainda não veio (ou a API falhou): nada de "R$ 0,00" que pareça dado. */
export function celulasPlacar(obra: Pick<Obra, "verba">, r: ResumoDaObra | null, tela: AbaAtiva, falhou: boolean): Celula[] {
  const contrato: Celula = obra.verba
    ? { rotulo: "Contrato", valor: fmtReais(obra.verba), sub: "fechado com o cliente" }
    : { rotulo: "Contrato", valor: "—", sub: "não informado", tom: "mut" };
  if (!r) {
    const sub = falhou ? "não carregou" : "";
    return [contrato, { rotulo: "Gasto até hoje", valor: "—", sub, tom: "mut" }, { rotulo: "Falta gastar", valor: "—", sub, tom: "mut" }, { rotulo: "Prazo", valor: "—", sub, tom: "mut" }];
  }
  const f = r.financeiro;
  const pct = f.tem_orcamento && f.realizado_pct != null ? `${(f.realizado_pct / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do orçado` : "";
  const gasto: Celula = { rotulo: "Gasto até hoje", valor: fmtReais(f.realizado), sub: !f.realizado ? "nenhum gasto lançado" : f.tem_orcamento ? pct : "sem orçamento para comparar" };
  const falta: Celula = !f.tem_orcamento
    ? { rotulo: "Falta gastar", valor: "—", sub: tela === "projeto" ? "aparece com a estimativa" : "aparece com o orçamento", tom: "mut" }
    : f.falta_gastar == null
      ? { rotulo: "Falta gastar", valor: "—", sub: "", tom: "mut" }
      : { rotulo: "Falta gastar", valor: fmtReais(f.falta_gastar), sub: `de ${fmtReais(f.orcado_atual)} orçados` };
  return [contrato, gasto, falta, prazo(r.cronograma)];
}

export function Placar(p: { obra: Obra; resumo: ResumoDaObra | null; tela: AbaAtiva; falhou: boolean }) {
  return (
    <section className="placar" aria-label="Placar da obra" aria-busy={!p.resumo && !p.falhou}>
      <dl>
        {celulasPlacar(p.obra, p.resumo, p.tela, p.falhou).map((c) => (
          <div key={c.rotulo}>
            <dt>{c.rotulo}</dt>
            <dd className={`placar-v${c.tom ? ` t-${c.tom}` : ""}`}>{c.valor}</dd>
            <dd className="placar-s">{c.sub}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
