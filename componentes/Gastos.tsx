"use client";
/**
 * Aba Gastos: o dinheiro que saiu da obra. A pessoa envia o comprovante (foto ou PDF), a IA lê e sugere, e uma pessoa
 * confere e confirma; só então vira gasto, na etapa (e no tópico) da obra. Seções: o que espera revisão, o gasto por
 * etapa, os gastos lançados e as etapas e tópicos onde eles entram.
 */
import { useMemo, useState } from "react";
import type { Comprovante, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtDiaHora, fmtReais } from "@/lib/formato";
import { CabecalhoPagina, type Numero } from "./CabecalhoPagina";
import { useCasca } from "./contexto";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { Arvore } from "./gastos/Arvore";
import { EnviarComprovante } from "./gastos/EnviarComprovante";
import { Revisao } from "./gastos/Revisao";
import { fmtDia, rotuloEtapa } from "./gastos/escolhas";
import s from "./gastos/gastos.module.css";

type Secao = "revisar" | "etapas" | "lancados" | "arvore";
const SECOES: { k: Secao; rotulo: string }[] = [
  { k: "revisar", rotulo: "A revisar" },
  { k: "etapas", rotulo: "Por etapa" },
  { k: "lancados", rotulo: "Lançados" },
  { k: "arvore", rotulo: "Etapas e tópicos" },
];

