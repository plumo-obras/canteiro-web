"use client";
/**
 * Lançar no almoxarifado: saída (foi usado ou perdido), entrada sem pedido (sobra de outra obra, compra no balcão) e
 * contagem. Na contagem a pessoa diz quanto TEM, não quanto ajustar: é o que ela acabou de contar, e a conta da
 * diferença é nossa. Saída de curva A exige a frente de serviço (a mesma regra de regras.validar_saida). Só a entrada
 * aceita insumo novo: o que nunca entrou não tem saldo para sair nem para contar. A saída diz a etapa do orçamento
 * onde o material foi usado (apropriação do consumo), obrigatória quando a obra tem orçamento importado.
 */
import { useRef, useState } from "react";
import type { EtapaObra, ItemInsumo } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { uuid7 } from "@/lib/ids";
import { fmtQtdUn, lerQtd } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Campo, ErroApi, useEnvio } from "./Campos";
import { CampoInsumo, CamposInsumoNovo, useInsumoNovo, type EscolhaInsumo } from "./CampoInsumo";

export type TipoLancamento = "saida" | "entrada" | "contagem";

const TIPOS: { k: TipoLancamento; rotulo: string }[] = [
  { k: "saida", rotulo: "Saída" },
  { k: "entrada", rotulo: "Entrada" },
  { k: "contagem", rotulo: "Contagem" },
];

