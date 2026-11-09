"use client";
/**
 * Revisão do comprovante: a foto de um lado, os campos do outro. Cada campo mostra o que a IA leu (lido, confira ou
 * em branco) e a resposta própria da pessoa com o mesmo peso das opções. Só a confirmação cria o gasto; até lá o
 * comprovante segue "a revisar" e não conta em nada.
 */
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { CampoRevisao, ComprovanteDetalhe, EstadoCampo, EtapaNaArvore, Obra, Pedido } from "@/lib/contrato";
import { api, arquivoComprovante, lerComprovante } from "@/lib/cliente";
import { fmtReais } from "@/lib/formato";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { corpoConfirmar, escolhasIniciais, hojeNaObra, nomeComCodigo, pendencias, type Escolha, type Escolhas } from "./escolhas";
import { NovaEtapa } from "./NovaEtapa";
import s from "./gastos.module.css";

const PAGOS = ["aprovado", "enviado", "em_transito", "recebido", "parcial", "conferido"] as const;

const CAMPO_DA_PROPRIA = {
  valor: "valor",
  data: "data",
  favorecido: "favorecido",
  descricao: "descricao",
  etapa: "etapa",
  topico: "etapa",
} as const satisfies Record<keyof Escolhas["propria"], keyof Escolhas>;

const SELO: Record<EstadoCampo, { texto: string; classe: string; icone?: "check" | "alert" }> = {
  lido: { texto: "Lido", classe: "ok", icone: "check" },
  conferir: { texto: "Confira", classe: "warn", icone: "alert" },
  vazio: { texto: "Em branco", classe: "" },
};

const TIPO_DOC: Record<string, string> = {
  nota_fiscal: "Nota fiscal",
  comprovante_pix: "Pix",
  comprovante_transferencia: "Transferência",
  boleto: "Boleto",
  recibo: "Recibo",
  anotacao_a_mao: "Anotação à mão",
  outro: "Outro documento",
};

