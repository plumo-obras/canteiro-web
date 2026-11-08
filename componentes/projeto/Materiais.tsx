"use client";
/**
 * Aba Materiais do Projeto 3D: o que o projeto estrutural pede para sair do papel (aço por bitola, concreto, forma,
 * enchimento), cada material com o insumo do SINAPI que é o mesmo produto e o preço de referência na UF da obra.
 * "Levar para Compras" vira a lista de materiais da obra pela mesma prévia da planilha: o que falta comprar é a conta
 * da API (precisa − saldo − a caminho), não desta tela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/cliente";
import type { MaterialDoProjeto, Obra, PreviaOrcamento } from "@/lib/contrato";
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

const unidade = (u: string) => ({ m3: "m³", m2: "m²" })[u] ?? u;

export function Materiais({ obra, ids }: { obra: Obra; ids: string[] }) {
  const { podeOperar, mudou, avisarFeito } = useCasca();
  const [dados, setDados] = useState<MateriaisProjeto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PreviaOrcamento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const lancar = useRef<HTMLButtonElement>(null);
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

  const enviaveis = useMemo(() => (dados ? paraAObra(dados.itens) : []), [dados]);

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
      {podeOperar && enviaveis.length ? (
        <button type="button" className={`btn amb ${s.levar}`} disabled={ocupado} aria-busy={ocupado} onClick={() => void verPrevia()}>
          <Icone nome={ocupado ? "loader" : "package"} tam={15} className={ocupado ? "spin" : undefined} />
          Levar {enviaveis.length} {enviaveis.length === 1 ? "material" : "materiais"} para Compras
        </button>
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
            {previa.atualizados ? `, ${previa.atualizados} já ${previa.atualizados === 1 ? "existia e terá" : "existiam e terão"} a quantidade trocada pela do projeto` : ""}. O que
            falta comprar sai da conta de Compras (precisa − estoque − a caminho). Dá para desfazer pelo Histórico.
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
            </table>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
