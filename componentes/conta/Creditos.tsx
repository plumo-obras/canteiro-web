"use client";
/**
 * Créditos de IA: saldo contra a franquia e o consumo dos últimos 30 dias (por dia, por obra, por rota). Os números
 * chegam somados pela API (GET /uso); aqui só se completa os dias sem consumo com zero e se desenha.
 */
import { useId, useState } from "react";
import type { Creditos as TCreditos, Obra, RelatorioUso } from "@/lib/contrato";
import { Icone } from "../Icone";
import s from "./conta.module.css";
import { ROTULO_ROTA, diaCurto, fmtDolares, fmtTokens } from "./formato";

interface Props {
  className: string;
  creditos: TCreditos;
  chaveAtiva: boolean;
  dias: string[];
  uso: { dado: RelatorioUso | null; erro: string | null; carregando: boolean };
  obras: Obra[];
}

export function Creditos({ className, creditos, chaveAtiva, dias, uso, obras }: Props) {
  const [emBreve, setEmBreve] = useState(false);
  const idBreve = useId();
  const { saldo_microdolares: saldo, franquia } = creditos;
  const usado = Math.max(0, franquia - saldo);
  const pct = franquia > 0 ? Math.min(100, Math.round((usado / franquia) * 100)) : 0;
  const nivel = pct >= 90 ? "alto" : pct >= 75 ? "atencao" : "ok";
  const nomeObra = (id: string | null) => (id ? (obras.find((o) => o.id === id)?.nome ?? "Obra removida") : "Geral (sem obra)");
  const r = uso.dado;

  return (
    <section className={className} aria-labelledby="t-creditos">
      <div className={s.cabBloco}>
        <h2 id="t-creditos" className={s.h2}>
          Créditos de IA
        </h2>
        <div className={s.comprar}>
          <button type="button" className="btn" aria-expanded={emBreve} aria-controls={idBreve} onClick={() => setEmBreve((v) => !v)}>
            Comprar créditos
            <span className={s.breve}>em breve</span>
          </button>
        </div>
      </div>
      {emBreve ? (
        <div id={idBreve} className={s.aviso} role="note">
          <Icone nome="info" tam={15} />
          <span>
            A compra de créditos pelo app ainda não está disponível. Por enquanto, para aumentar a franquia, fale com o suporte do
            Canteiro. Outra saída é conectar uma chave própria da Anthropic.
          </span>
        </div>
      ) : null}

      <div className={s.saldo}>
        <div>
          <div className={s.rotuloPeq}>Saldo</div>
          <div className={s.grande}>{fmtDolares(saldo)}</div>
          <div className={s.diz}>de {fmtDolares(franquia)} de franquia</div>
        </div>
        <div className={s.medidor}>
          <div
            className={s.barra}
            data-nivel={nivel}
            role="meter"
            aria-label="Uso da franquia"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}% usado: ${fmtDolares(usado)} de ${fmtDolares(franquia)}`}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className={s.legBarra}>
            <span>
              <b>{fmtDolares(usado)}</b> usados
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      </div>
      {chaveAtiva ? (
        <p className={s.texto}>
          A chave própria está ativa: as conversas são cobradas pela Anthropic e não descontam deste saldo.
        </p>
      ) : saldo <= 0 ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          Sem créditos: o agente não responde até a franquia renovar ou uma chave própria ser conectada.
        </div>
      ) : null}

      <div className={s.consumo}>
        <div className={s.cabBloco}>
          <h3 className={s.h3}>Consumo nos últimos 30 dias</h3>
          {r ? (
            <span className={s.total}>
              <b>{fmtDolares(r.total.custo)}</b> · {fmtTokens(r.total.tokens)} tokens
            </span>
          ) : null}
        </div>
        {uso.erro && !r ? (
          <div className="aviso-erro" role="alert">
            <Icone nome="alert" tam={15} />
            Não consegui carregar o consumo: {uso.erro}
          </div>
        ) : !r ? (
          <div className="carregando" role="status">
            <Icone nome="loader" className="spin" tam={15} />
            Carregando o consumo…
          </div>
        ) : (
          <>
            <GraficoDias dias={dias} r={r} />
            <div className={s.listas}>
              <Lista
                titulo="Por obra"
                total={r.total.custo}
                itens={r.por_obra.map((x) => ({ k: x.obra_id ?? "-", nome: nomeObra(x.obra_id), custo: x.custo }))}
              />
              <Lista
                titulo="Por rota"
                total={r.total.custo}
                itens={r.por_rota.map((x) => ({ k: x.rota, nome: ROTULO_ROTA[x.rota] ?? x.rota, custo: x.custo }))}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Barras por dia, uma série só (sem legenda: o título diz o que é). Hover e teclado (← →) mostram o valor do dia;
 * a tabela escondida dá os mesmos números a quem usa leitor de tela.
 */
function GraficoDias({ dias, r }: { dias: string[]; r: RelatorioUso }) {
  const porDia = new Map(r.por_dia.map((d) => [d.dia, d]));
  const serie = dias.map((dia) => ({ dia, custo: porDia.get(dia)?.custo ?? 0, tokens: porDia.get(dia)?.tokens ?? 0 }));
  const max = Math.max(...serie.map((d) => d.custo), 1);
  const [foco, setFoco] = useState<number | null>(null);
  const atual = foco === null ? null : serie[foco]!;

  const mover = (e: React.PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - caixa.left) / caixa.width) * serie.length);
    setFoco(Math.max(0, Math.min(serie.length - 1, i)));
  };
  const tecla = (e: React.KeyboardEvent) => {
    const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setFoco(e.key === "Home" ? 0 : serie.length - 1);
    } else if (passo) {
      e.preventDefault();
      setFoco((f) => (f === null ? (passo > 0 ? 0 : serie.length - 1) : Math.max(0, Math.min(serie.length - 1, f + passo))));
    }
  };

  return (
    <figure className={s.grafico}>
      <div className={s.eixoY} aria-hidden="true">
        <span>{fmtDolares(max)}</span>
        <span>US$ 0</span>
      </div>
      <div
        className={s.plot}
        tabIndex={0}
        role="img"
        aria-label={`Consumo por dia. Maior dia: ${fmtDolares(max)}. Use as setas para ver cada dia.`}
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
        onKeyDown={tecla}
        onBlur={() => setFoco(null)}
      >
        {serie.map((d, i) => (
          <span key={d.dia} className={s.col} data-on={foco === i || undefined}>
            <span className={s.barraDia} data-zero={d.custo === 0 || undefined} style={{ height: d.custo ? `${Math.max(3, (d.custo / max) * 100)}%` : undefined }} />
          </span>
        ))}
        {atual ? (
          <span
            className={s.tip}
            role="status"
            data-lado={foco! > serie.length / 2 ? "esq" : "dir"}
            style={{ left: `${((foco! + 0.5) / serie.length) * 100}%` }}
          >
            <b>{diaCurto(atual.dia)}</b> {atual.custo ? `${fmtDolares(atual.custo)} · ${fmtTokens(atual.tokens)} tokens` : "sem consumo"}
          </span>
        ) : null}
      </div>
      <div className={s.eixoX} aria-hidden="true">
        <span>{diaCurto(dias[0]!)}</span>
        <span>{diaCurto(dias[Math.floor(dias.length / 2)]!)}</span>
        <span>hoje</span>
      </div>
      <table className="sr-only">
        <caption>Consumo de IA por dia</caption>
        <thead>
          <tr>
            <th scope="col">Dia</th>
            <th scope="col">Custo</th>
            <th scope="col">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {serie
            .filter((d) => d.custo)
            .map((d) => (
              <tr key={d.dia}>
                <td>{diaCurto(d.dia)}</td>
                <td>{fmtDolares(d.custo)}</td>
                <td>{d.tokens}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  );
}

function Lista({ titulo, total, itens }: { titulo: string; total: number; itens: { k: string; nome: string; custo: number }[] }) {
  return (
    <div>
      <h4 className={s.h4}>{titulo}</h4>
      {itens.length ? (
        <ul className={s.lista}>
          {itens.map((x) => {
            const pct = total ? Math.round((x.custo / total) * 100) : 0;
            return (
              <li key={x.k}>
                <div className={s.itemT}>
                  <span className={s.itemNome}>{x.nome}</span>
                  <span>
                    {fmtDolares(x.custo)} <span className={s.diz}>· {pct}%</span>
                  </span>
                </div>
                <span className={s.trilho} aria-hidden="true">
                  <span style={{ width: `${Math.max(pct, 1)}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={s.diz}>Sem consumo no período.</p>
      )}
    </div>
  );
}