export function Revisao({ comprovanteId, obra, fechar }: { comprovanteId: string; obra: Obra; fechar: () => void }) {
  const { podeOperar, mudou, avisar, avisarFeito } = useCasca();
  const [c, setC] = useState<ComprovanteDetalhe | null>(null);
  const [arvore, setArvore] = useState<EtapaNaArvore[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [esc, setEsc] = useState<Escolhas | null>(null);
  const [ocupado, setOcupado] = useState<"confirmar" | "ler" | "descartar" | null>(null);
  const [erroApi, setErroApi] = useState<string | null>(null);
  const [descartando, setDescartando] = useState(false);
  const [confirmarLer, setConfirmarLer] = useState(false);
  const idMotivo = useId();
  const [motivo, setMotivo] = useState("");
  const hoje = hojeNaObra();

  const carregar = async () => {
    const [d, a, ps] = await Promise.all([
      api.comprovante(comprovanteId),
      api.arvore(obra.id),
      api.listarPedidos(obra.id, { status: [...PAGOS], limite: 200 }).catch(() => [] as Pedido[]),
    ]);
    setC(d);
    setArvore(a);
    setPedidos(ps);
    setEsc(escolhasIniciais(d.revisao));
  };

  useEffect(() => {
    carregar().catch((e) => setErro(mensagemDe(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uma vez por comprovante aberto
  }, [comprovanteId]);

  const falta = c && esc ? pendencias(c.revisao, esc, hoje) : [];
  const corpo = c && esc ? corpoConfirmar(c.revisao, esc, hoje) : null;
  const revisavel = !!c && c.status === "a_revisar";

  const mudar = (patch: Partial<Escolhas>) => setEsc((e) => (e ? { ...e, ...patch } : e));
  // digitar (ou escolher na lista) a resposta própria já a marca: ninguém digita e esquece de marcar
  const proprio = (k: keyof Escolhas["propria"], v: string) =>
    setEsc((e) => {
      if (!e) return e;
      const campo = CAMPO_DA_PROPRIA[k];
      return { ...e, propria: { ...e.propria, [k]: v }, ...(v ? { [campo]: "propria" as const } : {}) };
    });

  const confirmar = async () => {
    if (!corpo) return;
    setOcupado("confirmar");
    setErroApi(null);
    try {
      const r = await api.confirmarComprovante(comprovanteId, corpo);
      mudou();
      avisarFeito(`Gasto de ${fmtReais(r.gasto.valor)} lançado.`, r.registro_id);
      fechar();
    } catch (e) {
      setErroApi(mensagemDe(e));
      setOcupado(null);
    }
  };

  // ler de novo troca as opções: o que a pessoa já escolheu ou digitou se perderia sem aviso
  const mexeu = !!c && !!esc && JSON.stringify(esc) !== JSON.stringify(escolhasIniciais(c.revisao));
  const pedirLerDeNovo = () => (mexeu ? setConfirmarLer(true) : lerDeNovo());

  const lerDeNovo = async () => {
    setConfirmarLer(false);
    setOcupado("ler");
    setErroApi(null);
    try {
      const r = await lerComprovante(comprovanteId);
      if (!r.ok && r.mensagem) avisar(r.mensagem, true);
      await carregar();
      mudou();
    } catch (e) {
      setErroApi(mensagemDe(e));
    } finally {
      setOcupado(null);
    }
  };

  const descartar = async () => {
    setOcupado("descartar");
    setErroApi(null);
    try {
      const r = await api.descartarComprovante(comprovanteId, motivo);
      mudou();
      avisarFeito("Comprovante descartado. O arquivo continua guardado.", r.registro_id);
      fechar();
    } catch (e) {
      setErroApi(mensagemDe(e));
      setOcupado(null);
    }
  };

  const rodape = !c ? (
    <button type="button" className="btn" onClick={fechar}>
      Fechar
    </button>
  ) : !revisavel || !podeOperar ? (
    <>
      {revisavel ? <span className="mut sm">Só quem opera a obra confirma o gasto.</span> : null}
      <button type="button" className="btn" onClick={fechar}>
        Fechar
      </button>
    </>
  ) : descartando ? (
    <>
      <button type="button" className="btn" onClick={() => setDescartando(false)}>
        Voltar
      </button>
      <button type="button" className="btn" disabled={!!ocupado} aria-busy={ocupado === "descartar"} onClick={descartar}>
        {ocupado === "descartar" ? <Icone nome="loader" className="spin" tam={14} /> : null}
        Descartar comprovante
      </button>
    </>
  ) : confirmarLer ? (
    <>
      <span className="mut sm">Ler de novo troca o que você já escolheu ou digitou.</span>
      <button type="button" className="btn" onClick={() => setConfirmarLer(false)}>
        Cancelar
      </button>
      <button type="button" className="btn" onClick={lerDeNovo}>
        <Icone nome="spark" tam={14} />
        Ler mesmo assim
      </button>
    </>
  ) : (
    <>
      <button type="button" className="btn" disabled={!!ocupado} onClick={() => setDescartando(true)}>
        Não é gasto
      </button>
      <button type="button" className="btn" disabled={!!ocupado} aria-busy={ocupado === "ler"} onClick={pedirLerDeNovo}>
        {ocupado === "ler" ? <Icone nome="loader" className="spin" tam={14} /> : <Icone nome="spark" tam={14} />}
        {ocupado === "ler" ? "Lendo…" : "Ler de novo"}
      </button>
      <button type="button" className="btn amb" disabled={!corpo || !!ocupado} aria-busy={ocupado === "confirmar"} onClick={confirmar}>
        {ocupado === "confirmar" ? <Icone nome="loader" className="spin" tam={14} /> : <Icone nome="check" tam={14} />}
        Confirmar gasto
      </button>
    </>
  );

  return (
    <Modal titulo="Revisar comprovante" fechar={fechar} largo classe={s.modalRev} rodape={rodape}>
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : !c || !esc ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Abrindo o comprovante…
        </div>
      ) : (
        <div className={s.rev}>
          <Arquivo id={c.id} tipo={c.tipo_conteudo} />
          <div className={s.revCampos}>
            <Cabecalho c={c} />
            {!revisavel ? (
              <div className={`${s.aviso} ${s.avisoInfo}`}>
                {c.status === "confirmado" ? "Este comprovante já virou gasto." : `Descartado${c.motivo_descarte ? `: ${c.motivo_descarte}` : "."}`}
              </div>
            ) : null}
            {c.revisao.avisos.length ? (
              <ul className={s.aviso} role="list" aria-label="Atenção">
                {c.revisao.avisos.map((a) => (
                  <li key={a}>
                    <Icone nome="alert" tam={14} />
                    {a}
                  </li>
                ))}
              </ul>
            ) : null}
            <fieldset disabled={!revisavel || !podeOperar || !!ocupado} className={s.campos}>
              <CampoOpcoes
                rotulo="Valor pago"
                campo={c.revisao.valor}
                escolha={esc.valor}
                escolher={(x) => mudar({ valor: x })}
                propria={
                  <input
                    className="f"
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    aria-label="Valor pago (outro)"
                    value={esc.propria.valor}
                    onChange={(e) => proprio("valor", e.target.value)}
                  />
                }
              />
              <CampoOpcoes
                rotulo="Data do pagamento"
                campo={c.revisao.data_pagamento}
                escolha={esc.data}
                escolher={(x) => mudar({ data: x })}
                propria={
                  <input
                    className="f"
                    type="date"
                    max={hoje}
                    aria-label="Data do pagamento (outra)"
                    value={esc.propria.data}
                    onChange={(e) => proprio("data", e.target.value)}
                  />
                }
              />
              <CampoOpcoes
                rotulo="Quem recebeu"
                campo={c.revisao.favorecido}
                escolha={esc.favorecido}
                escolher={(x) => mudar({ favorecido: x })}
                selo={(o) => (o.fornecedor_id ? <span className="pill info">fornecedor cadastrado</span> : null)}
                propria={
                  <input
                    className="f"
                    maxLength={120}
                    placeholder="Loja, empresa ou pessoa"
                    aria-label="Quem recebeu (outro)"
                    value={esc.propria.favorecido}
                    onChange={(e) => proprio("favorecido", e.target.value)}
                  />
                }
              />
              <CampoOpcoes
                rotulo="O que foi pago"
                campo={c.revisao.descricao}
                escolha={esc.descricao}
                escolher={(x) => mudar({ descricao: x })}
                propria={
                  <input
                    className="f"
                    maxLength={200}
                    placeholder="Ex.: cimento e areia, mão de obra do pedreiro"
                    aria-label="O que foi pago (outro)"
                    value={esc.propria.descricao}
                    onChange={(e) => proprio("descricao", e.target.value)}
                  />
                }
              />
              <CampoEtapa
                c={c}
                obraId={obra.id}
                arvore={arvore}
                esc={esc}
                mudar={mudar}
                proprio={proprio}
                criada={(e) => {
                  setArvore((a) => [...a, e]);
                  proprio("etapa", e.chave);
                }}
              />
              <CampoPedido pedidos={pedidos} esc={esc} mudar={mudar} />
            </fieldset>
            {revisavel && podeOperar && falta.length ? (
              <p className={s.falta} role="status">
                Para confirmar, falta: {falta.join(", ")}.
              </p>
            ) : null}
            {descartando ? (
              <div className="campo">
                <label className="l" htmlFor={idMotivo}>
                  Por que não é gasto da obra? (opcional)
                </label>
                <input
                  id={idMotivo}
                  className="f"
                  maxLength={200}
                  placeholder="Ex.: foto repetida, gasto pessoal"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
            ) : null}
            {erroApi ? (
              <div className="aviso-erro form-erro" role="alert">
                {erroApi}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Cabecalho({ c }: { c: ComprovanteDetalhe }) {
  const tipo = c.revisao.tipo_documento ? TIPO_DOC[c.revisao.tipo_documento] : null;
  return (
    <div className={s.revTopo}>
      {tipo ? <span className="pill info">{tipo}</span> : null}
      <span className="mut sm">
        Enviado por {c.quem || "alguém"}
        {c.legenda ? <> · “{c.legenda}”</> : null}
      </span>
      {c.revisao.observacoes ? <p className={s.obs}>{c.revisao.observacoes}</p> : null}
    </div>
  );
}

/** Um campo: o selo do estado, as opções da IA e a resposta própria, todas com o mesmo peso. */
function CampoOpcoes(p: {
  rotulo: string;
  campo: CampoRevisao;
  escolha: Escolha;
  escolher: (e: Escolha) => void;
  propria: ReactNode;
  selo?: (o: CampoRevisao["opcoes"][number]) => ReactNode;
}) {
  const nome = useId();
  return (
    <Grupo rotulo={p.rotulo} estado={p.campo.estado}>
      {p.campo.opcoes.map((o, i) => (
        <label key={i} className={`${s.opc}${p.escolha === i ? ` ${s.on}` : ""}`}>
          <input type="radio" name={nome} checked={p.escolha === i} onChange={() => p.escolher(i)} />
          <span className={s.opcTexto}>
            <span className={s.opcValor}>
              {o.rotulo} {p.selo?.(o)}
            </span>
            {o.motivo ? <span className={s.opcMotivo}>{o.motivo}</span> : null}
          </span>
        </label>
      ))}
      <Propria nome={nome} escolhida={p.escolha === "propria"} escolher={() => p.escolher("propria")} sozinha={!p.campo.opcoes.length}>
        {p.propria}
      </Propria>
    </Grupo>
  );
}

/**
 * A resposta própria: um cartão igual aos das opções, com o campo dentro. Clicar no cartão (ou digitar no campo, ver
 * `proprio`) a escolhe. Só passar pelo campo com Tab não troca nada: navegar pelo teclado não desmarca a opção da IA.
 */
function Propria(p: { nome: string; escolhida: boolean; escolher: () => void; sozinha: boolean; children: ReactNode }) {
  return (
    <div className={`${s.opc} ${s.propria}${p.escolhida ? ` ${s.on}` : ""}`} onClick={p.escolher}>
      {p.sozinha ? null : <input type="radio" name={p.nome} checked={p.escolhida} onChange={p.escolher} aria-label="Outra resposta" />}
      <span className={s.opcTexto}>
        {p.sozinha ? null : <span className={s.opcValor}>Outro</span>}
        {p.children}
      </span>
    </div>
  );
}

function Grupo({ rotulo, estado, children }: { rotulo: string; estado: EstadoCampo; children: ReactNode }) {
  const selo = SELO[estado];
  return (
    <div className={s.grupo} role="radiogroup" aria-label={rotulo} data-estado={estado}>
      <div className={s.grupoTopo}>
        <span className={s.grupoRotulo}>{rotulo}</span>
        <span className={`pill ${selo.classe}`}>
          {selo.icone ? <Icone nome={selo.icone} tam={12} /> : null}
          {selo.texto}
        </span>
      </div>
      <div className={s.opcs}>{children}</div>
    </div>
  );
}

function CampoEtapa(p: {
  c: ComprovanteDetalhe;
  obraId: string;
  arvore: EtapaNaArvore[];
  esc: Escolhas;
  mudar: (x: Partial<Escolhas>) => void;
  proprio: (k: keyof Escolhas["propria"], v: string) => void;
  criada: (e: EtapaNaArvore) => void;
}) {
  const nome = useId();
  const cl = p.c.revisao.classificacao;
  const no = p.arvore.find((e) => e.chave === p.esc.propria.etapa);
  return (
    <Grupo rotulo="Etapa da obra" estado={cl.estado}>
      {cl.opcoes.map((o, i) => (
        <label key={i} className={`${s.opc}${p.esc.etapa === i ? ` ${s.on}` : ""}`}>
          <input type="radio" name={nome} checked={p.esc.etapa === i} onChange={() => p.mudar({ etapa: i })} />
          <span className={s.opcTexto}>
            <span className={s.opcValor}>{o.rotulo}</span>
            {o.motivo ? <span className={s.opcMotivo}>{o.motivo}</span> : null}
          </span>
        </label>
      ))}
      <Propria nome={nome} escolhida={p.esc.etapa === "propria"} escolher={() => p.mudar({ etapa: "propria" })} sozinha={!cl.opcoes.length}>
        <span className={s.duasCols}>
          <select
            className="f"
            aria-label="Etapa (outra)"
            value={p.esc.propria.etapa}
            onChange={(e) => {
              p.proprio("etapa", e.target.value);
              p.proprio("topico", "");
            }}
          >
            <option value="">Escolha a etapa…</option>
            {p.arvore.map((e) => (
              <option key={e.chave} value={e.chave}>
                {nomeComCodigo(e)}
              </option>
            ))}
          </select>
          <select
            className="f"
            aria-label="Tópico (opcional)"
            value={p.esc.propria.topico}
            disabled={!no?.topicos.length}
            onChange={(e) => p.proprio("topico", e.target.value)}
          >
            <option value="">{no?.topicos.length ? "Sem tópico" : "Etapa sem tópicos"}</option>
            {no?.topicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </span>
        {no?.inclui ? <span className={s.opcMotivo}>Entra aqui: {no.inclui}</span> : null}
        <NovaEtapa obraId={p.obraId} criada={p.criada} />
      </Propria>
      <label className={`${s.opc}${p.esc.etapa === "depois" ? ` ${s.on}` : ""}`}>
        <input type="radio" name={nome} checked={p.esc.etapa === "depois"} onChange={() => p.mudar({ etapa: "depois" })} />
        <span className={s.opcTexto}>
          <span className={s.opcValor}>Ver depois</span>
          <span className={s.opcMotivo}>O gasto entra sem etapa e você define depois, em Lançados.</span>
        </span>
      </label>
    </Grupo>
  );
}

/** Opcional e sem IA: quando o gasto paga um pedido, ele marca o pedido como pago e não soma de novo na etapa. */
function CampoPedido({ pedidos, esc, mudar }: { pedidos: Pedido[]; esc: Escolhas; mudar: (x: Partial<Escolhas>) => void }) {
  const id = useId();
  const ordenados = useMemo(() => [...pedidos].sort((a, b) => b.criado_em.localeCompare(a.criado_em)), [pedidos]);
  if (!pedidos.length) return null;
  return (
    <div className="campo">
      <label className="l" htmlFor={id}>
        É o pagamento de um pedido? (opcional)
      </label>
      <select id={id} className="f" value={esc.pedido} onChange={(e) => mudar({ pedido: e.target.value })}>
        <option value="">Não, é um gasto avulso</option>
        {ordenados.map((p) => (
          <option key={p.id} value={p.id}>
            {p.numero} · {p.fornecedor} · {fmtReais(p.valor)}
            {p.pago ? ` (pago ${fmtReais(p.pago)})` : ""}
          </option>
        ))}
      </select>
      {esc.pedido ? (
        <div className="campo-dica">O custo do pedido já conta pela entrega: este pagamento marca o pedido como pago e não soma de novo na etapa.</div>
      ) : null}
    </div>
  );
}

/** A foto (ou o PDF) ao lado dos campos. Vem pelo repasse com o token, num endereço que só vale nesta aba. */
function Arquivo({ id, tipo }: { id: string; tipo: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    let criado: string | null = null;
    arquivoComprovante(id)
      .then((b) => {
        if (!vivo) return;
        criado = URL.createObjectURL(b);
        setUrl(criado);
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
      if (criado) URL.revokeObjectURL(criado);
    };
  }, [id]);
  return (
    <div className={s.arquivo}>
      {erro ? (
        <span className="mut sm">Não consegui abrir o arquivo.</span>
      ) : !url ? (
        <Icone nome="loader" className="spin" tam={18} />
      ) : tipo === "application/pdf" ? (
        <iframe src={url} title="Comprovante em PDF" className={s.pdf} />
      ) : (
        <img src={url} alt="Foto do comprovante" className={s.foto} />
      )}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className={`btn sm ${s.abrir}`}>
          Abrir em tamanho real
        </a>
      ) : null}
    </div>
  );
}
