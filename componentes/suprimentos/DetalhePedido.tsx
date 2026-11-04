"use client";
/**
 * Detalhe do pedido: as linhas com o pedido, o recebido e o que falta; a previsão (editável, com Desfazer); as entregas
 * já registradas; e as ações do status. A entrega é por nota: NF, data e valor, mais quanto chegou de cada linha (já vem
 * preenchido com o que falta, o caso comum). Material dá entrada no almoxarifado; serviço só registra a medição.
 * "Imprimir" gera a folha de pedido limpa (a casca some no @media print).
 */
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EtapaObra, Fornecedor, ItemInsumo, Obra, Pedido, Recebimento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { mascararCnpj } from "@/lib/cnpj";
import { fmtDiaHora, fmtQtd, fmtQtdUn, fmtReais, lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "@/lib/formato";
import { uuid7 } from "@/lib/ids";
import { ROTULO_STATUS } from "../CartaoProposta";
import { mensagemDe, useCasca } from "../contexto";
import { Confirmar, Drawer, Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { useCarregar } from "../useCarregar";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";
import { acoesDe, type AcaoPedido } from "./Pedidos";

/** Diferença entre a NF e o valor das linhas que já merece um segundo olhar (centavos). */
export const TOLERANCIA_NF = 100;

const fmtData = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fDataLonga = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
// O que falta vem da API (regra do domínio, 0 em pedido conferido ou cancelado): a tela não refaz a conta.
const falta = (l: Pedido["linhas"][number]) => l.falta_entregar;
const nomeEtapa = (etapas: EtapaObra[], k: string | null) => {
  if (!k) return "";
  const e = etapas.find((x) => x.etapa === k);
  return e ? `${e.etapa} · ${e.descricao}` : k;
};

export function DetalhePedido(props: {
  pedido: Pedido;
  obra: Obra;
  itens: ItemInsumo[];
  etapas: EtapaObra[];
  fornecedores: Fornecedor[];
  fechar: () => void;
  /** O pedido como a API devolveu depois de uma escrita: recebido ou cancelado, ele sai da lista de abertos. */
  atualizar?: (p: Pedido) => void;
}) {
  const { pedido: p, obra, etapas, fornecedores } = props;
  const { podeOperar, versao, avisar, avisarFeito, mudou } = useCasca();
  const [modal, setModal] = useState<"entrega" | "encerrar" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [previsao, setPrevisao] = useState(p.previsao && /^\d{4}-\d{2}-\d{2}/.test(p.previsao) ? p.previsao.slice(0, 10) : "");
  const forn = fornecedores.find((f) => f.id === p.fornecedor_id);
  const entregas = useCarregar(() => (p.recebimentos ? api.listarRecebimentos(p.id) : Promise.resolve([] as Recebimento[])), [p.id, p.recebimentos, versao]);
  const acoes = podeOperar ? acoesDe(p) : [];
  const encerrado = p.status === "conferido" || p.status === "cancelado";
  const previsaoMudou = previsao !== (p.previsao ?? "").slice(0, 10);

  const executar = async (a: AcaoPedido) => {
    if (a.tipo !== "avancar") return setModal(a.tipo);
    setOcupado(true);
    try {
      const r = await api.avancarPedido(p.id, a.para);
      props.atualizar?.(r);
      mudou();
      avisarFeito(a.feito, r.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setOcupado(false);
    }
  };

  const salvarPrevisao = async () => {
    setOcupado(true);
    try {
      const r = await api.editarPedido(p.id, { previsao: previsao || null });
      props.atualizar?.(r);
      mudou();
      avisarFeito(previsao ? `Previsão do ${p.numero}: ${fmtData(previsao)}.` : `Previsão do ${p.numero} apagada.`, r.registro_id);
    } catch (e) {
      avisar(mensagemDe(e), true);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Drawer
      titulo={
        <>
          {p.numero} <span className={`pill st-${p.status}`}>{ROTULO_STATUS[p.status]}</span>
        </>
      }
      fechar={props.fechar}
    >
      <p className="mut sm" style={{ margin: 0 }}>
        {p.fornecedor}
        {forn?.cnpj ? ` · CNPJ ${mascararCnpj(forn.cnpj)}` : ""} · pedido em {fmtDiaHora(p.criado_em)}
      </p>
      {p.observacao ? <p className="ped-obs">{p.observacao}</p> : null}

      <div className="painel-acoes">
        {/* No painel cabe tudo à vista: a entrega de um pedido aprovado não pode ficar escondida num menu. */}
        {acoes.map((a, i) => (
          <button
            key={a.rotulo}
            type="button"
            className={`btn${i === 0 ? " amb" : ""}`}
            disabled={ocupado}
            aria-busy={ocupado && i === 0}
            onClick={() => executar(a)}
          >
            {a.rotulo}
          </button>
        ))}
        <button type="button" className="btn" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {!encerrado ? (
        <div className="ped-prev">
          <Campo rotulo="Previsão de chegada">
            {(a) => <input {...a} type="date" className="f" value={previsao} disabled={!podeOperar} onChange={(e) => setPrevisao(e.target.value)} />}
          </Campo>
          {podeOperar && previsaoMudou ? (
            <button type="button" className="btn" disabled={ocupado} aria-busy={ocupado} onClick={salvarPrevisao}>
              Salvar previsão
            </button>
          ) : null}
        </div>
      ) : null}

      <h3 className="sectit">Linhas</h3>
      <div className="card lista">
        <table className="tbl-ped">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="num">
                Pedido
              </th>
              <th scope="col" className="num">
                Recebido
              </th>
              <th scope="col" className="num">
                Falta
              </th>
              <th scope="col" className="num">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {p.linhas.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.nome}
                  {l.tipo === "servico" ? <span className="pill ax-serv">serviço</span> : null}
                  <div className="mut sm">
                    {fmtReais(l.valor_unitario)}/{l.unidade}
                    {l.etapa ? ` · etapa ${nomeEtapa(etapas, l.etapa)}` : ""}
                  </div>
                </td>
                <td className="num">{fmtQtdUn(l.quantidade, l.unidade)}</td>
                <td className="num">{l.recebida ? fmtQtdUn(l.recebida, l.unidade) : "—"}</td>
                <td className={`num${falta(l) && p.status === "parcial" ? " t-perda" : ""}`}>{falta(l) ? fmtQtdUn(falta(l), l.unidade) : "—"}</td>
                <td className="num">{fmtReais(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total do pedido</td>
              <td className="num">
                <b>{fmtReais(p.valor)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 className="sectit">Entregas</h3>
      {entregas.erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {entregas.erro}
        </div>
      ) : null}
      {!p.recebimentos ? (
        <p className="mut sm">Nenhuma entrega registrada ainda.</p>
      ) : entregas.carregando && !entregas.dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando entregas…
        </div>
      ) : (
        <ul className="card lista ped-entregas">
          {(entregas.dado ?? []).map((r) => (
            <Entrega key={r.id} r={r} />
          ))}
        </ul>
      )}

      {modal === "entrega" ? <ModalRecebimento pedido={p} fechar={() => setModal(null)} atualizar={props.atualizar} /> : null}
      {modal === "encerrar" ? <ConfirmarEncerrar pedido={p} fechar={() => setModal(null)} atualizar={props.atualizar} /> : null}
      <FolhaPedido pedido={p} obra={obra} fornecedor={forn} etapas={etapas} />
    </Drawer>
  );
}

function Entrega({ r }: { r: Recebimento }) {
  const dif = r.nf_valor != null ? r.nf_valor - r.valor : 0;
  return (
    <li className="ped-ent">
      <div className="ped-ent-t">
        <b>Entrega {r.numero}</b>
        <span className="mut sm">
          {" "}
          · {fmtDiaHora(r.criado_em)} · {r.quem}
        </span>
        <div className="mut sm">
          {[r.nf_numero ? `NF ${r.nf_numero}` : "sem NF", r.nf_data ? fmtData(r.nf_data) : null, r.nf_valor != null ? `NF ${fmtReais(r.nf_valor)}` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="sm">{r.linhas.map((l) => `${fmtQtdUn(l.quantidade, l.unidade)} ${l.nome}`).join(" · ")}</div>
        {Math.abs(dif) > TOLERANCIA_NF ? (
          <div className="conf-dif falta" role="status">
            A NF ({fmtReais(r.nf_valor!)}) está {fmtReais(Math.abs(dif))} {dif > 0 ? "acima" : "abaixo"} do valor das linhas ({fmtReais(r.valor)}).
          </div>
        ) : null}
      </div>
      <span className="num">{fmtReais(r.valor)}</span>
    </li>
  );
}

/**
 * Registrar entrega. Cada linha começa com o que falta: o comum é chegar tudo. Entregar a mais é aceito (a API grava);
 * zero numa linha = não veio nesta entrega. A soma pelo preço do pedido é comparada com o valor da NF.
 */
export function ModalRecebimento({ pedido: p, fechar, atualizar }: { pedido: Pedido; fechar: () => void; atualizar?: (p: Pedido) => void }) {
  const { avisarFeito, mudou } = useCasca();
  const [qtds, setQtds] = useState(() => p.linhas.map((l) => (falta(l) ? qtdParaCampo(falta(l)) : "")));
  // Linha já 100% recebida começa travada em zero: quantidade nela quase sempre é engano (foi a outra linha que chegou).
  // "Chegou a mais" destrava para o caso real de o fornecedor mandar sobra.
  const [aMais, setAMais] = useState<boolean[]>(() => p.linhas.map(() => false));
  const [nf, setNf] = useState("");
  const [nfData, setNfData] = useState(hojeISO());
  const [nfValor, setNfValor] = useState("");
  // Conferido ao sair do campo: valor válido vira o formato do Real ("3600" → "3.600,00"); inválido ("3.600,000", um
  // zero a mais) mostra o erro na hora, em vez de só ao gravar. O campo nunca reformata enquanto a pessoa digita.
  const [nfValorErro, setNfValorErro] = useState<string | null>(null);
  // Enquanto o valor da NF não é número, Registrar fica desabilitado (e o envio também recusa, por garantia).
  const nfValorInvalido = !!nfValor.trim() && lerReais(nfValor) === null;
  const sairNfValor = () => {
    if (!nfValor.trim()) return setNfValorErro(null);
    const c = lerReais(nfValor);
    if (c === null) return setNfValorErro("Valor da NF em reais, ex.: 4.680,50.");
    setNfValorErro(null);
    setNfValor(fmtReais(c).replace("R$ ", ""));
  };
  const chave = useRef(uuid7());
  const primeiro = useRef<HTMLInputElement>(null);
  const travada = (i: number) => !falta(p.linhas[i]!) && !aMais[i];
  const lidas = qtds.map((t, i) => (travada(i) ? 0 : t.trim() ? lerQtd(t) : 0));
  const valorLinhas = p.linhas.reduce((s, l, i) => s + Math.round(((lidas[i] ?? 0) * l.valor_unitario) / 1000), 0);
  const v = nfValor.trim() ? lerReais(nfValor) : null;
  const dif = v !== null ? v - valorLinhas : 0;
  const soServico = p.linhas.every((l) => l.tipo === "servico");
  const [confirmaExcesso, setConfirmaExcesso] = useState(false);
  const excessos = p.linhas.flatMap((l, i) => {
    const q = lidas[i] ?? 0;
    return q > falta(l) ? [{ l, total: l.recebida + q }] : [];
  });

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      qtds: lidas.some((x) => x === null)
        ? "Quantidade inválida em alguma linha (ex.: 12 ou 2,5)."
        : !lidas.some((x) => (x ?? 0) > 0)
          ? "Diga quanto chegou de pelo menos uma linha."
          : null,
      nf: nf.trim().length > 60 ? "Número da NF muito longo." : null,
      nfValor: nfValor.trim() && v === null ? "Valor da NF em reais, ex.: 4.680,50." : null,
    }),
    async () => {
      if (nfValorInvalido) return setNfValorErro("Valor da NF em reais, ex.: 4.680,50.");
      // Entrega acima do que falta é aceita, mas não por engano: pede o "sim" com os números antes de gravar.
      if (excessos.length) return setConfirmaExcesso(true);
      await gravar();
    },
  );
  const gravar = async () => {
      const r = await api
        .registrarRecebimento(p.id, {
          // Campo vazio vai ausente, não null: a API aceita o campo opcional faltando, não nulo.
          ...(nf.trim() ? { nf_numero: nf.trim() } : {}),
          ...(nfData ? { nf_data: nfData } : {}),
          ...(v !== null ? { nf_valor: v } : {}),
          linhas: lidas.flatMap((q, indice) => (q ? [{ indice, quantidade: q }] : [])),
          chave_idempotencia: chave.current,
        })
        .catch((x) => {
          // A mesma chave com outro conteúdo a API recusa (409): depois de um erro a pessoa pode mudar o formulário.
          chave.current = uuid7();
          throw x;
        });
      atualizar?.(r.pedido);
      mudou();
      fechar();
      avisarFeito(
        r.pedido.status === "conferido" ? `${p.numero} recebido por completo.` : `Entrega do ${p.numero} registrada; o resto continua a caminho.`,
        r.registro_id,
      );
  };

  return (
    <Modal
      titulo={`Registrar entrega · ${p.numero}`}
      fechar={fechar}
      focoInicial={primeiro}
      largo
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-entrega" className="btn amb" disabled={ocupado || nfValorInvalido} aria-busy={ocupado}>
            {soServico ? "Registrar medição" : "Registrar entrega"} · {fmtReais(valorLinhas)}
          </button>
        </>
      }
    >
      <form id="form-entrega" onSubmit={enviar} noValidate>
        <p className="mut sm" style={{ margin: "0 0 4px" }}>
          {p.fornecedor}. {soServico ? "Serviço não dá entrada no almoxarifado: fica registrada a medição." : "O material entra no almoxarifado com esta entrega."}
        </p>
        <div className="campos3">
          <Campo rotulo="NF nº (opcional)" erro={erros.nf}>
            {(a) => <input {...a} ref={primeiro} className="f" autoComplete="off" value={nf} onChange={(e) => setNf(e.target.value)} />}
          </Campo>
          <Campo rotulo="Data da NF">
            {(a) => <input {...a} type="date" className="f" value={nfData} onChange={(e) => setNfData(e.target.value)} />}
          </Campo>
          <Campo rotulo="Valor da NF (R$)" erro={erros.nfValor ?? nfValorErro}>
            {(a) => (
              <input {...a} className="f" inputMode="decimal" autoComplete="off" placeholder={reaisParaCampo(valorLinhas)} value={nfValor} onChange={(e) => {
                  setNfValor(e.target.value);
                  if (nfValorErro && lerReais(e.target.value) !== null) setNfValorErro(null);
                }} onBlur={sairNfValor} />
            )}
          </Campo>
        </div>
        <div className="tbl-rola">
          <table className="tbl-ent">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">
                  Pedido
                </th>
                <th scope="col" className="num">
                  Falta
                </th>
                <th scope="col" className="num">
                  Chegou agora
                </th>
              </tr>
            </thead>
            <tbody>
              {p.linhas.map((l, i) => {
                const q = lidas[i] ?? 0;
                const acima = q - falta(l);
                return (
                  <tr key={i}>
                    <td>
                      {l.nome}
                      {!falta(l) ? (
                        <label className="ent-amais">
                          <input
                            type="checkbox"
                            checked={aMais[i]}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setAMais((a) => a.map((x, j) => (j === i ? on : x)));
                              if (!on) setQtds((qs) => qs.map((x, j) => (j === i ? "" : x)));
                            }}
                          />
                          já recebida · chegou a mais
                        </label>
                      ) : null}
                    </td>
                    <td className="num ent-ped" data-rot="Pedido">{fmtQtdUn(l.quantidade, l.unidade)}</td>
                    <td className="num ent-falta" data-rot="Falta">{falta(l) ? fmtQtdUn(falta(l), l.unidade) : "—"}</td>
                    <td className="num ent-agora" data-rot="Chegou agora">
                      <label className="sr-only" htmlFor={`ent-${i}`}>
                        Quanto chegou de {l.nome} ({l.unidade})
                      </label>
                      <span className="ent-q">
                        <input
                          id={`ent-${i}`}
                          className="f"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0"
                          disabled={travada(i)}
                          value={travada(i) ? "" : qtds[i]}
                          aria-invalid={lidas[i] === null}
                          aria-describedby={acima > 0 ? `ent-${i}-acima` : undefined}
                          onChange={(e) => setQtds((qs) => qs.map((x, j) => (j === i ? e.target.value : x)))}
                        />
                        <small>{l.unidade}</small>
                      </span>
                      {acima > 0 ? (
                        <div id={`ent-${i}-acima`} className="ent-acima">
                          {fmtQtdUn(acima, l.unidade)} acima do pedido
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {erros.qtds ? (
          <div className="campo-erro" role="alert">
            {erros.qtds}
          </div>
        ) : null}
        {!nf.trim() ? <p className="ent-semnf">Sem nota fiscal: a entrega fica registrada sem NF. Dá para conferir depois pelo valor das linhas.</p> : null}
        {v !== null && Math.abs(dif) > TOLERANCIA_NF ? (
          <div className="conf-dif falta" role="status">
            <b>
              A NF está {fmtReais(Math.abs(dif))} {dif > 0 ? "acima" : "abaixo"}
            </b>{" "}
            do valor destas linhas pelo preço do pedido ({fmtReais(valorLinhas)}). Confira antes de registrar; grava mesmo assim.
          </div>
        ) : null}
        <ErroApi texto={erroApi} />
      </form>
      {confirmaExcesso ? (
        <Confirmar
          titulo={
            excessos.length === 1
              ? `Gravar ${fmtQtd(excessos[0]!.total)} de ${fmtQtdUn(excessos[0]!.l.quantidade, excessos[0]!.l.unidade)} mesmo assim?`
              : "Gravar a entrega acima do pedido mesmo assim?"
          }
          confirmar="Gravar mesmo assim"
          fechar={() => setConfirmaExcesso(false)}
          aoConfirmar={async () => {
            setConfirmaExcesso(false);
            await gravar();
          }}
        >
          <ul className="sm" style={{ margin: "4px 0 0" }}>
            {excessos.map(({ l, total }, i) => (
              <li key={i}>
                {l.nome}: com esta entrega chegam {fmtQtd(total)} de {fmtQtdUn(l.quantidade, l.unidade)} pedidos ({fmtQtdUn(total - l.quantidade, l.unidade)} a mais).
              </li>
            ))}
          </ul>
          <p className="mut sm">O que vier a mais entra no estoque e no comprometido pelo preço do pedido.</p>
        </Confirmar>
      ) : null}
    </Modal>
  );
}

/** Encerrar o resto: o fornecedor não manda mais; a sobra sai do "a caminho" e volta para a conta de falta. */
export function ConfirmarEncerrar({ pedido: p, fechar, atualizar }: { pedido: Pedido; fechar: () => void; atualizar?: (p: Pedido) => void }) {
  const { avisarFeito, mudou } = useCasca();
  const pendentes = p.linhas.filter((l) => falta(l) > 0);
  return (
    <Confirmar
      titulo={`Encerrar o resto do ${p.numero}?`}
      confirmar="Encerrar o resto"
      fechar={fechar}
      aoConfirmar={async () => {
        const r = await api.avancarPedido(p.id, "conferido");
        atualizar?.(r);
        fechar();
        mudou();
        avisarFeito(`${p.numero} encerrado com o que chegou.`, r.registro_id);
      }}
    >
      <p style={{ margin: "4px 0 8px" }}>O fornecedor não vai mandar o que falta. Sai do «a caminho» e volta para a conta de falta:</p>
      <ul className="sm">
        {pendentes.map((l, i) => (
          <li key={i}>
            {fmtQtdUn(falta(l), l.unidade)} de {l.nome}
          </li>
        ))}
      </ul>
    </Confirmar>
  );
}

/** A folha que sai na impressora: o pedido como o fornecedor e o almoxarife precisam ver, sem nada da tela. */
function FolhaPedido({ pedido: p, obra, fornecedor, etapas }: { pedido: Pedido; obra: Obra; fornecedor?: Fornecedor; etapas: EtapaObra[] }) {
  return createPortal(
    <article className="folha-pedido" aria-hidden="true">
      <header>
        <div>
          <h1>Pedido {p.numero}</h1>
          <p>
            Emitido em {fDataLonga.format(new Date(p.criado_em))} · {ROTULO_STATUS[p.status]}
          </p>
        </div>
        <div className="folha-obra">
          <b>{obra.nome}</b>
          <p>{[obra.endereco, [obra.cidade, obra.uf].filter(Boolean).join("/"), obra.cep].filter(Boolean).join(" · ")}</p>
          {obra.numero_contrato ? <p>Contrato {obra.numero_contrato}</p> : null}
        </div>
      </header>
      <section className="folha-forn">
        <small>Fornecedor</small>
        <b>{p.fornecedor}</b>
        {fornecedor ? (
          <p>
            {[
              fornecedor.cnpj ? `CNPJ ${mascararCnpj(fornecedor.cnpj)}` : null,
              fornecedor.contato || null,
              fornecedor.telefone || null,
              fornecedor.email || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {p.previsao ? <p>Previsão de entrega: {/^\d{4}-\d{2}-\d{2}/.test(p.previsao) ? fmtData(p.previsao.slice(0, 10)) : p.previsao}</p> : null}
      </section>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Etapa</th>
            <th className="num">Quant.</th>
            <th>Un.</th>
            <th className="num">Unitário</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {p.linhas.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{l.nome}</td>
              <td>{l.etapa ? nomeEtapa(etapas, l.etapa) : ""}</td>
              <td className="num">{fmtQtd(l.quantidade)}</td>
              <td>{l.unidade}</td>
              <td className="num">{fmtReais(l.valor_unitario)}</td>
              <td className="num">{fmtReais(l.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>Total</td>
            <td className="num">{fmtReais(p.valor)}</td>
          </tr>
        </tfoot>
      </table>
      {p.observacao ? <p className="folha-obs">Observação: {p.observacao}</p> : null}
      <footer>
        <span>Emitido pelo Plumo</span>
        <span className="folha-ass">Assinatura</span>
      </footer>
    </article>,
    document.body,
  );
}
