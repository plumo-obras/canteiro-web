"use client";
/**
 * O painel da obra, embaixo da conversa do dia no Resumo: os números que dizem como a obra está (gasto, o que falta
 * gastar, o prazo e as etapas), o orçado × gasto das etapas que estão andando, o dinheiro mês a mês, o que vem a seguir
 * no cronograma e os últimos gastos. Cada bloco diz em uma linha o que mostra e leva à tela do detalhe.
 *
 * Nenhuma conta de dinheiro aqui: orçado, gasto, saldo e falta gastar vêm prontos da API (orçamento, resumo,
 * desembolso). A tela só escolhe o que mostrar e situa o mês de hoje no cronograma.
 */
import type { Cronograma, Desembolso, GastoObra, Obra, Orcamento, ResumoDaObra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtMes, fmtMesLongo, somarMes } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { useCasca } from "../contexto";
import { GraficoDesembolso } from "../cronograma/Desembolso";
import { Icone } from "../Icone";
import { BarraConsumo, LegendaConsumo, tomDoConsumo } from "../orcamento/BarraConsumo";
import { reaisInteiros } from "../orcamento/Andamento";
import { telaNoModo } from "../sessoes";
import { useCarregar } from "../useCarregar";
import s from "./painel.module.css";

/** AAAA-MM de hoje no fuso da obra. */
const mesDeHoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).slice(0, 7);
const indiceDoMes = (inicio: string, mes: string) => (Number(mes.slice(0, 4)) - Number(inicio.slice(0, 4))) * 12 + Number(mes.slice(5, 7)) - Number(inicio.slice(5, 7));

export function Painel({ obra, resumo }: { obra: Obra; resumo: ResumoDaObra | null }) {
  const { versao, modo } = useCasca();
  const comGastos = telaNoModo("gastos", modo);
  const { dado } = useCarregar(
    () =>
      Promise.all([
        api.orcamento(obra.id).catch(() => null),
        api.cronograma(obra.id).catch(() => null),
        api.desembolso(obra.id).catch(() => null),
        comGastos ? api.listarGastos(obra.id, { limite: 4 }).catch(() => [] as GastoObra[]) : Promise.resolve([] as GastoObra[]),
      ]),
    [obra.id, versao, comGastos],
  );
  if (!resumo || resumo.obra.id !== obra.id || !resumo.financeiro.tem_orcamento) return null;
  const [orc, crono, desemb, gastos] = dado ?? [null, null, null, []];
  return (
    <div className={s.painel}>
      <Numeros resumo={resumo} orc={orc} crono={crono} />
      {/* as etapas à esquerda, o que vem e o que saiu à direita; o gráfico precisa da largura toda para ser lido */}
      <div className={s.duas}>
        {orc ? <EtapasAndando orc={orc} crono={crono} /> : null}
        <div className={s.coluna}>
          {crono?.inicio ? <ProximasEtapas crono={crono} /> : null}
          {comGastos ? <UltimosGastos gastos={gastos} /> : null}
        </div>
      </div>
      {desemb && desemb.meses.length ? <DinheiroNoTempo d={desemb} /> : null}
    </div>
  );
}

