"use client";
/**
 * Importar a planilha do orçamento em três passos: escolher o arquivo, dizer qual coluna é qual (a API sugere pelo
 * cabeçalho) e conferir a prévia antes de gravar. A planilha de orçamento de verdade não tem as nossas colunas: tem
 * título, subtotal por etapa e o mesmo material repetido em várias etapas. A API pula os títulos, junta os
 * repetidos e calcula a curva ABC pelo valor; aqui a pessoa vê tudo isso antes de confirmar.
 */
import { useRef, useState } from "react";
import type { LeituraPlanilha, Mapeamento, Obra, PreviaOrcamento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtQtdUn, fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { ErroApi } from "../formularios/Campos";
import { ComparaVerba } from "./verba";

type Passo = { k: "arquivo" } | { k: "colunas"; leitura: LeituraPlanilha } | { k: "previa"; leitura: LeituraPlanilha; previa: PreviaOrcamento };

const CAMPOS: { k: keyof Omit<Mapeamento, "planilha" | "linha_cabecalho">; rotulo: string; obrigatorio?: boolean; dica?: string }[] = [
  { k: "nome", rotulo: "Descrição do item", obrigatorio: true },
  { k: "unidade", rotulo: "Unidade", obrigatorio: true },
  { k: "quantidade", rotulo: "Quantidade", obrigatorio: true },
  { k: "valor_unitario", rotulo: "Preço unitário", dica: "Sem ele, o preço sai do total ÷ quantidade." },
  { k: "valor_total", rotulo: "Preço total" },
  { k: "saldo", rotulo: "Já tem em estoque", dica: "Raro no orçamento: só se a planilha trouxer o que já está na obra." },
  { k: "curva", rotulo: "Curva ABC", dica: "Sem ela, a curva é calculada pelo valor de cada item." },
];

const MAX_LINHAS_PREVIA = 60;

export function ImportarOrcamento({ obra, fechar, feito }: { obra: Obra; fechar: () => void; feito?: () => void }) {
  const { mudou, avisar } = useCasca();
  const [passo, setPasso] = useState<Passo>({ k: "arquivo" });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mapa, setMapa] = useState<Mapeamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

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

  const ler = (arq: File, planilha?: string) =>
    rodar(async () => {
      const leitura = await api.lerPlanilha(obra.id, arq, planilha);
      setArquivo(arq);
      setMapa(leitura.sugestao);
      setPasso({ k: "colunas", leitura });
    });

  const faltando = mapa ? CAMPOS.filter((c) => c.obrigatorio && mapa[c.k] === null) : [];
  const verPrevia = (leitura: LeituraPlanilha) =>
    rodar(async () => {
      const previa = await api.importarOrcamento(obra.id, arquivo!, mapa!, false);
      setPasso({ k: "previa", leitura, previa });
    });

  const aplicar = (previa: PreviaOrcamento) =>
    rodar(async () => {
      const r = await api.importarOrcamento(obra.id, arquivo!, mapa!, true);
      if (!r.aplicado) {
        // a planilha mudou entre a prévia e o aplicar (ou alguém cadastrou um insumo no meio): mostra o que a API viu
        setPasso((p) => (p.k === "previa" ? { ...p, previa: r } : p));
        return;
      }
      mudou();
      fechar();
      avisar(`Orçamento importado: ${previa.linhas.length} ${previa.linhas.length === 1 ? "insumo" : "insumos"}, ${fmtReais(r.total)}.`);
      feito?.();
    });

  const rodape =
    passo.k === "arquivo" ? (
      <button type="button" className="btn" onClick={fechar}>
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
          disabled={ocupado || passo.previa.erros.length > 0 || !passo.previa.linhas.length}
          aria-busy={ocupado}
          onClick={() => aplicar(passo.previa)}
        >
          {passo.previa.erros.length
            ? "Corrija os erros para importar"
            : `Importar ${passo.previa.linhas.length} ${passo.previa.linhas.length === 1 ? "insumo" : "insumos"}`}
        </button>
      </>
    );

  return (
    <Modal titulo="Importar a planilha do orçamento" fechar={fechar} rodape={rodape} largo={passo.k !== "arquivo"}>
      <ol className="passos-mini" aria-label="Passos">
        {(["Arquivo", "Colunas", "Prévia"] as const).map((t, i) => {
          const atual = ["arquivo", "colunas", "previa"].indexOf(passo.k);
          return (
            <li key={t} className={i === atual ? "on" : i < atual ? "feito" : ""} aria-current={i === atual ? "step" : undefined}>
              {t}
            </li>
          );
        })}
      </ol>

      {passo.k === "arquivo" ? (
        <div
          className="solta"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) ler(f);
          }}
        >
          <Icone nome="package" tam={26} />
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
            hidden
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
          mapa={mapa}
          setMapa={setMapa}
          trocarAba={(p) => ler(arquivo!, p)}
          ocupado={ocupado}
          faltando={faltando.map((c) => c.rotulo)}
        />
      ) : passo.k === "previa" ? (
        <Previa previa={passo.previa} obra={obra} />
      ) : null}
      <ErroApi texto={erro} />
    </Modal>
  );
}

function Colunas(props: {
  leitura: LeituraPlanilha;
  mapa: Mapeamento;
  setMapa: (m: Mapeamento) => void;
  trocarAba: (p: string) => void;
  ocupado: boolean;
  faltando: string[];
}) {
  const { leitura, mapa, setMapa } = props;
  const usadas = new Map(CAMPOS.filter((c) => mapa[c.k] !== null).map((c) => [mapa[c.k]!, c.rotulo]));
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
        {CAMPOS.map((c) => (
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

function Previa({ previa, obra }: { previa: PreviaOrcamento; obra: Obra }) {
  const { linhas, erros, ignoradas } = previa;
  return (
    <>
      {erros.length ? (
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
      ) : null}
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
          <span>
            total do orçamento
            <ComparaVerba total={previa.total} verba={obra.verba} />
          </span>
        </div>
      </div>
      {previa.juntadas || ignoradas.length ? (
        <p className="mut sm">
          {previa.juntadas
            ? `${previa.juntadas} ${previa.juntadas === 1 ? "linha repetida foi juntada" : "linhas repetidas foram juntadas"} (o mesmo material em etapas diferentes). `
            : ""}
          {ignoradas.length
            ? `${ignoradas.length} ${ignoradas.length === 1 ? "linha ficou de fora" : "linhas ficaram de fora"}: títulos, subtotais e linhas sem quantidade.`
            : ""}
        </p>
      ) : null}
      {ignoradas.length ? (
        <details className="prev-ign">
          <summary>Ver as linhas que ficaram de fora</summary>
          <ul>
            {ignoradas.map((g) => (
              <li key={g.linha}>
                Linha {g.linha}: {g.texto || "(vazia)"} <span className="mut">· {g.motivo}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
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
