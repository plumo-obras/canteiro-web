"use client";
/**
 * Página inicial depois do login: uma visão de todas as obras para decidir onde entrar. Os números vêm prontos de
 * GET /obras/resumo (somados na API); aqui só se escolhe o que destacar. "Abrir obra" entra no workspace na conversa
 * mais recente da obra (ou numa nova), pelo ?obra=&sessao= que a Casca lê.
 */
import Link from "next/link";
import { useState } from "react";
import { situacaoPrazo } from "../cronograma/Cronograma";
import { fmtMesLongo } from "@/lib/cronograma";
import type { PrazoCronograma, ResumoObra, StatusObra, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import type { SessaoApi } from "@/lib/historico";
import type { Tela } from "../sessoes";
import { fmtReais } from "@/lib/formato";
import { BarraFiltros, CabecalhoPagina } from "../CabecalhoPagina";
import { Icone } from "../Icone";
import { useCarregar } from "../useCarregar";
import { Paginacao, usePaginas } from "../Paginacao";
import s from "./inicio.module.css";
import { haQuanto, primeiroNome } from "./tempo";

const TXT_STATUS: Record<StatusObra, string> = { em_andamento: "Em andamento", em_orcamento: "Em orçamento", concluida: "Concluída", desfazendo_aprovacao: "Desfazendo a aprovação" };
const ORDEM_STATUS: Record<StatusObra, number> = { em_andamento: 0, em_orcamento: 1, concluida: 2, desfazendo_aprovacao: 0 };

const POR_PAGINA = 12;
const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Link do workspace para a obra: a sessão mais recente dela (a lista vem das mais novas) ou uma conversa nova. Com `tela`,
 * abre direto nela (o aviso de aprovação cai em Aprovações, não na conversa).
 */
export function hrefDaObra(obraId: string, sessoes: SessaoApi[], tela?: Tela) {
  const recente = sessoes.find((x) => x.obra_id === obraId);
  const p = new URLSearchParams({ obra: obraId });
  if (recente) p.set("sessao", recente.id);
  if (tela) p.set("tela", tela);
  return `/?${p}`;
}

export interface Aviso {
  chave: string;
  texto: string;
  tom: "warn" | "info";
  obraId: string;
  tela: Tela;
}

/**
 * Os avisos do topo, um por obra e por tipo: o que espera alguém, com o nome da obra junto para o link dizer aonde vai.
 * Só aprovações e NFs a conferir: compra e entrega já estão no cartão da obra, e aqui viraria lista de tarefas.
 */
export function avisosDe(resumos: ResumoObra[]): Aviso[] {
  const aprovacoes = resumos
    .filter((r) => r.pendencias)
    .map((r) => ({
      chave: `apr-${r.obra.id}`,
      texto: `${plural(r.pendencias, "aprovação", "aprovações")} · ${r.obra.nome}`,
      tom: "warn" as const,
      obraId: r.obra.id,
      tela: "aprovacoes" as const,
    }));
  const nfs = resumos
    .filter((r) => r.nf_para_conferir)
    .map((r) => ({
      chave: `nf-${r.obra.id}`,
      texto: `${plural(r.nf_para_conferir, "NF para conferir", "NFs para conferir")} · ${r.obra.nome}`,
      tom: "info" as const,
      obraId: r.obra.id,
      tela: "suprimentos" as const,
    }));
  return [...aprovacoes, ...nfs];
}

const MAX_AVISOS = 6;

export function Inicio({ usuario }: { usuario: Usuario }) {
  const [tentativa, setTentativa] = useState(0);
  const { dado, erro, carregando } = useCarregar(
    // O histórico só escolhe a sessão do link: se falhar, o cartão abre uma conversa nova e a página segue.
    () => Promise.all([api.resumoObras(), api.listarSessoes({ limite: 100 }).catch(() => [] as SessaoApi[])]),
    [tentativa],
  );
  const [resumos, sessoes] = dado ?? [null, []];
  const ordenados = resumos
    ? [...resumos].sort((a, b) => ORDEM_STATUS[a.obra.status] - ORDEM_STATUS[b.obra.status] || a.obra.nome.localeCompare(b.obra.nome, "pt-BR"))
    : null;
  const avisos = avisosDe(resumos ?? []);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusObra | "todas">("todas");
  const q = normal(busca);
  const filtrados = (ordenados ?? []).filter(
    (r) => (status === "todas" || r.obra.status === status) && (!q || normal(`${r.obra.nome} ${r.obra.cidade} ${r.obra.cliente ?? ""}`).includes(q)),
  );
  const pag = usePaginas(filtrados, POR_PAGINA, [busca, status]);
  const conta = (st: StatusObra) => (resumos ?? []).filter((r) => r.obra.status === st).length;

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${primeiroNome(usuario.nome)}`}
        sub={
          resumos?.length ? (
            <>
              {plural(resumos.length, "obra", "obras")}
              {conta("em_andamento") ? ` · ${conta("em_andamento")} em andamento` : null}
            </>
          ) : undefined
        }
        acao={
          usuario.papel !== "viewer" ? (
            <Link href="/obras/nova" className="btn amb">
              <Icone nome="plus" tam={15} />
              Nova obra
            </Link>
          ) : null
        }
      />

      {erro && !resumos ? (
        <div className="aviso-erro" role="alert">
          <Icone nome="alert" tam={15} />
          <span>
            Não consegui carregar as obras: {erro}{" "}
            <button type="button" className={s.denovo} onClick={() => setTentativa((n) => n + 1)}>
              Tentar de novo
            </button>
          </span>
        </div>
      ) : !ordenados ? (
        <div className={s.grade} aria-busy={carregando} aria-label="Carregando obras">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${s.cartao} ${s.esqueleto}`} aria-hidden="true">
              <span className={s.osso} style={{ width: "34%" }} />
              <span className={s.osso} style={{ width: "62%", height: 22 }} />
              <span className={s.osso} style={{ width: "100%", height: 96 }} />
            </div>
          ))}
        </div>
      ) : !ordenados.length ? (
        <div className="card vazio">
          <Icone nome="info" tam={24} />
          <h3>Nenhuma obra ainda</h3>
          <p>Cadastre a primeira obra: nome e endereço bastam para começar, e o próximo passo é o orçamento.</p>
          {usuario.papel !== "viewer" ? (
            <Link href="/obras/nova" className="btn amb">
              Cadastrar obra
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {avisos.length ? (
            <nav className={s.avisos} aria-label="Esperando você">
              {avisos.slice(0, MAX_AVISOS).map((a) => (
                <Link key={a.chave} href={hrefDaObra(a.obraId, sessoes, a.tela)} className={`${s.etiqueta} ${a.tom}`}>
                  <span className={s.bola} aria-hidden="true" />
                  {a.texto}
                </Link>
              ))}
              {avisos.length > MAX_AVISOS ? <span className={s.maisAvisos}>e mais {avisos.length - MAX_AVISOS} nos cartões</span> : null}
            </nav>
          ) : null}
          {/* uma obra só não tem o que buscar nem filtrar */}
          {ordenados.length > 1 ? (
            <BarraFiltros
              busca={{ valor: busca, mudar: setBusca, placeholder: "Buscar por nome, cidade ou cliente", rotulo: "Buscar obra" }}
              grupos={[
                {
                  rotulo: "Situação",
                  valor: status,
                  opcoes: (["todas", "em_andamento", "em_orcamento", "concluida"] as const).map((st) => ({
                    k: st,
                    rotulo: `${st === "todas" ? "Todas" : TXT_STATUS[st]} (${st === "todas" ? resumos!.length : conta(st)})`,
                  })),
                  mudar: (k: StatusObra | "todas") => setStatus(k),
                },
              ]}
            />
          ) : null}
          {filtrados.length ? (
            <ul className={s.grade} aria-label="Obras">
              {pag.visiveis.map((r) => (
                <CartaoObra key={r.obra.id} r={r} href={hrefDaObra(r.obra.id, sessoes)} />
              ))}
            </ul>
          ) : (
            <div className="card vazio">
              <Icone nome="busca" tam={24} />
              <h3>Nenhuma obra encontrada</h3>
              <p>Nada com «{busca.trim() || TXT_STATUS[status as StatusObra]}». Tente outro nome ou limpe o filtro.</p>
            </div>
          )}
          <Paginacao pagina={pag.pagina} total={pag.total} mudar={pag.setPagina} quantos={filtrados.length} porPagina={POR_PAGINA} nome="obras" />
        </>
      )}
    </>
  );
}

