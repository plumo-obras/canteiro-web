"use client";
/**
 * Importar uma planilha em quatro passos: dizer o que ela é, escolher o arquivo, dizer qual coluna é qual (a API sugere
 * pelo cabeçalho) e conferir a prévia antes de gravar. A pergunta do 1º passo existe porque as duas planilhas que a
 * construtora tem parecem iguais e significam coisas diferentes:
 * - o **orçamento da obra** (serviços por etapa) vira uma versão — o contrato ou um aditivo — e cada linha é um item,
 *   sem juntar repetidos, para o total fechar no centavo com a planilha (`POST …/orcamento/versoes`);
 * - a **lista de materiais** (insumos para comprar e estocar) junta os repetidos e alimenta o almoxarifado
 *   (`POST …/orcamento/importar`).
 */
import { useRef, useState } from "react";
import type { EtapaObra, ItemPrevia, LeituraPlanilha, Mapeamento, Obra, PreviaOrcamento, PreviaVersao, TipoVersao } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtd, fmtQtdUn, fmtReais } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { Campo, ErroApi } from "../formularios/Campos";
import { ComparaVerba } from "./verba";
import { useCarregar } from "../useCarregar";

type Tipo = "eap" | "materiais";
type Previa = { k: "eap"; p: PreviaVersao } | { k: "materiais"; p: PreviaOrcamento };
type Passo =
  | { k: "tipo" }
  | { k: "arquivo" }
  | { k: "colunas"; leitura: LeituraPlanilha }
  | { k: "previa"; leitura: LeituraPlanilha; previa: Previa; chave: string };

type CampoMapa = keyof Omit<Mapeamento, "planilha" | "linha_cabecalho">;
const CAMPOS: { k: CampoMapa; rotulo: string; obrigatorio?: boolean; dica?: string; so?: Tipo }[] = [
  { k: "item", rotulo: "Item (nº)", so: "eap", dica: "O número do item, ex.: 3.2.1. Dá a etapa de cada linha." },
  { k: "codigo", rotulo: "Código", so: "eap" },
  { k: "fonte", rotulo: "Fonte", so: "eap", dica: "SINAPI, SEINFRA, próprio…" },
  { k: "nome", rotulo: "Descrição do item", obrigatorio: true },
  { k: "unidade", rotulo: "Unidade", obrigatorio: true },
  { k: "quantidade", rotulo: "Quantidade", obrigatorio: true },
  { k: "valor_unitario", rotulo: "Preço unitário", dica: "Sem ele, o preço sai do total ÷ quantidade." },
  { k: "valor_total", rotulo: "Preço total" },
  { k: "saldo", rotulo: "Já tem em estoque", so: "materiais", dica: "Só se a planilha trouxer o que já está na obra." },
  { k: "curva", rotulo: "Curva ABC", so: "materiais", dica: "Sem ela, a curva é calculada pelo valor de cada item." },
];

const MAX_LINHAS_PREVIA = 60;
const comSinal = (c: number) => (c < 0 ? `−${fmtReais(-c)}` : `+${fmtReais(c)}`);
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