export function Gastos({ obra }: { obra: Obra }) {
  const { versao } = useCasca();
  const [secao, setSecao] = useState<Secao>("revisar");
  const [enviando, setEnviando] = useState(false);
  const [revisando, setRevisando] = useState<string | null>(null);
  const { dado, erro, carregando } = useCarregar(
    () =>
      Promise.all([api.listarComprovantes(obra.id, "a_revisar"), api.resumoGastos(obra.id), api.listarGastos(obra.id, { limite: 200 }), api.arvore(obra.id)]),
    [obra.id, versao],
  );
  const [fila, resumo, gastos, arvore] = dado ?? [[], null, [], []];
  // nomes de etapa e tópico já arquivados: só o resumo ainda os tem
  const nomesResumo = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of resumo?.etapas ?? []) {
      m.set(e.etapa, e.nome);
      for (const t of e.topicos) if (t.topico_id) m.set(t.topico_id, t.nome);
    }
    return m;
  }, [resumo]);

  const numeros: Numero[] = [];
  if (resumo) {
    numeros.push({ rotulo: "Gasto na obra", valor: fmtReais(resumo.total), sub: "confirmado, fora pagamento de pedido" });
    if (resumo.a_revisar) numeros.push({ rotulo: "A revisar", valor: `${resumo.a_revisar}`, tag: "não contam ainda", tom: "atencao" });
    if (resumo.pagamentos_de_pedidos) numeros.push({ rotulo: "Pagamentos de pedidos", valor: fmtReais(resumo.pagamentos_de_pedidos), sub: "já contam pela entrega" });
  }

  const abas = (
    <div className="seg" role="tablist" aria-label="Seções de Gastos">
      {SECOES.map((x) => (
        <button key={x.k} type="button" role="tab" aria-selected={secao === x.k} className={secao === x.k ? "on" : ""} onClick={() => setSecao(x.k)}>
          {x.rotulo}
          {x.k === "revisar" && fila.length ? <small className="seg-n">{fila.length}</small> : null}
        </button>
      ))}
    </div>
  );

  const acao = (
    <button type="button" className="btn amb" onClick={() => setEnviando(true)}>
      <Icone nome="plus" tam={15} />
      Enviar comprovante
    </button>
  );

  return (
    <div className="page">
      <CabecalhoPagina titulo="Gastos" acao={acao} numeros={numeros} barra={abas} />
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando gastos…
        </div>
      ) : dado ? (
        <div role="tabpanel" aria-label={SECOES.find((x) => x.k === secao)!.rotulo}>
          {secao === "revisar" ? (
            <Fila fila={fila} abrir={setRevisando} enviar={() => setEnviando(true)} />
          ) : secao === "etapas" ? (
            !resumo?.etapas.length ? (
              <Vazio texto="Nenhum gasto confirmado ainda. Envie um comprovante e confirme na revisão." />
            ) : (
              <ul className={`card lista ${s.lista}`} role="list">
                {resumo.etapas.map((e) => (
                  <li key={e.etapa} className={s.linha}>
                    <div className={s.linhaTopo}>
                      <strong>{e.nome}</strong>
                      <span className={s.valor}>{fmtReais(e.total)}</span>
                    </div>
                    {e.topicos.length > 1 || e.topicos[0]?.topico_id ? (
                      <ul className={s.sublista} role="list">
                        {e.topicos.map((t) => (
                          <li key={t.topico_id ?? "sem"}>
                            <span className="mut">{t.nome}</span>
                            <span className={s.valor}>{fmtReais(t.total)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : secao === "lancados" ? (
            !gastos.length ? (
              <Vazio texto="Nenhum gasto lançado ainda." />
            ) : (
              <ul className={`card lista ${s.lista}`} role="list">
                {gastos.map((g) => (
                  <li key={g.id} className={s.linha}>
                    <div className={s.linhaTopo}>
                      <span>
                        <strong>{g.descricao}</strong> <span className="mut">· {g.favorecido}</span>
                      </span>
                      <span className={s.valor}>{fmtReais(g.valor)}</span>
                    </div>
                    <div className="mut sm">
                      {fmtDia(g.data_pagamento)} · {rotuloEtapa(arvore, g.etapa, g.topico_id, nomesResumo)}
                      {g.pedido_id ? (
                        <>
                          {" "}
                          · <span className="pill info">pagamento de pedido</span>
                        </>
                      ) : null}
                      {g.comprovante_id ? (
                        <>
                          {" "}
                          ·{" "}
                          <button type="button" className={s.link} onClick={() => setRevisando(g.comprovante_id)}>
                            ver comprovante
                          </button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Arvore obra={obra} arvore={arvore} />
          )}
        </div>
      ) : null}
      {enviando ? (
        <EnviarComprovante
          obra={obra}
          fechar={() => setEnviando(false)}
          revisar={(id) => {
            setEnviando(false);
            setSecao("revisar");
            setRevisando(id);
          }}
        />
      ) : null}
      {revisando ? <Revisao comprovanteId={revisando} obra={obra} fechar={() => setRevisando(null)} /> : null}
    </div>
  );
}

function Fila({ fila, abrir, enviar }: { fila: Comprovante[]; abrir: (id: string) => void; enviar: () => void }) {
  if (!fila.length)
    return (
      <div className="card vazio">
        <Icone nome="recibo" tam={26} />
        <h3>Nada esperando revisão</h3>
        <p>Envie a foto de uma nota, Pix, boleto pago ou recibo. A IA lê e preenche; você confere e confirma.</p>
        <button type="button" className="btn amb" style={{ marginTop: 16 }} onClick={enviar}>
          <Icone nome="plus" tam={15} />
          Enviar comprovante
        </button>
      </div>
    );
  return (
    <ul className={`card lista ${s.lista}`} role="list">
      {fila.map((c) => (
        <li key={c.id} className={s.linha}>
          <div className={s.linhaTopo}>
            <span>
              <Icone nome={c.tipo_conteudo === "application/pdf" ? "planilha" : "recibo"} tam={15} /> <strong>{c.legenda || "Comprovante"}</strong>
            </span>
            <button type="button" className="btn sm pri" onClick={() => abrir(c.id)}>
              Revisar
            </button>
          </div>
          <div className="mut sm">
            {c.quem || "Alguém"} · {fmtDiaHora(c.criado_em)} ·{" "}
            {c.leitura ? (
              <span className="pill ok">lido pela IA</span>
            ) : c.erro_leitura ? (
              <span className="pill warn">sem leitura: preencher à mão</span>
            ) : (
              <span className="pill">ainda não lido</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="card vazio sm">{texto}</div>;
}
