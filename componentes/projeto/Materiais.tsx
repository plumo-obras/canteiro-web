"use client";
/**
 * Aba Materiais do Projeto 3D: o que o projeto estrutural pede para sair do papel (aço por bitola, concreto, forma,
 * enchimento), cada material com o insumo do SINAPI que é o mesmo produto e o preço de referência na UF da obra.
 * "Levar para Compras" vira a lista de materiais da obra pela mesma prévia da planilha: o que falta comprar é a conta
 * da API (precisa − saldo − a caminho), não desta tela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/cliente";
import type { ItemInsumo, MaterialDoProjeto, Obra, PreviaOrcamento, PreviaVersao } from "@/lib/contrato";
import { fmtQtdUn, fmtReais } from "@/lib/formato";
import { tradutor, type MateriaisProjeto, type MaterialProjeto } from "@/lib/tradutor";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import s from "./projeto.module.css";

const ORIGEM = "projeto estrutural";

/** O nome do insumo na obra: legível em Compras, estável entre envios (reenviar atualiza, não duplica) e com o código. */
export function nomeNaObra(m: MaterialProjeto): string {
  return m.referencia ? `${m.especificacao} (SINAPI ${m.referencia.codigo})` : m.especificacao;
}

/** Só vai para a obra o que tem quantidade: vigota sem quantidade é para confirmar com o fornecedor. */
export function paraAObra(itens: MaterialProjeto[]): MaterialDoProjeto[] {
  return itens
    .filter((m) => m.quantidade > 0)
    .map((m) => ({
      nome: nomeNaObra(m),
      unidade: m.unidade,
      quantidade: Math.round(m.quantidade * 1000),
      valor_unitario: m.referencia?.preco_centavos ?? 0,
    }));
}

/** Tokens significativos do nome, para achar o mesmo produto já cadastrado na obra ("Aço CA-50 10 mm" ~ "Aço CA-50 Ø 10,0 mm"). */
function tokens(nome: string): Set<string> {
  return new Set(
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((x) => x.length > 0 && !["de", "da", "do", "mm", "cm"].includes(x)),
  );
}
const contido = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

/** O insumo da obra que é, com boa chance, o mesmo material do projeto (ou null). */
function jaNaObra(especificacao: string, existentes: ItemInsumo[]): string | null {
  const tm = tokens(especificacao);
  for (const e of existentes) {
    const te = tokens(e.insumo.nome);
    const [menor, maior] = te.size <= tm.size ? [te, tm] : [tm, te];
    if (menor.size >= 2 && contido(menor, maior)) return e.insumo.nome;
  }
  return null;
}

const unidade = (u: string) => ({ m3: "m³", m2: "m²" })[u] ?? u;

