"use client";
/**
 * Os dados da obra, em três blocos que o cadastro mostra um por passo e a edição mostra juntos: onde (nome e
 * endereço), o que é (tipologia, área, padrão) e o contrato (regime, verba, prazo). Só o nome é obrigatório: quem
 * ainda não sabe a área não pode travar no cadastro, e o que faltar se completa depois.
 */
import type { DadosObra, Obra, Padrao, Regime, Tipologia } from "@/lib/contrato";
import { lerQtd, lerReais, qtdParaCampo, reaisParaCampo } from "@/lib/formato";
import { Campo } from "../formularios/Campos";

export const TIPOLOGIAS: { k: Tipologia; rotulo: string }[] = [
  { k: "casa", rotulo: "Casa térrea" },
  { k: "sobrado", rotulo: "Sobrado" },
  { k: "predio", rotulo: "Prédio" },
  { k: "galpao", rotulo: "Galpão" },
  { k: "comercial", rotulo: "Comercial" },
  { k: "reforma", rotulo: "Reforma" },
  { k: "outro", rotulo: "Outro" },
];

export const PADROES: { k: Padrao; rotulo: string; dica: string }[] = [
  { k: "baixo", rotulo: "Baixo", dica: "Acabamento simples: cerâmica, louça e metal de linha básica, pintura PVA." },
  { k: "normal", rotulo: "Normal", dica: "O mais comum: porcelanato de linha média, pintura acrílica, esquadria de alumínio." },
  { k: "alto", rotulo: "Alto", dica: "Acabamento fino: porcelanato grande ou pedra, metais de linha alta, automação." },
];

export const REGIMES: { k: Regime; rotulo: string; dica: string }[] = [
  { k: "empreitada", rotulo: "Empreitada", dica: "Preço fechado com o dono: o estouro sai da sua margem." },
  { k: "administracao", rotulo: "Administração", dica: "O dono paga o custo mais a sua taxa: o estouro é dele, e ele vai perguntar por quê." },
];

export interface FormObra {
  nome: string;
  cep: string;
  cidade: string;
  uf: string;
  endereco: string;
  tipologia: Tipologia | null;
  area: string;
  pavimentos: string;
  padrao: Padrao | null;
  regime: Regime | null;
  verba: string;
  inicio: string;
  prazo: string;
  cliente: string;
}

export type ErrosObra = Partial<Record<keyof FormObra, string | null>>;

export function formDe(o?: Obra): FormObra {
  return {
    nome: o?.nome ?? "",
    cep: o?.cep ?? "",
    cidade: o?.cidade ?? "",
    uf: o?.uf ?? "",
    endereco: o?.endereco ?? "",
    tipologia: o?.tipologia ?? null,
    area: o?.area_construida ? qtdParaCampo(o.area_construida) : "",
    pavimentos: o?.pavimentos ? String(o.pavimentos) : "",
    padrao: o?.padrao ?? null,
    regime: o?.regime ?? null,
    verba: o?.verba ? reaisParaCampo(o.verba) : "",
    inicio: o?.inicio ?? "",
    prazo: o?.prazo_meses ? String(o.prazo_meses) : "",
    cliente: o?.cliente ?? "",
  };
}

const inteiro = (t: string) => (t.trim() === "" ? 0 : /^\d+$/.test(t.trim()) ? Number(t.trim()) : null);

/** Erros de um bloco (ou de todos): só o que a API recusaria ou que certamente é dedo errado. */
export function validarObra(f: FormObra, bloco: "onde" | "oque" | "contrato" | "tudo"): ErrosObra {
  const e: ErrosObra = {};
  if (bloco === "onde" || bloco === "tudo") {
    e.nome = f.nome.trim() ? (f.nome.trim().length > 120 ? "Nome muito longo (até 120 letras)." : null) : "Dê um nome para a obra, ex.: Casa Jardim Europa.";
    e.cep = f.cep.trim() && !/^\d{5}-?\d{3}$/.test(f.cep.trim()) ? "CEP com 8 números, ex.: 13025-320." : null;
    e.uf = f.uf.trim() && !/^[A-Za-z]{2}$/.test(f.uf.trim()) ? "UF com 2 letras, ex.: SP." : null;
  }
  if (bloco === "oque" || bloco === "tudo") {
    const a = f.area.trim() ? lerQtd(f.area) : 0;
    e.area = a === null ? "Digite a área em m², ex.: 142 ou 142,5." : null;
    const p = inteiro(f.pavimentos);
    e.pavimentos = p === null || p > 200 ? "Número de pavimentos, ex.: 2." : null;
  }
  if (bloco === "contrato" || bloco === "tudo") {
    e.verba = f.verba.trim() && lerReais(f.verba) === null ? "Digite a verba em reais, ex.: 850.000." : null;
    const m = inteiro(f.prazo);
    e.prazo = m === null || m > 240 ? "Prazo em meses, ex.: 14." : null;
  }
  return e;
}