/** Só o que pede ação, em frases curtas; zero não aparece. Sem nada pendente, "Tudo em dia". */
export function pendenciasDe(r: ResumoObra): { texto: string; tom: "pede" | "falta" | "info" }[] {
  const ps: { texto: string; tom: "pede" | "falta" | "info" }[] = [];
  if (r.pendencias) ps.push({ texto: plural(r.pendencias, "aprovação esperando você", "aprovações esperando você"), tom: "pede" });
  if (r.nf_para_conferir) ps.push({ texto: plural(r.nf_para_conferir, "NF para conferir", "NFs para conferir"), tom: "pede" });
  if (r.falta_comprar) ps.push({ texto: `${plural(r.falta_comprar, "insumo", "insumos")} a comprar`, tom: "falta" });
  if (r.pedidos_abertos)
    ps.push({ texto: `${plural(r.pedidos_abertos, "pedido a receber", "pedidos a receber")} · ${fmtReais(r.valor_pedidos_abertos)}`, tom: "info" });
  return ps;
}

/** "Termina set/2027 · em dia" ou "Termina out/2027 · 0,8 mês de atraso": a mesma frase do topo do cronograma. */
export function frasePrazo(p: PrazoCronograma): { termina: string; sit: { texto: string; tom: string } | null } {
  const sit = situacaoPrazo(p);
  const projetado = sit && p.termino_projetado && p.termino_projetado !== p.termino_contratual;
  return { termina: fmtMesLongo(projetado ? p.termino_projetado : p.termino_contratual), sit };
}

