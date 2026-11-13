"use client";
/**
 * Compras: marcar o que falta comprar do orçamento, fazer o pedido e dizer quando chegou. Três abas internas: Comprar
 * (o trabalho do dia: o que falta ao lado dos pedidos), Estoque (entradas, saídas, contagem) e Fornecedores. A tela
 * carrega uma vez o que as seções usam, e a "versão" da casca recarrega tudo depois de cada escrita.
 */
import { useEffect, useRef, useState } from "react";
import type { EtapaObra, Fornecedor, ItemInsumo, Obra } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { uuid7 } from "@/lib/ids";
import { CabecalhoTela } from "./orcamento/CabecalhoTela";
import { useCelular } from "./midia";
import { useCasca } from "./contexto";
import { Icone } from "./Icone";
import { useCarregar } from "./useCarregar";
import { ModalMovimento } from "./formularios/ModalMovimento";
import { ModalNovoPedido } from "./formularios/ModalNovoPedido";
import { FaltaComprar } from "./suprimentos/FaltaComprar";
import { ListaFornecedores, ModalFornecedor } from "./suprimentos/Fornecedores";
import { Itens, ehServico, type Lancar } from "./suprimentos/Itens";
import { ModalNovoItem } from "./suprimentos/ModalNovoItem";
import { ModalPedidoMarcados } from "./suprimentos/ModalPedidoMarcados";
import { ABERTOS, ListaPedidos } from "./suprimentos/Pedidos";
import { BaseOrcamento } from "./cronograma/BaseOrcamento";
import { BotaoPlumo } from "./BotaoPlumo";
import s from "./suprimentos/compras.module.css";

type Secao = "compras" | "pedidos" | "estoque" | "fornecedores";

// Etapas e fornecedores são da Fase 2: se a rota ainda não existir (API antiga), a tela segue sem eles.
const ouVazio = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);

