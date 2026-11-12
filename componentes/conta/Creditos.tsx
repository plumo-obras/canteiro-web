"use client";
/**
 * Uso de IA dos últimos 30 dias: o total no título, o gráfico por dia e, ao lado, o gasto por obra. Os números chegam
 * somados pela API (GET /uso); aqui só se completa os dias sem consumo com zero e se desenha. A franquia de créditos
 * cabe numa linha discreta embaixo: é o que explica o saldo, não o assunto do cartão.
 */
import { useState } from "react";
import type { Creditos as TCreditos, Obra, RelatorioUso } from "@/lib/contrato";
import { Icone } from "../Icone";
import s from "./conta.module.css";
import { diaCurto, fmtDolares, fmtTokens } from "./formato";

interface Props {
  className: string;
  creditos: TCreditos;
  chaveAtiva: boolean;
  dias: string[];
  uso: { dado: RelatorioUso | null; erro: string | null; carregando: boolean };
  obras: Obra[];
  /** Celular: só o total e as barras, sem eixos nem a lista por obra. */
  compacto?: boolean;
}

export function Creditos({ className, creditos, chaveAtiva, dias, uso, obras, compacto }: Props) {
  const { saldo_microdolares: saldo, franquia } = creditos;
  const nomeObra = (id: string | null) => (id ? (obras.find((o) => o.id === id)?.nome ?? "Obra removida") : "Geral (sem obra)");
  const r = uso.dado;

  return (
    <section className={className} aria-labelledby="t-uso">
      <div className={s.cabCartao}>
        <h2 id="t-uso" className={compacto ? s.h2Cel : s.h2}>
          {compacto ? "Uso de IA · 30 dias" : "Uso de IA · últimos 30 dias"}
        </h2>
        <b className={s.total}>{r ? fmtDolares(r.total.custo) : "…"}</b>
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
      ) : compacto ? (
        <GraficoDias dias={dias} r={r} compacto />
      ) : (
        <div className={s.uso}>
          <GraficoDias dias={dias} r={r} />
          <Lista titulo="Por obra" itens={r.por_obra.map((x) => ({ k: x.obra_id ?? "-", nome: nomeObra(x.obra_id), custo: x.custo }))} />
        </div>
      )}

      {/* Sem chave e sem saldo o Plumo para de responder: isso não pode ficar numa linha discreta. */}
      {!chaveAtiva && saldo <= 0 ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          Sem créditos: o Plumo não responde até a franquia renovar ou uma chave própria ser conectada.
        </div>
      ) : (
        <p className={s.franquia}>
          {chaveAtiva
            ? `Com a chave própria, nada sai dos créditos da plataforma (saldo de ${fmtDolares(saldo)} de ${fmtDolares(franquia)}).`
            : `Créditos da plataforma: ${fmtDolares(saldo)} de ${fmtDolares(franquia)} da franquia.`}
        </p>
      )}
    </section>
  );
}

/**
 * Barras por dia, uma série só (sem legenda: o título diz o que é). Hover e teclado (← →) mostram o valor do dia;
 * a tabela escondida dá os mesmos números a quem usa leitor de tela. O pico ganha cor cheia: é o dia que explica o total.
 */
function GraficoDias({ dias, r, compacto }: { dias: string[]; r: RelatorioUso; compacto?: boolean }) {
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

  const pico = serie.reduce((m, d, i) => (d.custo > (serie[m]?.custo ?? 0) ? i : m), 0);
  const temPico = serie[pico]!.custo > 0;
  const meio = Math.floor(dias.length / 2);

  return (
    <figure className={`${s.grafico} ${compacto ? s.graficoCel : ""}`}>
      {compacto ? null : (
        <div className={s.eixoY} aria-hidden="true">
          <span>{fmtDolares(max)}</span>
          <span>0</span>
        </div>
      )}
      <div
        className={s.plot}
        tabIndex={0}
        role="img"
        aria-label={`Consumo por dia, de ${diaCurto(dias[0]!)} a ${diaCurto(dias.at(-1)!)}.${
          temPico ? ` Pico de ${fmtDolares(serie[pico]!.custo)} em ${diaCurto(serie[pico]!.dia)}.` : " Sem consumo no período."
        } Use as setas para ver cada dia.`}
        onPointerMove={mover}
        onPointerLeave={() => setFoco(null)}
        onKeyDown={tecla}
        onBlur={() => setFoco(null)}
      >
        {serie.map((d, i) => (
          <span key={d.dia} className={s.col} data-on={foco === i || undefined} data-pico={(temPico && i === pico) || undefined}>
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
      {compacto ? null : (
        <div className={s.eixoX} aria-hidden="true">
          <span>{diaCurto(dias[0]!)}</span>
          <span>{diaCurto(dias[meio]!)}</span>
          <span>{diaCurto(dias.at(-1)!)}</span>
        </div>
      )}
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

/** Barras deitadas: o maior item enche o trilho, os outros na proporção dele. */
function Lista({ titulo, itens }: { titulo: string; itens: { k: string; nome: string; custo: number }[] }) {
  const maior = Math.max(...itens.map((x) => x.custo), 1);
  return (
    <div className={s.porObra}>
      <h3 className={s.h4}>{titulo}</h3>
      {itens.length ? (
        <ul className={s.barrasH} aria-label={`Uso ${titulo.toLowerCase()}`}>
          {itens.map((x) => (
            <li key={x.k}>
              <span className={s.itemNome} title={x.nome}>
                {x.nome}
              </span>
              <span className={s.trilho} aria-hidden="true">
                <span style={{ width: `${Math.max((x.custo / maior) * 100, 2)}%` }} />
              </span>
              <span className={s.itemValor}>{fmtDolares(x.custo)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.diz}>Sem consumo no período.</p>
      )}
    </div>
  );
}
