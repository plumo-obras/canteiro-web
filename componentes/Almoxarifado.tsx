"use client";
/**
 * Aba Almoxarifado: um insumo por linha com a linha de conta da API. O que falta vem primeiro (mais falta proporcional
 * no topo); o que está coberto fica recolhido em "Cobertos". Clicar no item abre o painel com os movimentos.
 */
import { useState } from "react";
import type { ItemInsumo, Movimento, Obra, TipoMovimento } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtDiaHora, fmtQtdUn } from "@/lib/formato";
import { useCasca } from "./contexto";
import { Drawer } from "./Dialogo";
import { Icone } from "./Icone";
import { LinhaConta } from "./LinhaConta";
import { useCarregar } from "./useCarregar";

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

function Tabela({ itens, abrir }: { itens: ItemInsumo[]; abrir: (i: ItemInsumo) => void }) {
  return (
    <div className="card lista">
      <table>
        <thead>
          <tr>
            <th scope="col">Insumo</th>
            <th scope="col">Conta até o fim da obra</th>
            <th scope="col" className="num">
              Situação
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it) => (
            <tr key={it.insumo.id} className="click" onClick={() => abrir(it)}>
              <td>
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
              </td>
              <td>
                <LinhaConta conta={it.conta} un={it.insumo.unidade} />
              </td>
              <td className="num">
                {it.conta.falta > 0 ? (
                  <span className="pill bad">falta {fmtQtdUn(it.conta.falta, it.insumo.unidade)}</span>
                ) : (
                  <span className="pill ok">coberto</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PainelItem({ obraId, item, fechar }: { obraId: string; item: ItemInsumo; fechar: () => void }) {
  const { versao } = useCasca();
  const { dado: movs, erro, carregando } = useCarregar(() => api.listarMovimentos(obraId, item.insumo.id), [obraId, item.insumo.id, versao]);
  const un = item.insumo.unidade;
  return (
    <Drawer titulo={item.insumo.nome} fechar={fechar}>
      <p className="mut sm" style={{ margin: 0 }}>
        Curva {item.insumo.curva} · unidade {un}
      </p>
      <div className="card">
        <LinhaConta conta={item.conta} un={un} />
      </div>
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
                return (
                  <tr key={m.id}>
                    <td className="sm">{fmtDiaHora(m.criado_em)}</td>
                    <td>
                      {TIPO[m.tipo] ?? m.tipo}
                      {m.destino || m.origem_doc ? <div className="sm mut">{[m.destino, m.origem_doc].filter(Boolean).join(" · ")}</div> : null}
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

export function Almoxarifado({ obra }: { obra: Obra }) {
  const { versao } = useCasca();
  const { dado, erro, carregando } = useCarregar(() => api.listarInsumos(obra.id), [obra.id, versao]);
  const [aberto, setAberto] = useState<string | null>(null);
  const itens = dado ?? [];
  const peso = (i: ItemInsumo) => (i.conta.precisa ? i.conta.falta / i.conta.precisa : i.conta.falta);
  const faltando = itens.filter((i) => i.conta.falta > 0).sort((a, b) => peso(b) - peso(a));
  const cobertos = itens.filter((i) => i.conta.falta <= 0);
  const item = itens.find((i) => i.insumo.id === aberto);

  return (
    <div className="page">
      <div className="cab-tela">
        <h2>Almoxarifado</h2>
        <span className="mut sm">{obra.nome}</span>
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
        </div>
      ) : (
        <>
          {faltando.length ? <Tabela itens={faltando} abrir={(i) => setAberto(i.insumo.id)} /> : dado ? (
            <div className="card vazio">
              <Icone nome="checkCircle" tam={24} />
              <h3>Nada falta</h3>
              <p>O saldo, o que está a caminho e o que está em cotação cobrem a obra até o fim.</p>
            </div>
          ) : null}
          {cobertos.length ? (
            <details className="cobertos">
              <summary>
                <Icone nome="chevRight" tam={14} />
                Cobertos ({cobertos.length})
              </summary>
              <Tabela itens={cobertos} abrir={(i) => setAberto(i.insumo.id)} />
            </details>
          ) : null}
        </>
      )}
      {item ? <PainelItem obraId={obra.id} item={item} fechar={() => setAberto(null)} /> : null}
    </div>
  );
}
