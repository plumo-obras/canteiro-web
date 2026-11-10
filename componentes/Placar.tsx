"use client";
/**
 * O placar fixo no topo de toda tela da obra: Valor fechado · Gasto até hoje · Falta gastar · Prazo. É onde o "gasto" é um
 * número só no app: o realizado do orçamento, igual ao da API para o agente. A casca busca o resumo; aqui só formata.
 */
import { useId, useState } from "react";
import type { Obra, ResumoDaObra } from "@/lib/contrato";
import { fmtReais } from "@/lib/formato";
import { Icone } from "./Icone";
import { useCelular } from "./midia";

export type Tom = "mut" | "ok" | "neg";
export interface Celula {
  rotulo: string;
  valor: string;
  sub: string;
  tom?: Tom;
  /** O sub continua à vista no celular, onde os outros somem para caber. */
  fixo?: boolean;
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
export function celulasPlacar(obra: Pick<Obra, "verba">, r: ResumoDaObra | null, falhou: boolean): Celula[] {
  const contrato: Celula = obra.verba
    ? { rotulo: "Valor fechado", valor: fmtReais(obra.verba), sub: "com o cliente" }
    : { rotulo: "Valor fechado", valor: "—", sub: "não informado", tom: "mut" };
  if (!r) {
    const sub = falhou ? "não carregou" : "";
    return [contrato, { rotulo: "Gasto até hoje", valor: "—", sub, tom: "mut" }, { rotulo: "Falta gastar", valor: "—", sub, tom: "mut" }, { rotulo: "Prazo", valor: "—", sub, tom: "mut" }];
  }
  const f = r.financeiro;
  const pct = f.tem_orcamento && f.realizado_pct != null ? `${(f.realizado_pct / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do orçado` : "";
  // Com entregue a pagar, o gasto não é só o que saiu do caixa: a soma à vista responde "onde foram parar os 25 mil"
  // de quem compara com o Já pago do Cronograma. A soma vem pronta da API.
  const partes = f.entregue_a_pagar && f.pago != null ? `${fmtReais(f.pago)} pago + ${fmtReais(f.entregue_a_pagar)} entregue a pagar` : null;
  const gasto: Celula = {
    rotulo: "Gasto até hoje",
    valor: fmtReais(f.realizado),
    sub: !f.realizado ? "nenhum gasto lançado" : (partes ?? (f.tem_orcamento ? pct : "sem orçamento para comparar")),
    ...(partes ? { fixo: true } : {}),
  };
  const falta: Celula = !f.tem_orcamento
    ? { rotulo: "Falta gastar", valor: "—", sub: "aparece com o orçamento", tom: "mut" }
    : f.falta_gastar == null
      ? { rotulo: "Falta gastar", valor: "—", sub: "", tom: "mut" }
      : { rotulo: "Falta gastar", valor: fmtReais(f.falta_gastar), sub: `de ${fmtReais(f.orcado_atual)} orçados` };
  return [contrato, gasto, falta, prazo(r.cronograma)];
}

const chaveAberto = (obraId: string) => `plumo.placar.${obraId}`;
function lerAberto(obraId: string) {
  try {
    return localStorage.getItem(chaveAberto(obraId)) === "aberto";
  } catch {
    return false;
  }
}
function gravarAberto(obraId: string, aberto: boolean) {
  try {
    if (aberto) localStorage.setItem(chaveAberto(obraId), "aberto");
    else localStorage.removeItem(chaveAberto(obraId));
  } catch {
    // navegador sem armazenamento: a escolha vale até trocar de obra
  }
}

/** Quem usa `Placar` dá key pela obra: o estado aberto/recolhido nasce do que foi lembrado para ela. */
export function Placar(p: { obra: Obra; resumo: ResumoDaObra | null; falhou: boolean }) {
  const celular = useCelular();
  const [aberto, setAberto] = useState(() => lerAberto(p.obra.id));
  const idNumeros = useId();
  const celulas = celulasPlacar(p.obra, p.resumo, p.falhou);
  const numeros = (
    <dl id={idNumeros}>
      {celulas.map((c) => (
        <div key={c.rotulo}>
          <dt>{c.rotulo}</dt>
          <dd className={`placar-v${c.tom ? ` t-${c.tom}` : ""}`}>{c.valor}</dd>
          <dd className={`placar-s${c.fixo ? " fixo" : ""}`}>{c.sub}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <section className="placar" aria-label="Placar da obra" aria-busy={!p.resumo && !p.falhou}>
      {celular ? (
        // No celular a altura é da tela aberta: os dois números do dia a dia à vista, os quatro a um toque.
        <button
          type="button"
          className="placar-linha"
          aria-expanded={aberto}
          aria-controls={aberto ? idNumeros : undefined}
          onClick={() => {
            gravarAberto(p.obra.id, !aberto);
            setAberto(!aberto);
          }}
        >
          <span className="placar-linha-t">
            {aberto ? (
              "Placar da obra"
            ) : (
              <>
                <span className="fx-nw">Gasto {celulas[1]!.valor}</span>
                {" · "}
                <span className="fx-nw">Falta {celulas[2]!.valor}</span>
              </>
            )}
          </span>
          <Icone nome="chevDown" tam={16} />
        </button>
      ) : null}
      {!celular || aberto ? numeros : null}
    </section>
  );
}
