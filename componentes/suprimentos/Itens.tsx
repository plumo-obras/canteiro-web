"use client";
/**
 * Itens de Suprimentos (o antigo almoxarifado): um insumo por linha, com três números que qualquer um lê (tem, a caminho, a obra precisa), a barra
 * de cobertura e a situação em palavras. O que falta vem primeiro, com o "Pedir" na própria linha. A fórmula inteira
 * (a Conta da API) fica no painel do insumo, para quem quer conferir. Clicar no item abre o painel com os movimentos.
 * Serviço (terraplanagem, empreiteiro) não tem estoque: não mostra saldo nem entrada, saída ou contagem; o que está
 * "a caminho" dele é o contratado e ainda não medido.
 */
import { useState } from "react";
import type { Conta, EtapaObra, ItemInsumo, Movimento, Obra, TipoInsumo, TipoMovimento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtDiaHora, fmtQtdUn } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Drawer } from "../Dialogo";
import { Icone } from "../Icone";
import { LinhaConta } from "../LinhaConta";
import type { TipoLancamento } from "../formularios/ModalMovimento";
import { ImportarOrcamento } from "../obra/ImportarOrcamento";
import { BotaoMais, Paginacao, useMaisAntigos, usePaginas } from "../Paginacao";

// A planilha do orçamento pode ter milhares de linhas: 50 por página e a busca pelo nome.
const POR_PAGINA = 50;
const MOVS = 30;
const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

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
export const ehServico = (i: ItemInsumo) => i.insumo.tipo === "servico";

