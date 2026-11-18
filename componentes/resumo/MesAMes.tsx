"use client";
/**
 * O dinheiro mês a mês no Resumo, enxuto: uma coluna por mês com o que saiu (cheio) e o que ainda vai sair (claro), e um
 * traço fino onde o cronograma previa. Sem eixo nem grade: a escala é só para comparar os meses entre si; o valor de
 * cada mês aparece ao passar o mouse e na tabela para leitor de tela. O gráfico completo, com valores e cenários, fica em
 * Cronograma › Desembolso. Os valores vêm prontos de GET /desembolso.
 */
import type { Desembolso } from "@/lib/contrato";
import { fmtMes } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import s from "./painel.module.css";

export function MesAMes({ d }: { d: Desembolso }) {
  const ms = d.meses;
  if (!ms.length) return null;
  const topo = Math.max(1, ...ms.map((m) => Math.max(m.pago + m.projetado, m.previsto)));
  const pct = (v: number) => `${(v / topo) * 100}%`;
  const comRotulo = (i: number) => i === 0 || i === ms.length - 1 || ms[i]!.mes === d.mes_atual;
  return (
    <figure className={s.mesAMes}>
      <div className={s.colunas} aria-hidden="true">
        {ms.map((m, i) => {
          const agora = m.mes === d.mes_atual;
          const dica = [fmtMes(m.mes), m.pago ? `pago ${fmtReais(m.pago)}` : "", m.projetado ? `vai sair ${fmtReais(m.projetado)}` : "", m.previsto ? `previsto ${fmtReais(m.previsto)}` : ""]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={m.mes} className={`${s.mesCol}${agora ? ` ${s.mesAgora}` : ""}`} title={dica}>
              <div className={s.pilha}>
                {m.previsto ? <span className={s.previsto} style={{ bottom: pct(m.previsto) }} /> : null}
                {m.projetado ? <span className={s.vaiSair} style={{ height: pct(m.projetado) }} /> : null}
                {m.pago ? <span className={s.pago} style={{ height: pct(m.pago) }} /> : null}
              </div>
              <span className={s.mes}>{comRotulo(i) ? fmtMes(m.mes) : ""}</span>
            </div>
          );
        })}
      </div>
      <figcaption className={s.legendaMes}>
        <span>
          <i className={s.legPago} aria-hidden="true" />
          pago
        </span>
        <span>
          <i className={s.legVai} aria-hidden="true" />
          vai sair
        </span>
        <span>
          <i className={s.legPrev} aria-hidden="true" />
          previsto no cronograma
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Dinheiro mês a mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Pago</th>
            <th scope="col">Vai sair</th>
            <th scope="col">Previsto</th>
          </tr>
        </thead>
        <tbody>
          {ms.map((m) => (
            <tr key={m.mes}>
              <th scope="row">{fmtMes(m.mes)}</th>
              <td>{fmtReais(m.pago)}</td>
              <td>{fmtReais(m.projetado)}</td>
              <td>{fmtReais(m.previsto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
