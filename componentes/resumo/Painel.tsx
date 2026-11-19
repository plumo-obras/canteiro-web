"use client";
/**
 * Os blocos do Resumo, embaixo dos quadros: o orçado × gasto das etapas que estão andando, o que vem (a semana e o
 * cronograma à frente), os últimos gastos e o dinheiro mês a mês. Cada bloco diz em uma linha o que mostra e leva à tela
 * do detalhe. Os números da obra inteira (gasto, orçado, prazo) ficam nos quadros: aqui não se repetem.
 *
 * Nenhuma conta de dinheiro aqui: orçado, gasto e saldo vêm prontos da API (orçamento, desembolso). A tela só escolhe o
 * que mostrar e situa o mês de hoje no cronograma.
 */
import type { Cronograma, Desembolso, EventoSemana, GastoObra, Orcamento } from "@/lib/contrato";
import { fmtMes, somarMes } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { BarraConsumo, LegendaConsumo, tomDoConsumo } from "../orcamento/BarraConsumo";
import { reaisInteiros } from "../orcamento/Andamento";
import { telaDe } from "../sessoes";
import { diaCurto, indiceDoMes, mesDeHoje } from "./dia";
import { MesAMes } from "./MesAMes";
import s from "./painel.module.css";

export function Painel({
  orc,
  crono,
  desemb,
  gastos,
  semana,
}: {
  orc: Orcamento | null;
  crono: Cronograma | null;
  desemb: Desembolso | null;
  /** null: esta versão (a demonstração sem Gastos) não tem a tela. */
  gastos: GastoObra[] | null;
  /** null: a API no ar ainda não tem GET /hoje. */
  semana: EventoSemana[] | null;
}) {
  const comOQueVem = !!crono?.inicio || !!semana;
  return (
    <div className={s.painel}>
      {/* as etapas à esquerda, o que vem e o que saiu à direita; o gráfico precisa da largura toda para ser lido */}
      <div className={s.duas}>
        {orc ? <EtapasAndando orc={orc} crono={crono} /> : null}
        <div className={s.coluna}>
          {comOQueVem ? <OQueVem crono={crono} semana={semana} /> : null}
          {gastos ? <UltimosGastos gastos={gastos} /> : null}
        </div>
      </div>
      {desemb && desemb.meses.length ? <DinheiroNoTempo d={desemb} /> : null}
    </div>
  );
}

/** As etapas que estão andando: com gasto ainda não fechado, ou previstas para este mês no cronograma. A que passou do orçado vem primeiro. */
function EtapasAndando({ orc, crono }: { orc: Orcamento; crono: Cronograma | null }) {
  const { irParaTela } = useCasca();
  const j = crono?.inicio ? indiceDoMes(crono.inicio, mesDeHoje()) : -1;
  const doMes = new Set((crono?.etapas ?? []).filter((e) => (e.percentuais[j] ?? 0) > 0).map((e) => e.etapa));
  const peso = (t: string) => (t === "estouro" ? 0 : t === "perto" ? 1 : 2);
  const andando = orc.etapas
    .filter((e) => e.estourou || doMes.has(e.etapa) || (e.gasto > 0 && e.gasto < e.atual))
    .sort((a, b) => peso(tomDoConsumo(a.atual, a.gasto)) - peso(tomDoConsumo(b.atual, b.gasto)));
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
                {reaisInteiros(e.gasto)} <span className="mut">de {reaisInteiros(e.atual)}</span>
              </span>
              <span className={s.etapaBarra}>
                <BarraConsumo orcado={e.atual} gasto={e.gasto} saldo={e.saldo} />
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
      <p className={s.explica}>O que saiu em cada mês, o que ainda vai sair e onde o cronograma previa. Os valores de cada mês estão no Cronograma.</p>
      <MesAMes d={d} />
      <button type="button" className={`link ${s.ver}`} onClick={() => irParaTela("cronograma")}>
        Ver o desembolso no Cronograma <Icone nome="chevRight" tam={14} />
      </button>
    </section>
  );
}

/** O que vem: os inícios de etapa dos próximos 7 dias (de GET /hoje) e o que o cronograma diz para este mês e os próximos. */
function OQueVem({ crono, semana }: { crono: Cronograma | null; semana: EventoSemana[] | null }) {
  const { irParaTela } = useCasca();
  return (
    <section className={`card ${s.bloco}`} aria-labelledby="painel-vem">
      <div className={s.cab}>
        <h2 id="painel-vem">O que vem</h2>
      </div>
      {semana ? (
        <div className={s.parte}>
          <h3 className={s.subtitulo}>Esta semana</h3>
          {semana.length ? (
            <ul className={s.lista} role="list">
              {semana.map((e, i) => {
                const tela = e.acao ? telaDe(e.acao.tela) : undefined;
                return (
                  <li key={`${e.data}-${i}`}>
                    <span className={s.quando}>{diaCurto(e.data)}</span>
                    <span className={s.listaTxt}>
                      <b>{e.titulo}</b>
                      {e.detalhe ? <span className="mut sm">{e.detalhe}</span> : null}
                    </span>
                    {tela ? (
                      <button type="button" className="link sm" onClick={() => irParaTela(tela, e.acao!.filtro)}>
                        {e.acao!.rotulo}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mut sm">Nada previsto nos próximos 7 dias.</p>
          )}
        </div>
      ) : null}
      {crono?.inicio ? <NoCronograma crono={crono} /> : null}
      {crono?.inicio ? (
        <button type="button" className={`link ${s.ver}`} onClick={() => irParaTela("cronograma")}>
          Ver o Cronograma <Icone nome="chevRight" tam={14} />
        </button>
      ) : null}
    </section>
  );
}

/** O que o cronograma diz para agora e para os próximos meses: o que está previsto neste mês e o que começa depois. */
function NoCronograma({ crono }: { crono: Cronograma }) {
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
    <div className={s.parte}>
      <h3 className={s.subtitulo}>No cronograma</h3>
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
    </div>
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