function FrasePrazo({ p }: { p: PrazoCronograma }) {
  const f = frasePrazo(p);
  return (
    <span className={s.prazo}>
      {f.termina}
      {f.sit ? (
        <>
          {" · "}
          <span data-tom={f.sit.tom}>{f.sit.texto}</span>
        </>
      ) : null}
    </span>
  );
}

const TOM_PEND = { pede: "warn", falta: "bad", info: "info" } as const;

/** O selo da situação: verde andando, azul em orçamento, cinza parada ou concluída, ocre desfazendo. */
function seloStatus(r: ResumoObra): { texto: string; classe: string } {
  const st = r.obra.status;
  // "Em orçamento" numa obra sem orçamento nenhum diz o contrário do que ela está
  if (st === "em_orcamento" && r.tem_orcamento === false) return { texto: "Sem orçamento", classe: s.neutro! };
  const classe = { em_andamento: "ok", em_orcamento: "info", concluida: s.neutro!, desfazendo_aprovacao: "warn" }[st];
  return { texto: TXT_STATUS[st], classe };
}

/** O cartão inteiro é o link para a obra: um alvo grande, sem botão disputando a atenção. */
function CartaoObra({ r, href }: { r: ResumoObra; href: string }) {
  const { obra } = r;
  const ps = pendenciasDe(r);
  const atrasada = (r.prazo?.atraso_decimos ?? (r.prazo?.atraso_meses ?? 0) * 10) > 0;
  const selo = seloStatus(r);
  const onde = [obra.cidade, obra.cliente].filter(Boolean).join(" · ");
  return (
    <li className={s.item}>
      <Link href={href} className={s.cartao}>
        <div className={s.topo}>
          <h2 className={s.nome}>{obra.nome}</h2>
          <span className={`pill ${selo.classe}`}>{selo.texto}</span>
        </div>
        {onde ? <span className={s.onde}>{onde}</span> : null}
        <dl className={s.numeros}>
          <div>
            <dt>Contrato</dt>
            <dd>{obra.verba ? fmtReais(obra.verba) : "—"}</dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd>{r.prazo?.termino_contratual ? <FrasePrazo p={r.prazo} /> : "—"}</dd>
          </div>
        </dl>
        {ps.length ? (
          <ul className={s.pends}>
            {ps.map((p) => (
              <li key={p.texto} className={`pill ${TOM_PEND[p.tom]}`}>
                {p.texto}
              </li>
            ))}
          </ul>
        ) : (
          // "Tudo em dia" ao lado de "0,9 mês de atraso" se contradiz: com atraso, só "Sem pendências".
          <span className={s.pends}>
            <span className={`pill ${atrasada ? s.neutro : "ok"}`}>{atrasada ? "Sem pendências" : "Tudo em dia"}</span>
          </span>
        )}
        <span className={s.rodape}>
          <span className={s.quando}>{r.ultima_atividade ? `Última atividade ${haQuanto(r.ultima_atividade)}` : "Sem atividade ainda"}</span>
          <Icone nome="chevRight" tam={16} />
        </span>
      </Link>
    </li>
  );
}
