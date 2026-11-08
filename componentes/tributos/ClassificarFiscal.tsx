"use client";
/**
 * O que um gasto comprova para os tributos (admin): a natureza (mão de obra com nota, folha, concreto…) e o IBS/CBS
 * destacado na nota, que vira crédito. Na nota de mão de obra, se ela traz o CNO da obra (sem ele a Receita não liga a
 * nota à obra) e a retenção de 11%. Quanto cada natureza abate do INSS vem da API (`parametros`), nunca daqui.
 */
import { useId, useState } from "react";
import type { GastoAClassificar, NaturezaFiscal } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { fmtReais, lerReais, reaisParaCampo } from "@/lib/formato";
import { mensagemDe, useCasca } from "../contexto";
import { Modal } from "../Dialogo";
import { Icone } from "../Icone";
import { pctParaCampo } from "../obra/CamposObra";
import { NATUREZAS, rotuloNatureza } from "./rotulos";

export function ClassificarFiscal(p: {
  gasto: GastoAClassificar;
  /** natureza → centésimos de ponto que abate da mão de obra presumida, como a API devolveu. */
  abatimento: Partial<Record<NaturezaFiscal, number>>;
  fechar: () => void;
}) {
  const { mudou, avisarFeito } = useCasca();
  const [natureza, setNatureza] = useState<NaturezaFiscal | "">(p.gasto.natureza_fiscal ?? "");
  const [ibs, setIbs] = useState("");
  const [cno, setCno] = useState(p.gasto.nf_cno === true);
  const [retencao, setRetencao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const id = useId();
  const valorIbs = ibs.trim() ? lerReais(ibs) : 0;
  const valorRetencao = retencao.trim() ? lerReais(retencao) : 0;
  const escolhida = NATUREZAS.find((n) => n.k === natureza);
  const nota = natureza === "mao_de_obra_nf";
  // o percentual direto só faz sentido onde o abatimento é uma fração do valor pago (folha, nota de mão de obra);
  // concreto, pré-moldado, GPS e autônomo têm regra própria, que a dica da natureza já explica
  const pct = natureza === "folha" || natureza === "mao_de_obra_nf" ? p.abatimento[natureza] : undefined;

  const salvar = async () => {
    if (valorIbs === null || (nota && valorRetencao === null)) {
      setErro(valorIbs === null ? "Digite o IBS/CBS em reais, ex.: 150,00." : "Digite a retenção em reais, ex.: 1.100,00.");
      return;
    }
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.classificarFiscal(p.gasto.id, {
        natureza_fiscal: natureza || null,
        ibs_cbs: valorIbs,
        ...(nota ? { nf_cno: cno, retencao: valorRetencao ?? 0 } : {}),
      });
      mudou();
      avisarFeito(`${rotuloNatureza(natureza || null)}: ${fmtReais(p.gasto.valor)}.`, r.registro_id);
      p.fechar();
    } catch (e) {
      setErro(mensagemDe(e));
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo="Classificar para os tributos"
      fechar={p.fechar}
      rodape={
        <>
          <button type="button" className="btn" onClick={p.fechar}>
            Cancelar
          </button>
          <button type="button" className="btn amb" disabled={ocupado} aria-busy={ocupado} onClick={salvar}>
            {ocupado ? <Icone nome="loader" className="spin" tam={14} /> : null}
            Salvar
          </button>
        </>
      }
    >
      <p className="mut sm">
        {p.gasto.descricao} · {p.gasto.favorecido} · {fmtReais(p.gasto.valor)}
      </p>
      <div className="campo">
        <label className="l" htmlFor={`${id}-n`}>
          O que foi pago
        </label>
        <select id={`${id}-n`} className="f" value={natureza} aria-describedby={`${id}-nd`} onChange={(e) => setNatureza(e.target.value as NaturezaFiscal | "")}>
          <option value="">A classificar</option>
          {NATUREZAS.map((n) => (
            <option key={n.k} value={n.k}>
              {n.rotulo}
            </option>
          ))}
        </select>
        <div id={`${id}-nd`} className="campo-dica">
          {escolhida ? escolhida.dica : "Sem classificação, o gasto não reduz o INSS da obra."}
          {pct !== undefined ? ` Reduz a mão de obra presumida em ${pctParaCampo(pct)}% do valor.` : null}
        </div>
      </div>
      {nota ? (
        <>
          <div className="campo">
            <label className="check">
              <input type="checkbox" checked={cno} onChange={(e) => setCno(e.target.checked)} aria-describedby={`${id}-cd`} />
              <span>A nota traz o CNO e o endereço da obra</span>
            </label>
            <div id={`${id}-cd`} className="campo-dica">
              Sem eles a Receita não liga a nota a esta obra e ela não reduz o INSS. Peça ao prestador para corrigir.
            </div>
          </div>
          <div className="campo">
            <label className="l" htmlFor={`${id}-r`}>
              Retenção de 11% na nota (R$)
            </label>
            <input
              id={`${id}-r`}
              className="f"
              inputMode="decimal"
              placeholder={reaisParaCampo(Math.round(p.gasto.valor * 0.11))}
              value={retencao}
              aria-describedby={`${id}-rd`}
              onChange={(e) => setRetencao(e.target.value)}
            />
            <div id={`${id}-rd`} className="campo-dica">
              Obrigatória quando quem contrata é empresa; pessoa física não retém.
            </div>
          </div>
        </>
      ) : null}
      <div className="campo">
        <label className="l" htmlFor={`${id}-i`}>
          IBS/CBS destacado na nota (R$)
        </label>
        <input
          id={`${id}-i`}
          className="f"
          inputMode="decimal"
          placeholder={reaisParaCampo(0)}
          value={ibs}
          aria-describedby={`${id}-id`}
          onChange={(e) => setIbs(e.target.value)}
        />
        <div id={`${id}-id`} className="campo-dica">
          Opcional. Vira crédito no IBS/CBS da obra.
        </div>
      </div>
      {erro ? (
        <div className="aviso-erro form-erro" role="alert">
          {erro}
        </div>
      ) : null}
    </Modal>
  );
}