export function ModalMovimento(props: {
  obraId: string;
  itens: ItemInsumo[];
  etapas?: EtapaObra[];
  insumoInicial?: string;
  tipoInicial?: TipoLancamento;
  fechar: () => void;
}) {
  const etapas = props.etapas ?? [];
  const [etapa, setEtapa] = useState("");
  const { avisarFeito, mudou } = useCasca();
  const [tipo, setTipo] = useState<TipoLancamento>(props.tipoInicial ?? "saida");
  const [escolha, setEscolha] = useState<EscolhaInsumo>(props.insumoInicial ? { tipo: "existente", id: props.insumoInicial } : null);
  const novo = useInsumoNovo(props.obraId);
  const insumoId = escolha?.tipo === "existente" ? escolha.id : "";
  const [qtd, setQtd] = useState("");
  const [texto, setTexto] = useState("");
  // Uma chave por tentativa: o reenvio do mesmo lançamento não entra em dobro. Depois de um erro a pessoa pode mudar
  // o formulário, e a mesma chave com outro conteúdo a API recusa (409); por isso ela troca a cada falha.
  const chave = useRef(uuid7());
  const primeiro = useRef<HTMLElement>(null);
  const item = props.itens.find((i) => i.insumo.id === insumoId);
  const un = item?.insumo.unidade ?? (escolha?.tipo === "novo" ? novo.unidade : "");
  const saldo = item?.conta.saldo ?? 0;
  const q = lerQtd(qtd);
  const ajuste = tipo === "contagem" && q !== null ? q - saldo : null;
  const curvaA = item?.insumo.curva === "A";
  // Contagem que muda mais da metade do que a obra usa quase sempre é dedo errado (2700 no lugar de 27,00).
  const salto = ajuste !== null && !!item && Math.abs(ajuste) > Math.max(item.conta.precisa, saldo) / 2;

  const rotuloTexto = tipo === "saida" ? `Para onde foi${curvaA ? "" : " (opcional)"}` : tipo === "entrada" ? "De onde veio (opcional)" : "Motivo (opcional)";
  const dicaTexto =
    tipo === "saida"
      ? curvaA
        ? "Item curva A: diga a frente de serviço (ex.: Alvenaria do 1º andar)."
        : "Ex.: Reboco interno, quebra no descarregamento."
      : tipo === "entrada"
        ? "Ex.: NF 5120, sobra da obra Jardim Europa."
        : "Ex.: quebra, erro de lançamento.";

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      insumo: !escolha
        ? tipo === "entrada"
          ? "Digite o nome do insumo e escolha na lista (ou cadastre um novo)."
          : "Escolha um insumo da lista. Material novo entra pela aba Entrada."
        : escolha.tipo === "novo" && tipo !== "entrada"
          ? "Este insumo ainda não existe na obra. Se o material chegou, lance uma entrada."
          : null,
      unidade: escolha?.tipo === "novo" && tipo === "entrada" && !novo.unidade ? "Escolha a unidade." : null,
      qtd:
        q === null
          ? "Digite a quantidade, ex.: 12 ou 2,5."
          : tipo !== "contagem" && q === 0
            ? "A quantidade tem de ser maior que zero."
            : tipo === "contagem" && ajuste === 0
              ? "Bate com o saldo: não há o que ajustar."
              : tipo === "saida" && item && q > saldo
                ? `Sai mais do que o saldo (${fmtQtdUn(saldo, un)}). Se o saldo está errado, faça uma contagem.`
                : null,
      texto: tipo === "saida" && curvaA && !texto.trim() ? "Item curva A só sai com a frente de serviço." : null,
      etapa: tipo === "saida" && etapas.length && !etapa ? "Escolha a etapa onde o material foi usado." : null,
    }),
    async () => {
      const t = texto.trim() || null;
      const ins = await novo.garantir(escolha, props.itens);
      const m = await api
        .lancarMovimento(props.obraId, {
          insumo_id: ins.id,
          tipo: tipo === "contagem" ? "ajuste" : tipo,
          quantidade: tipo === "contagem" ? ajuste! : q!,
          destino: tipo === "entrada" ? null : t,
          origem_doc: tipo === "entrada" ? t : tipo === "contagem" ? "Contagem" : null,
          ...(tipo === "saida" && etapa ? { etapa } : {}),
          chave_idempotencia: chave.current,
        })
        .catch((x) => {
          chave.current = uuid7();
          throw x;
        });
      mudou();
      props.fechar();
      const nome = ins.nome;
      avisarFeito(
        tipo === "saida"
          ? `Saída de ${fmtQtdUn(q!, un)} de ${nome} lançada.`
          : tipo === "entrada"
            ? `Entrada de ${fmtQtdUn(q!, un)} de ${nome} lançada.`
            : `Saldo de ${nome} ajustado para ${fmtQtdUn(q!, un)}.`,
        m.registro_id,
      );
    },
  );

  const rotuloBotao =
    q === null || !escolha
      ? "Lançar"
      : tipo === "saida"
        ? `Lançar saída de ${fmtQtdUn(q, un)}`
        : tipo === "entrada"
          ? `Lançar entrada de ${fmtQtdUn(q, un)}`
          : `Ajustar saldo para ${fmtQtdUn(q, un)}`;

  return (
    <Modal
      titulo="Lançar no almoxarifado"
      fechar={props.fechar}
      focoInicial={primeiro}
      rodape={
        <>
          <button type="button" className="btn" onClick={props.fechar}>
            Voltar
          </button>
          <button type="submit" form="form-mov" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            {rotuloBotao}
          </button>
        </>
      }
    >
      <form id="form-mov" onSubmit={enviar} noValidate>
        <div className="seg" role="radiogroup" aria-label="O que aconteceu">
          {TIPOS.map((t, i) => (
            <button
              key={t.k}
              type="button"
              role="radio"
              aria-checked={tipo === t.k}
              ref={i === 0 ? (primeiro as React.RefObject<HTMLButtonElement>) : undefined}
              className={tipo === t.k ? "on" : ""}
              onClick={() => setTipo(t.k)}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
        <p className="seg-dica mut sm">
          {tipo === "saida"
            ? "Material que foi usado, perdido ou levado para outra obra."
            : tipo === "entrada"
              ? "Material que chegou sem pedido no Plumo. Entrega de pedido se registra no próprio pedido."
              : "Você contou o estoque: diga quanto tem e o saldo é ajustado pela diferença."}
        </p>
        <Campo rotulo="Insumo" erro={erros.insumo} dica={item ? `Tem agora: ${fmtQtdUn(saldo, un)}` : undefined}>
          {(a) => <CampoInsumo a={a} itens={props.itens} valor={escolha} mudar={setEscolha} permitirNovo={tipo === "entrada"} dicaSemNovo="Material novo entra pela aba Entrada." />}
        </Campo>
        {escolha?.tipo === "novo" && tipo === "entrada" ? <CamposInsumoNovo nome={escolha.nome} novo={novo} erroUnidade={erros.unidade} /> : null}
        <Campo
          rotulo={`${tipo === "contagem" ? "Quanto tem agora" : "Quantidade"}${un ? ` (${un})` : ""}`}
          erro={erros.qtd}
          dica={
            ajuste !== null && ajuste !== 0 && !erros.qtd
              ? `${ajuste > 0 ? "Sobe" : "Desce"} ${fmtQtdUn(Math.abs(ajuste), un)} em relação ao saldo.${salto ? " É muita diferença: confira se digitou certo." : ""}`
              : undefined
          }
          alerta={salto}
        >
          {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" value={qtd} onChange={(e) => setQtd(e.target.value)} />}
        </Campo>
        {tipo === "saida" && etapas.length ? (
          <Campo rotulo="Etapa do orçamento" erro={erros.etapa} dica="Onde o material foi usado: o consumo conta nesta etapa.">
            {(a) => (
              <select {...a} className="f" value={etapa} onChange={(e) => setEtapa(e.target.value)}>
                <option value="">Escolha…</option>
                {etapas.map((e) => (
                  <option key={e.etapa} value={e.etapa}>
                    {e.etapa} · {e.descricao}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        ) : null}
        <Campo rotulo={rotuloTexto} erro={erros.texto} dica={dicaTexto}>
          {(a) => <input {...a} className="f" autoComplete="off" value={texto} onChange={(e) => setTexto(e.target.value)} />}
        </Campo>
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
