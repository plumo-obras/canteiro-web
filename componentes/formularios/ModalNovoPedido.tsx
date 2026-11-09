"use client";
/**
 * Pedido novo, com várias linhas: o que se compra (ou contrata) de um fornecedor numa ida só. Cada linha tem o insumo,
 * a quantidade, o unitário e a etapa do orçamento para onde o gasto vai (apropriação; obrigatória quando a obra tem
 * orçamento importado). Escolhido o insumo, a quantidade já vem com o que falta comprar segundo a conta da API e o
 * unitário com o preço do orçamento. Item fora do orçamento se cadastra aqui mesmo, digitando o nome.
 */
import { useId, useRef, useState } from "react";
import type { EtapaObra, Fornecedor, ItemInsumo, TipoInsumo } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { criarPedidoComChave, type ChavePedido } from "../suprimentos/chavePedido";
import { fmtQtdUn, fmtReais, lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { Campo, ErroApi, useEnvio } from "./Campos";
import { CampoInsumo, UNIDADES, type EscolhaInsumo } from "./CampoInsumo";

const MAX_LINHAS = 50;

interface Linha {
  chave: string;
  escolha: EscolhaInsumo;
  qtd: string;
  unit: string;
  etapa: string;
  /** Só para insumo novo. */
  unidade: string;
  tipo: TipoInsumo;
}

const vazia = (): Linha => ({ chave: uuid7(), escolha: null, qtd: "", unit: "", etapa: "", unidade: "", tipo: "material" });

/** quantidade (milésimos) × unitário (centavos) → centavos, arredondado como a API. */
export const totalLinha = (q: number | null, v: number | null) => (q && v ? Math.round((q * v) / 1000) : 0);

function linhaDe(itens: ItemInsumo[], id: string): Linha {
  const i = itens.find((x) => x.insumo.id === id);
  return {
    ...vazia(),
    escolha: { tipo: "existente", id },
    qtd: i && i.conta.comprar > 0 ? qtdParaCampo(i.conta.comprar) : "",
    unit: i?.insumo.valor_unitario ? reaisParaCampo(i.insumo.valor_unitario) : "",
  };
}

export function ModalNovoPedido(props: {
  obraId: string;
  itens: ItemInsumo[];
  etapas: EtapaObra[];
  fornecedores: Fornecedor[];
  insumoInicial?: string;
  chave: ChavePedido;
  fechar: () => void;
}) {
  const { obraId, itens, etapas, fornecedores } = props;
  const { avisarFeito, mudou } = useCasca();
  const [linhas, setLinhas] = useState<Linha[]>(() => [props.insumoInicial ? linhaDe(itens, props.insumoInicial) : vazia()]);
  const [fornecedor, setFornecedor] = useState("");
  const [previsao, setPrevisao] = useState("");
  // Data incompleta ou impossível no campo de data chega como "" (o navegador descarta): sem esta marca, a previsão
  // digitada sumia calada e o pedido ia sem ela.
  const [previsaoRuim, setPrevisaoRuim] = useState(false);
  const [observacao, setObservacao] = useState("");
  // O pedido nasce "feito": passar pela cotação é a exceção de quem combina preço antes.
  const [aprovado, setAprovado] = useState(true);
  const primeiro = useRef<HTMLInputElement>(null);
  const listaForn = useId();
  // Insumos novos criados num envio que falhou depois: o reenvio usa o que já existe em vez de dar 409 por nome.
  const criados = useRef(new Map<string, string>());
  const exigeEtapa = etapas.length > 0;
  const forn = fornecedores.find((f) => f.nome.trim().toLowerCase() === fornecedor.trim().toLowerCase());

  const mudar = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const escolher = (i: number, e: EscolhaInsumo) => {
    const ant = linhas[i]!;
    const item = e?.tipo === "existente" ? itens.find((x) => x.insumo.id === e.id) : undefined;
    // Só preenche o que ainda está vazio: trocar de insumo não apaga o que a pessoa digitou.
    mudar(i, {
      escolha: e,
      ...(item && !ant.qtd && item.conta.comprar > 0 ? { qtd: qtdParaCampo(item.conta.comprar) } : {}),
      ...(item && !ant.unit && item.insumo.valor_unitario ? { unit: reaisParaCampo(item.insumo.valor_unitario) } : {}),
    });
  };

  const lidas = linhas.map((l) => ({ q: lerQtd(l.qtd), v: lerReais(l.unit) }));
  const total = lidas.reduce((t, x) => t + totalLinha(x.q, x.v), 0);
  const idDe = (l: Linha) => (l.escolha?.tipo === "existente" ? l.escolha.id : null);
  const repetidos = new Set(linhas.map(idDe).filter((id, i, a) => id && a.indexOf(id) !== i));

  const erroLinha = (l: Linha, i: number): string | null => {
    const { q, v } = lidas[i]!;
    if (!l.escolha) return "Escolha o insumo (ou digite o nome para cadastrar).";
    if (l.escolha.tipo === "novo" && !l.unidade) return "Escolha a unidade do insumo novo.";
    if (repetidos.has(idDe(l))) return "Este insumo já está em outra linha.";
    if (q === null || q === 0) return "Digite a quantidade, ex.: 120 ou 2,5.";
    if (v === null) return "Digite o preço unitário, ex.: 39,90.";
    if (exigeEtapa && !l.etapa) return "Escolha a etapa do orçamento.";
    return null;
  };
  const errosLinhas = linhas.map(erroLinha);

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      fornecedor: fornecedor.trim() ? null : "Diga de quem é a compra.",
      previsao: previsaoRuim ? "Data inválida: escolha no calendário (dd/mm/aaaa) ou deixe em branco." : null,
      linhas: errosLinhas.some(Boolean) ? "Corrija as linhas marcadas." : null,
    }),
    async () => {
      const corpoLinhas = [];
      for (const [i, l] of linhas.entries()) {
        let id = idDe(l);
        if (!id && l.escolha?.tipo === "novo") {
          const nome = l.escolha.nome;
          id = criados.current.get(nome) ?? null;
          if (!id) {
            const ins = await api.criarInsumo(obraId, { nome, unidade: l.unidade, tipo: l.tipo, curva: "C" });
            criados.current.set(nome, ins.id);
            id = ins.id;
          }
        }
        corpoLinhas.push({ insumo_id: id!, quantidade: lidas[i]!.q!, valor_unitario: lidas[i]!.v!, etapa: l.etapa || null });
      }
      const p = await criarPedidoComChave(props.chave, mudou, obraId, {
        fornecedor: forn?.nome ?? fornecedor.trim(),
        fornecedor_id: forn?.id ?? null,
        previsao: previsao || null,
        observacao: observacao.trim(),
        aprovado,
        linhas: corpoLinhas,
      });
      mudou();
      props.fechar();
      avisarFeito(`${p.numero} criado${aprovado ? " já aprovado" : " em cotação"}: ${fmtReais(p.valor)}.`, p.registro_id);
    },
  );
  const mostrarErros = !!erros.linhas;

  return (
    <Modal
      titulo="Novo pedido"
      fechar={props.fechar}
      focoInicial={primeiro}
      largo
      rodape={
        <>
          <span className="ped-total">
            Total <b>{fmtReais(total)}</b>
          </span>
          <button type="button" className="btn" onClick={props.fechar}>
            Voltar
          </button>
          <button type="submit" form="form-pedido" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            {aprovado ? "Criar aprovado" : "Criar em cotação"}
          </button>
        </>
      }
    >
      <form id="form-pedido" onSubmit={enviar} noValidate>
        <div className="campos3">
          <Campo
            rotulo="Fornecedor"
            erro={erros.fornecedor}
            dica={forn ? "Do cadastro de fornecedores." : fornecedor.trim() && fornecedores.length ? "Fora do cadastro: o pedido leva só o nome." : undefined}
          >
            {(a) => (
              <input
                {...a}
                ref={primeiro}
                className="f"
                list={listaForn}
                autoComplete="off"
                placeholder="Escolha ou digite o nome"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
              />
            )}
          </Campo>
          <datalist id={listaForn}>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.nome} />
            ))}
          </datalist>
          <Campo rotulo="Previsão de chegada (opcional)" erro={previsaoRuim ? "Data inválida: escolha no calendário (dd/mm/aaaa) ou deixe em branco." : null}>
            {(a) => (
              <input
                {...a}
                type="date"
                className="f"
                value={previsao}
                onChange={(e) => {
                  setPrevisao(e.target.value);
                  setPrevisaoRuim(e.target.validity.badInput);
                }}
                onBlur={(e) => setPrevisaoRuim(e.target.validity.badInput)}
              />
            )}
          </Campo>
          <Campo rotulo="Observação (opcional)">
            {(a) => <input {...a} className="f" autoComplete="off" maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} />}
          </Campo>
        </div>

        <h3 className="sectit">Itens</h3>
        <ol className="ped-linhas">
          {linhas.map((l, i) => {
            const item = idDe(l) ? itens.find((x) => x.insumo.id === idDe(l)) : undefined;
            const un = item?.insumo.unidade ?? (l.escolha?.tipo === "novo" ? l.unidade : "");
            const t = totalLinha(lidas[i]!.q, lidas[i]!.v);
            const erro = mostrarErros ? errosLinhas[i] : null;
            return (
              <li key={l.chave} className={`ped-linha${etapas.length ? " com-etapa" : ""}${erro ? " com-erro" : ""}`}>
                <div className="ped-l-ins">
                  <Campo
                    rotulo={`Item ${i + 1}`}
                    dica={item ? (item.conta.comprar > 0 ? `A conta diz para comprar ${fmtQtdUn(item.conta.comprar, un)}.` : "A conta diz que está coberto.") : undefined}
                  >
                    {(a) => <CampoInsumo a={a} itens={itens} valor={l.escolha} mudar={(e) => escolher(i, e)} permitirNovo />}
                  </Campo>
                  {l.escolha?.tipo === "novo" ? (
                    <div className="ped-l-novo">
                      <label className="sr-only" htmlFor={`un-${l.chave}`}>
                        Unidade de {l.escolha.nome}
                      </label>
                      <select id={`un-${l.chave}`} className="f" value={l.unidade} onChange={(e) => mudar(i, { unidade: e.target.value })}>
                        <option value="">Unidade…</option>
                        {UNIDADES.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                      <div className="seg seg-pq" role="radiogroup" aria-label={`${l.escolha.nome} é material ou serviço`}>
                        {(["material", "servico"] as const).map((k) => (
                          <button key={k} type="button" role="radio" aria-checked={l.tipo === k} className={l.tipo === k ? "on" : ""} onClick={() => mudar(i, { tipo: k })}>
                            {k === "material" ? "Material" : "Serviço"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <Campo rotulo={`Quant.${un ? ` (${un})` : ""}`}>
                  {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" value={l.qtd} onChange={(e) => mudar(i, { qtd: e.target.value })} />}
                </Campo>
                <Campo rotulo="Unitário (R$)">
                  {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" placeholder="0,00" value={l.unit} onChange={(e) => mudar(i, { unit: e.target.value })} />}
                </Campo>
                {etapas.length ? (
                  <div>
                    <Campo rotulo="Etapa">
                      {(a) => (
                        <select {...a} className="f" value={l.etapa} onChange={(e) => mudar(i, { etapa: e.target.value })}>
                          <option value="">Escolha…</option>
                          {etapas.map((e) => (
                            <option key={e.etapa} value={e.etapa}>
                              {e.etapa} · {e.descricao}
                            </option>
                          ))}
                        </select>
                      )}
                    </Campo>
                    {l.etapa && linhas.length > 1 && linhas.some((x) => x.etapa !== l.etapa) ? (
                      <button type="button" className="link ped-l-todas" onClick={() => setLinhas((ls) => ls.map((x) => ({ ...x, etapa: l.etapa })))}>
                        Aplicar esta etapa a todas as linhas
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div className="ped-l-tot">
                  <span className="l">Total</span>
                  <b>{t ? fmtReais(t) : "—"}</b>
                </div>
                {linhas.length > 1 ? (
                  <button
                    type="button"
                    className="iconbtn ped-l-x"
                    aria-label={`Tirar o item ${i + 1}`}
                    onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  >
                    <Icone nome="x" tam={16} />
                  </button>
                ) : null}
                {erro ? (
                  <div className="campo-erro ped-l-erro" role="alert">
                    {erro}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {linhas.length < MAX_LINHAS ? (
          <button type="button" className="btn sm" onClick={() => setLinhas((ls) => [...ls, vazia()])}>
            <Icone nome="plus" tam={14} />
            Outro item
          </button>
        ) : null}
        {!etapas.length ? <p className="mut sm">A obra ainda não tem orçamento importado: a etapa de cada linha fica para depois.</p> : null}

        <label className="check">
          <input type="checkbox" checked={aprovado} onChange={(e) => setAprovado(e.target.checked)} />
          <span>
            Já está aprovado
            <small>O preço está fechado; o pedido pula a cotação e vai direto para enviar ao fornecedor.</small>
          </span>
        </label>
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
