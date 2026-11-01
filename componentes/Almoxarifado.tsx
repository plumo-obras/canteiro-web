"use client";
/**
 * Aba Almoxarifado: um insumo por linha, com três números que qualquer um lê (tem, a caminho, a obra precisa), a barra
 * de cobertura e a situação em palavras. O que falta vem primeiro, com o "Pedir" na própria linha. A fórmula inteira
 * (a Conta da API) fica no painel do insumo, para quem quer conferir. Clicar no item abre o painel com os movimentos.
 */
import { useState } from "react";
import type { Conta, ItemInsumo, Movimento, Obra, TipoMovimento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtDiaHora, fmtQtdUn } from "@/lib/formato";
import { useCasca } from "./contexto";
import { Drawer } from "./Dialogo";
import { Icone } from "./Icone";
import { LinhaConta } from "./LinhaConta";
import { useCarregar } from "./useCarregar";
import { ModalMovimento, type TipoLancamento } from "./formularios/ModalMovimento";
import { ModalNovoPedido } from "./formularios/ModalNovoPedido";
import { ImportarOrcamento } from "./obra/ImportarOrcamento";

const TIPO: Record<TipoMovimento, string> = {
  entrada: "Entrada",
  saida: "Saída",
  ajuste: "Ajuste de contagem",
  transferencia_entrada: "Veio de outra obra",
  transferencia_saida: "Foi para outra obra",
};

function sinal(m: Movimento) {
  if (m.tipo === "ajuste") return m.quantidade;
  return m.tipo === "entrada" || m.tipo === "transferencia_entrada" ? m.quantidade : -m.quantidade;
}

/** Situação de cada insumo em palavras: é o que a pessoa procura ao abrir a tela ("o que preciso comprar?"). */
function situacao(c: Conta): "falta" | "coberto" | "fora" {
  if (c.precisa === 0) return "fora";
  return c.falta > 0 ? "falta" : "coberto";
}

/**
 * Barra de cobertura: quanto do que a obra ainda vai usar já está garantido. Cheio = tem no almoxarifado; listrado =
 * a caminho ou em cotação; o vão vermelho é a falta. Mostra a mesma conta da API sem pedir para ler uma fórmula.
 */
function Cobertura({ c }: { c: Conta }) {
  if (!c.precisa) return null;
  const pct = (v: number) => `${Math.min(100, (Math.max(0, v) / c.precisa) * 100)}%`;
  const tem = Math.min(Math.max(0, c.saldo), c.precisa);
  const vem = Math.min(c.a_caminho + c.cotando + c.transferencia, c.precisa - tem);
  return (
    <span className="cob" aria-hidden="true">
      <span className="cob-tem" style={{ width: pct(tem) }} />
      <span className="cob-vem" style={{ width: pct(vem) }} />
    </span>
  );
}