function Numeros({ resumo, orc, crono }: { resumo: ResumoDaObra; orc: Orcamento | null; crono: Cronograma | null }) {
  const f = resumo.financeiro;
  const c = resumo.cronograma;
  const etapas = orc?.etapas ?? [];
  const comGasto = etapas.filter((e) => e.realizado > 0).length;
  const passaram = etapas.filter((e) => e.estourou).length;
  const mes = crono?.inicio && crono.meses ? Math.min(crono.meses, Math.max(0, indiceDoMes(crono.inicio, mesDeHoje()) + 1)) : null;
  return (
    <dl className={s.numeros} aria-label="Como está a obra">
      <div>
        <dt>Gasto até hoje</dt>
        <dd className={s.valor}>{reaisInteiros(f.realizado)}</dd>
        <dd className={s.grafico}>
          <BarraConsumo orcado={f.orcado_atual} gasto={f.realizado} saldo={f.saldo} alta />
        </dd>
      </div>
      <div>
        <dt>Falta gastar</dt>
        <dd className={s.valor}>{f.falta_gastar != null ? reaisInteiros(f.falta_gastar) : "—"}</dd>
        <dd className={s.sub}>de {reaisInteiros(f.orcado_atual)} orçados</dd>
      </div>
      <div>
        <dt>Prazo</dt>
        <dd className={s.valor}>{mes ? `Mês ${mes} de ${crono!.meses}` : c.cadastrado ? "Cronograma montado" : "Sem cronograma"}</dd>
        {mes ? (
          <dd className={s.grafico}>
            <span className={s.tempo} role="img" aria-label={`Mês ${mes} de ${crono!.meses} do cronograma`}>
              <span style={{ width: `${(mes / crono!.meses) * 100}%` }} />
            </span>
          </dd>
        ) : null}
        <dd className={s.sub}>
          {c.termino_contratual ? `entrega ${fmtMesLongo(c.termino_contratual)}` : "monte em Cronograma"}
          {c.cadastrado && c.atraso_decimos == null ? " · sem medição" : ""}
        </dd>
      </div>
      <div>
        <dt>Etapas</dt>
        {orc ? (
          <>
            <dd className={s.linhaIcone}>
              <Icone nome="recibo" tam={15} />
              {comGasto} de {etapas.length} {comGasto === 1 ? "etapa possui gastos" : "etapas possuem gastos"}
            </dd>
            <dd className={`${s.linhaIcone}${passaram ? ` ${s.ruim}` : ""}`}>
              <Icone nome="planilha" tam={15} />
              {passaram} de {etapas.length} passou do orçado
            </dd>
          </>
        ) : (
          <dd className={s.valor}>—</dd>
        )}
      </div>
    </dl>
  );
}

