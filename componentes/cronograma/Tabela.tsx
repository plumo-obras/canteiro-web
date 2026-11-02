"use client";
/**
 * A tabela físico-financeira (pedido do engenheiro): etapa × mês com o % previsto e o R$ do mês, valores cheios, para
 * conferir com o cronograma da licitação e a medição da prefeitura. Usa só o que o GET do cronograma já devolve
 * (percentuais e orçado de cada etapa; o mensal para os totais). Desktop: primeira coluna fixa e rolagem horizontal.
 * Celular: uma lista por etapa, com os meses dela.
 */
import type { Cronograma } from "@/lib/contrato";
import { fmtMes, fmtPct, listaMeses, valoresMes } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { Modal } from "../Dialogo";

/** As linhas da tabela: só as etapas que estão no cronograma, com o R$ de cada mês já calculado. */
export function linhasTabela(c: Cronograma) {
  return c.etapas
    .filter((e) => e.percentuais.some(Boolean))
    .map((e) => {
      const vs = valoresMes(e.atual, e.percentuais);
      return { etapa: e.etapa, descricao: e.descricao, atual: e.atual, meses: e.percentuais.map((p, i) => ({ pct: p, valor: vs[i]! })) };
    });
}

export function TabelaFisicoFinanceira({ crono, fechar }: { crono: Cronograma; fechar: () => void }) {
  const meses = listaMeses(crono.inicio!, crono.meses);
  const linhas = linhasTabela(crono);
  const mensal = crono.mensal.slice(0, crono.meses);
  return (
    <Modal
      titulo="Físico-financeiro"
      fechar={fechar}
      largo
      classe="tela-cheia tff-modal"
      rodape={
        <button type="button" className="btn" onClick={fechar}>
          Fechar
        </button>
      }
    >
      <p className="mut sm" style={{ margin: "0 0 10px" }}>
        % previsto e R$ de cada mês, por etapa, no cronograma vigente.
      </p>
      <div className="tff-rola" tabIndex={0} aria-label="Tabela físico-financeira, role para os lados">
        <table className="tff">
          <thead>
            <tr>
              <th scope="col" className="tff-fixa">
                Etapa
              </th>
              {meses.map((m) => (
                <th key={m} scope="col" className="num">
                  {fmtMes(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.etapa}>
                <th scope="row" className="tff-fixa">
                  <span className="eap-num">{l.etapa}</span> {l.descricao}
                  <small>{fmtReais(l.atual)}</small>
                </th>
                {l.meses.map((x, i) => (
                  <td key={i} className={`num${x.pct ? "" : " tff-vazio"}`}>
                    {x.pct ? (
                      <>
                        <b>{fmtPct(x.pct)}</b>
                        <small>{fmtReais(x.valor)}</small>
                      </>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="tff-fixa">
                Total do mês
              </th>
              {mensal.map((m) => (
                <td key={m.mes} className="num">
                  <b>{fmtReais(m.previsto)}</b>
                  <small>acum. {fmtReais(m.previsto_acumulado)}</small>
                  <small>{fmtPct(m.pct_previsto_acumulado)}</small>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {/* celular: primeiro o total por mês (para conferir a medição), depois uma etapa por bloco */}
      <div className="tff-lista">
        <section className="tff-etapa tff-mes">
          <h3>Por mês</h3>
          <ul>
            {mensal.map((m) => (
              <li key={m.mes}>
                <span>{fmtMes(m.mes)}</span>
                <span className="num">
                  {fmtReais(m.previsto)}
                  <small>
                    acum. {fmtReais(m.previsto_acumulado)} · {fmtPct(m.pct_previsto_acumulado)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </section>
        {linhas.map((l) => (
          <section key={l.etapa} className="tff-etapa">
            <h3>
              <span className="eap-num">{l.etapa}</span> {l.descricao}
              <small>{fmtReais(l.atual)}</small>
            </h3>
            <ul>
              {l.meses.map((x, i) =>
                x.pct ? (
                  <li key={i}>
                    <span>{fmtMes(meses[i]!)}</span>
                    <span className="num">
                      {fmtReais(x.valor)}
                      <small>{fmtPct(x.pct)}</small>
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