export function Materiais({ obra, ids }: { obra: Obra; ids: string[] }) {
  const { podeOperar, mudou, avisarFeito } = useCasca();
  const [dados, setDados] = useState<MateriaisProjeto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PreviaOrcamento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [existentes, setExistentes] = useState<ItemInsumo[]>([]);
  const [incluirExistentes, setIncluirExistentes] = useState(false);
  const lancar = useRef<HTMLButtonElement>(null);
  const [previaEstr, setPreviaEstr] = useState<PreviaVersao | null>(null);
  const chaveEstr = useRef<string>("");
  const lancarEstr = useRef<HTMLButtonElement>(null);
  const chaveIds = ids.join(",");

  useEffect(() => {
    if (!chaveIds) return;
    let vivo = true;
    setErro(null);
    tradutor
      .materiais(chaveIds.split(","), obra.uf || "SP")
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [chaveIds, obra.uf]);

  useEffect(() => {
    let vivo = true;
    api
      .listarInsumos(obra.id)
      .then((is) => vivo && setExistentes(is))
      .catch(() => {}); // sem a lista, a tela só não avisa sobre duplicados
    return () => {
      vivo = false;
    };
  }, [obra.id]);

  // de cada material do projeto, o insumo da obra que parece ser o mesmo (para avisar e não duplicar)
  const duplicadoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of dados?.itens ?? []) {
      const achado = jaNaObra(x.especificacao, existentes);
      if (achado) m.set(x.chave, achado);
    }
    return m;
  }, [dados, existentes]);

  // por padrão não manda o que já existe na obra (evita o mesmo aço virar dois itens); a pessoa pode incluir
  const enviaveis = useMemo(
    () => (dados ? paraAObra(dados.itens.filter((m) => incluirExistentes || !duplicadoDe.has(m.chave))) : []),
    [dados, duplicadoDe, incluirExistentes],
  );
  // A versão "Estrutura" do orçamento é o projeto inteiro (não se tira duplicado: é o orçamento do projeto, não a compra).
  const todosDoProjeto = useMemo(() => (dados ? paraAObra(dados.itens) : []), [dados]);

  const verPrevia = useCallback(async () => {
    setOcupado(true);
    setErroEnvio(null);
    try {
      setPrevia(await api.materiaisDoProjeto(obra.id, ORIGEM, enviaveis, false));
    } catch (e) {
      setErroEnvio(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  }, [obra.id, enviaveis]);

  async function aplicar() {
    setOcupado(true);
    setErroEnvio(null);
    try {
      const r = await api.materiaisDoProjeto(obra.id, ORIGEM, enviaveis, true);
      setPrevia(null);
      mudou();
      const n = r.linhas.length;
      avisarFeito(`${n} ${n === 1 ? "material do projeto lançado" : "materiais do projeto lançados"} na obra. O que falta comprar está em Compras.`, r.registro_ids?.[0]);
    } catch (e) {
      setErroEnvio(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  }

  const verPreviaEstrutura = useCallback(async () => {
    setOcupado(true);
    setErroEnvio(null);
    try {
      chaveEstr.current = crypto.randomUUID();
      setPreviaEstr(await api.estruturaDoProjeto(obra.id, todosDoProjeto, false));
    } catch (e) {
      setErroEnvio(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  }, [obra.id, todosDoProjeto]);

  async function aplicarEstrutura() {
    setOcupado(true);
    setErroEnvio(null);
    try {
      const r = await api.estruturaDoProjeto(obra.id, todosDoProjeto, true, chaveEstr.current);
      setPreviaEstr(null);
      mudou();
      const comoQue = r.tipo === "contrato" ? "contrato do orçamento" : "aditivo do orçamento";
      avisarFeito(`Estrutura do projeto lançada como ${comoQue} (${fmtReais(r.total)}). Veja em Orçamento.`, r.registro_id ?? undefined);
    } catch (e) {
      setErroEnvio(mensagemDe(e));
    } finally {
      setOcupado(false);
    }
  }

  if (erro) {
    return (
      <div className="aviso-erro" role="alert">
        <Icone nome="alert" tam={15} />
        <span>{erro}</span>
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="carregando" role="status">
        <Icone nome="loader" className="spin" />
        Levantando os materiais do projeto…
      </div>
    );
  }
  if (!dados.itens.length) {
    return <p className={s.explica}>Os materiais aparecem quando houver folha de detalhamento (quadro de aço, concreto e forma) no pacote.</p>;
  }

  const ref = dados.referencia;
  return (
    <>
      <div className={s.matCab}>
        <span>
          {ref ? (
            <>
              Preços de referência: <b>SINAPI {ref.mes.split("-").reverse().join("/")}</b> · {ref.uf}
            </>
          ) : (
            "Sem a base SINAPI neste ambiente: materiais sem código e sem preço."
          )}
        </span>
        {dados.total_referencia_centavos ? <b className={s.matTotal}>{fmtReais(dados.total_referencia_centavos)}</b> : null}
      </div>
      <ul className={s.materiais} aria-label="Materiais do projeto">
        {dados.itens.map((m) => (
          <li key={m.chave}>
            <div className={s.matLinha}>
              <b>{m.especificacao}</b>
              <span className="num">{m.quantidade > 0 ? `${m.quantidade.toLocaleString("pt-BR")} ${unidade(m.unidade)}` : "a confirmar"}</span>
            </div>
            {m.referencia ? (
              <span className={s.deonde}>
                SINAPI {m.referencia.codigo}
                {m.referencia.preco_centavos != null ? ` · ${fmtReais(m.referencia.preco_centavos)}/${unidade(m.unidade)}` : " · sem preço nesta UF"}
                {m.referencia.total_centavos ? ` · ${fmtReais(m.referencia.total_centavos)}` : ""}
              </span>
            ) : (
              <span className={s.resp}>Sem item avulso no SINAPI: cotar com o fornecedor</span>
            )}
            {duplicadoDe.has(m.chave) ? (
              <span className={s.jaNaObra}>
                <Icone nome="check" tam={12} /> Já na obra como «{duplicadoDe.get(m.chave)}» — não será duplicado
              </span>
            ) : null}
            {m.ajuste ? <span className={s.falta}>{m.ajuste}</span> : null}
            {m.nota ? <span className={s.resp}>{m.nota}</span> : null}
          </li>
        ))}
      </ul>
      {dados.avisos.map((a) => (
        <p key={a} className={s.explica}>
          {a}
        </p>
      ))}
      {podeOperar && duplicadoDe.size ? (
        <label className={s.incluir}>
          <input type="checkbox" checked={incluirExistentes} onChange={(e) => setIncluirExistentes(e.target.checked)} />
          {duplicadoDe.size === 1
            ? `1 material já existe na obra e ficou de fora. Marque para lançar mesmo assim (vira item separado).`
            : `${duplicadoDe.size} materiais já existem na obra e ficaram de fora. Marque para lançar mesmo assim (viram itens separados).`}
        </label>
      ) : null}
      {podeOperar ? (
        <div className={s.acoes}>
          <button type="button" className={`btn amb ${s.levar}`} disabled={ocupado || !enviaveis.length} aria-busy={ocupado} onClick={() => void verPrevia()}>
            <Icone nome={ocupado ? "loader" : "package"} tam={15} className={ocupado ? "spin" : undefined} />
            {enviaveis.length ? `Levar ${enviaveis.length} ${enviaveis.length === 1 ? "material" : "materiais"} para Compras` : "Todos já estão na obra"}
          </button>
          <button type="button" className="btn" disabled={ocupado || !todosDoProjeto.length} aria-busy={ocupado} onClick={() => void verPreviaEstrutura()}>
            <Icone nome="planilha" tam={15} />
            Lançar no orçamento (Estrutura)
          </button>
        </div>
      ) : null}
      {erroEnvio && !previa ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          <span>{erroEnvio}</span>
        </div>
      ) : null}

      {previa ? (
        <Modal
          titulo="Lançar os materiais do projeto na obra?"
          fechar={() => setPrevia(null)}
          focoInicial={lancar}
          largo
          rodape={
            <>
              <button type="button" className="btn" onClick={() => setPrevia(null)}>
                Voltar
              </button>
              <button ref={lancar} type="button" className="btn amb" disabled={ocupado || previa.erros.length > 0} aria-busy={ocupado} onClick={() => void aplicar()}>
                Lançar {previa.linhas.length} {previa.linhas.length === 1 ? "material" : "materiais"} na obra
              </button>
            </>
          }
        >
          <p className="mut">
            {previa.novos} {previa.novos === 1 ? "novo" : "novos"}
            {previa.atualizados ? `, ${previa.atualizados} já ${previa.atualizados === 1 ? "existia e terá" : "existiam e terão"} a quantidade trocada pela do projeto` : ""} — valor
            total de referência <b>{fmtReais(previa.total)}</b>. O que falta comprar sai da conta de Compras (precisa −
            estoque − a caminho). Dá para desfazer pelo Histórico.
          </p>
          {previa.erros.map((e) => (
            <div key={`${e.linha}-${e.mensagem}`} className="aviso-erro" role="alert">
              <Icone nome="alert" tam={15} />
              <span>{e.mensagem}</span>
            </div>
          ))}
          {erroEnvio ? (
            <div className="aviso-erro" role="alert">
              <Icone nome="alert" tam={15} />
              <span>{erroEnvio}</span>
            </div>
          ) : null}
          <div className="tbl-rola">
            <table className="tbl-orc">
              <thead>
                <tr>
                  <th scope="col">Insumo</th>
                  <th scope="col" className="num">
                    Precisa
                  </th>
                  <th scope="col" className="num">
                    Unitário
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col">Curva</th>
                </tr>
              </thead>
              <tbody>
                {previa.linhas.map((l) => (
                  <tr key={l.nome}>
                    <td>
                      {l.nome}
                      {l.situacao === "atualiza" ? <span className="pill">atualiza</span> : null}
                      {l.situacao === "atualiza" && l.precisa_antes != null ? <small className="mut"> · antes {fmtQtdUn(l.precisa_antes, l.unidade)}</small> : null}
                    </td>
                    <td className="num">{fmtQtdUn(l.quantidade, l.unidade)}</td>
                    <td className="num">{l.valor_unitario ? fmtReais(l.valor_unitario) : "—"}</td>
                    <td className="num">{l.total ? fmtReais(l.total) : "—"}</td>
                    <td>
                      <span className={`curva c${l.curva}`}>{l.curva}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Valor total de referência</th>
                  <td className="num" aria-hidden="true" />
                  <td className="num" aria-hidden="true" />
                  <td className="num">
                    <b>{fmtReais(previa.total)}</b>
                  </td>
                  <td aria-hidden="true" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      ) : null}

      {previaEstr ? (
        <Modal
          titulo="Lançar a estrutura do projeto no orçamento?"
          fechar={() => setPreviaEstr(null)}
          focoInicial={lancarEstr}
          largo
          rodape={
            <>
              <button type="button" className="btn" onClick={() => setPreviaEstr(null)}>
                Voltar
              </button>
              <button ref={lancarEstr} type="button" className="btn amb" disabled={ocupado || previaEstr.erros.length > 0} aria-busy={ocupado} onClick={() => void aplicarEstrutura()}>
                Lançar como {previaEstr.tipo === "contrato" ? "contrato" : "aditivo"}
              </button>
            </>
          }
        >
          <p className="mut">
            Os materiais do projeto viram uma <b>versão do orçamento</b> (etapa «Estrutura») —{" "}
            {previaEstr.tipo === "contrato" ? (
              <>o <b>contrato</b> da obra, por ser a primeira versão.</>
            ) : (
              <>um <b>aditivo</b>, porque a obra já tem contrato.</>
            )}{" "}
            {previaEstr.n_itens} {previaEstr.n_itens === 1 ? "item" : "itens"}, valor total <b>{fmtReais(previaEstr.total)}</b>. É diferente de «Levar para Compras»: aqui o projeto entra como orçamento, não como lista de materiais. Dá para desfazer pelo Histórico.
          </p>
          {previaEstr.erros.map((e) => (
            <div key={`${e.linha}-${e.mensagem}`} className="aviso-erro" role="alert">
              <Icone nome="alert" tam={15} />
              <span>{e.mensagem}</span>
            </div>
          ))}
          {erroEnvio ? (
            <div className="aviso-erro" role="alert">
              <Icone nome="alert" tam={15} />
              <span>{erroEnvio}</span>
            </div>
          ) : null}
          <div className="tbl-rola">
            <table className="tbl-orc">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">
                    Quantidade
                  </th>
                  <th scope="col" className="num">
                    Unitário
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {previaEstr.itens.map((l) => (
                  <tr key={`${l.numero}-${l.descricao}`} className={l.tipo === "etapa" ? s.linhaEtapa : undefined}>
                    <td>
                      {l.tipo === "etapa" ? <b>{l.descricao}</b> : l.descricao}
                    </td>
                    <td className="num">{l.tipo === "item" ? fmtQtdUn(l.quantidade, l.unidade) : ""}</td>
                    <td className="num">{l.tipo === "item" && l.valor_unitario ? fmtReais(l.valor_unitario) : ""}</td>
                    <td className="num">{l.tipo === "item" && l.total ? fmtReais(l.total) : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Valor total</th>
                  <td className="num" aria-hidden="true" />
                  <td className="num" aria-hidden="true" />
                  <td className="num">
                    <b>{fmtReais(previaEstr.total)}</b>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
