/**
 * Quanto do orçado já foi gasto, numa barra só: o trilho é o orçado, o preenchimento é o gasto, e o que passou do
 * orçado aparece em vermelho depois da marca de 100%. Lê em um segundo o que os três números soltos (orçado, gasto,
 * falta gastar) obrigavam a fazer de cabeça. Os valores vêm prontos da API; aqui só se desenha a proporção.
 *
 * Cor com o significado do app: o gasto é tinta neutra (gastar não é bom nem ruim), âmbar a partir de 90% do orçado
 * (pede atenção) e vermelho só no que passou. Verde ficaria dizendo "resolvido".
 */
import { fmtReais } from "@/lib/formato";
import s from "./barra-consumo.module.css";

// 100% do orçado fica a 80% do trilho: sobra lugar para mostrar até 25% de estouro sem a barra sair da caixa
const ESCALA = 0.8;
const MAX_ESTOURO = 0.25;
const PERTO = 0.9;

export type TomConsumo = "nada" | "normal" | "perto" | "estouro";

export function tomDoConsumo(orcado: number, gasto: number): TomConsumo {
  if (!gasto) return "nada";
  if (!orcado || gasto > orcado) return "estouro";
  return gasto / orcado >= PERTO ? "perto" : "normal";
}

const pctTexto = (orcado: number, gasto: number) =>
  `${Math.round((gasto / orcado) * 100).toLocaleString("pt-BR")}%`;

/** A barra em palavras: "84% do orçado", "passou R$ 2.670 do orçado (106%)", "nada gasto". */
export function fraseDoConsumo(orcado: number, gasto: number, saldo: number): string {
  const tom = tomDoConsumo(orcado, gasto);
  if (tom === "nada") return "nada gasto";
  if (!orcado) return `${fmtReais(gasto)} sem orçado`;
  if (tom === "estouro") return `passou ${fmtReais(-saldo)} do orçado (${pctTexto(orcado, gasto)})`;
  return `${pctTexto(orcado, gasto)} do orçado`;
}

export function BarraConsumo({
  orcado,
  gasto,
  saldo,
  frase = true,
  alta = false,
}: {
  orcado: number;
  gasto: number;
  /** orçado − gasto, da API (negativo quando passou). */
  saldo: number;
  /** A frase embaixo da barra; sem ela, a frase vai só para o leitor de tela. */
  frase?: boolean;
  /** Mais grossa: a barra da obra inteira, no topo. */
  alta?: boolean;
}) {
  const tom = tomDoConsumo(orcado, gasto);
  const razao = orcado ? gasto / orcado : gasto ? 1 + MAX_ESTOURO : 0;
  const dentro = Math.min(1, razao) * ESCALA * 100;
  const fora = razao > 1 ? Math.min(razao - 1, MAX_ESTOURO) * ESCALA * 100 : 0;
  const texto = fraseDoConsumo(orcado, gasto, saldo);
  return (
    <span className={`${s.consumo} ${s[tom]}`}>
      <span className={`${s.trilho}${alta ? ` ${s.alta}` : ""}`} role="img" aria-label={`Consumo do orçado: ${texto}`}>
        {dentro ? <span className={s.gasto} style={{ width: `${dentro}%` }} /> : null}
        {fora ? <span className={s.passou} style={{ left: `${ESCALA * 100}%`, width: `${fora}%` }} /> : null}
        <span className={s.limite} style={{ left: `${ESCALA * 100}%` }} />
      </span>
      {frase ? (
        <span className={s.frase} aria-hidden="true">
          {texto}
        </span>
      ) : null}
    </span>
  );
}

/** A legenda da barra, uma vez por tela (perto do título do bloco). */
export function LegendaConsumo() {
  return (
    <span className={s.legenda}>
      <span>
        <i className={s.legGasto} aria-hidden="true" />
        gasto
      </span>
      <span>
        <i className={s.legPassou} aria-hidden="true" />
        acima do orçado
      </span>
      <span>
        <i className={s.legLimite} aria-hidden="true" />
        100% do orçado
      </span>
    </span>
  );
}
