"use client";
/**
 * Aba Cronograma (Fase 4): o físico-financeiro (etapas × meses em %), as medições mensais e o prazo. A API calcula o
 * mensal, o medido e o término projetado (GET /obras/{id}/cronograma); a tela mostra, desenha a curva S e edita. Sem
 * cronograma, o estado vazio leva ao editor. O aditivo de prazo muda o prazo da obra (PATCH, com Desfazer) e abre o
 * editor com os meses a mais, vazios, para redistribuir.
 */
import { useState } from "react";
import type { Cronograma as DadosCronograma, Obra, PrazoCronograma } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtMes, fmtMesLongo, fmtPct, listaMeses } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { CabecalhoPagina, type Kpi } from "../CabecalhoPagina";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { useCarregar } from "../useCarregar";
import { MenuMais } from "../MenuMais";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";
import { CurvaS } from "./CurvaS";
import { Gantt } from "./Gantt";
import { EditorCronograma } from "./Editor";
import { ListaMedicoes, ModalMedicao } from "./Medicao";

/** "3 meses de atraso" · "1,4 mês de atraso" · "em dia" · "adiantada 0,5 mês", a partir dos décimos de mês. */
export function situacaoAtraso(decimos: number | null | undefined, meses: number | null | undefined): { texto: string; tom: "ok" | "acima" | "info" } | null {
  if (meses === null || meses === undefined) return null;
  const dec = decimos ?? meses * 10;
  if (dec === 0) return { texto: "em dia", tom: "ok" };
  const abs = Math.abs(dec);
  const n = abs % 10 ? (abs / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(abs / 10);
  // "1,4 mês" e "0,5 mês": abaixo de 2 o substantivo fica no singular, como se fala.
  const txt = `${n} ${abs < 20 ? "mês" : "meses"}`;
  return dec > 0 ? { texto: `${txt} de atraso`, tom: "acima" } : { texto: `adiantada ${txt}`, tom: "ok" };
}

export const situacaoPrazo = (p: PrazoCronograma) => situacaoAtraso(p.atraso_decimos, p.atraso_meses);

export function kpisDoCronograma(c: DadosCronograma): Kpi[] {
  const p = c.prazo;
  const sit = situacaoPrazo(p);
  const ks: Kpi[] = [
    { icone: "calendario", n: fmtMesLongo(p.termino_contratual), r: `término contratual · ${c.meses} meses desde ${fmtMesLongo(c.inicio)}` },
    sit
      ? { icone: "history", n: fmtMesLongo(p.termino_projetado), r: `término projetado pela última medição${c.revisoes ? " · contra o cronograma atual" : ""}`, tag: sit.texto, tom: sit.tom }
      : { icone: "history", n: "—", r: "término projetado · sai na 1ª medição" },
    p.pct_medido !== null
      ? {
          icone: "checkCircle",
          n: fmtPct(p.pct_medido),
          r: `medido × ${fmtPct(p.pct_previsto_na_medicao ?? 0)} previsto em ${fmtMes(p.mes_referencia)}`,
          ...((p.pct_medido ?? 0) < (p.pct_previsto_na_medicao ?? 0) ? { tag: "abaixo do previsto", tom: "atencao" as const } : {}),
        }
      : { icone: "checkCircle", n: "—", r: "medido × previsto · sem medição ainda" },
  ];
  // Depois de reprogramar, o atraso do cronograma atual zera; o do original é o que o diretor precisa ver.
  if (c.revisoes && p.termino_base) {
    const sb = situacaoAtraso(p.atraso_base_decimos, p.atraso_base_meses);
    ks.push({
      icone: "alert",
      n: fmtMesLongo(p.termino_base),
      r: `contra o cronograma original (${c.revisoes} ${c.revisoes === 1 ? "reprogramação" : "reprogramações"})`,
      ...(sb ? { tag: sb.texto, tom: sb.tom } : {}),
    });
  }
  return ks;
}

/**
 * O topo numa linha: "Termina set/2027 · em dia · 7,65% medido". O projetado só aparece quando difere do contratual,
 * e o atraso contra o cronograma original só depois de reprogramar.
 */
export function textoPrazo(c: DadosCronograma): { termina: string; contrato: string | null; sit: { texto: string; tom: string } | null; medido: string | null; base: string | null } {
  const p = c.prazo;
  const sit = situacaoPrazo(p);
  const projetado = sit && p.termino_projetado && p.termino_projetado !== p.termino_contratual;
  const sb = c.revisoes && p.termino_base ? situacaoAtraso(p.atraso_base_decimos, p.atraso_base_meses) : null;
  return {
    termina: fmtMesLongo(projetado ? p.termino_projetado : p.termino_contratual),
    contrato: projetado ? fmtMesLongo(p.termino_contratual) : null,
    sit,
    medido: p.pct_medido !== null ? `${fmtPct(p.pct_medido)} medido` : null,
    base: sb && sb.texto !== "em dia" ? `${sb.texto} contra o original` : null,
  };
}

function ResumoPrazo({ c }: { c: DadosCronograma }) {
  const t = textoPrazo(c);
  return (
    <p className="crono-resumo">
      Termina <b>{t.termina}</b>
      {t.contrato ? <span className="mut"> (contrato {t.contrato})</span> : null}
      {" · "}
      {t.sit ? <span className={`crono-sit t-${t.sit.tom}`}>{t.sit.texto}</span> : <span className="mut">sem medição ainda</span>}
      {t.medido ? ` · ${t.medido}` : ""}
      {t.base ? <span className="crono-sit t-acima"> · {t.base}</span> : null}
    </p>
  );
}

export function Cronograma({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const { dado, erro, carregando } = useCarregar(() => api.cronograma(obra.id), [obra.id, versao]);
  const [modo, setModo] = useState<{ k: "ver" } | { k: "editar"; meses?: number; aditivoPrazo?: boolean }>({ k: "ver" });
  const [modal, setModal] = useState<"medicao" | "prazo" | null>(null);
  const tem = !!dado?.inicio && dado.meses > 0;
  const editando = modo.k === "editar" && dado;

  return (
    <div className="page">
      <CabecalhoPagina
        titulo="Cronograma"
        sub={tem && !editando ? <ResumoPrazo c={dado} /> : undefined}
        acoes={
          podeOperar && tem && !editando ? (
            <>
              <button type="button" className="btn amb" onClick={() => setModal("medicao")}>
                <Icone nome="plus" tam={15} />
                Nova medição
              </button>
              <MenuMais
                rotulo="Mais ações do cronograma"
                itens={[
                  { rotulo: "Editar cronograma", acao: () => setModo({ k: "editar" }) },
                  { rotulo: "Aditivo de prazo", acao: () => setModal("prazo") },
                ]}
              />
            </>
          ) : null
        }
      />
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando o cronograma…
        </div>
      ) : !dado ? null : editando ? (
        <EditorCronograma obra={obra} crono={dado} meses={modo.meses} aditivoPrazo={modo.aditivoPrazo} fechar={() => setModo({ k: "ver" })} />
      ) : !tem ? (
        <div className="card vazio">
          <Icone nome="calendario" tam={24} />
          <h3>Sem cronograma ainda</h3>
          {dado.etapas.length ? (
            <p>
              Distribua cada etapa do orçamento pelos meses da obra, em %. Com ele, cada medição mostra o previsto × executado e projeta o término.
            </p>
          ) : (
            <p>Importe o orçamento da obra primeiro: o cronograma distribui as etapas dele pelos meses.</p>
          )}
          {podeOperar && dado.etapas.length ? (
            <button type="button" className="btn amb" style={{ marginTop: 16 }} onClick={() => setModo({ k: "editar" })}>
              Montar cronograma
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <CurvaS mensal={dado.mensal} comBase={!!dado.revisoes} />
          <Gantt crono={dado} />
          <h3 className="sectit">Medições</h3>
          <ListaMedicoes obra={obra} medicoes={dado.medicoes} />
        </>
      )}
      {modal === "medicao" && dado ? <ModalMedicao obra={obra} crono={dado} fechar={() => setModal(null)} /> : null}
      {modal === "prazo" && dado ? (
        <ModalAditivoPrazo
          obra={obra}
          crono={dado}
          fechar={() => setModal(null)}
          feito={(meses) => {
            setModal(null);
            setModo({ k: "editar", meses, aditivoPrazo: true });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Aditivo de prazo: escolhe o novo prazo e abre o editor com os meses a mais, vazios. Nada é gravado aqui: o PUT do
 * cronograma leva `atualizar_prazo_da_obra` e grava o prazo da obra junto, numa operação só (o Desfazer volta os dois).
 * Antes eram duas escritas, e desfazer uma só deixava "obra 11 meses × cronograma 10".
 */
function ModalAditivoPrazo({ obra, crono, fechar, feito }: { obra: Obra; crono: DadosCronograma; fechar: () => void; feito: (meses: number) => void }) {
  const atual = Math.max(obra.prazo_meses || 0, crono.meses);
  const [meses, setMeses] = useState(String(atual + 1));
  const n = /^\d+$/.test(meses.trim()) ? Number(meses) : NaN;
  const { erros, enviar } = useEnvio(
    () => ({ meses: !Number.isInteger(n) || n < 1 || n > 60 ? "Prazo de 1 a 60 meses." : n <= crono.meses ? `Maior que os ${crono.meses} meses do cronograma.` : null }),
    async () => feito(n),
  );
  const novoFim = crono.inicio && Number.isInteger(n) && n > 0 ? listaMeses(crono.inicio, n).at(-1)! : null;
  return (
    <Modal
      titulo="Aditivo de prazo"
      fechar={fechar}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-prazo" className="btn amb">
            Redistribuir no cronograma
          </button>
        </>
      }
    >
      <form id="form-prazo" onSubmit={enviar} noValidate>
        <p className="mut" style={{ margin: "0 0 8px" }}>
          Hoje: {crono.meses} meses, término em {fmtMesLongo(crono.prazo.termino_contratual)}. O cronograma abre com os meses novos vazios; ao salvar, o prazo da
          obra muda junto.
        </p>
        <Campo rotulo="Novo prazo (meses)" erro={erros.meses} dica={novoFim ? `Novo término contratual: ${fmtMesLongo(novoFim)} (+${n - crono.meses} ${n - crono.meses === 1 ? "mês" : "meses"}).` : undefined}>
          {(a) => <input {...a} className="f" inputMode="numeric" autoComplete="off" value={meses} onChange={(e) => setMeses(e.target.value)} />}
        </Campo>
      </form>
    </Modal>
  );
}
