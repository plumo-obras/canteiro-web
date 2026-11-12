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
import { Icone } from "../Icone";
import { useCelular } from "../midia";
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
  /** Texto curto do celular ("1 comprovante"). */
  curto: string;
  tom: "warn" | "info";
  /** As obras onde a coisa espera: com uma só, a etiqueta leva direto à tela dela; com várias, filtra os cartões. */
  obraIds: string[];
  tela: Tela;
}

/**
 * As etiquetas do topo, uma por tipo, somando todas as obras: o que espera alguém. Só aprovações e comprovantes (NFs) a
 * conferir: compra e entrega já estão no cartão da obra, e aqui viraria lista de tarefas.
 */
export function avisosDe(resumos: ResumoObra[]): Aviso[] {
  const avisos: Aviso[] = [];
  const apr = resumos.filter((r) => r.pendencias);
  const nApr = apr.reduce((t, r) => t + r.pendencias, 0);
  if (nApr) {
    const texto = plural(nApr, "aprovação", "aprovações");
    avisos.push({ chave: "apr", texto, curto: texto, tom: "warn", obraIds: apr.map((r) => r.obra.id), tela: "aprovacoes" });
  }
  const nfs = resumos.filter((r) => r.nf_para_conferir);
  const nNf = nfs.reduce((t, r) => t + r.nf_para_conferir, 0);
  if (nNf) {
    avisos.push({
      chave: "nf",
      texto: plural(nNf, "comprovante para conferir", "comprovantes para conferir"),
      curto: plural(nNf, "comprovante", "comprovantes"),
      tom: "info",
      obraIds: nfs.map((r) => r.obra.id),
      tela: "suprimentos",
    });
  }
  return avisos;
}