/** O que mudou em relação à obra (ou tudo, no cadastro), já nas unidades da API. Chamar só depois de validar. */
export function dadosDe(f: FormObra, antes?: Obra): DadosObra {
  const cep = f.cep.replace(/\D/g, "");
  const d: DadosObra = {
    nome: f.nome.replace(/\s+/g, " ").trim(),
    cep: cep ? `${cep.slice(0, 5)}-${cep.slice(5)}` : "",
    cidade: f.cidade.trim(),
    uf: f.uf.trim().toUpperCase(),
    endereco: f.endereco.trim(),
    tipologia: f.tipologia,
    area_construida: f.area.trim() ? lerQtd(f.area)! : 0,
    pavimentos: inteiro(f.pavimentos)!,
    padrao: f.padrao,
    regime: f.regime,
    verba: f.verba.trim() ? lerReais(f.verba)! : 0,
    inicio: f.inicio || null,
    prazo_meses: inteiro(f.prazo)!,
    cliente: f.cliente.trim(),
  };
  if (!antes) return d;
  return Object.fromEntries(Object.entries(d).filter(([k, v]) => (antes as unknown as Record<string, unknown>)[k] !== v)) as DadosObra;
}

/** CEP → cidade e UF pelo ViaCEP. Ajuda, não depende: se falhar, a pessoa digita. */
export async function buscarCep(cep: string): Promise<{ cidade: string; uf: string; endereco: string } | null> {
  const n = cep.replace(/\D/g, "");
  if (n.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${n}/json/`);
    const j = (await r.json()) as { erro?: boolean; localidade?: string; uf?: string; logradouro?: string; bairro?: string };
    if (!r.ok || j.erro) return null;
    return { cidade: j.localidade ?? "", uf: j.uf ?? "", endereco: [j.logradouro, j.bairro].filter(Boolean).join(", ") };
  } catch {
    return null;
  }
}

type Props = { f: FormObra; mudar: (p: Partial<FormObra>) => void; erros: ErrosObra; nomeRef?: React.Ref<HTMLInputElement> };

export function CamposOnde({ f, mudar, erros, nomeRef }: Props) {
  const aoSairCep = async () => {
    const r = await buscarCep(f.cep);
    // Só preenche o que está vazio: não apaga o que a pessoa já digitou.
    if (r) mudar({ cidade: f.cidade || r.cidade, uf: f.uf || r.uf, endereco: f.endereco || r.endereco });
  };
  return (
    <>
      <Campo rotulo="Nome da obra" erro={erros.nome} dica="Como a equipe chama a obra no dia a dia.">
        {(a) => (
          <input
            {...a}
            ref={nomeRef}
            className="f"
            autoComplete="off"
            placeholder="Ex.: Casa Jardim Europa"
            value={f.nome}
            onChange={(e) => mudar({ nome: e.target.value })}
          />
        )}
      </Campo>
      <div className="campos2">
        <Campo rotulo="CEP (opcional)" erro={erros.cep} dica="Preenche cidade e UF. A UF define a tabela de preços de referência.">
          {(a) => (
            <input
              {...a}
              className="f"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              value={f.cep}
              onChange={(e) => mudar({ cep: e.target.value })}
              onBlur={aoSairCep}
            />
          )}
        </Campo>
        <div className="campos-cidade">
          <Campo rotulo="Cidade" erro={erros.cidade}>
            {(a) => <input {...a} className="f" autoComplete="address-level2" value={f.cidade} onChange={(e) => mudar({ cidade: e.target.value })} />}
          </Campo>
          <Campo rotulo="UF" erro={erros.uf}>
            {(a) => (
              <input
                {...a}
                className="f"
                autoComplete="address-level1"
                maxLength={2}
                value={f.uf}
                onChange={(e) => mudar({ uf: e.target.value.toUpperCase() })}
              />
            )}
          </Campo>
        </div>
      </div>
      <Campo rotulo="Endereço (opcional)">
        {(a) => <input {...a} className="f" autoComplete="street-address" value={f.endereco} onChange={(e) => mudar({ endereco: e.target.value })} />}
      </Campo>
    </>
  );
}

/** Grupo de escolha única em botões (role=radio), com setas como num radio nativo. */
export function Escolha<K extends string>(props: {
  rotulo: string;
  opcoes: { k: K; rotulo: string }[];
  valor: K | null;
  mudar: (k: K | null) => void;
  grade?: boolean;
}) {
  const { opcoes, valor, mudar } = props;
  const mover = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = opcoes[(i + d + opcoes.length) % opcoes.length]!;
    mudar(n.k);
    (e.currentTarget.parentElement?.children[(i + d + opcoes.length) % opcoes.length] as HTMLElement | undefined)?.focus();
  };
  const foco = Math.max(
    0,
    opcoes.findIndex((o) => o.k === valor),
  );
  return (
    <div className={props.grade ? "escolha-grade" : "seg"} role="radiogroup" aria-label={props.rotulo}>
      {opcoes.map((o, i) => (
        <button
          key={o.k}
          type="button"
          role="radio"
          aria-checked={valor === o.k}
          tabIndex={i === foco ? 0 : -1}
          className={valor === o.k ? "on" : ""}
          // Clicar de novo na escolhida desmarca: nenhum destes campos é obrigatório.
          onClick={() => mudar(valor === o.k ? null : o.k)}
          onKeyDown={(e) => mover(e, i)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function CamposOQue({ f, mudar, erros }: Props) {
  const padrao = PADROES.find((p) => p.k === f.padrao);
  return (
    <>
      <div className="campo">
        <span className="l">Tipo de obra</span>
        <Escolha rotulo="Tipo de obra" grade opcoes={TIPOLOGIAS} valor={f.tipologia} mudar={(k) => mudar({ tipologia: k })} />
      </div>
      <div className="campos2">
        <Campo rotulo="Área construída (m²)" erro={erros.area}>
          {(a) => (
            <input
              {...a}
              className="f"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex.: 142,5"
              value={f.area}
              onChange={(e) => mudar({ area: e.target.value })}
            />
          )}
        </Campo>
        <Campo rotulo="Pavimentos" erro={erros.pavimentos}>
          {(a) => (
            <input
              {...a}
              className="f"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 2"
              value={f.pavimentos}
              onChange={(e) => mudar({ pavimentos: e.target.value })}
            />
          )}
        </Campo>
      </div>
      <div className="campo">
        <span className="l">Padrão de acabamento</span>
        <Escolha rotulo="Padrão de acabamento" opcoes={PADROES} valor={f.padrao} mudar={(k) => mudar({ padrao: k })} />
        <p className="seg-dica mut sm">{padrao ? padrao.dica : "É o que mais mexe no preço por m²: a mesma área custa até o dobro do baixo para o alto."}</p>
      </div>
    </>
  );
}

export function CamposContrato({ f, mudar, erros }: Props) {
  const regime = REGIMES.find((r) => r.k === f.regime);
  return (
    <>
      <div className="campo">
        <span className="l">Regime de contratação</span>
        <Escolha rotulo="Regime de contratação" opcoes={REGIMES} valor={f.regime} mudar={(k) => mudar({ regime: k })} />
        {regime ? <p className="seg-dica mut sm">{regime.dica}</p> : null}
      </div>
      <div className="campos2">
        <Campo rotulo="Verba do dono (R$)" erro={erros.verba} dica="Quanto o dono quer gastar. O orçamento é comparado com ela.">
          {(a) => (
            <input
              {...a}
              className="f"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex.: 850.000"
              value={f.verba}
              onChange={(e) => mudar({ verba: e.target.value })}
            />
          )}
        </Campo>
        <Campo rotulo="Cliente (opcional)">
          {(a) => <input {...a} className="f" autoComplete="off" value={f.cliente} onChange={(e) => mudar({ cliente: e.target.value })} />}
        </Campo>
      </div>
      <div className="campos2">
        <Campo rotulo="Início previsto (opcional)">
          {(a) => <input {...a} type="date" className="f" value={f.inicio} onChange={(e) => mudar({ inicio: e.target.value })} />}
        </Campo>
        <Campo rotulo="Prazo (meses)" erro={erros.prazo}>
          {(a) => (
            <input
              {...a}
              className="f"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 14"
              value={f.prazo}
              onChange={(e) => mudar({ prazo: e.target.value })}
            />
          )}
        </Campo>
      </div>
    </>
  );
}
