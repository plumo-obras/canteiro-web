"use client";
/**
 * Item novo na obra, fora da planilha: material (tem estoque) ou serviço (contratado e medido, sem estoque). A
 * quantidade prevista é opcional; sem ela o item fica fora da conta de falta (a tela diz "sem quantidade prevista").
 */
import { useRef, useState } from "react";
import type { CurvaABC, TipoInsumo } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { lerQtd } from "@/lib/formato";
import { useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Campo, ErroApi, useEnvio } from "../formularios/Campos";
import { UNIDADES } from "../formularios/CampoInsumo";
import { BuscaProduto, type EscolhaProduto } from "./BuscaProduto";
import { fmtReais } from "@/lib/formato";

export function ModalNovoItem({ obraId, uf = "SP", fechar }: { obraId: string; uf?: string; fechar: () => void }) {
  const { avisarFeito, mudou } = useCasca();
  const [tipo, setTipo] = useState<TipoInsumo>("material");
  const [nome, setNome] = useState("");
  const [unidade, setUnidade] = useState("");
  const [curva, setCurva] = useState<CurvaABC>("C");
  const [prevista, setPrevista] = useState("");
  const [refPreco, setRefPreco] = useState<{ valor: number | null; fonte: string } | null>(null);
  const q = prevista.trim() ? lerQtd(prevista) : 0;
  const primeiro = useRef<HTMLButtonElement>(null);

  function aoEscolher(e: EscolhaProduto) {
    setNome(e.nome);
    setUnidade(e.unidade);
    setRefPreco({ valor: e.valorCentavos, fonte: e.fonte });
  }
  // a unidade da tabela (ex.: "vb") pode não estar na lista: entra como opção para o cadastro não travar
  const unidades = [...new Set([...UNIDADES, ...(tipo === "servico" ? ["vb", "h", "dia", "mês"] : []), ...(unidade ? [unidade] : [])])];

  const { erros, erroApi, ocupado, enviar } = useEnvio(
    () => ({
      nome: !nome.trim() ? "Dê o nome do item, ex.: Terraplanagem do lote." : nome.trim().length > 120 ? "Nome muito longo (até 120 letras)." : null,
      unidade: unidade ? null : "Escolha a unidade.",
      prevista: q === null ? "Digite a quantidade, ex.: 850 ou 2,5." : null,
    }),
    async () => {
      const i = await api.criarInsumo(obraId, { nome: nome.replace(/\s+/g, " ").trim(), unidade, tipo, curva, precisa_ate_o_fim: q ?? 0, valor_unitario: refPreco?.valor ?? undefined });
      mudou();
      fechar();
      avisarFeito(`${tipo === "servico" ? "Serviço" : "Material"} ${i.nome} cadastrado.`, i.registro_id);
    },
  );

  return (
    <Modal
      titulo="Novo item"
      fechar={fechar}
      focoInicial={primeiro}
      rodape={
        <>
          <button type="button" className="btn" onClick={fechar}>
            Voltar
          </button>
          <button type="submit" form="form-item" className="btn amb" disabled={ocupado} aria-busy={ocupado}>
            Cadastrar {tipo === "servico" ? "serviço" : "material"}
          </button>
        </>
      }
    >
      <form id="form-item" onSubmit={enviar} noValidate>
        <div className="seg" role="radiogroup" aria-label="Material ou serviço">
          {(["material", "servico"] as const).map((k, i) => (
            <button
              key={k}
              ref={i === 0 ? primeiro : undefined}
              type="button"
              role="radio"
              aria-checked={tipo === k}
              className={tipo === k ? "on" : ""}
              onClick={() => setTipo(k)}
            >
              {k === "material" ? "Material" : "Serviço"}
            </button>
          ))}
        </div>
        <p className="seg-dica mut sm">
          {tipo === "material"
            ? "Tem estoque: entra pelo pedido ou pela entrada, sai para a obra."
            : "Sem estoque (terraplanagem, aterro, empreiteiro): é contratado no pedido e medido na entrega."}
        </p>
        <BuscaProduto uf={uf} aoEscolher={aoEscolher} />
        <Campo rotulo="Nome" erro={erros.nome}>
          {(a) => <input {...a} className="f" autoComplete="off" value={nome} onChange={(e) => { setNome(e.target.value); setRefPreco(null); }} />}
        </Campo>
        {refPreco ? (
          <p className="seg-dica mut sm">
            Preço de referência: <b>{refPreco.valor != null ? fmtReais(refPreco.valor) : "sem preço nesta UF"}</b> · {refPreco.fonte}
          </p>
        ) : null}
        <div className="campos2">
          <Campo rotulo="Unidade" erro={erros.unidade}>
            {(a) => (
              <select {...a} className="f" value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                <option value="">Escolha…</option>
                {unidades.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            )}
          </Campo>
          <Campo rotulo="Curva ABC">
            {(a) => (
              <select {...a} className="f" value={curva} onChange={(e) => setCurva(e.target.value as CurvaABC)}>
                <option value="A">A · caro ou crítico</option>
                <option value="B">B · intermediário</option>
                <option value="C">C · miúdo</option>
              </select>
            )}
          </Campo>
        </div>
        <Campo
          rotulo={`Quantidade prevista até o fim da obra${unidade ? ` (${unidade})` : ""} (opcional)`}
          erro={erros.prevista}
          dica="É o que entra na conta de falta. Sem ela, o item aparece como «sem quantidade prevista»."
        >
          {(a) => <input {...a} className="f" inputMode="decimal" autoComplete="off" placeholder="Ex.: 850" value={prevista} onChange={(e) => setPrevista(e.target.value)} />}
        </Campo>
        <ErroApi texto={erroApi} />
      </form>
    </Modal>
  );
}