export function Suprimentos({ obra }: { obra: Obra }) {
  const { versao, podeOperar } = useCasca();
  const celular = useCelular();
  const [secaoEscolhida, setSecao] = useState<Secao>("compras");
  // Pedidos só é aba no celular; no computador ele é a coluna ao lado do que falta comprar.
  const secao: Secao = !celular && secaoEscolhida === "pedidos" ? "compras" : secaoEscolhida;
  const [lancando, setLancando] = useState<Lancar | null>(null);
  const [marcados, setMarcados] = useState<ItemInsumo[] | null>(null);
  // Sobe a cada pedido criado: as marcações só saem aí, e "Voltar" no pedido não perde nada.
  const [pedidosFeitos, setPedidosFeitos] = useState(0);
  const desfazendo = obra.status === "desfazendo_aprovacao";
  const { lerFiltroTela, limparFiltroTela } = useCasca();
  const [etapaRecorte, setEtapaRecorte] = useState(() => lerFiltroTela("suprimentos")?.etapa ?? null);
  useEffect(limparFiltroTela, [limparFiltroTela]);
  // Aqui, e não no diálogo: fechar e reabrir depois de uma resposta perdida tem de repetir a mesma chave.
  const chavePedido = useRef(uuid7());
  const [modal, setModal] = useState<{ k: "item" } | { k: "fornecedor"; f?: Fornecedor } | null>(null);
  const { dado, erro, carregando } = useCarregar(
    () =>
      Promise.all([
        api.listarInsumos(obra.id),
        api.listarPedidos(obra.id, { status: ABERTOS, limite: 500 }),
        ouVazio<EtapaObra>(api.etapas(obra.id)),
        ouVazio<Fornecedor>(api.listarFornecedores()),
        // o "precisa até" de cada item sai do cronograma; sem ele (ou com erro), a linha só não diz a data
        api.cronograma(obra.id).catch(() => null),
      ]),
    [obra.id, versao],
  );
  const [itens, pedidos, etapas, fornecedores, cronograma] = dado ?? [[], [], [], [], null];
  const inicioEtapa = (etapa: string): string | null => {
    const e = cronograma?.etapas.find((x) => x.etapa === etapa);
    const i = e ? e.percentuais.findIndex((p) => p > 0) : -1;
    return e && i >= 0 ? (cronograma?.mensal[i]?.mes ?? null) : null;
  };

  const nFalta = itens.filter((i) => i.conta.comprar > 0).length;
  const novoItemFora = podeOperar && dado && !desfazendo ? () => setLancando({ tipo: "pedido" }) : null;
  const acao =
    podeOperar && dado ? (
      secao === "compras" ? (
        novoItemFora ? (
          <button type="button" className="btn" onClick={novoItemFora}>
            <Icone nome="plus" tam={15} />
            Item fora do orçamento
          </button>
        ) : null
      ) : secao === "fornecedores" ? (
        <button type="button" className="btn amb" onClick={() => setModal({ k: "fornecedor" })}>
          <Icone nome="plus" tam={15} />
          Novo fornecedor
        </button>
      ) : secao === "estoque" && itens.some((i) => !ehServico(i)) ? (
        <button type="button" className="btn amb" onClick={() => setLancando({ tipo: "saida" })}>
          Lançar entrada ou saída
        </button>
      ) : null
    ) : null;
  // No celular o cabeçalho é só o título: o que no computador fica à vista vai para o "⋯" (Fornecedores inclusive,
  // que ali não cabe como aba).
  const menu = celular
    ? [
        ...(novoItemFora && secao !== "fornecedores" ? [{ rotulo: "Item fora do orçamento", acao: novoItemFora }] : []),
        ...(secao === "estoque" && podeOperar && dado && itens.some((i) => !ehServico(i)) ? [{ rotulo: "Lançar entrada ou saída", acao: () => setLancando({ tipo: "saida" }) }] : []),
        ...(secao === "estoque" && podeOperar && dado ? [{ rotulo: "Novo item", acao: () => setModal({ k: "item" }) }] : []),
        ...(secao === "fornecedores" && podeOperar && dado ? [{ rotulo: "Novo fornecedor", acao: () => setModal({ k: "fornecedor" }) }] : []),
        ...(secao !== "fornecedores" ? [{ rotulo: "Fornecedores", acao: () => setSecao("fornecedores") }] : []),
      ]
    : secao === "estoque" && podeOperar && dado
      ? [{ rotulo: "Novo item", acao: () => setModal({ k: "item" }) }]
      : [];
  const SECOES: { k: Secao; rotulo: string; n?: number }[] = celular
    ? [
        { k: "compras", rotulo: "Comprar", n: nFalta },
        { k: "pedidos", rotulo: "Pedidos" },
        { k: "estoque", rotulo: "Estoque" },
      ]
    : [
        { k: "compras", rotulo: "Comprar", n: nFalta },
        { k: "estoque", rotulo: "Estoque" },
        { k: "fornecedores", rotulo: "Fornecedores" },
      ];
  const abas = (
    <div className={`seg ${s.seg}`} role="tablist" aria-label="Seções de Compras">
      {SECOES.map((x) => (
        <button
          key={x.k}
          type="button"
          role="tab"
          aria-selected={secao === x.k}
          aria-label={x.n ? `${x.rotulo} (${x.n})` : x.rotulo}
          className={secao === x.k ? "on" : ""}
          onClick={() => setSecao(x.k)}
        >
          {x.rotulo}
          {x.n ? celular ? ` · ${x.n.toLocaleString("pt-BR")}` : <small className={s.segN}>{x.n.toLocaleString("pt-BR")}</small> : null}
        </button>
      ))}
    </div>
  );
  const faltaComprar = (
    <FaltaComprar
      key={pedidosFeitos}
      itens={itens}
      etapas={etapas}
      fazerPedido={setMarcados}
      desfazendo={desfazendo}
      etapa={etapaRecorte}
      verTudo={() => setEtapaRecorte(null)}
      inicioEtapa={inicioEtapa}
    />
  );
  const listaPedidos = (titulo: boolean) => <ListaPedidos obra={obra} pedidos={pedidos} itens={itens} etapas={etapas} fornecedores={fornecedores} titulo={titulo} />;

  return (
    <div className={`page ${s.tela}`}>
      <CabecalhoTela
        titulo="Compras"
        contexto={
          secao === "compras"
            ? "O que falta comprar sai do orçamento aprovado, na ordem das etapas."
            : secao === "estoque"
              ? "Entradas, saídas e contagem do que está na obra."
              : "Quem fornece para a obra."
        }
        acoes={
          <>
            {secao === "compras" ? <BotaoPlumo rotulo="Pedir ao Plumo uma cotação" /> : null}
            {acao}
          </>
        }
        menu={menu}
        rotuloMenu="Mais ações de Compras"
      />
      {abas}
      {erro ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          {erro}
        </div>
      ) : null}
      {carregando && !dado ? (
        <div className="carregando" role="status">
          <Icone nome="loader" className="spin" tam={15} />
          Carregando as compras…
        </div>
      ) : dado ? (
        secao === "compras" ? (
          celular ? (
            faltaComprar
          ) : (
            // lado a lado: o que falta (a coluna larga) e os pedidos em cartões
            <div className={s.duas}>
              {faltaComprar}
              {listaPedidos(true)}
            </div>
          )
        ) : secao === "pedidos" ? (
          listaPedidos(false)
        ) : secao === "estoque" ? (
          <Itens obra={obra} itens={itens} etapas={etapas} lancar={setLancando} lancando={!!lancando} />
        ) : (
          <ListaFornecedores fornecedores={fornecedores} editar={podeOperar ? (f) => setModal({ k: "fornecedor", f }) : null} />
        )
      ) : null}

      {marcados ? <ModalPedidoMarcados obraId={obra.id} marcados={marcados} etapas={etapas} fornecedores={fornecedores} pedidos={pedidos} chave={chavePedido} fechar={() => setMarcados(null)} criado={() => setPedidosFeitos((n) => n + 1)} /> : null}
      {lancando?.tipo === "pedido" ? (
        <ModalNovoPedido
          chave={chavePedido}
          obraId={obra.id}
          itens={itens}
          etapas={etapas}
          fornecedores={fornecedores}
          insumoInicial={lancando.insumoId}
          fechar={() => setLancando(null)}
        />
      ) : lancando ? (
        <ModalMovimento
          obraId={obra.id}
          itens={itens.filter((i) => !ehServico(i))}
          etapas={etapas}
          insumoInicial={lancando.insumoId}
          tipoInicial={lancando.tipo}
          fechar={() => setLancando(null)}
        />
      ) : null}
      {modal?.k === "item" ? <ModalNovoItem obraId={obra.id} uf={obra.uf || "SP"} fechar={() => setModal(null)} /> : null}
      {modal?.k === "fornecedor" ? <ModalFornecedor fornecedor={modal.f} fechar={() => setModal(null)} /> : null}
    </div>
  );
}
