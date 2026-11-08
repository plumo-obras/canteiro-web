"use client";
/**
 * Aba Tributos: a estimativa do INSS da obra (a aferição que a Receita faz no fim, pelo CNO/SERO) e do IBS/CBS, para a
 * pessoa ver durante a obra quanto vai pagar e o que reduz o valor (dar nota à mão de obra, classificar os gastos).
 * A conta inteira vem da API, linha a linha; a tela só formata. Só existe com a API de verdade (SO_COM_API).
 */
import { useState } from "react";
import type { GastoAClassificar, IBSCBSObra, INSSObra, NaturezaFiscal, Obra, TributosObra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais } from "@/lib/formato";
import { CabecalhoPagina, type Numero } from "./CabecalhoPagina";
import { useCasca } from "./contexto";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { fmtDia } from "./gastos/escolhas";
import { ClassificarFiscal } from "./tributos/ClassificarFiscal";
import { ModalDadosFiscais } from "./tributos/ModalDadosFiscais";
import { fmtCno, rotuloNatureza } from "./tributos/rotulos";
import s from "./tributos/tributos.module.css";

const SITUACAO_INSS: Record<INSSObra["situacao"], { texto: string; tom: string }> = {
  calculado: { texto: "estimado", tom: "info" },
  isenta: { texto: "isenta", tom: "ok" },
  sem_dados: { texto: "faltam dados", tom: "warn" },
};
const SITUACAO_IBS: Record<IBSCBSObra["situacao"], { texto: string; tom: string }> = {
  calculado: { texto: "estimado", tom: "info" },
  nao_incide: { texto: "não incide", tom: "ok" },
  sem_dados: { texto: "faltam dados", tom: "warn" },
};

/** O mapa de abatimentos dos parâmetros da API, só com números (o resto do objeto é informativo). */
function abatimentoDe(t: TributosObra): Partial<Record<NaturezaFiscal, number>> {
  const a = t.parametros.inss["abatimento"];
  if (!a || typeof a !== "object") return {};
  return Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === "number")) as Partial<Record<NaturezaFiscal, number>>;
}

export function Tributos({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const [dados, setDados] = useState(false);
  const [classificando, setClassificando] = useState<GastoAClassificar | null>(null);
  const { dado: t, erro, carregando } = useCarregar(() => api.tributos(obra.id), [obra.id, versao]);

  const numeros: Numero[] = [];
  let principal: Numero | undefined;
  if (t) {
    if (t.inss.situacao === "calculado") principal = { rotulo: "INSS da obra, se aferida hoje", valor: fmtReais(t.inss.inss) };
    else principal = { rotulo: "INSS da obra", valor: SITUACAO_INSS[t.inss.situacao].texto, tom: t.inss.situacao === "isenta" ? "ok" : "atencao" };
    if (t.ibs_cbs.situacao === "calculado") numeros.push({ rotulo: "IBS/CBS a pagar", valor: fmtReais(t.ibs_cbs.a_pagar) });
    if (t.inss.situacao === "calculado") numeros.push({ rotulo: "Mão de obra comprovada", valor: fmtReais(t.inss.comprovado) });
    if (t.inss.fator_ajuste === "nao_atingido" && t.inss.falta_fator_ajuste)
      numeros.push({ rotulo: "Falta declarar para zerar", valor: fmtReais(t.inss.falta_fator_ajuste), tom: "atencao" });
    if (t.a_classificar) numeros.push({ rotulo: "A classificar", valor: `${t.a_classificar}`, sub: fmtReais(t.valor_a_classificar), tom: "atencao" });
  }

  // Sem dono ou finalidade a estimativa fica pela metade: o botão vira o convite a cadastrar, em destaque como o
  // "Nova obra" do início. O VAU não entra aqui: sem ele à mão, vale a tabela da Receita. O viewer só consulta.
  const incompleto = !obra.proprietario || !obra.finalidade;
  const acao = podeOperar ? (
    <button type="button" className="btn amb" onClick={() => setDados(true)}>
      <Icone nome={incompleto ? "plus" : "planilha"} tam={15} />
      {incompleto ? "Cadastrar dados fiscais" : "Editar dados fiscais"}
    </button>
  ) : (
    <button type="button" className="btn" onClick={() => setDados(true)}>
      <Icone nome="planilha" tam={15} />
      Dados fiscais
    </button>
  );

  return (
    <div className="page">
      <CabecalhoPagina
        titulo="Tributos"
        selo="estimativa"
        sub={t ? (t.cno ? `CNO ${fmtCno(t.cno)}` : "Obra sem CNO informado") : undefined}
        acao={acao}
        principal={principal}
        numeros={numeros}
      />
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !t ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando tributos…
        </div>
      ) : t ? (
        <>
          <p className={s.aviso} role="note">
            <Icone nome="info" tam={15} />
            <span>{t.aviso}</span>
          </p>
          <div className={s.cards}>
            <CardINSS inss={t.inss} vau={t} preencher={() => setDados(true)} />
            <CardIBS ibs={t.ibs_cbs} preencher={() => setDados(true)} />
          </div>
          <ListaGastos
            titulo="Mão de obra sem comprovação"
            vazio={null}
            explica="Peça a nota com o CNO e o endereço da obra a quem recebeu: com ela, o pagamento passa a reduzir o INSS."
            gastos={t.sem_nota}
            podeOperar={podeOperar}
            classificar={setClassificando}
          />
          <ListaGastos
            titulo="Gastos a classificar"
            vazio="Todos os gastos estão classificados."
            explica={t.a_classificar > t.pendentes.length ? `Os ${t.pendentes.length} maiores de ${t.a_classificar}.` : "Sem classificação, o gasto não reduz o INSS."}
            gastos={t.pendentes}
            podeOperar={podeOperar}
            classificar={setClassificando}
          />
        </>
      ) : null}
      {dados ? <ModalDadosFiscais obra={obra} fechar={() => setDados(false)} leitura={!podeOperar} /> : null}
      {classificando && t ? <ClassificarFiscal gasto={classificando} abatimento={abatimentoDe(t)} fechar={() => setClassificando(null)} /> : null}
    </div>
  );
}