export function ImportarOrcamento({ obra, fechar, feito }: { obra: Obra; fechar: () => void; feito?: () => void }) {
  const { mudou, avisar, avisarFeito } = useCasca();
  const [passo, setPasso] = useState<Passo>({ k: "tipo" });
  const [tipo, setTipo] = useState<Tipo | null>(null);
  // Com contrato vigente, nada vem marcado: o testador passou pelo seletor sem ver e substituiu o contrato por um
  // aditivo. Sem contrato, só pode ser o contrato (aditivo sem contrato a API recusa).
  const [versaoEscolhida, setVersao] = useState<TipoVersao | null>(null);
  const orc = useCarregar(() => api.orcamento(obra.id).catch(() => null), [obra.id]);
  const vigente = orc.dado?.versoes.find((v) => v.tipo === "contrato" && v.ativa) ?? null;
  const versao: TipoVersao | null = versaoEscolhida ?? (orc.dado && !vigente ? "contrato" : null);
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [errosTipo, setErrosTipo] = useState<{ descricao?: string | null; data?: string | null }>({});
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mapa, setMapa] = useState<Mapeamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const campos = CAMPOS.filter((c) => !c.so || c.so === tipo);

  const rodar = async (f: () => Promise<void>) => {
    setErro(null);
    setOcupado(true);
    try {
      await f();
    } catch (x) {
      setErro(mensagemDe(x));
    } finally {
      setOcupado(false);
    }
  };

  const validarAditivo = () => {
    const e = {
      descricao: !descricao.trim() ? "Diga do que é o aditivo, ex.: ampliação do refeitório." : descricao.trim().length > 200 ? "Até 200 letras." : null,
      data: !data ? "Informe a data do aditivo." : null,
    };
    setErrosTipo(e);
    return !e.descricao && !e.data;
  };

  const seguirDoTipo = () => {
    if (!tipo || (tipo === "eap" && !versao)) return;
    if (tipo === "eap" && versao === "aditivo") {
      const e = {
        descricao: !descricao.trim() ? "Diga do que é o aditivo, ex.: ampliação do refeitório." : descricao.trim().length > 200 ? "Até 200 letras." : null,
        data: !data ? "Informe a data do aditivo." : null,
      };
      setErrosTipo(e);
      if (e.descricao || e.data) return;
    }
    setErrosTipo({});
    setPasso({ k: "arquivo" });
  };

  const ler = (arq: File, planilha?: string) =>
    rodar(async () => {
      const leitura = await api.lerPlanilha(obra.id, arq, planilha);
      setEscolhas({}); // outra planilha, outras ordens: as escolhas de etapa da anterior não valem
      setArquivo(arq);
      setMapa(leitura.sugestao);
      setPasso({ k: "colunas", leitura });
    });

  // O que não vale para o tipo escolhido vai nulo: a API só olha item/código/fonte no orçamento e saldo/curva na lista.
  const mapaDoTipo = (): Mapeamento => {
    const m = { ...mapa! };
    for (const c of CAMPOS) if (c.so && c.so !== tipo) m[c.k] = null;
    return m;
  };

  // No aditivo, a etapa de destino que a pessoa trocou item a item (ordem → etapa). Vai na prévia e no importar.
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const etapasContrato = useCarregar(() => api.etapas(obra.id).catch(() => []), [obra.id]);

  const importar = (aplicar: boolean, chave: string, tv: TipoVersao = versao ?? "contrato", esc: Record<string, string> = escolhas): Promise<Previa> =>
    tipo === "eap"
      ? api
          .versaoOrcamento(obra.id, arquivo!, {
            mapeamento: mapaDoTipo(),
            tipo: tv,
            descricao: tv === "aditivo" && descricao.trim() ? descricao.trim() : undefined,
            data: tv === "aditivo" && data ? data : undefined,
            aplicar,
            chave_idempotencia: aplicar ? chave : undefined,
            ...(tv === "aditivo" && Object.keys(esc).length ? { etapas_itens: esc } : {}),
          })
          .then((p) => ({ k: "eap", p }))
      : api.importarOrcamento(obra.id, arquivo!, mapaDoTipo(), aplicar).then((p) => ({ k: "materiais", p }));

  const faltando = mapa ? campos.filter((c) => c.obrigatorio && mapa[c.k] === null) : [];
  const verPrevia = (leitura: LeituraPlanilha) =>
    rodar(async () => {
      // Uma chave por prévia: clicar duas vezes em importar (ou a rede repetir) não grava duas versões.
      const chave = uuid7();
      setPasso({ k: "previa", leitura, previa: await importar(false, chave), chave });
    });

  /** "Não, é um aditivo": troca o tipo e refaz a prévia com a mesma planilha e as mesmas colunas. */
  const virarAditivo = (passoAtual: Extract<Passo, { k: "previa" }>) =>
    rodar(async () => {
      setVersao("aditivo");
      const chave = uuid7();
      setPasso({ ...passoAtual, previa: await importar(false, chave, "aditivo"), chave });
    });

  /** Trocar a etapa de um item do aditivo refaz a prévia (os totais por etapa mudam) com uma chave nova. */
  const mudarEtapaItem = (passoAtual: Extract<Passo, { k: "previa" }>, ordem: number, etapa: string) =>
    rodar(async () => {
      const novas = { ...escolhas, [String(ordem)]: etapa };
      setEscolhas(novas);
      const chave = uuid7();
      setPasso({ ...passoAtual, previa: await importar(false, chave, "aditivo", novas), chave });
    });

  const aplicar = (passoAtual: Extract<Passo, { k: "previa" }>) =>
    rodar(async () => {
      if (passoAtual.previa.k === "eap" && passoAtual.previa.p.tipo === "aditivo" && !validarAditivo()) return;
      const r = await importar(true, passoAtual.chave);
      if (!r.p.aplicado) {
        // a planilha mudou entre a prévia e o aplicar (ou alguém gravou no meio): mostra o que a API viu
        setPasso({ ...passoAtual, previa: r });
        return;
      }
      mudou();
      fechar();
      if (r.k === "eap") {
        const p = r.p;
        const texto =
          p.tipo === "contrato"
            ? `Contrato importado: ${plural(p.n_itens, "item", "itens")} em ${plural(p.n_etapas, "etapa", "etapas")}, ${fmtReais(p.total)}.`
            : `Aditivo importado: ${comSinal(p.total)} em ${plural(p.n_itens, "item", "itens")}.`;
        avisarFeito(texto, p.registro_id);
      } else avisar(`Lista de materiais importada: ${plural(r.p.linhas.length, "insumo", "insumos")}, ${fmtReais(r.p.total)}.`);
      feito?.();
    });

  const nLinhas = (p: Previa) => (p.k === "eap" ? p.p.n_itens : p.p.linhas.length);
  const rotuloImportar = (p: Previa) =>
    p.p.erros.length
      ? "Corrija os erros para importar"
      : p.k === "eap"
        ? p.p.tipo === "contrato"
          ? p.p.substitui
            ? "Substituir o contrato"
            : `Importar o contrato (${plural(p.p.n_itens, "item", "itens")})`
          : `Importar o aditivo (${comSinal(p.p.total)})`
        : `Importar ${plural(p.p.linhas.length, "insumo", "insumos")}`;

  const rodape =
    passo.k === "tipo" ? (
      <>
        <button type="button" className="btn" onClick={fechar}>
          Voltar
        </button>
        <button type="button" className="btn amb" disabled={!tipo || (tipo === "eap" && !versao)} onClick={seguirDoTipo}>
          Continuar
        </button>
      </>
    ) : passo.k === "arquivo" ? (
      <button type="button" className="btn" onClick={() => setPasso({ k: "tipo" })}>
        Voltar
      </button>
    ) : passo.k === "colunas" ? (
      <>
        <button type="button" className="btn" onClick={() => setPasso({ k: "arquivo" })}>
          Outro arquivo
        </button>
        <button type="button" className="btn amb" disabled={ocupado || faltando.length > 0} aria-busy={ocupado} onClick={() => verPrevia(passo.leitura)}>
          Ver a prévia
        </button>
      </>
    ) : (
      <>
        <button type="button" className="btn" onClick={() => setPasso({ k: "colunas", leitura: passo.leitura })}>
          Corrigir as colunas
        </button>
        <button
          type="button"
          className="btn amb"
          disabled={ocupado || passo.previa.p.erros.length > 0 || !nLinhas(passo.previa)}
          aria-busy={ocupado}
          onClick={() => aplicar(passo)}
        >
          {rotuloImportar(passo.previa)}
        </button>
      </>
    );

  const ordem = ["tipo", "arquivo", "colunas", "previa"];
  return (
    <Modal titulo="Importar planilha" fechar={fechar} rodape={rodape} largo={passo.k === "colunas" || passo.k === "previa"}>
      <ol className="passos-mini" aria-label="Passos">
        {(["Tipo", "Arquivo", "Colunas", "Prévia"] as const).map((t, i) => {
          const atual = ordem.indexOf(passo.k);
          return (
            <li key={t} className={i === atual ? "on" : i < atual ? "feito" : ""} aria-current={i === atual ? "step" : undefined}>
              {t}
            </li>
          );
        })}
      </ol>

      {passo.k === "tipo" ? (
        <>
          <p className="mut" style={{ margin: "0 0 4px" }}>
            O que é esta planilha?
          </p>
          <div className="portas" role="radiogroup" aria-label="O que é esta planilha?" style={{ marginTop: 6 }}>
            <button type="button" role="radio" aria-checked={tipo === "eap"} className={`porta${tipo === "eap" ? "" : " porta-sec"}`} onClick={() => setTipo("eap")}>
              <Icone nome="planilha" tam={22} />
              <span>
                <b>Orçamento da obra</b>
                <small>Serviços por etapa, como foi contratado: cada linha vira um item, e o total fecha com a planilha.</small>
              </span>
              {tipo === "eap" ? <Icone nome="checkCircle" tam={18} /> : null}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={tipo === "materiais"}
              className={`porta${tipo === "materiais" ? "" : " porta-sec"}`}
              onClick={() => setTipo("materiais")}
            >
              <Icone nome="package" tam={22} />
              <span>
                <b>Lista de materiais</b>
                <small>Insumos para comprar e estocar: o almoxarifado cobra a falta destas quantidades. Repetidos são juntados.</small>
              </span>
              {tipo === "materiais" ? <Icone nome="checkCircle" tam={18} /> : null}
            </button>
          </div>
          {tipo === "eap" ? (
            <>
              {vigente ? (
                <fieldset className="pergunta-versao">
                  <legend>Esta planilha é um aditivo ou o contrato novo?</legend>
                  <div className="portas" role="radiogroup" aria-label="Aditivo ou contrato novo">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={versao === "aditivo"}
                      className={`porta${versao === "aditivo" ? "" : " porta-sec"}`}
                      onClick={() => setVersao("aditivo")}
                    >
                      <Icone nome="plus" tam={20} />
                      <span>
                        <b>Um aditivo</b>
                        <small>Soma ao contrato vigente ({fmtReais(vigente.total)}), que fica intacto. Quantidade negativa é supressão.</small>
                      </span>
                      {versao === "aditivo" ? <Icone nome="checkCircle" tam={18} /> : null}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={versao === "contrato"}
                      className={`porta${versao === "contrato" ? "" : " porta-sec"}`}
                      onClick={() => setVersao("contrato")}
                    >
                      <Icone nome="planilha" tam={20} />
                      <span>
                        <b>O contrato novo</b>
                        <small>
                          Substitui por inteiro o contrato vigente ({fmtReais(vigente.total)}, {plural(vigente.itens, "item", "itens")}). Dá para desfazer.
                        </small>
                      </span>
                      {versao === "contrato" ? <Icone nome="checkCircle" tam={18} /> : null}
                    </button>
                  </div>
                </fieldset>
              ) : orc.dado ? (
                <p className="seg-dica mut sm">A obra ainda não tem contrato importado: esta planilha vira o contrato. Os aditivos vêm depois dele.</p>
              ) : null}
              {versao === "aditivo" ? (
                <div className="campos2">
                  <Campo rotulo="Do que é o aditivo" erro={errosTipo.descricao}>
                    {(a) => (
                      <input
                        {...a}
                        className="f"
                        maxLength={200}
                        autoComplete="off"
                        placeholder="Ex.: ampliação do refeitório"
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                      />
                    )}
                  </Campo>
                  <Campo rotulo="Data do aditivo" erro={errosTipo.data}>
                    {(a) => <input {...a} type="date" className="f" value={data} onChange={(e) => setData(e.target.value)} />}
                  </Campo>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : passo.k === "arquivo" ? (
        <div
          className="solta"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) ler(f);
          }}
        >
          <Icone nome="planilha" tam={26} />
          <p>
            <b>Arraste a planilha aqui</b> ou escolha o arquivo.
          </p>
          <p className="mut sm">Excel (.xlsx) ou CSV, até 5 MB. Do jeito que está: com título, etapas e subtotais.</p>
          <button type="button" className="btn amb" disabled={ocupado} aria-busy={ocupado} onClick={() => entrada.current?.click()}>
            {ocupado ? "Lendo a planilha…" : "Escolher arquivo"}
          </button>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-label="Arquivo da planilha"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) ler(f);
            }}
          />
        </div>
      ) : passo.k === "colunas" && mapa ? (
        <Colunas
          leitura={passo.leitura}
          campos={campos}
          mapa={mapa}
          setMapa={setMapa}
          trocarAba={(p) => ler(arquivo!, p)}
          ocupado={ocupado}
          faltando={faltando.map((c) => c.rotulo)}
        />
      ) : passo.k === "previa" ? (
        passo.previa.k === "eap" ? (
          <>
            <PreviaEap
              previa={passo.previa.p}
              obra={obra}
              virarAditivo={() => virarAditivo(passo)}
              ocupado={ocupado}
              etapasContrato={etapasContrato.dado ?? []}
              mudarEtapa={(ordem, etapa) => mudarEtapaItem(passo, ordem, etapa)}
            />
            {passo.previa.p.tipo === "aditivo" ? (
              <div className="campos2">
                <Campo rotulo="Do que é o aditivo" erro={errosTipo.descricao}>
                  {(a) => (
                    <input
                      {...a}
                      className="f"
                      maxLength={200}
                      autoComplete="off"
                      placeholder="Ex.: serviços fora da planilha"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                    />
                  )}
                </Campo>
                <Campo rotulo="Data do aditivo" erro={errosTipo.data}>
                  {(a) => <input {...a} type="date" className="f" value={data} onChange={(e) => setData(e.target.value)} />}
                </Campo>
              </div>
            ) : null}
          </>
        ) : (
          <PreviaMateriais previa={passo.previa.p} />
        )
      ) : null}
      <ErroApi texto={erro} />
    </Modal>
  );
}