const EXTENSO = ["nenhuma", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
/** Número pequeno por extenso no feminino ("duas obras"), como se fala; de 11 em diante, algarismo. */
const contar = (n: number, um: string, varios: string) => `${n <= 10 ? EXTENSO[n] : n} ${n === 1 ? um : varios}`;
const maiuscula = (t: string) => t[0]!.toUpperCase() + t.slice(1);

/** "Três obras, duas coisas esperando você." — o resumo do cabeçalho, como no protótipo. */
export function resumoDoDia(resumos: ResumoObra[]): string {
  const esperando = resumos.reduce((t, r) => t + r.pendencias + r.nf_para_conferir, 0);
  const obras = maiuscula(contar(resumos.length, "obra", "obras"));
  return `${obras}, ${esperando ? `${contar(esperando, "coisa", "coisas")} esperando você` : "nada esperando você"}.`;
}

/** "Bom dia" até meio-dia, "Boa tarde" até as 18 h, depois "Boa noite" (no fuso do canteiro). */
export function saudacao(agora = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(agora));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const SITUACOES = ["todas", "em_orcamento", "em_andamento", "concluida"] as const;
const TXT_SITUACAO: Record<(typeof SITUACOES)[number], string> = { todas: "Todas", em_orcamento: "Em orçamento", em_andamento: "Em andamento", concluida: "Concluídas" };

export function Inicio({ usuario }: { usuario: Usuario }) {
  const [tentativa, setTentativa] = useState(0);
  const celular = useCelular();
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
  // Etiqueta que soma várias obras: filtra os cartões para as obras onde a coisa espera.
  const [so, setSo] = useState<Aviso | null>(null);
  const q = normal(busca);
  const filtrados = (ordenados ?? []).filter(
    (r) =>
      (status === "todas" || r.obra.status === status) &&
      (!so || so.obraIds.includes(r.obra.id)) &&
      (!q || normal(`${r.obra.nome} ${r.obra.cidade} ${r.obra.cliente ?? ""}`).includes(q)),
  );
  const pag = usePaginas(filtrados, POR_PAGINA, [busca, status, so]);
  const conta = (st: StatusObra | "todas") => (resumos ?? []).filter((r) => st === "todas" || r.obra.status === st).length;
  const podeCriar = usuario.papel !== "viewer";

  return (
    <>
      <header className={s.cab}>
        <div className={s.cabTexto}>
          <h1 className={s.titulo}>{celular ? saudacao() : `${saudacao()}, ${primeiroNome(usuario.nome)}`}</h1>
          {resumos?.length && !celular ? <p className={s.sub}>{resumoDoDia(resumos)}</p> : null}
        </div>
        {podeCriar ? (
          <Link href="/obras/nova" className={`btn amb ${s.nova}`} aria-label={celular ? "Nova obra" : undefined}>
            <Icone nome="plus" tam={15} />
            {celular ? "Obra" : "Nova obra"}
          </Link>
        ) : null}
      </header>

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
          {podeCriar ? (
            <Link href="/obras/nova" className="btn amb">
              Cadastrar obra
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {avisos.length ? (
            <nav className={s.avisos} aria-label="Esperando você">
              {avisos.map((a) => {
                const texto = celular ? a.curto : a.texto;
                const classe = `${s.etiqueta} ${a.tom}`;
                return a.obraIds.length === 1 ? (
                  <Link key={a.chave} href={hrefDaObra(a.obraIds[0]!, sessoes, a.tela)} className={classe}>
                    <span className={s.bola} aria-hidden="true" />
                    {texto}
                  </Link>
                ) : (
                  <button
                    key={a.chave}
                    type="button"
                    className={classe}
                    aria-pressed={so?.chave === a.chave}
                    onClick={() => setSo((x) => (x?.chave === a.chave ? null : a))}
                  >
                    <span className={s.bola} aria-hidden="true" />
                    {texto}
                  </button>
                );
              })}
            </nav>
          ) : null}
          {/* uma obra só não tem o que buscar nem filtrar */}
          {ordenados.length > 1 ? (
            <div className={s.barra}>
              <label className={s.busca}>
                <Icone nome="busca" tam={16} />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={celular ? "Buscar obra" : "Buscar por nome, cidade ou cliente"}
                  aria-label="Buscar obra"
                />
              </label>
              {celular ? null : (
                <div className={s.seg} role="group" aria-label="Situação">
                  {SITUACOES.map((st) => (
                    <button key={st} type="button" className={status === st ? s.on : undefined} aria-pressed={status === st} onClick={() => setStatus(st)}>
                      {TXT_SITUACAO[st]}
                      {conta(st) ? (
                        <>
                          {" "}
                          <span className={s.c}>{conta(st)}</span>
                        </>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {filtrados.length ? (
            <ul className={s.grade} aria-label="Obras">
              {pag.visiveis.map((r) => (
                <CartaoObra key={r.obra.id} r={r} href={hrefDaObra(r.obra.id, sessoes)} celular={celular} />
              ))}
            </ul>
          ) : (
            <div className="card vazio">
              <Icone nome="busca" tam={24} />
              <h3>Nenhuma obra encontrada</h3>
              <p>Nada com «{busca.trim() || (so ? so.texto : TXT_STATUS[status as StatusObra])}». Tente outro nome ou limpe o filtro.</p>
            </div>
          )}
          <Paginacao pagina={pag.pagina} total={pag.total} mudar={pag.setPagina} quantos={filtrados.length} porPagina={POR_PAGINA} nome="obras" />
        </>
      )}
    </>
  );
}

/** Só o que pede ação, em frases curtas; zero não aparece. `curto` é o texto do celular ("3 a comprar"). */
export function pendenciasDe(r: ResumoObra): { texto: string; curto: string; tom: "pede" | "info" | "neutro" }[] {
  const ps: { texto: string; curto: string; tom: "pede" | "info" | "neutro" }[] = [];
  if (r.pendencias) {
    const t = plural(r.pendencias, "aprovação", "aprovações");
    ps.push({ texto: t, curto: t, tom: "pede" });
  }
  if (r.nf_para_conferir)
    ps.push({ texto: plural(r.nf_para_conferir, "comprovante para conferir", "comprovantes para conferir"), curto: plural(r.nf_para_conferir, "comprovante", "comprovantes"), tom: "info" });
  if (r.falta_comprar) ps.push({ texto: `${plural(r.falta_comprar, "insumo", "insumos")} a comprar`, curto: `${r.falta_comprar} a comprar`, tom: "neutro" });
  if (r.pedidos_abertos)
    ps.push({ texto: plural(r.pedidos_abertos, "pedido a receber", "pedidos a receber"), curto: `${r.pedidos_abertos} a receber`, tom: "neutro" });
  return ps;
}

/** "Termina set/2027 · em dia" ou "Termina out/2027 · 0,8 mês de atraso": a mesma frase do topo do cronograma. */
export function frasePrazo(p: PrazoCronograma): { termina: string; sit: { texto: string; tom: string } | null } {
  const sit = situacaoPrazo(p);
  const projetado = sit && p.termino_projetado && p.termino_projetado !== p.termino_contratual;
  return { termina: fmtMesLongo(projetado ? p.termino_projetado : p.termino_contratual), sit };
}

/** A frase inteira ganha a cor da situação, como no protótipo: verde em dia, vermelho com atraso. */
function FrasePrazo({ p }: { p: PrazoCronograma }) {
  const f = frasePrazo(p);
  return (
    <span className={s.prazo} data-tom={f.sit?.tom}>
      {f.termina}
      {f.sit ? ` · ${f.sit.texto}` : null}
    </span>
  );
}

/** "R$ 480.000" sem centavos redondos; no celular, "R$ 2,07 mi" a partir do milhão. */
export function fmtContrato(c: number, curto = false): string {
  if (curto && c >= 100_000_000) return `R$ ${(c / 100_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  const r = fmtReais(c);
  return c % 100 === 0 ? r.replace(/,00$/, "") : r;
}

const TOM_PEND = { pede: "warn", info: "info", neutro: s.neutro! } as const;

/** O selo da situação: verde andando, azul em orçamento, cinza parada ou concluída, ocre desfazendo. */
function seloStatus(r: ResumoObra): { texto: string; classe: string } {
  const st = r.obra.status;
  // "Em orçamento" numa obra sem orçamento nenhum diz o contrário do que ela está
  if (st === "em_orcamento" && r.tem_orcamento === false) return { texto: "sem orçamento", classe: s.neutro! };
  const classe = { em_andamento: "ok", em_orcamento: "info", concluida: s.neutro!, desfazendo_aprovacao: "warn" }[st];
  return { texto: TXT_STATUS[st].toLowerCase(), classe };
}

/** O cartão inteiro é o link para a obra: um alvo grande, sem botão disputando a atenção. */
function CartaoObra({ r, href, celular }: { r: ResumoObra; href: string; celular: boolean }) {
  const { obra } = r;
  const ps = pendenciasDe(r);
  const atrasada = (r.prazo?.atraso_decimos ?? (r.prazo?.atraso_meses ?? 0) * 10) > 0;
  const selo = seloStatus(r);
  const cidade = obra.uf && obra.cidade ? `${obra.cidade}/${obra.uf}` : obra.cidade;
  const temPrazo = !!r.prazo?.termino_contratual;
  const pends = ps.length ? (
    <ul className={s.pends}>
      {ps.map((p) => (
        <li key={p.texto} className={`pill ${TOM_PEND[p.tom]}`}>
          {celular ? p.curto : p.texto}
        </li>
      ))}
    </ul>
  ) : (
    // "Tudo em dia" ao lado de "0,9 mês de atraso" se contradiz: com atraso, só "Sem pendências".
    <span className={s.pends}>
      <span className={`pill ${atrasada ? s.neutro : "ok"}`}>{atrasada ? "Sem pendências" : "Tudo em dia"}</span>
    </span>
  );
  return (
    <li className={s.item}>
      <Link href={href} className={s.cartao}>
        <div className={s.topo}>
          <h2 className={s.nome}>{obra.nome}</h2>
          <span className={`pill ${selo.classe}`}>{selo.texto}</span>
        </div>
        {celular ? (
          <>
            <span className={s.onde}>{[cidade, obra.verba ? fmtContrato(obra.verba, true) : ""].filter(Boolean).join(" · ")}</span>
            {temPrazo ? <FrasePrazo p={r.prazo!} /> : null}
            {pends}
          </>
        ) : (
          <>
            {cidade || obra.cliente ? <span className={s.onde}>{[cidade, obra.cliente].filter(Boolean).join(" · ")}</span> : null}
            <dl className={s.numeros}>
              <div>
                <dt>Contrato</dt>
                <dd>{obra.verba ? fmtContrato(obra.verba) : "—"}</dd>
              </div>
              <div>
                <dt>Prazo</dt>
                <dd>{temPrazo ? <FrasePrazo p={r.prazo!} /> : <span className={s.prazo}>—</span>}</dd>
              </div>
            </dl>
            {pends}
            <span className={s.quando}>{r.ultima_atividade ? `Última atividade ${haQuanto(r.ultima_atividade)}` : "Sem atividade ainda"}</span>
          </>
        )}
      </Link>
    </li>
  );
}
