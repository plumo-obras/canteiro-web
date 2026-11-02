"use client";
/**
 * Editor do cronograma físico-financeiro: etapas × meses em %. Cada etapa soma 100% (ou fica toda vazia, fora do
 * cronograma), como a API exige; o total da linha avisa quando não fecha. O atalho "distribuir igual" preenche um
 * intervalo de meses em partes iguais (os centésimos que sobram vão para os primeiros meses). Embaixo, o R$ previsto
 * por mês e o acumulado, ao vivo, para a pessoa ver a curva de desembolso enquanto distribui.
 */
import { useState } from "react";
import type { Cronograma, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { CEM, distribuirIgual, fmtMes, fmtPct, listaMeses, previsaoMensal, redimensionar, somaPct } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { lerMesAno, lerPct, pctParaCampo } from "../obra/CamposObra";
import { ErroApi } from "../formularios/Campos";

const mesAtual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date());
const paraCampoMes = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
const celula = (c: number) => (c ? pctParaCampo(c) : "");
/** O mesmo que `redimensionar`, para o texto das células (mês novo = campo vazio). */
const redimTexto = (cs: string[], m: number) => Array.from({ length: m }, (_, i) => cs[i] ?? "");

export function EditorCronograma(props: { obra: Obra; crono: Cronograma; meses?: number; aditivoPrazo?: boolean; fechar: () => void }) {
  const { obra, crono } = props;
  const { avisarFeito, mudou } = useCasca();
  const inicioPadrao = crono.inicio ?? (obra.inicio ? obra.inicio.slice(0, 7) : mesAtual());
  const mesesPadrao = props.meses ?? (crono.meses || obra.prazo_meses || 12);
  const [inicio, setInicio] = useState(paraCampoMes(inicioPadrao));
  const [meses, setMeses] = useState(String(mesesPadrao));
  const [grade, setGrade] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(crono.etapas.map((e) => [e.etapa, redimensionar(e.percentuais, mesesPadrao).map(celula)])),
  );
  const [distribuindo, setDistribuindo] = useState<{ etapa: string; de: number; ate: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novaBase, setNovaBase] = useState(false);
  const reprogramando = !!crono.inicio;
  const [ocupado, setOcupado] = useState(false);

  const ini = lerMesAno(inicio);
  const n = /^\d+$/.test(meses.trim()) ? Number(meses) : NaN;
  const nOk = Number.isInteger(n) && n >= 1 && n <= 60;
  const nVal = nOk ? n : mesesPadrao;
  const colunas = ini ? listaMeses(ini, nVal) : Array.from({ length: nVal }, (_, i) => `Mês ${i + 1}`);
  const linhas = crono.etapas.map((e) => {
    const cels = redimTexto(grade[e.etapa] ?? [], nVal);
    const lidas = cels.map((t) => (t.trim() ? lerPct(t) : 0));
    const invalida = lidas.some((x) => x === null);
    const total = somaPct(lidas.map((x) => x ?? 0));
    return { ...e, cels, lidas: lidas.map((x) => x ?? 0), invalida, total };
  });
  const prev = previsaoMensal(
    linhas.map((l) => ({ atual: l.atual, percentuais: l.lidas })),
    nVal,
  );
  const totalObra = linhas.reduce((t, l) => t + l.atual, 0);
  const problemas = linhas.filter((l) => l.invalida || (l.total !== 0 && l.total !== CEM));
  const nenhuma = linhas.every((l) => l.total === 0);

  const mudarCel = (etapa: string, i: number, v: string) =>
    setGrade((g) => ({ ...g, [etapa]: redimTexto(g[etapa] ?? [], nVal).map((x, j) => (j === i ? v : x)) }));
  const mudarMeses = (v: string) => {
    setMeses(v);
    const m = Number(v);
    // Mais meses: os novos entram vazios (aditivo de prazo). Menos: corta no fim, e o total da linha avisa.
    if (Number.isInteger(m) && m >= 1 && m <= 60) setGrade((g) => Object.fromEntries(Object.entries(g).map(([k, cs]) => [k, redimTexto(cs, m)])));
  };
  const aplicarDistribuicao = () => {
    if (!distribuindo) return;
    setGrade((g) => ({ ...g, [distribuindo.etapa]: distribuirIgual(nVal, distribuindo.de, distribuindo.ate).map(celula) }));
    setDistribuindo(null);
  };

  const salvar = async () => {
    setErro(null);
    if (!ini) return setErro("Início em mês e ano, ex.: 11/2026.");
    if (!nOk) return setErro("Duração de 1 a 60 meses.");
    if (problemas.length)
      return setErro(`${problemas.length === 1 ? "1 etapa não fecha" : `${problemas.length} etapas não fecham`} 100%: ${problemas.map((p) => p.etapa).join(", ")}. Cada etapa soma 100% ou fica toda vazia.`);
    if (nenhuma) return setErro("Distribua pelo menos uma etapa.");
    setOcupado(true);
    try {
      const r = await api.salvarCronograma(obra.id, {
        inicio: ini,
        meses: n,
        etapas: linhas.filter((l) => l.total).map((l) => ({ etapa: l.etapa, percentuais: l.lidas })),
        ...(novaBase ? { nova_linha_base: true } : {}),
        ...(props.aditivoPrazo ? { atualizar_prazo_da_obra: true } : {}),
      });
      mudou();
      props.fechar();
      avisarFeito(
        `${props.aditivoPrazo ? `Aditivo de prazo: obra e cronograma com ${n} meses` : `Cronograma salvo: ${n} meses`}, de ${fmtMes(ini)} a ${fmtMes(listaMeses(ini, n).at(-1)!)}.`,
        r.registro_id,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="crono-editor" aria-label="Editor do cronograma">
      {props.aditivoPrazo ? (
        <p className="prev-subst" role="status">
          <Icone nome="calendario" tam={16} />
          <span>
            <b>Aditivo de prazo: {meses} meses.</b> Redistribua as etapas nos meses novos. Ao salvar, o prazo da obra passa a {meses} meses junto com o cronograma, e
            o Desfazer volta os dois.
          </span>
        </p>
      ) : null}
      <div className="crono-ed-cab">
        <div className="campo">
          <label className="l" htmlFor="crono-ini">
            Início (mês)
          </label>
          <input id="crono-ini" className="f" inputMode="numeric" placeholder="MM/AAAA" maxLength={7} value={inicio} aria-invalid={!ini} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="campo">
          <label className="l" htmlFor="crono-meses">
            Duração (meses)
          </label>
          <input id="crono-meses" className="f" inputMode="numeric" value={meses} aria-invalid={!nOk} onChange={(e) => mudarMeses(e.target.value)} />
        </div>
        <p className="mut sm">
          {obra.prazo_meses ? `Prazo da obra: ${obra.prazo_meses} meses. ` : ""}Digite o % de cada etapa em cada mês; cada etapa soma 100%. Etapa toda vazia fica fora do
          cronograma.
        </p>
      </div>
      <div className="tbl-rola crono-rola">
        <table className="tbl-crono">
          <thead>
            <tr>
              <th scope="col" className="crono-et">
                Etapa
              </th>
              {colunas.map((c) => (
                <th key={c} scope="col" className="num">
                  {c.startsWith("Mês") ? c : fmtMes(c)}
                </th>
              ))}
              <th scope="col" className="num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const fecha = l.total === CEM;
              const ruim = l.invalida || (l.total !== 0 && !fecha);
              const dist = distribuindo?.etapa === l.etapa ? distribuindo : null;
              return [
                <tr key={l.etapa} className={ruim ? "crono-ruim" : l.total ? "" : "crono-fora"}>
                  <th scope="row" className="crono-et">
                    <span className="eap-num">{l.etapa}</span> {l.descricao}
                    <small className="mut">{fmtReais(l.atual)}</small>
                    <button type="button" className="link crono-dist" onClick={() => setDistribuindo(dist ? null : { etapa: l.etapa, de: 0, ate: nVal - 1 })}>
                      Distribuir igual…
                    </button>
                  </th>
                  {l.cels.map((t, i) => (
                    <td key={i} className="crono-cel">
                      <input
                        className="f"
                        inputMode="decimal"
                        aria-label={`${l.descricao}, ${colunas[i]}, %`}
                        aria-invalid={t.trim() !== "" && lerPct(t) === null}
                        value={t}
                        onChange={(e) => mudarCel(l.etapa, i, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className={`num crono-tot${ruim ? " t-neg" : fecha ? " t-ok" : ""}`}>{l.total ? fmtPct(l.total) : "—"}</td>
                </tr>,
                dist ? (
                  <tr key={`${l.etapa}-dist`} className="crono-dist-l">
                    <td colSpan={nVal + 2}>
                      <span>Distribuir igual de</span>
                      <select className="f" aria-label="Do mês" value={dist.de} onChange={(e) => setDistribuindo({ ...dist, de: Number(e.target.value) })}>
                        {colunas.map((c, i) => (
                          <option key={c} value={i}>
                            {c.startsWith("Mês") ? c : fmtMes(c)}
                          </option>
                        ))}
                      </select>
                      <span>a</span>
                      <select className="f" aria-label="Até o mês" value={dist.ate} onChange={(e) => setDistribuindo({ ...dist, ate: Number(e.target.value) })}>
                        {colunas.map((c, i) => (
                          <option key={c} value={i}>
                            {c.startsWith("Mês") ? c : fmtMes(c)}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="btn sm amb" onClick={aplicarDistribuicao}>
                        Aplicar
                      </button>
                      <button type="button" className="btn sm" onClick={() => setDistribuindo(null)}>
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="crono-et">
                Previsto no mês
              </th>
              {prev.previsto.map((v, i) => (
                <td key={i} className="num">
                  {v ? fmtReais(v) : "—"}
                </td>
              ))}
              <td className="num">{fmtReais(prev.acumulado.at(-1) ?? 0)}</td>
            </tr>
            <tr>
              <th scope="row" className="crono-et">
                Acumulado
              </th>
              {prev.acumulado.map((v, i) => (
                <td key={i} className="num">
                  {fmtReais(v)}
                  <small className="mut">{totalObra ? fmtPct(Math.round((v / totalObra) * CEM)) : ""}</small>
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {problemas.length ? (
        <p className="campo-erro" role="status">
          <Icone nome="alert" tam={14} /> {problemas.length === 1 ? "1 etapa não fecha 100%" : `${problemas.length} etapas não fecham 100%`}: cada etapa soma 100% ou
          fica toda vazia.
        </p>
      ) : null}
      <ErroApi texto={erro} />
      {reprogramando ? (
        <label className="check">
          <input type="checkbox" checked={novaBase} onChange={(e) => setNovaBase(e.target.checked)} />
          <span>
            Usar como nova linha de base
            <small>
              {crono.base
                ? `Hoje o atraso também é medido contra o cronograma original (${fmtMes(crono.base.inicio)}, ${crono.base.meses} meses). Marcado, este passa a ser o original e esse atraso zera: use só quando o contrato for reprogramado formalmente.`
                : "Marcado, este cronograma passa a ser a referência do atraso contra o original."}
            </small>
          </span>
        </label>
      ) : null}
      <div className="form-acoes">
        <button type="button" className="btn" onClick={props.fechar}>
          Cancelar
        </button>
        <button type="button" className="btn amb" disabled={ocupado} aria-busy={ocupado} onClick={salvar}>
          Salvar cronograma
        </button>
      </div>
    </section>
  );
}