function Colunas(props: {
  leitura: LeituraPlanilha;
  campos: typeof CAMPOS;
  mapa: Mapeamento;
  setMapa: (m: Mapeamento) => void;
  trocarAba: (p: string) => void;
  ocupado: boolean;
  faltando: string[];
}) {
  const { leitura, mapa, setMapa, campos } = props;
  const usadas = new Map(campos.filter((c) => mapa[c.k] !== null).map((c) => [mapa[c.k]!, c.rotulo]));
  return (
    <>
      <p className="mut" style={{ margin: "4px 0 0" }}>
        Achei o cabeçalho na linha {leitura.linha_cabecalho}
        {leitura.planilhas.length > 1 ? ` da aba «${leitura.planilha}»` : ""}. Confira qual coluna é qual: o que veio marcado é palpite pelo título.
      </p>
      {leitura.planilhas.length > 1 ? (
        <div className="campo">
          <label className="l" htmlFor="aba-orc">
            Aba da planilha
          </label>
          <select id="aba-orc" className="f" value={leitura.planilha} disabled={props.ocupado} onChange={(e) => props.trocarAba(e.target.value)}>
            {leitura.planilhas.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="mapa">
        {campos.map((c) => (
          <div className="campo" key={c.k}>
            <label className="l" htmlFor={`mapa-${c.k}`}>
              {c.rotulo}
              {c.obrigatorio ? "" : " (opcional)"}
            </label>
            <select
              id={`mapa-${c.k}`}
              className="f"
              value={mapa[c.k] ?? ""}
              aria-invalid={c.obrigatorio && mapa[c.k] === null}
              onChange={(e) => setMapa({ ...mapa, [c.k]: e.target.value === "" ? null : Number(e.target.value) })}
            >
              <option value="">{c.obrigatorio ? "Escolha a coluna…" : "Não tem"}</option>
              {leitura.colunas.map((col) => (
                <option key={col.indice} value={col.indice}>
                  {col.titulo}
                  {usadas.has(col.indice) && mapa[c.k] !== col.indice ? ` (já é ${usadas.get(col.indice)})` : ""}
                </option>
              ))}
            </select>
            {c.dica ? <div className="campo-dica">{c.dica}</div> : null}
          </div>
        ))}
      </div>
      {props.faltando.length ? (
        <p className="campo-erro" role="status">
          Falta dizer a coluna de: {props.faltando.join(", ")}.
        </p>
      ) : null}
      <h3 className="sectit">Primeiras linhas</h3>
      <div className="tbl-rola">
        <table className="tbl-amostra">
          <thead>
            <tr>
              {leitura.colunas.map((col) => (
                <th key={col.indice} className={usadas.has(col.indice) ? "usada" : ""} scope="col">
                  {usadas.has(col.indice) ? <small>{usadas.get(col.indice)}</small> : null}
                  {col.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leitura.amostra.map((l, i) => (
              <tr key={i}>
                {leitura.colunas.map((col) => (
                  <td key={col.indice} className={usadas.has(col.indice) ? "usada" : ""}>
                    {l[col.indice] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ErrosDaPrevia({ erros }: { erros: { linha: number; mensagem: string }[] }) {
  if (!erros.length) return null;
  return (
    <div className="prev-erros" role="alert">
      <b>{erros.length === 1 ? "1 linha precisa de correção" : `${erros.length} linhas precisam de correção`} antes de importar. Nada foi gravado.</b>
      <ul>
        {erros.slice(0, 12).map((e, i) => (
          <li key={i}>
            Linha {e.linha}: {e.mensagem}
          </li>
        ))}
        {erros.length > 12 ? <li>e mais {erros.length - 12}.</li> : null}
      </ul>
      <p className="sm">Corrija na planilha e escolha o arquivo de novo, ou ajuste as colunas.</p>
    </div>
  );
}

function Ignoradas({ ignoradas }: { ignoradas: { linha: number; texto: string; motivo: string }[] }) {
  if (!ignoradas.length) return null;
  return (
    <details className="prev-ign">
      <summary>
        {ignoradas.length === 1 ? "1 linha ficou de fora" : `${ignoradas.length} linhas ficaram de fora`} (títulos, subtotais, linhas vazias): ver quais
      </summary>
      <ul>
        {ignoradas.map((g) => (
          <li key={g.linha}>
            Linha {g.linha}: {g.texto || "(vazia)"} <span className="mut">· {g.motivo}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

const ORIGEM_ETAPA: Record<string, (i: ItemPrevia) => string> = {
  codigo: () => "pelo código, igual ao contrato",
  planilha: (i) => `da planilha do aditivo${i.etapa_planilha ? ` (etapa ${i.etapa_planilha})` : ""}`,
  escolhida: (i) => `escolhida por você${i.etapa_planilha ? ` (na planilha: ${i.etapa_planilha})` : ""}`,
};

function PreviaEap(props: {
  previa: PreviaVersao;
  obra: Obra;
  virarAditivo: () => void;
  ocupado: boolean;
  etapasContrato: EtapaObra[];
  mudarEtapa: (ordem: number, etapa: string) => void;
}) {
  const { previa, obra, virarAditivo, ocupado } = props;
  // Um contrato novo de verdade raramente custa menos da metade do vigente; uma planilha de aditivo, quase sempre.
  const fracao = previa.substitui?.total ? previa.total / previa.substitui.total : 1;
  const aditivo = previa.tipo === "aditivo";
  const porEtapa = new Map<string, ItemPrevia[]>();
  for (const i of previa.itens) {
    if (i.tipo === "etapa" && i.nivel <= 1) continue;
    porEtapa.set(i.etapa, [...(porEtapa.get(i.etapa) ?? []), i]);
  }
  return (
    <>
      <ErrosDaPrevia erros={previa.erros} />
      {previa.substitui ? (
        <div className="prev-subst" role="alert">
          <Icone nome="alert" tam={16} />
          <span>
            <b>
              Esta planilha substitui o contrato atual ({fmtReais(previa.substitui.total)}, {plural(previa.substitui.itens, "item", "itens")}).
            </b>{" "}
            O contrato atual sai de vigência; dá para voltar a ele com Desfazer.
            {fracao < 0.5 ? (
              <>
                {" "}
                <b>
                  Parece um aditivo: o total é {(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do contrato.
                </b>
              </>
            ) : null}
          </span>
          <button type="button" className="btn sm" disabled={ocupado} onClick={virarAditivo}>
            Não, é um aditivo
          </button>
        </div>
      ) : null}
      <div className="prev-resumo">
        <div>
          <span className="prev-n">{aditivo ? comSinal(previa.total) : fmtReais(previa.total)}</span>
          <span>
            {aditivo ? "no aditivo" : "total do contrato"}
            {aditivo ? null : <ComparaVerba total={previa.total} verba={obra.verba} />}
          </span>
        </div>
        <div>
          <span className="prev-n">{previa.n_etapas.toLocaleString("pt-BR")}</span>
          <span>{previa.n_etapas === 1 ? "etapa" : "etapas"}</span>
        </div>
        <div>
          <span className="prev-n">{previa.n_itens.toLocaleString("pt-BR")}</span>
          <span>{previa.n_itens === 1 ? "item" : "itens"}</span>
        </div>
      </div>
      {previa.avisos.length ? (
        <details className="prev-ign prev-avisos" open={previa.avisos.length <= 3}>
          <summary>{previa.avisos.length === 1 ? "1 aviso (grava mesmo assim)" : `${previa.avisos.length} avisos (grava mesmo assim)`}</summary>
          <ul>
            {previa.avisos.map((a, i) => (
              <li key={i}>
                Linha {a.linha}: {a.mensagem}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <Ignoradas ignoradas={previa.ignoradas} />
      {aditivo ? <ItensDoAditivo previa={previa} etapasContrato={props.etapasContrato} mudarEtapa={props.mudarEtapa} ocupado={ocupado} /> : null}
      {aditivo && previa.etapas.length ? <h3 className="sectit">Por etapa</h3> : null}
      {previa.etapas.length ? (
        <div className="tbl-rola prev-etapas">
          {previa.etapas.map((e) => {
            const its = porEtapa.get(e.etapa) ?? [];
            return (
              <details key={e.etapa}>
                <summary>
                  <span className="eap-num">{e.etapa}</span>
                  <span className="eap-desc">{e.descricao}</span>
                  <span className="mut sm">{plural(its.filter((i) => i.tipo === "item").length, "item", "itens")}</span>
                  <span className="num">
                    <b>{aditivo ? comSinal(e.total) : fmtReais(e.total)}</b>
                  </span>
                </summary>
                <table className="tbl-eap">
                  <tbody>
                    {its.slice(0, MAX_LINHAS_PREVIA).map((i) =>
                      i.tipo === "etapa" ? (
                        <tr key={i.ordem} className="eap-sub">
                          <td className="eap-n">{i.numero}</td>
                          <td colSpan={4}>{i.descricao}</td>
                        </tr>
                      ) : (
                        <tr key={i.ordem}>
                          <td className="eap-n">{i.numero}</td>
                          <td className="eap-d">
                            {i.descricao}
                            {i.codigo || i.fonte ? <span className="eap-cod">{[i.codigo, i.fonte].filter(Boolean).join(" · ")}</span> : null}
                          </td>
                          <td className="num">{fmtQtd(i.quantidade)} {i.unidade}</td>
                          <td className="num">{fmtReais(i.valor_unitario)}</td>
                          <td className="num">{fmtReais(i.total)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
                {its.length > MAX_LINHAS_PREVIA ? <p className="mut sm prev-mais">e mais {its.length - MAX_LINHAS_PREVIA} linhas nesta etapa.</p> : null}
              </details>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

/**
 * Itens do aditivo com a etapa de destino. A API já põe cada item na etapa do contrato que tem o mesmo fonte|código;
 * aqui a pessoa confere e troca o que precisar (vai em `etapas_itens`). As opções são as etapas do contrato mais as
 * que só existem no próprio aditivo (os títulos de etapa da planilha dele).
 */
function ItensDoAditivo(props: { previa: PreviaVersao; etapasContrato: EtapaObra[]; mudarEtapa: (ordem: number, etapa: string) => void; ocupado: boolean }) {
  const { previa, etapasContrato } = props;
  const doContrato = new Set(etapasContrato.map((e) => e.etapa));
  const proprias = previa.itens.filter((i) => i.tipo === "etapa" && i.nivel <= 1 && !doContrato.has(i.etapa)).map((i) => ({ etapa: i.etapa, descricao: i.descricao }));
  const opcoes = [...etapasContrato, ...proprias];
  const itens = previa.itens.filter((i) => i.tipo === "item");
  return (
    <>
      <h3 className="sectit">Itens e etapa de destino</h3>
      <div className="tbl-rola">
        <table className="tbl-eap tbl-adt-itens">
          <thead>
            <tr>
              <th scope="col">Nº</th>
              <th scope="col">Item</th>
              <th scope="col" className="num">
                Total
              </th>
              <th scope="col">Etapa de destino</th>
            </tr>
          </thead>
          <tbody>
            {itens.slice(0, 200).map((i) => (
              <tr key={i.ordem}>
                <td className="eap-n">{i.numero}</td>
                <td className="eap-d">
                  {i.descricao}
                  {i.codigo || i.fonte ? <span className="eap-cod">{[i.codigo, i.fonte].filter(Boolean).join(" · ")}</span> : null}
                </td>
                <td className="num">{comSinal(i.total)}</td>
                <td>
                  <select
                    className="f"
                    aria-label={`Etapa de destino de ${i.descricao}`}
                    value={i.etapa}
                    disabled={props.ocupado}
                    onChange={(e) => props.mudarEtapa(i.ordem, e.target.value)}
                  >
                    {opcoes.some((o) => o.etapa === i.etapa) ? null : <option value={i.etapa}>{i.etapa}</option>}
                    {opcoes.map((o) => (
                      <option key={o.etapa} value={o.etapa}>
                        {o.etapa} · {o.descricao}
                        {doContrato.has(o.etapa) ? "" : " (do aditivo)"}
                      </option>
                    ))}
                  </select>
                  {i.etapa_origem ? <small className={`adt-origem o-${i.etapa_origem}`}>{ORIGEM_ETAPA[i.etapa_origem]?.(i)}</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {itens.length > 200 ? <p className="mut sm prev-mais">e mais {itens.length - 200} itens.</p> : null}
      </div>
    </>
  );
}

function PreviaMateriais({ previa }: { previa: PreviaOrcamento }) {
  const { linhas, ignoradas } = previa;
  return (
    <>
      <ErrosDaPrevia erros={previa.erros} />
      <div className="prev-resumo">
        <div>
          <span className="prev-n">{linhas.length}</span>
          <span>
            {linhas.length === 1 ? "insumo" : "insumos"}
            {previa.atualizados ? (
              <small>
                {previa.novos} novos, {previa.atualizados} já existiam e serão atualizados
              </small>
            ) : null}
          </span>
        </div>
        <div>
          <span className="prev-n">{fmtReais(previa.total)}</span>
          <span>total da lista</span>
        </div>
      </div>
      {previa.juntadas ? (
        <p className="mut sm">
          {previa.juntadas} {previa.juntadas === 1 ? "linha repetida foi juntada" : "linhas repetidas foram juntadas"} (o mesmo material em etapas diferentes).
        </p>
      ) : null}
      <Ignoradas ignoradas={ignoradas} />
      {linhas.length ? (
        <div className="tbl-rola">
          <table className="tbl-orc">
            <thead>
              <tr>
                <th scope="col">Insumo</th>
                <th scope="col" className="num">
                  Quantidade
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
              {linhas.slice(0, MAX_LINHAS_PREVIA).map((l) => (
                <tr key={l.nome}>
                  <td>
                    {l.nome}
                    {l.situacao === "atualiza" ? <span className="pill">atualiza</span> : null}
                    {l.linhas.length > 1 ? <small className="mut"> · juntou {l.linhas.length} linhas</small> : null}
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
          </table>
          {linhas.length > MAX_LINHAS_PREVIA ? <p className="mut sm">e mais {linhas.length - MAX_LINHAS_PREVIA} insumos.</p> : null}
        </div>
      ) : null}
    </>
  );
}