/** As etapas que estão andando: com gasto ainda não fechado, ou previstas para este mês no cronograma. A que passou do orçado vem primeiro. */
function EtapasAndando({ orc, crono }: { orc: Orcamento; crono: Cronograma | null }) {
  const { irParaTela } = useCasca();
  const j = crono?.inicio ? indiceDoMes(crono.inicio, mesDeHoje()) : -1;
  const doMes = new Set((crono?.etapas ?? []).filter((e) => (e.percentuais[j] ?? 0) > 0).map((e) => e.etapa));
  const peso = (t: string) => (t === "estouro" ? 0 : t === "perto" ? 1 : 2);
  const andando = orc.etapas
    .filter((e) => e.estourou || doMes.has(e.etapa) || (e.realizado > 0 && e.realizado < e.atual))
    .sort((a, b) => peso(tomDoConsumo(a.atual, a.realizado)) - peso(tomDoConsumo(b.atual, b.realizado)));
  return (
    <section className={`card ${s.bloco}`} aria-labelledby="painel-etapas">
      <div className={s.cab}>
        <h2 id="painel-etapas">Etapas em andamento</h2>
      </div>
      <p className={s.explica}>Quanto do orçado de cada etapa já foi gasto. As que passaram do orçado vêm primeiro.</p>
      <LegendaConsumo />
      {andando.length ? (
        <ul className={s.etapas} role="list">
          {andando.map((e) => (
            <li key={e.etapa}>
              <span className={s.etapaNome}>
                <span className="eap-num">{e.etapa}</span>
                {e.descricao}
              </span>
              <span className={s.etapaValores}>
                {reaisInteiros(e.realizado)} <span className="mut">de {reaisInteiros(e.atual)}</span>
              </span>
              <span className={s.etapaBarra}>
                <BarraConsumo orcado={e.atual} gasto={e.realizado} saldo={e.saldo} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mut sm">Nenhuma etapa andando agora.</p>
      )}
      <button type="button" className={`link ${s.ver}`} onClick={() => irParaTela("orcamento")}>
        Ver as {orc.etapas.length} etapas no Orçamento <Icone nome="chevRight" tam={14} />
      </button>
    </section>
  );
}

function DinheiroNoTempo({ d }: { d: Desembolso }) {
  const { irParaTela } = useCasca();
  return (
    <section className={`card ${s.bloco}`} aria-labelledby="painel-dinheiro">
      <div className={s.cab}>
        <h2 id="painel-dinheiro">Dinheiro mês a mês</h2>
      </div>
      <p className={s.explica}>
        Já pago {fmtReais(d.totais.pago)}; ainda vão sair {fmtReais(d.totais.falta)}. O tracejado é o que o cronograma previa para cada mês.
      </p>
      <div className={s.grafico}>
        <GraficoDesembolso d={d} cenario="cronograma" />
      </div>
      <button type="button" className={`link ${s.ver}`} onClick={() => irParaTela("cronograma")}>
        Ver o desembolso no Cronograma <Icone nome="chevRight" tam={14} />
      </button>
    </section>
  );
}

/** O que o cronograma diz para agora e para os próximos meses: o que está previsto neste mês e o que começa depois. */
function ProximasEtapas({ crono }: { crono: Cronograma }) {
  const { irParaTela } = useCasca();
  const j = indiceDoMes(crono.inicio!, mesDeHoje());
  const primeiro = (p: number[]) => p.findIndex((v) => v > 0);
  const ultimo = (p: number[]) => p.length - 1 - [...p].reverse().findIndex((v) => v > 0);
  const comMes = crono.etapas.filter((e) => e.percentuais.some((v) => v > 0));
  const agora = comMes.filter((e) => (e.percentuais[j] ?? 0) > 0);
  const depois = comMes
    .filter((e) => primeiro(e.percentuais) > j)
    .sort((a, b) => primeiro(a.percentuais) - primeiro(b.percentuais))
    .slice(0, Math.max(2, 5 - agora.length));
  const mesDe = (i: number) => fmtMes(somarMes(crono.inicio!, i));
  return (
    <section className={`card ${s.bloco}`} aria-labelledby="painel-proximas">
      <div className={s.cab}>
        <h2 id="painel-proximas">O que vem no cronograma</h2>
      </div>
      <p className={s.explica}>As etapas previstas para este mês e as próximas a começar.</p>
      <ul className={s.lista} role="list">
        {agora.map((e) => (
          <li key={e.etapa}>
            <span className={`${s.ponto} ${s.agora}`} aria-hidden="true" />
            <span className={s.listaTxt}>
              <b>{e.descricao}</b>
              <span className="mut sm">{ultimo(e.percentuais) === j ? "termina este mês" : `neste mês · até ${mesDe(ultimo(e.percentuais))}`}</span>
            </span>
          </li>
        ))}
        {depois.map((e) => (
          <li key={e.etapa}>
            <span className={s.ponto} aria-hidden="true" />
            <span className={s.listaTxt}>
              <b>{e.descricao}</b>
              <span className="mut sm">começa em {mesDe(primeiro(e.percentuais))}</span>
            </span>
          </li>
        ))}
        {!agora.length && !depois.length ? <li className="mut sm">O cronograma não tem mais etapas pela frente.</li> : null}
      </ul>
      <button type="button" className={`link ${s.ver}`} onClick={() => irParaTela("cronograma")}>
        Ver o Cronograma <Icone nome="chevRight" tam={14} />
      </button>
    </section>
  );
}

function UltimosGastos({ gastos }: { gastos: GastoObra[] }) {
  const { irParaTela } = useCasca();
  return (
    <section className={`card ${s.bloco}`} aria-labelledby="painel-gastos">
      <div className={s.cab}>
        <h2 id="painel-gastos">Últimos gastos</h2>
      </div>
      <p className={s.explica}>O dinheiro que saiu por último, já conferido.</p>
      {gastos.length ? (
        <ul className={s.lista} role="list">
          {gastos.map((g) => (
            <li key={g.id}>
              <span className={s.listaTxt}>
                <b>{g.descricao}</b>
                <span className="mut sm">
                  {g.data_pagamento.slice(8, 10)}/{g.data_pagamento.slice(5, 7)} · {g.etapa === null ? "sem etapa" : (g.etapa_nome ?? g.etapa)}
                </span>
              </span>
              <span className={s.listaValor}>{fmtReais(g.valor)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mut sm">Nenhum gasto lançado ainda.</p>
      )}
      <button type="button" className={`link ${s.ver}`} onClick={() => irParaTela("gastos")}>
        Ver todos em Gastos <Icone nome="chevRight" tam={14} />
      </button>
    </section>
  );
}