export function situacao(c: Conta): "falta" | "coberto" | "fora" {
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
        const servico = ehServico(it);
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
              {servico ? <span className="pill ax-serv">serviço</span> : null}
              <Cobertura c={c} />
            </span>
            <span role="cell" className="num ax-n" data-rot="Tem">
              {servico ? "—" : fmtQtdUn(c.saldo, un)}
            </span>
            <span role="cell" className="num ax-n" data-rot={servico ? "Contratado" : "A caminho"}>
              {vem ? fmtQtdUn(vem, un) : "—"}
              {servico && vem ? <small>contratado, a medir</small> : null}
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
                      {servico ? "Contratar" : "Pedir"}
                    </button>
                  ) : null}
                </>
              ) : st === "coberto" ? (
                <span className="pill ok">coberto</span>
              ) : (
                <span className="pill" title="Sem quantidade prevista, a conta de falta não tem com o que comparar">
                  sem quantidade prevista
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
  const mais = useMaisAntigos((antes) => api.listarMovimentos(obraId, item.insumo.id, MOVS, antes), MOVS, [obraId, item.insumo.id, versao]);
  const { itens: movs, erro } = mais;
  const carregando = mais.buscando;
  const un = item.insumo.unidade;
  const estornados = new Set((movs ?? []).map((m) => m.desfaz).filter(Boolean));
  const servico = ehServico(item);
  return (
    <Drawer titulo={item.insumo.nome} fechar={fechar}>
      <p className="mut sm" style={{ margin: 0 }}>
        {servico ? "Serviço · sem estoque" : "Material"} · curva {item.insumo.curva} · unidade {un}
      </p>
      <div className="card">
        <LinhaConta conta={item.conta} un={un} />
      </div>
      {podeOperar ? (
        <div className="painel-acoes">
          {item.conta.comprar > 0 ? (
            <button type="button" className="btn amb" onClick={() => lancar({ tipo: "pedido", insumoId: item.insumo.id })}>
              <Icone nome="cart" tam={15} />
              {servico ? "Contratar" : "Pedir"} {fmtQtdUn(item.conta.comprar, un)}
            </button>
          ) : null}
          {servico ? null : (
            <>
              <button type="button" className="btn" onClick={() => lancar({ tipo: "saida", insumoId: item.insumo.id })}>
                Lançar saída
              </button>
              <button type="button" className="btn" onClick={() => lancar({ tipo: "contagem", insumoId: item.insumo.id })}>
                Contei o estoque
              </button>
              <button type="button" className="btn" onClick={() => lancar({ tipo: "entrada", insumoId: item.insumo.id })}>
                Entrada sem pedido
              </button>
            </>
          )}
        </div>
      ) : null}
      {servico ? (
        <p className="mut sm">Serviço não tem estoque: o que foi contratado e medido aparece nos pedidos, em Suprimentos › Pedidos.</p>
      ) : null}
      {!item.conta.precisa ? (
        <p className="campo-dica alerta">
          Sem quantidade prevista: a conta de falta fica em zero porque não sabe quanto a obra vai usar. A quantidade prevista vem da lista de materiais
          (Orçamento › Importar planilha › Lista de materiais) ou do cadastro do item em «Novo item».
        </p>
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
      {movs?.length ? <BotaoMais acabou={mais.acabou} buscando={mais.buscando} carregarMais={mais.carregarMais} rotulo="Movimentos mais antigos" /> : null}
    </Drawer>
  );
}

/** O que está aberto por cima da lista: um lançamento no almoxarifado ou um pedido novo (o "Pedir" do painel). */
export type Lancar = { tipo: TipoLancamento | "pedido"; insumoId?: string };

const FILTROS: { k: TipoInsumo | null; rotulo: string }[] = [
  { k: null, rotulo: "Todos" },
  { k: "material", rotulo: "Materiais" },
  { k: "servico", rotulo: "Serviços" },
];

/** Seção Itens de Suprimentos. Os dados vêm de cima (a tela carrega uma vez e as três seções usam). */
export function Itens(props: { obra: Obra; itens: ItemInsumo[]; etapas: EtapaObra[]; lancar: (l: Lancar) => void; lancando: boolean }) {
  const { obra, itens } = props;
  const { podeOperar } = useCasca();
  const [aberto, setAberto] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [filtro, setFiltro] = useState<TipoInsumo | null>(null);
  const peso = (i: ItemInsumo) => (i.conta.precisa ? i.conta.falta / i.conta.precisa : i.conta.falta);
  const ordem = { falta: 0, coberto: 1, fora: 2 } as const;
  const lista = [...itens]
    .filter((i) => !filtro || (i.insumo.tipo ?? "material") === filtro)
    .sort((a, b) => ordem[situacao(a.conta)] - ordem[situacao(b.conta)] || peso(b) - peso(a) || a.insumo.nome.localeCompare(b.insumo.nome, "pt-BR"));
  const item = itens.find((i) => i.insumo.id === aberto);
  const [busca, setBusca] = useState("");
  const q = semAcento(busca);
  const achados = q ? lista.filter((i) => semAcento(i.insumo.nome).includes(q)) : lista;
  const pag = usePaginas(achados, POR_PAGINA, [busca, filtro, obra.id]);
  const temServico = itens.some(ehServico);

  if (!itens.length)
    return (
      <div className="card vazio">
        <Icone nome="package" tam={24} />
        <h3>Nenhum item nesta obra</h3>
        <p>Importe a lista de materiais da obra para o almoxarifado começar a fazer a conta, ou cadastre um item em «Novo item».</p>
        {podeOperar ? (
          <button type="button" className="btn amb" onClick={() => setImportando(true)}>
            Importar lista de materiais
          </button>
        ) : null}
        {importando ? <ImportarOrcamento obra={obra} fechar={() => setImportando(false)} /> : null}
      </div>
    );

  return (
    <>
      <div className="barra-acoes">
        {itens.length > POR_PAGINA / 2 ? (
          <label className="busca">
            <Icone nome="busca" tam={16} />
            <span className="sr-only">Buscar item</span>
            <input type="search" placeholder="Buscar item, ex.: cimento" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
        ) : null}
        {temServico || filtro ? (
          <div className="seg seg-pq" role="radiogroup" aria-label="Filtrar por tipo">
            {FILTROS.map((f) => (
              <button key={f.rotulo} type="button" role="radio" aria-checked={filtro === f.k} className={filtro === f.k ? "on" : ""} onClick={() => setFiltro(f.k)}>
                {f.rotulo}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p className="ax-legenda">
        <span className="mut">Falta é o que a obra ainda precisa menos o que tem e o que já está a caminho.</span>
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
      {(q || filtro) && !achados.length ? <div className="card vazio sm">Nenhum item{q ? ` com «${busca.trim()}»` : ""} neste filtro.</div> : null}
      {achados.length ? (
        <Lista
          itens={pag.visiveis}
          abrir={(i) => setAberto(i.insumo.id)}
          pedir={podeOperar ? (i) => props.lancar({ tipo: "pedido", insumoId: i.insumo.id }) : null}
        />
      ) : null}
      <Paginacao pagina={pag.pagina} total={pag.total} mudar={pag.setPagina} quantos={achados.length} porPagina={POR_PAGINA} nome="itens" />
      {item && !props.lancando ? <PainelItem obraId={obra.id} item={item} fechar={() => setAberto(null)} lancar={props.lancar} /> : null}
    </>
  );
}