function Lista({ itens, abrir, pedir }: { itens: ItemInsumo[]; abrir: (i: ItemInsumo) => void; pedir: ((i: ItemInsumo) => void) | null }) {
  return (
    <div className="card lista almox" role="table" aria-label="Insumos da obra">
      <div className="ax-l ax-cab" role="row">
        <span role="columnheader">Insumo</span>
        <span role="columnheader" className="num">
          Tem
        </span>
        <span role="columnheader" className="num">
          A caminho
        </span>
        <span role="columnheader" className="num">
          A obra precisa
        </span>
        <span role="columnheader" className="num">
          Situação
        </span>
      </div>
      {itens.map((it) => {
        const c = it.conta;
        const un = it.insumo.unidade;
        const st = situacao(c);
        const vem = c.a_caminho + c.cotando + c.transferencia;
        return (
          <div key={it.insumo.id} className={`ax-l ax-${st}`} role="row" onClick={() => abrir(it)}>
            <span role="cell" className="ax-nome">
              <button
                type="button"
                className="nome-ins"
                onClick={(e) => {
                  e.stopPropagation();
                  abrir(it);
                }}
              >
                {it.insumo.nome}
              </button>
              <span className={`curva c${it.insumo.curva}`} title={`Curva ${it.insumo.curva}`}>
                {it.insumo.curva}
              </span>
              <Cobertura c={c} />
            </span>
            <span role="cell" className="num ax-n" data-rot="Tem">
              {fmtQtdUn(c.saldo, un)}
            </span>
            <span role="cell" className="num ax-n" data-rot="A caminho">
              {vem ? fmtQtdUn(vem, un) : "—"}
              {c.cotando ? <small>{fmtQtdUn(c.cotando, un)} em cotação</small> : null}
            </span>
            <span role="cell" className="num ax-n" data-rot="A obra precisa">
              {c.precisa ? fmtQtdUn(c.precisa, un) : "—"}
            </span>
            <span role="cell" className="num ax-sit">
              {st === "falta" ? (
                <>
                  <span className="pill bad">falta {fmtQtdUn(c.falta, un)}</span>
                  {pedir ? (
                    <button
                      type="button"
                      className="btn ax-pedir"
                      onClick={(e) => {
                        e.stopPropagation();
                        pedir(it);
                      }}
                    >
                      Pedir
                    </button>
                  ) : null}
                </>
              ) : st === "coberto" ? (
                <span className="pill ok">coberto</span>
              ) : (
                <span className="pill" title="Não está na planilha do orçamento: não entra na conta de falta">
                  fora do orçamento
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PainelItem({ obraId, item, fechar, lancar }: { obraId: string; item: ItemInsumo; fechar: () => void; lancar: (a: Lancar) => void }) {
  const { versao, podeOperar } = useCasca();
  const { dado: movs, erro, carregando } = useCarregar(() => api.listarMovimentos(obraId, item.insumo.id), [obraId, item.insumo.id, versao]);
  const un = item.insumo.unidade;
  const estornados = new Set((movs ?? []).map((m) => m.desfaz).filter(Boolean));
  return (
    <Drawer titulo={item.insumo.nome} fechar={fechar}>
      <p className="mut sm" style={{ margin: 0 }}>
        Curva {item.insumo.curva} · unidade {un}
      </p>
      <div className="card">
        <LinhaConta conta={item.conta} un={un} />
      </div>
      {podeOperar ? (
        <div className="painel-acoes">
          {item.conta.comprar > 0 ? (
            <button type="button" className="btn amb" onClick={() => lancar({ tipo: "pedido", insumoId: item.insumo.id })}>
              <Icone nome="cart" tam={15} />
              Pedir {fmtQtdUn(item.conta.comprar, un)}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={() => lancar({ tipo: "saida", insumoId: item.insumo.id })}>
            Lançar saída
          </button>
          <button type="button" className="btn" onClick={() => lancar({ tipo: "contagem", insumoId: item.insumo.id })}>
            Contei o estoque
          </button>
          <button type="button" className="btn" onClick={() => lancar({ tipo: "entrada", insumoId: item.insumo.id })}>
            Entrada sem pedido
          </button>
        </div>
      ) : null}
      <h3 className="sectit">Movimentos</h3>
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !movs ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando movimentos…
        </div>
      ) : movs && movs.length === 0 ? (
        <p className="mut">Nenhum movimento ainda.</p>
      ) : movs ? (
        <div className="card lista">
          <table>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Movimento</th>
                <th scope="col" className="num">
                  Quantidade
                </th>
                <th scope="col">Quem</th>
              </tr>
            </thead>
            <tbody>
              {movs.map((m) => {
                const s = sinal(m);
                // O desfazer não apaga: grava o movimento inverso. Os dois ficam à vista, marcados, para a conta fechar.
                const estornado = estornados.has(m.id);
                return (
                  <tr key={m.id} className={estornado ? "estornado" : undefined}>
                    <td className="sm">{fmtDiaHora(m.criado_em)}</td>
                    <td>
                      {m.desfaz ? "Estorno (desfeito)" : (TIPO[m.tipo] ?? m.tipo)}
                      {estornado ? <span className="pill">desfeito</span> : null}
                      {m.destino || m.origem_doc ? (
                        <div className="sm mut">{[m.desfaz ? null : m.destino, m.origem_doc].filter(Boolean).join(" · ")}</div>
                      ) : null}
                    </td>
                    <td className="num" style={{ color: s < 0 ? "var(--redInk)" : "var(--greenInk)" }}>
                      {s > 0 ? "+" : s < 0 ? "−" : ""}
                      {fmtQtdUn(Math.abs(s), un)}
                    </td>
                    <td className="sm">
                      {m.quem}
                      {m.origem && m.origem !== "tela" ? <div className="mut">via {m.origem}</div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Drawer>
  );
}

/** O que está aberto por cima da aba: um lançamento no almoxarifado ou um pedido novo (o "Pedir" do painel). */
type Lancar = { tipo: TipoLancamento | "pedido"; insumoId?: string };

export function Almoxarifado({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const [lancando, setLancando] = useState<Lancar | null>(null);
  const { dado, erro, carregando } = useCarregar(() => api.listarInsumos(obra.id), [obra.id, versao]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const itens = dado ?? [];
  const peso = (i: ItemInsumo) => (i.conta.precisa ? i.conta.falta / i.conta.precisa : i.conta.falta);
  const ordem = { falta: 0, coberto: 1, fora: 2 } as const;
  const lista = [...itens].sort(
    (a, b) => ordem[situacao(a.conta)] - ordem[situacao(b.conta)] || peso(b) - peso(a) || a.insumo.nome.localeCompare(b.insumo.nome, "pt-BR"),
  );
  const nFalta = itens.filter((i) => situacao(i.conta) === "falta").length;
  const item = itens.find((i) => i.insumo.id === aberto);

  return (
    <div className="page">
      <div className="cab-tela">
        <h2>Almoxarifado</h2>
        <span className="mut sm">{obra.nome}</span>
        {podeOperar && itens.length ? (
          <button type="button" className="btn cab-acao" onClick={() => setLancando({ tipo: "saida" })}>
            <Icone nome="plus" tam={15} />
            Lançar entrada ou saída
          </button>
        ) : null}
      </div>
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando insumos…
        </div>
      ) : dado && itens.length === 0 ? (
        <div className="card vazio">
          <Icone nome="package" tam={24} />
          <h3>Nenhum insumo nesta obra</h3>
          <p>Importe a planilha do orçamento para o almoxarifado começar a fazer a conta.</p>
          {podeOperar ? (
            <button type="button" className="btn amb" onClick={() => setImportando(true)}>
              Importar planilha do orçamento
            </button>
          ) : null}
          {importando ? <ImportarOrcamento obra={obra} fechar={() => setImportando(false)} /> : null}
        </div>
      ) : (
        <>
          <p className="ax-resumo">
            {nFalta ? (
              <>
                <b className="t-falta">{nFalta === 1 ? "1 insumo" : `${nFalta} insumos`} faltando</b> para terminar a obra.
              </>
            ) : (
              <b className="t-ok">Nada falta para terminar a obra.</b>
            )}{" "}
            <span className="mut">Falta é o que a obra ainda precisa menos o que tem e o que já está a caminho.</span>
          </p>
          <p className="ax-legenda" aria-hidden="true">
            <span>
              <i className="cob-tem" /> tem
            </span>
            <span>
              <i className="cob-vem" /> a caminho
            </span>
            <span>
              <i className="cob-falta" /> falta
            </span>
          </p>
          <Lista
            itens={lista}
            abrir={(i) => setAberto(i.insumo.id)}
            pedir={podeOperar ? (i) => setLancando({ tipo: "pedido", insumoId: i.insumo.id }) : null}
          />
        </>
      )}
      {item && !lancando ? <PainelItem obraId={obra.id} item={item} fechar={() => setAberto(null)} lancar={setLancando} /> : null}
      {lancando?.tipo === "pedido" ? (
        <ModalNovoPedido obraId={obra.id} itens={itens} insumoInicial={lancando.insumoId} fechar={() => setLancando(null)} />
      ) : lancando ? (
        <ModalMovimento obraId={obra.id} itens={itens} insumoInicial={lancando.insumoId} tipoInicial={lancando.tipo} fechar={() => setLancando(null)} />
      ) : null}
    </div>
  );
}