function Linhas({ linhas, rotulo }: { linhas: string[]; rotulo: string }) {
  return linhas.length ? (
    <ol className={s.linhas} aria-label={rotulo}>
      {linhas.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ol>
  ) : null;
}

function Motivos({ motivos, preencher, falta }: { motivos: string[]; preencher: () => void; falta: boolean }) {
  return (
    <>
      <ul className={s.motivos}>
        {motivos.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      {falta ? (
        <button type="button" className="btn sm amb" onClick={preencher}>
          Preencher dados fiscais
        </button>
      ) : null}
    </>
  );
}

/** "VAU R$ 2.725,32/m² de 11/2026, da tabela da Receita": de onde veio o valor do m² que a conta usou. */
function origemDoVau(t: Pick<TributosObra, "vau_referencia" | "vau_usado" | "vau_fonte">): string {
  if (!t.vau_usado) return "";
  const mes = t.vau_referencia ? ` de ${t.vau_referencia.slice(5, 7)}/${t.vau_referencia.slice(0, 4)}` : "";
  return ` · VAU ${fmtReais(t.vau_usado)}/m²${mes}${t.vau_fonte === "tabela_sero" ? ", da tabela da Receita" : ", informado"}`;
}

function CardINSS({ inss, vau, preencher }: { inss: INSSObra; vau: Pick<TributosObra, "vau_referencia" | "vau_usado" | "vau_fonte">; preencher: () => void }) {
  const sit = SITUACAO_INSS[inss.situacao];
  return (
    <section className={`card ${s.card}`} aria-labelledby="t-inss">
      <div className={s.cardTopo}>
        <h2 id="t-inss" className="sectit">
          INSS da obra
        </h2>
        <span className={`pill ${sit.tom}`}>{sit.texto}</span>
      </div>
      <p className="mut sm">Aferição da Receita (CNO/SERO){origemDoVau(vau)}</p>
      {inss.situacao === "calculado" ? (
        <>
          <p className={s.valor}>{fmtReais(inss.inss)}</p>
          <FatorAjuste inss={inss} />
          {inss.economia_com_notas > 0 ? (
            <p className={s.economia} role="status">
              <Icone nome="spark" tam={15} />
              <span>
                Com nota (e o CNO da obra nela) da mão de obra sem comprovação ({fmtReais(inss.mao_de_obra_sem_nf + (inss.notas_sem_cno ?? 0))}),
                o INSS cairia <strong>{fmtReais(inss.economia_com_notas)}</strong>.
              </span>
            </p>
          ) : null}
          {inss.avisos?.length ? (
            <ul className={s.motivos} aria-label="Avisos do INSS">
              {inss.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          <Linhas linhas={inss.linhas} rotulo="Conta do INSS" />
        </>
      ) : (
        <Motivos motivos={inss.motivos} preencher={preencher} falta={inss.situacao === "sem_dados"} />
      )}
    </section>
  );
}

/** O fator de ajuste (art. 33): o caminho para a obra de pessoa física não pagar nada na aferição. */
function FatorAjuste({ inss }: { inss: INSSObra }) {
  const minimo = inss.fator_ajuste_minimo ? `${inss.fator_ajuste_minimo / 100}%` : "";
  if (inss.fator_ajuste === "aplicado")
    return (
      <p className={s.economia} role="status">
        <Icone nome="check" tam={15} />
        <span>
          <strong>Fator de ajuste aplicado:</strong> a remuneração declarada passa de {minimo} da mão de obra presumida e a DCTFWeb está em dia. Sem ele,
          seriam {fmtReais(inss.inss_sem_fator_ajuste ?? 0)}.
        </span>
      </p>
    );
  if (inss.fator_ajuste === "atingido")
    return (
      <p className={s.economia} role="status">
        <Icone nome="spark" tam={15} />
        <span>
          <strong>Fator de ajuste ao alcance:</strong> a remuneração declarada já passa de {minimo}. Com a DCTFWeb entregue em todos os meses da obra, o
          INSS vai a <strong>R$ 0,00</strong>. Confirme nos dados fiscais.
        </span>
      </p>
    );
  if (inss.fator_ajuste === "nao_atingido" && inss.falta_fator_ajuste)
    return (
      <p className={s.economia} role="status">
        <Icone nome="spark" tam={15} />
        <span>
          Declarando mais <strong>{fmtReais(inss.falta_fator_ajuste)}</strong> de remuneração no eSocial (folha, autônomo, MEI ou notas com o CNO) e com a
          DCTFWeb em dia, a obra chega a {minimo} e o INSS da aferição vai a zero (fator de ajuste).
        </span>
      </p>
    );
  return null;
}

function CardIBS({ ibs, preencher }: { ibs: IBSCBSObra; preencher: () => void }) {
  const sit = SITUACAO_IBS[ibs.situacao];
  return (
    <section className={`card ${s.card}`} aria-labelledby="t-ibs">
      <div className={s.cardTopo}>
        <h2 id="t-ibs" className="sectit">
          IBS/CBS
        </h2>
        <span className={`pill ${sit.tom}`}>{sit.texto}</span>
      </div>
      <p className="mut sm">Reforma tributária, regime de bens imóveis</p>
      {ibs.situacao === "calculado" ? (
        <>
          <p className={s.valor}>{fmtReais(ibs.a_pagar)}</p>
          <Linhas linhas={ibs.linhas} rotulo="Conta do IBS/CBS" />
        </>
      ) : (
        <Motivos motivos={ibs.motivos} preencher={preencher} falta={ibs.situacao === "sem_dados"} />
      )}
      {ibs.creditos > 0 && ibs.situacao !== "calculado" ? <p className="mut sm">Créditos das notas de compra: {fmtReais(ibs.creditos)}</p> : null}
      {ibs.transicao ? <p className={`mut sm ${s.transicao}`}>{ibs.transicao}</p> : null}
    </section>
  );
}

function ListaGastos(p: {
  titulo: string;
  explica: string;
  /** null = a seção some quando não há gasto. */
  vazio: string | null;
  gastos: GastoAClassificar[];
  podeOperar: boolean;
  classificar: (g: GastoAClassificar) => void;
}) {
  if (!p.gastos.length && p.vazio === null) return null;
  return (
    <section className={s.secao} aria-label={p.titulo}>
      <h2 className="sectit">{p.titulo}</h2>
      <p className="mut sm">{p.gastos.length ? p.explica : p.vazio}</p>
      {p.gastos.length ? (
        <ul className={`card lista ${s.lista}`} role="list">
          {p.gastos.map((g) => (
            <li key={g.id} className={s.linha}>
              <div className={s.linhaTopo}>
                <span>
                  <strong>{g.descricao}</strong> <span className="mut">· {g.favorecido}</span>
                </span>
                <span className={s.num}>{fmtReais(g.valor)}</span>
              </div>
              <div className={`mut sm ${s.linhaMeta}`}>
                <span>
                  {fmtDia(g.data_pagamento)} · {rotuloNatureza(g.natureza_fiscal)}
                </span>
                {p.podeOperar ? (
                  <button type="button" className="btn sm" onClick={() => p.classificar(g)} aria-label={`Classificar ${g.descricao}, ${fmtReais(g.valor)}`}>
                    Classificar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
