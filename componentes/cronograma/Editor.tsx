"use client";
/**
 * Editor do cronograma físico-financeiro, como planilha: etapas × meses em %. Cada etapa soma 100% (ou fica toda vazia,
 * fora do cronograma), como a API exige; a coluna Soma (fixa à direita) diz se fecha. Células planas: o campo só aparece
 * no foco/hover; o intervalo da etapa ganha um tom, para ler como barra. Setas, Tab e Enter andam entre as células, e
 * colar um bloco do Excel preenche a partir da célula focada. "Distribuir igual" e "Limpar etapa" ficam no ⋯ da linha.
 * Rodapé fixo com o resumo da validação; Salvar só com tudo certo. No celular, lista de etapas: o toque abre os meses.
 */
import { useRef, useState } from "react";
import type { Cronograma, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { CEM, colarBloco, fmtReaisCurto, distribuirIgual, fmtMes, fmtPct, listaMeses, previsaoMensal, redimensionar, somaPct, textoSoma } from "@/lib/cronograma";
import { fmtReais } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Icone } from "../Icone";
import { lerMesAno, lerPct, pctParaCampo } from "../obra/CamposObra";
import { ErroApi } from "../formularios/Campos";
import { Ajuda } from "../Ajuda";
import { Modal } from "../Dialogo";
import { MenuMais } from "../MenuMais";

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
  const limparEtapa = (etapa: string) => setGrade((g) => ({ ...g, [etapa]: Array.from({ length: nVal }, () => "") }));
  const [aberta, setAberta] = useState<string | null>(null);
  const tabela = useRef<HTMLTableElement>(null);

  /** Foco numa célula (r = linha da etapa, c = mês); fora da grade não faz nada. */
  const focar = (r: number, c: number) => {
    const el = tabela.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  };
  const teclaCel = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const el = e.currentTarget;
    const noInicio = el.selectionStart === 0 && el.selectionEnd === 0;
    const noFim = el.selectionStart === el.value.length;
    if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      focar(r + 1, c);
    } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
      e.preventDefault();
      focar(r - 1, c);
    } else if (e.key === "ArrowRight" && (noFim || el.selectionStart !== el.selectionEnd)) {
      e.preventDefault();
      focar(r, c + 1);
    } else if (e.key === "ArrowLeft" && (noInicio || el.selectionStart !== el.selectionEnd)) {
      e.preventDefault();
      focar(r, c - 1);
    }
  };
  const colar = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const t = e.clipboardData.getData("text/plain");
    // Um valor solto cola normal; bloco do Excel (tab ou várias linhas) espalha pela grade.
    if (!/[\t\n]/.test(t.trim())) return;
    e.preventDefault();
    const ordem = linhas.map((l) => l.etapa);
    const atual = ordem.map((k) => redimTexto(grade[k] ?? [], nVal));
    const nova = colarBloco(atual, r, c, t);
    setGrade((g) => ({ ...g, ...Object.fromEntries(ordem.map((k, i) => [k, nova[i]!])) }));
  };
  const irPrimeiroProblema = () => {
    const i = linhas.findIndex((l) => l.invalida || (l.total !== 0 && l.total !== CEM));
    if (i < 0) return;
    const desk = getComputedStyle(tabela.current?.closest(".pl-rola") ?? document.body).display !== "none";
    if (desk && tabela.current) focar(i, Math.max(0, linhas[i]!.lidas.findIndex((x) => x) ));
    else {
      setAberta(linhas[i]!.etapa);
      requestAnimationFrame(() => document.getElementById(`pl-m-${linhas[i]!.etapa}`)?.scrollIntoView({ block: "start" }));
    }
  };
  const nomeCol = (c: string) => (c.startsWith("Mês") ? c : fmtMes(c));

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

  const resumo = problemas.length
    ? `${problemas.length === 1 ? "1 etapa não soma" : `${problemas.length} etapas não somam`} 100%`
    : nenhuma
      ? "Distribua pelo menos uma etapa"
      : !ini
        ? "Início inválido (MM/AAAA)"
        : !nOk
          ? "Duração de 1 a 60 meses"
          : null;
  const faixa = (lidas: number[]) => {
    const de = lidas.findIndex((x) => x > 0);
    let ate = lidas.length - 1;
    while (ate > de && !lidas[ate]) ate--;
    return (i: number) => de >= 0 && i >= de && i <= ate;
  };
  const menuEtapa = (l: (typeof linhas)[number]) => [
    { rotulo: "Distribuir igual…", acao: () => setDistribuindo({ etapa: l.etapa, de: 0, ate: nVal - 1 }) },
    { rotulo: "Limpar etapa", acao: () => limparEtapa(l.etapa) },
  ];

  return (
    <section className="crono-editor" aria-label="Editor do cronograma">
      {props.aditivoPrazo ? (
        <p className="prev-subst" role="status">
          <Icone nome="calendario" tam={16} />
          <span>
            <b>Aditivo de prazo: {meses} meses.</b> Redistribua as etapas nos meses novos. Ao salvar, o prazo da obra passa a {meses} meses junto com o
            cronograma, e o Desfazer volta os dois.
          </span>
        </p>
      ) : null}
      <div className="pl-topo">
        <div className="campo">
          <label className="l" htmlFor="crono-ini">
            Início
          </label>
          <input id="crono-ini" className="f" inputMode="numeric" placeholder="MM/AAAA" maxLength={7} value={inicio} aria-invalid={!ini} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="campo">
          <label className="l" htmlFor="crono-meses">
            Duração (meses)
          </label>
          <input id="crono-meses" className="f" inputMode="numeric" value={meses} aria-invalid={!nOk} onChange={(e) => mudarMeses(e.target.value)} />
        </div>
        <p className="pl-frase">
          Cada etapa soma 100%.
          <Ajuda rotulo="o preenchimento do cronograma">
            Digite o % de cada etapa em cada mês. Etapa toda vazia fica fora do cronograma.
            {obra.prazo_meses ? ` Prazo da obra: ${obra.prazo_meses} meses.` : ""} Setas, Tab e Enter andam entre as células; dá para colar um bloco
            copiado do Excel a partir da célula selecionada. "Distribuir igual" fica no ⋯ de cada etapa.
          </Ajuda>
        </p>
      </div>

      {/* desktop: planilha */}
      <div className="pl-rola">
        <table className="pl" ref={tabela}>
          <thead>
            <tr>
              <th scope="col" className="pl-et">
                Etapa
              </th>
              {colunas.map((c) => (
                <th key={c} scope="col" className="num">
                  {nomeCol(c)} %
                </th>
              ))}
              <th scope="col" className="num pl-soma">
                Soma
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, r) => {
              const soma = l.invalida ? { texto: "valor inválido", ok: false } : textoSoma(l.total);
              const naFaixa = faixa(l.lidas);
              return (
                <tr key={l.etapa} className={`pl-linha${soma.ok ? "" : " ruim"}${l.total ? "" : " fora"}`}>
                  <th scope="row" className="pl-et">
                    <span className="pl-et-n">
                      <span className="eap-num">{l.etapa}</span> {l.descricao}
                    </span>
                    <small>{fmtReais(l.atual)}</small>
                    <span className="pl-et-menu">
                      <MenuMais rotulo={`Ações da etapa ${l.etapa}`} itens={menuEtapa(l)} />
                    </span>
                  </th>
                  {l.cels.map((t, c) => (
                    <td key={c} className={`pl-cel${naFaixa(c) ? " na-faixa" : ""}`}>
                      <input
                        data-r={r}
                        data-c={c}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`${l.descricao}, ${nomeCol(colunas[c]!)}, %`}
                        aria-invalid={t.trim() !== "" && lerPct(t) === null}
                        value={t}
                        onChange={(e) => mudarCel(l.etapa, c, e.target.value)}
                        onKeyDown={(e) => teclaCel(e, r, c)}
                        onPaste={(e) => colar(e, r, c)}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                    </td>
                  ))}
                  <td className={`num pl-soma${soma.ok ? (l.total ? " ok" : "") : " ruim"}`}>{soma.texto}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pl-et">
                Previsto no mês
              </th>
              {/* valor curto para a célula de 64 px; o cheio no title (a tabela físico-financeira tem os cheios) */}
              {prev.previsto.map((v, i) => (
                <td key={i} className="num" title={fmtReais(v)}>
                  {v ? fmtReaisCurto(v) : "—"}
                </td>
              ))}
              <td className="num pl-soma">{fmtReais(prev.acumulado.at(-1) ?? 0)}</td>
            </tr>
            <tr>
              <th scope="row" className="pl-et">
                Acumulado
              </th>
              {prev.acumulado.map((v, i) => (
                <td key={i} className="num">
                  {totalObra ? fmtPct(Math.round((v / totalObra) * CEM)) : "—"}
                </td>
              ))}
              <td className="pl-soma" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* celular: lista de etapas; o toque abre os meses, um campo cada */}
      <ul className="pl-m">
        {linhas.map((l) => {
          const soma = l.invalida ? { texto: "valor inválido", ok: false } : textoSoma(l.total);
          const ab = aberta === l.etapa;
          return (
            <li key={l.etapa} id={`pl-m-${l.etapa}`} className={soma.ok ? "" : "ruim"}>
              <button type="button" className="pl-m-etapa" aria-expanded={ab} onClick={() => setAberta(ab ? null : l.etapa)}>
                <span className="pl-et-n">
                  <span className="eap-num">{l.etapa}</span> {l.descricao}
                </span>
                <span className={`pl-m-soma${soma.ok ? (l.total ? " ok" : "") : " ruim"}`}>{soma.texto}</span>
              </button>
              {ab ? (
                <div className="pl-m-meses">
                  {l.cels.map((t, c) => (
                    <label key={c} className="pl-m-mes">
                      <span>{nomeCol(colunas[c]!)}</span>
                      <span className="ent-q">
                        <input
                          className="f"
                          inputMode="decimal"
                          autoComplete="off"
                          aria-invalid={t.trim() !== "" && lerPct(t) === null}
                          value={t}
                          onChange={(e) => mudarCel(l.etapa, c, e.target.value)}
                        />
                        <small>%</small>
                      </span>
                    </label>
                  ))}
                  <div className="pl-m-acoes">
                    <button type="button" className="btn sm" onClick={() => setDistribuindo({ etapa: l.etapa, de: 0, ate: nVal - 1 })}>
                      Distribuir igual…
                    </button>
                    <button type="button" className="btn sm" onClick={() => limparEtapa(l.etapa)}>
                      Limpar etapa
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

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
      <ErroApi texto={erro} />

      {/* rodapé fixo: o resumo da validação (o clique leva à primeira etapa com problema), Cancelar e Salvar */}
      <div className="pl-rodape">
        {resumo ? (
          <button type="button" className="pl-resumo ruim" onClick={irPrimeiroProblema} disabled={!problemas.length}>
            <Icone nome="alert" tam={14} />
            {resumo}
          </button>
        ) : (
          <span className="pl-resumo ok">
            <Icone nome="checkCircle" tam={14} />
            Todas as etapas fecham 100%
          </span>
        )}
        <span className="sp" />
        <button type="button" className="btn" onClick={props.fechar}>
          Cancelar
        </button>
        <button type="button" className="btn amb" disabled={!!resumo || ocupado} aria-busy={ocupado} onClick={salvar}>
          Salvar cronograma
        </button>
      </div>

      {distribuindo ? (
        <Modal
          titulo="Distribuir igual"
          fechar={() => setDistribuindo(null)}
          rodape={
            <>
              <button type="button" className="btn" onClick={() => setDistribuindo(null)}>
                Cancelar
              </button>
              <button type="button" className="btn amb" onClick={aplicarDistribuicao}>
                Aplicar
              </button>
            </>
          }
        >
          <p className="mut sm" style={{ margin: "0 0 10px" }}>
            {linhas.find((l) => l.etapa === distribuindo.etapa)?.descricao}: 100% em partes iguais no intervalo (substitui o que estiver na etapa).
          </p>
          <div className="campos2">
            <div className="campo">
              <label className="l" htmlFor="dist-de">
                De
              </label>
              <select id="dist-de" className="f" value={distribuindo.de} onChange={(e) => setDistribuindo({ ...distribuindo, de: Number(e.target.value) })}>
                {colunas.map((c, i) => (
                  <option key={c} value={i}>
                    {nomeCol(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label className="l" htmlFor="dist-ate">
                Até
              </label>
              <select id="dist-ate" className="f" value={distribuindo.ate} onChange={(e) => setDistribuindo({ ...distribuindo, ate: Number(e.target.value) })}>
                {colunas.map((c, i) => (
                  <option key={c} value={i}>
                    {nomeCol(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
