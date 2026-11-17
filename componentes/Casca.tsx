"use client";
/**
 * A casca do app: topo de vidro com a obra, o campo "Pergunte ao Plumo", o sino e a conta; embaixo, o Resumo e as cinco
 * telas em pílulas, na ordem da obra, e o menu "⋯". Uma tela por vez no palco. O Plumo (a conversa com o agente) não é
 * uma tela: abre num painel ao lado dela, que fica montado mesmo fechado, para o texto digitado e o "Parar" não se
 * perderem. Início e Conta ficam no logo e no avatar. No celular as telas vão para a barra de baixo, com o Plumo no meio.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Obra, ResumoDaObra, Usuario } from "@/lib/contrato";
import { api } from "@/lib/cliente";
import { formatarHistorico } from "@/lib/historico";
import { Aprovacoes } from "./Aprovacoes";
import { ProvedorCasca, mensagemDe, useCasca } from "./contexto";
import type { PedidoConversa } from "./Conversa";
import { CampoPlumo, PainelPlumo } from "./plumo/PainelPlumo";
import { Icone, Logo, type NomeIcone } from "./Icone";
import { MenuMais, type ItemMenu } from "./MenuMais";
import { Suprimentos } from "./Suprimentos";
import { Cronograma } from "./cronograma/Cronograma";
import { Gastos } from "./Gastos";
import { Placar } from "./Placar";
import { Projeto } from "./Projeto";
import { Historico } from "./Historico";
import { Tributos } from "./Tributos";
import { Orcamento } from "./Orcamento";
import { Resumo } from "./resumo/Resumo";
import { ModalDadosObra } from "./obra/ModalDadosObra";
import { MenuPerfil, useMenu } from "./MenuPerfil";
import { trocarTema, useTema } from "./tema";
import { useCelular, useMidia } from "./midia";
import { useCarregar } from "./useCarregar";
import { Abrindo } from "./Abrindo";
import { useSessaoGarantida } from "./useSessaoGarantida";
import { abaDe, telaNoModo, novaSessao, redutorSessoes, type AbaAtiva } from "./sessoes";
import { paradasDoTab, proximaParada } from "./foco";

// Rótulo e ícone de cada tela (para o título de seção e o aria-label).
const ROTULOS: Record<AbaAtiva, { rotulo: string; icone: NomeIcone }> = {
  resumo: { rotulo: "Resumo", icone: "resumo" },
  conversa: { rotulo: "Plumo", icone: "spark" },
  projeto: { rotulo: "Projeto", icone: "predio" },
  orcamento: { rotulo: "Orçamento", icone: "calc" },
  suprimentos: { rotulo: "Compras", icone: "package" },
  cronograma: { rotulo: "Cronograma", icone: "calendario" },
  gastos: { rotulo: "Gastos", icone: "recibo" },
  tributos: { rotulo: "Tributos", icone: "planilha" },
  aprovacoes: { rotulo: "Aprovações", icone: "checkCircle" },
  historico: { rotulo: "Histórico", icone: "history" },
};
// A barra É o caminho da obra, na ordem em que o trabalho anda: o usuário é guiado sem ver passos numerados. O Resumo
// vem antes de tudo: é a casa da obra, com a mesma ordem desenhada na linha do tempo. Depois Projeto, Orçamento, o
// Cronograma (que se monta a partir do orçamento, inclusive pelo Gerar com IA) e a execução, Compras e Gastos.
const ABAS: AbaAtiva[] = ["resumo", "projeto", "orcamento", "cronograma", "suprimentos", "gastos"];
// O que se consulta de vez em quando fica no "⋯", para a barra mostrar só o caminho.
const NO_MENU: AbaAtiva[] = ["tributos", "historico"];

const COR_STATUS: Record<Obra["status"], string> = { em_andamento: "var(--green)", em_orcamento: "var(--gray)", concluida: "var(--blue)", desfazendo_aprovacao: "var(--amber)" };
const TXT_STATUS: Record<Obra["status"], string> = { em_andamento: "em andamento", em_orcamento: "em orçamento", concluida: "concluída", desfazendo_aprovacao: "desfazendo" };
/** O status da API nasce "em_orcamento": sem orçamento nenhum, chamar assim promete o que não existe. Sem saber, não afirma. */
function statusDaObra(o: Obra, r: ResumoDaObra | null): string {
  if (o.status !== "em_orcamento") return TXT_STATUS[o.status];
  if (r?.obra.id !== o.id) return "";
  return r.financeiro.tem_orcamento ? TXT_STATUS.em_orcamento : "começando";
}

/** Entrada da casca: garante a sessão de login (renovando pelo cookie depois de recarregar) antes de montar o app. */
export function Casca({ demo }: { demo: boolean }) {
  const { usuario, semServidor, tentarAgora } = useSessaoGarantida();

  if (!usuario) return <Abrindo semServidor={semServidor} tentarAgora={tentarAgora} />;
  return (
    <ProvedorCasca usuario={usuario} demo={demo}>
      <App usuario={usuario} />
    </ProvedorCasca>
  );
}

/** Abaixo disto o painel do Plumo vira folha que cobre a tela; acima de LADO_A_LADO ele divide a largura com a tela. */
const MOVEL = "(max-width: 899px)";
const LADO_A_LADO = "(min-width: 1280px)";
const CHAVE_PLUMO = "plumo.painelPlumo";
// Última obra aberta neste navegador: uma aba nova em "/" volta nela, não na 1ª em andamento da lista.
const CHAVE_OBRA = "plumo.obra";
const LIMITE_CONVERSAS = 30;
function useMovel() {
  return useMidia(MOVEL);
}
/**
 * O painel do Plumo lado a lado com a tela fica como a pessoa deixou (aberto ou fechado), neste navegador. Mais
 * estreito, ele cobriria a tela que acabou de abrir: começa sempre fechado.
 */
export function lerPlumo(ladoALado: boolean) {
  if (!ladoALado) return false;
  try {
    return localStorage.getItem(CHAVE_PLUMO) === "aberto";
  } catch {
    return false;
  }
}

function App({ usuario }: { usuario: Usuario }) {
  const { demo, versao, cartoes, receberPropostas, registrarNavegacao, podeOperar, fecharAvisoFixo } = useCasca();
  const router = useRouter();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sessoes, despachar] = useReducer(redutorSessoes, []);
  const [atual, setAtual] = useState<string | null>(null);
  // Toda obra abre no Resumo, a casa dela; ?tela= leva direto a outra.
  const [tela, setTela] = useState<AbaAtiva>("resumo");
  // Vindo da Nova obra por "já tenho a planilha": abre o import do orçamento uma vez, nesta obra. A URL reescrita
  // abaixo já não carrega o ?importar=, então recarregar não abre de novo.
  const [importarEm, setImportarEm] = useState<string | null>(null);
  const [dadosObra, setDadosObra] = useState(false);
  const movel = useMovel();
  const ladoALado = useMidia(LADO_A_LADO);
  const barraCelular = useCelular();
  // O painel do Plumo. Quem abriu recebe o foco de volta ao fechar; o pedido é a pergunta feita no campo do topo.
  const [plumo, setPlumo] = useState(() => lerPlumo(typeof window !== "undefined" && window.matchMedia?.(LADO_A_LADO).matches));
  const [pedido, setPedido] = useState<PedidoConversa | null>(null);
  const quemAbriu = useRef<HTMLElement | null>(null);
  const campoPlumo = useRef<HTMLInputElement>(null);
  const lembrarPlumo = useCallback(
    (aberto: boolean) => {
      if (!ladoALado) return;
      try {
        localStorage.setItem(CHAVE_PLUMO, aberto ? "aberto" : "fechado");
      } catch {
        // navegador sem armazenamento: a escolha vale só nesta aba
      }
    },
    [ladoALado],
  );
  const abrirPlumo = useCallback(
    (texto = "") => {
      const ativo = document.activeElement as HTMLElement | null;
      // quem abriu pelo campo do topo volta para ele; pelo botão, volta para o botão
      if (ativo && ativo !== document.body && !ativo.closest("#painel-plumo")) quemAbriu.current = ativo;
      setPlumo(true);
      lembrarPlumo(true);
      if (texto) setPedido((p) => ({ n: (p?.n ?? 0) + 1, texto }));
      // o campo da conversa só existe à vista no quadro seguinte (o painel estava hidden)
      requestAnimationFrame(() => document.querySelector<HTMLElement>("#painel-plumo .composer textarea")?.focus({ preventScroll: true }));
    },
    [lembrarPlumo],
  );
  const fecharPlumo = useCallback(() => {
    setPlumo(false);
    lembrarPlumo(false);
    requestAnimationFrame(() => quemAbriu.current?.focus({ preventScroll: true }));
  }, [lembrarPlumo]);
  // O Plumo não é uma tela: quem pede a conversa (o "Perguntar ao Plumo" das telas, um link antigo) abre o painel.
  const irPara = useCallback((t: AbaAtiva) => (t === "conversa" ? abrirPlumo() : setTela(t)), [abrirPlumo]);
  useEffect(() => registrarNavegacao(irPara), [registrarNavegacao, irPara]);
  // ⌘K / Ctrl+K: no computador foca o campo do topo; sem ele (celular), abre o painel.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k" || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (campoPlumo.current) campoPlumo.current.focus();
      else abrirPlumo();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abrirPlumo]);
  // Conversas mais antigas, por obra. A 1ª lista é global (as 30 mais recentes de todas as obras): tudo o que é mais
  // novo que a última dela já está aqui, então o cursor de TODAS as obras começa nessa data.
  const [cursorGlobal, setCursorGlobal] = useState<string | null>(null);
  const [maisConversas, setMaisConversas] = useState<Record<string, { antes: string | null; buscando?: boolean }>>({});

  const iniciou = useRef(false);
  useEffect(() => {
    // Uma vez só (o StrictMode do dev roda o efeito duas vezes e abriria duas conversas vazias).
    if (iniciou.current) return;
    iniciou.current = true;
    // A obra vem por ?obra= e abre no Resumo; ?tela= abre uma tela, e ?sessao= abre o painel do Plumo naquela conversa
    // (?tela=conversa, de quando o Plumo era uma aba, também abre o painel). A obra, a conversa e a tela ficam na URL (o
    // efeito abaixo as reescreve), para o recarregar voltar no mesmo lugar: abrir outra obra em silêncio leva a lançar
    // na obra errada.
    const qs = new URLSearchParams(window.location.search);
    let ultima: string | null = null;
    try {
      ultima = localStorage.getItem(CHAVE_OBRA);
    } catch {
      // navegador sem armazenamento: vale a URL
    }
    const querObra = qs.get("obra") ?? ultima;
    const querSessao = qs.get("sessao");
    const querTela = abaDe(qs.get("tela"));
    // link com ?tela=gastos aberto na demonstração cai no Resumo: a tela não existe lá
    if (querTela === "conversa" || querSessao) setPlumo(true);
    else if (querTela && telaNoModo(querTela, demo)) setTela(querTela);
    if (querTela === "orcamento" && qs.get("importar") === "1" && querObra) setImportarEm(querObra);
    api
      .listarObras()
      .then((os) => {
        setObras(os);
        // sem obra pedida, abre uma em andamento (a lista vem por nome, e a 1ª pode ser uma obra parada)
        const o = os.find((x) => x.id === querObra) ?? os.find((x) => x.status === "em_andamento") ?? os[0];
        if (!o) return;
        const abrirNovaEm = (obraId: string) => {
          const s = novaSessao(obraId);
          despachar({ tipo: "nova", sessao: s });
          setAtual(s.id);
        };
        if (!querSessao) abrirNovaEm(o.id);
        // Histórico das conversas: falha aqui não impede de conversar, só some a lista antiga.
        api
          .listarSessoes({ limite: LIMITE_CONVERSAS })
          .then((ss) => {
            despachar({ tipo: "listadas", sessoes: ss, obraPadrao: o.id });
            setCursorGlobal(ss.length < LIMITE_CONVERSAS ? null : ss.at(-1)!.atualizado_em);
            if (querSessao) ss.some((x) => x.id === querSessao) ? setAtual(querSessao) : abrirNovaEm(o.id);
          })
          .catch(() => querSessao && abrirNovaEm(o.id));
      })
      .catch((e) => setErro(mensagemDe(e)));
    // `demo` não muda durante a sessão (vem do servidor na carga): roda uma vez, como antes
  }, [demo]);

  // Sessão antiga aberta pela 1ª vez: busca as mensagens e o estado atual das propostas que ficaram nela.
  const carregando = useRef(new Set<string>());
  useEffect(() => {
    const s = sessoes.find((x) => x.id === atual);
    if (!s || s.carregada || s.erroCarga || !s.servidorId || carregando.current.has(s.id)) return;
    carregando.current.add(s.id);
    (async () => {
      const { mensagens, propostaIds } = formatarHistorico(await api.mensagensSessao(s.servidorId!));
      if (propostaIds.length) {
        const ps = await api.listarPropostas({ obra_id: s.obraId });
        receberPropostas(ps.filter((p) => propostaIds.includes(p.id)));
      }
      despachar({ tipo: "carregou", sessaoId: s.id, mensagens });
    })()
      .catch((e) => despachar({ tipo: "falhouCarga", sessaoId: s.id, erro: mensagemDe(e) }))
      .finally(() => carregando.current.delete(s.id));
  }, [atual, sessoes, receberPropostas]);

  // Dados e status da obra mudam pelas telas (editar, aprovar o orçamento): relê a lista a cada escrita.
  const primeiraVersao = useRef(versao);
  useEffect(() => {
    if (versao === primeiraVersao.current) return;
    api
      .listarObras()
      .then(setObras)
      .catch(() => undefined);
  }, [versao]);

  // O contador de Aprovações vem do servidor (e de quem mais aprovou), não só do que esta aba viu.
  useEffect(() => {
    api
      .listarPropostas({ status: "pendente" })
      .then(receberPropostas)
      .catch(() => undefined);
  }, [versao, receberPropostas]);

  const sessaoAberta = sessoes.find((s) => s.id === atual);
  const obraAberta = obras?.find((o) => o.id === sessaoAberta?.obraId)?.id;
  // O Desfazer fixo (somar, reordenar) fala da tela onde a pessoa mexeu: em outra tela ou obra, ele confundiria.
  useEffect(() => fecharAvisoFixo(), [tela, obraAberta, fecharAvisoFixo]);
  // Com o painel aberto, a conversa também vai para a URL: recarregar (o portal recarrega a página ao trocar desktop ↔
  // celular) voltava em "Nova conversa". Só a que já tem mensagem: a vazia ainda não existe no servidor.
  const sessaoNaUrl = plumo && sessaoAberta && (sessaoAberta.mensagens.length || !sessaoAberta.carregada) ? sessaoAberta.servidorId : null;
  const { dado: resumoLido, erro: erroResumo } = useCarregar(() => (obraAberta ? api.resumoObra(obraAberta) : Promise.resolve(null)), [obraAberta, versao]);
  // useCarregar mantém o dado anterior: sem conferir, a obra nova mostraria por um instante os números da outra.
  const resumo = resumoLido?.obra.id === obraAberta ? resumoLido : null;
  const semOrcamento = resumo?.financeiro.tem_orcamento === false;
  useEffect(() => {
    if (!obraAberta) return;
    const qs = new URLSearchParams({ obra: obraAberta });
    if (sessaoNaUrl) qs.set("sessao", sessaoNaUrl);
    if (tela !== "resumo" && tela !== "conversa") qs.set("tela", tela);
    window.history.replaceState(null, "", `${window.location.pathname}?${qs}`);
    try {
      localStorage.setItem(CHAVE_OBRA, obraAberta);
    } catch {
      // navegador sem armazenamento: vale a URL
    }
  }, [obraAberta, sessaoNaUrl, tela]);

  const pendentes = (obraId: string) => Object.values(cartoes).filter((c) => c.proposta.obra_id === obraId && c.proposta.status === "pendente").length;
  const sessao = sessoes.find((s) => s.id === atual);
  const obra = obras?.find((o) => o.id === sessao?.obraId);

  const abrirNova = (obraId: string) => {
    const s = novaSessao(obraId);
    despachar({ tipo: "nova", sessao: s });
    setAtual(s.id);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("#painel-plumo .composer textarea")?.focus({ preventScroll: true }));
  };
  /** Trocar de obra é abrir a obra: o Resumo dela, e a conversa vai para a mais recente dela (ou uma nova). */
  const trocarObra = (obraId: string) => {
    irPara("resumo");
    const recente = sessoes.find((s) => s.obraId === obraId);
    if (recente) setAtual(recente.id);
    else {
      const s = novaSessao(obraId);
      despachar({ tipo: "nova", sessao: s });
      setAtual(s.id);
    }
  };

  const podeCadastrar = usuario.papel !== "viewer";
  const cursorDa = (obraId: string) => (obraId in maisConversas ? maisConversas[obraId]!.antes : cursorGlobal);
  const carregarConversas = async (obraId: string) => {
    const antes = cursorDa(obraId);
    if (!antes) return;
    setMaisConversas((m) => ({ ...m, [obraId]: { antes, buscando: true } }));
    try {
      const ss = await api.listarSessoes({ obra_id: obraId, limite: LIMITE_CONVERSAS, antes_de: antes });
      despachar({ tipo: "listadas", sessoes: ss, obraPadrao: obraId });
      setMaisConversas((m) => ({ ...m, [obraId]: { antes: ss.length < LIMITE_CONVERSAS ? null : ss.at(-1)!.atualizado_em } }));
    } catch {
      setMaisConversas((m) => ({ ...m, [obraId]: { antes } }));
    }
  };
  const conteudo = erro ? (
    <div className="aviso-erro" role="alert">
      <Icone nome="alert" tam={15} />
      Não consegui carregar as obras: {erro}
    </div>
  ) : !obras || (obras.length && !sessao) ? (
    <div className="carregando page" role="status">
      <Icone nome="loader" className="spin" tam={15} />
      {obras ? "Abrindo a obra…" : "Carregando obras…"}
    </div>
  ) : !sessao || !obra ? (
    <div className="card vazio">
      <Icone nome="predio" tam={24} />
      <h3>Nenhuma obra ainda</h3>
      <p>Cadastre a primeira obra para começar pelo projeto. As conversas com o Plumo aparecem aqui.</p>
      {podeCadastrar ? (
        <Link href="/obras/nova" className="btn amb">
          Cadastrar obra
        </Link>
      ) : null}
    </div>
  ) : null;

  return (
    <div className={`app${plumo && sessao && obra && !conteudo ? (ladoALado ? " com-plumo" : movel ? "" : " plumo-por-cima") : ""}`}>
      <Topo
        semAbas={barraCelular}
        obras={obras ?? []}
        obra={obra}
        resumo={resumo}
        tela={tela}
        setTela={irPara}
        pendentes={obra ? pendentes(obra.id) : 0}
        trocarObra={trocarObra}
        usuario={usuario}
        demo={demo}
        abrirDados={() => setDadosObra(true)}
        inerte={movel && plumo}
        campoPlumo={obra && !conteudo && !barraCelular ? <CampoPlumo perguntar={(t) => abrirPlumo(t)} campo={campoPlumo} /> : null}
      />
      {obra && !conteudo ? <Placar key={`placar-${obra.id}`} obra={obra} resumo={resumo} falhou={!!erroResumo} /> : null}

      <main className="palco" inert={movel && plumo}>
        {conteudo ??
          (sessao && obra ? (
            // key pela obra: trocar de obra remonta a tela. Sem isso o estado de A (o rascunho do editor do
            // cronograma, por exemplo) ficava montado com a obra B, e "Salvar" gravava o de A em B.
            <section key={obra.id} className="palco-tela" aria-label={ROTULOS[tela].rotulo}>
              {tela === "orcamento" ? (
                <Orcamento obra={obra} abrirImportar={importarEm === obra.id} aoAbrirImportar={() => setImportarEm(null)} />
              ) : tela === "cronograma" ? (
                <Cronograma obra={obra} />
              ) : tela === "suprimentos" ? (
                <Suprimentos obra={obra} />
              ) : tela === "gastos" ? (
                <Gastos obra={obra} />
              ) : tela === "tributos" ? (
                <Tributos obra={obra} />
              ) : tela === "projeto" ? (
                <Projeto obra={obra} />
              ) : tela === "historico" ? (
                <Historico obra={obra} />
              ) : tela === "aprovacoes" ? (
                <Aprovacoes obra={obra} obras={obras ?? []} />
              ) : (
                <Resumo obra={obra} resumo={resumo} />
              )}
            </section>
          ) : null)}
      </main>
      {sessao && obra && !conteudo ? (
        <PainelPlumo
          aberto={plumo}
          modal={movel}
          fechar={fecharPlumo}
          sessao={sessao}
          obra={obra}
          resumo={resumo}
          despachar={despachar}
          conversas={sessoes.filter((x) => x.obraId === obra.id)}
          escolher={setAtual}
          abrirNova={() => abrirNova(obra.id)}
          maisAntigas={{ existe: !!cursorDa(obra.id), buscando: !!maisConversas[obra.id]?.buscando, carregar: () => void carregarConversas(obra.id) }}
          pedido={pedido}
          atenderPedido={() => setPedido(null)}
          demo={demo}
        />
      ) : null}
      {obra && !conteudo && barraCelular ? (
        <BarraInferior
          aprovada={obra.status !== "em_orcamento" && !semOrcamento}
          tela={tela}
          setTela={irPara}
          plumo={plumo}
          abrirPlumo={() => abrirPlumo()}
          abrirDados={() => setDadosObra(true)}
          inerte={movel && plumo}
          demo={demo}
          podeCadastrar={podeCadastrar}
        />
      ) : null}
      {obra && dadosObra ? <ModalDadosObra obra={obra} fechar={() => setDadosObra(false)} leitura={!podeOperar} /> : null}
    </div>
  );
}

/** No celular (≤ 760 px) a navegação vai para uma barra fixa embaixo: o dia a dia na obra, o resto no Mais. */
// O Resumo sempre, e o Plumo no meio (o lugar mais à mão: ele não é uma tela, abre o painel); antes do orçamento
// aprovado o dia a dia é montar o projeto e o orçamento; depois, comprar e lançar (o Cronograma vai para o Mais).
function barraDe(aprovada: boolean, demo: boolean): AbaAtiva[] {
  const abas: AbaAtiva[] = aprovada ? ["resumo", "suprimentos", "conversa", "gastos"] : ["resumo", "projeto", "conversa", "orcamento"];
  // Na demonstração não há Gastos: outra tela fica no lugar, e a barra continua com cinco colunas.
  return demo ? abas.map((k) => (k !== "gastos" ? k : "cronograma")) : abas;
}

function BarraInferior(p: {
  aprovada: boolean;
  tela: AbaAtiva;
  setTela: (t: AbaAtiva) => void;
  plumo: boolean;
  abrirPlumo: () => void;
  abrirDados: () => void;
  inerte: boolean;
  demo: boolean;
  podeCadastrar: boolean;
}) {
  const itens = barraDe(p.aprovada, p.demo);
  const [mais, setMais] = useState(false);
  // Trocou de tela (pela folha ou por fora dela): a folha fecha, nunca fica cobrindo a tela nova.
  useEffect(() => setMais(false), [p.tela]);
  // Com o texto maior (o portal impõe tamanho mínimo de fonte), os rótulos não cabem: aí só os ícones (o nome fica no
  // aria-label) e o rótulo apenas no item ativo.
  const barra = useRef<HTMLElement>(null);
  const [compacta, setCompacta] = useState(false);
  useEffect(() => {
    const el = barra.current;
    if (!el) return;
    const medir = () => {
      el.classList.remove("compacta");
      const sobra = [...el.querySelectorAll<HTMLElement>(".bi-rot")].some((r) => r.scrollWidth > r.clientWidth + 1);
      setCompacta(sobra);
      if (sobra) el.classList.add("compacta");
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const naFolha = [...ABAS, ...NO_MENU].filter((k) => telaNoModo(k, p.demo) && !itens.includes(k));
  const noMais = naFolha.includes(p.tela);
  return (
    <>
      <nav ref={barra} className={`barra-inf${compacta ? " compacta" : ""}`} aria-label="Telas da obra" inert={p.inerte}>
        {itens.map((k) =>
          k === "conversa" ? (
            <button
              key={k}
              type="button"
              className="bi-item bi-plumo"
              aria-label="Plumo"
              aria-haspopup="dialog"
              aria-expanded={p.plumo}
              aria-controls="painel-plumo"
              onClick={p.abrirPlumo}
            >
              <span className="bi-bola" aria-hidden="true">
                <Icone nome="spark" tam={22} />
              </span>
              <span className="bi-rot" aria-hidden="true">
                Plumo
              </span>
            </button>
          ) : (
          <button
            key={k}
            type="button"
            className={`bi-item${p.tela === k ? " on" : ""}`}
            aria-current={p.tela === k ? "page" : undefined}
            aria-label={ROTULOS[k].rotulo}
            onClick={() => p.setTela(k)}
          >
            <Icone nome={ROTULOS[k].icone} tam={20} />
            <span className="bi-rot" aria-hidden="true">
              {ROTULOS[k].rotulo}
            </span>
          </button>
          ),
        )}
        <button
          type="button"
          className={`bi-item${noMais ? " on" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={mais}
          aria-label="Mais"
          onClick={() => setMais(true)}
        >
          <Icone nome="more" tam={20} />
          <span className="bi-rot" aria-hidden="true">
            Mais
          </span>
        </button>
      </nav>
      {mais ? (
        <FolhaMais
          fechar={() => setMais(false)}
          telas={naFolha}
          ir={(t) => {
            setMais(false);
            p.setTela(t);
          }}
          abrirDados={() => {
            setMais(false);
            p.abrirDados();
          }}
          podeCadastrar={p.podeCadastrar}
        />
      ) : null}
    </>
  );
}

/** A folha do Mais: as telas que não couberam na barra, Dados da obra, Início, Nova obra, Conta e Tema. Esc ou toque fora fecham. */
function FolhaMais(p: { fechar: () => void; telas: AbaAtiva[]; ir: (t: AbaAtiva) => void; abrirDados: () => void; podeCadastrar: boolean }) {
  const { fechar } = p;
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    caixa.current?.querySelector<HTMLElement>("button,a")?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
      // o Tab anda só dentro da folha: atrás dela está o véu
      if (e.key === "Tab" && caixa.current) {
        const prox = proximaParada(paradasDoTab(caixa.current), document.activeElement, e.shiftKey);
        if (prox) {
          e.preventDefault();
          prox.focus();
        }
      }
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      // a barra (com o botão Mais) só volta a aparecer depois de a folha sair: foca no quadro seguinte
      requestAnimationFrame(() => antes?.focus?.());
    };
  }, [fechar]);
  return (
    <div className="folha-fundo" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="folha" role="dialog" aria-modal="true" aria-label="Mais" ref={caixa}>
        <span className="folha-alca" aria-hidden="true" />
        {p.telas.map((k) => (
          <button key={k} type="button" className="folha-item" onClick={() => p.ir(k)}>
            <Icone nome={ROTULOS[k].icone} tam={18} />
            <span>{ROTULOS[k].rotulo}</span>
          </button>
        ))}
        <button type="button" className="folha-item" onClick={p.abrirDados}>
          <Icone nome="predio" tam={18} />
          <span>Dados da obra</span>
        </button>
        <Link href="/inicio" className="folha-item">
          <Icone nome="home" tam={18} />
          <span>Início</span>
        </Link>
        {p.podeCadastrar ? (
          <Link href="/obras/nova" className="folha-item">
            <Icone nome="plus" tam={18} />
            <span>Nova obra</span>
          </Link>
        ) : null}
        <Link href="/conta" className="folha-item">
          <Icone nome="user" tam={18} />
          <span>Conta</span>
        </Link>
        <ItemTema />
      </div>
    </div>
  );
}

function ItemTema() {
  const tema = useTema();
  const outro = tema === "escuro" ? "claro" : "escuro";
  return (
    <button type="button" className="folha-item" onClick={() => trocarTema(outro)}>
      <Icone nome={tema === "escuro" ? "sol" : "lua"} tam={18} />
      <span>Tema {outro}</span>
    </button>
  );
}

function Topo(p: {
  semAbas?: boolean;
  obras: Obra[];
  obra: Obra | undefined;
  resumo: ResumoDaObra | null;
  tela: AbaAtiva;
  setTela: (t: AbaAtiva) => void;
  pendentes: number;
  trocarObra: (id: string) => void;
  usuario: Usuario;
  demo: boolean;
  abrirDados: () => void;
  inerte: boolean;
  /** O campo "Pergunte ao Plumo" (só no computador; no celular o Plumo está no meio da barra de baixo). */
  campoPlumo: React.ReactNode;
}) {
  const { obra, tela } = p;
  const nav = useRef<HTMLDivElement>(null);
  const topo = useRef<HTMLElement>(null);
  const itensMenu: ItemMenu[] = [
    ...NO_MENU.filter((k) => telaNoModo(k, p.demo)).map((k) => ({ rotulo: ROTULOS[k].rotulo, acao: () => p.setTela(k) })),
    { rotulo: "Dados da obra", acao: p.abrirDados },
  ];
  const noMenu = NO_MENU.includes(tela);
  // As pílulas rolam quando não cabem (celular; no computador, com a fonte mínima que o portal impõe ou nome de obra
  // longo): a escolhida não pode ficar fora da vista. Rola só a barra, nunca a página.
  useEffect(() => mostrarEscolhida(nav.current), [tela]);
  // No computador, sobrando pílula, o topo aperta (menos espaço entre elas, seletor mais estreito); se nem assim
  // couber, a borda esmaecida do lado que tem mais mostra que a barra rola. Antes, a 1ª aba ficava cortada
  // à esquerda sem nenhum sinal de que havia algo ali.
  useEffect(() => {
    const n = nav.current;
    const t = topo.current;
    if (!n || !t) return;
    const bordas = () => {
      const fim = n.scrollWidth - n.clientWidth - n.scrollLeft;
      n.dataset.rola = n.scrollWidth <= n.clientWidth + 1 ? "" : n.scrollLeft > 1 && fim > 1 ? "ambos" : n.scrollLeft > 1 ? "esq" : "dir";
    };
    const medir = () => {
      t.classList.remove("aperto");
      if (n.scrollWidth > n.clientWidth + 1) t.classList.add("aperto");
      mostrarEscolhida(n);
      bordas();
    };
    medir();
    // sem ResizeObserver (jsdom, navegador antigo) fica a medida da abertura
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    ro?.observe(t);
    n.addEventListener("scroll", bordas, { passive: true });
    return () => {
      ro?.disconnect();
      n.removeEventListener("scroll", bordas);
    };
  }, [obra?.id, p.semAbas]);
  return (
    <header className="topo" ref={topo} inert={p.inerte}>
      <Link href="/inicio" className="topo-marca" aria-label="Plumo, início">
        <Logo />
        <span className="topo-marca-t">Plumo</span>
        {p.demo ? <span className="tag">demo</span> : null}
      </Link>
      {obra ? <SeletorObra obras={p.obras} obra={obra} resumo={p.resumo} trocar={p.trocarObra} /> : null}
      {p.campoPlumo}
      {obra && !p.semAbas ? (
        <nav className="topo-nav" ref={nav} aria-label="Telas da obra">
          {ABAS.filter((k) => telaNoModo(k, p.demo)).map((k) => (
            <button key={k} type="button" className={`pilula${tela === k ? " on" : ""}`} aria-current={tela === k ? "page" : undefined} onClick={() => p.setTela(k)}>
              {ROTULOS[k].rotulo}
            </button>
          ))}
          <span className={`topo-mais${noMenu ? " on" : ""}`}>
            <MenuMais rotulo={`Mais: ${itensMenu.map((i) => i.rotulo).join(", ")}${noMenu ? ` (aberto: ${ROTULOS[tela].rotulo})` : ""}`} itens={itensMenu} />
          </span>
        </nav>
      ) : obra ? null : (
        <span className="sp" />
      )}
      <div className="topo-dir">
        {obra ? (
          <button
            type="button"
            className={`topo-sino${tela === "aprovacoes" ? " on" : ""}`}
            aria-current={tela === "aprovacoes" ? "page" : undefined}
            aria-label={`Aprovações: ${p.pendentes === 0 ? "nada esperando você" : p.pendentes === 1 ? "1 coisa esperando você" : `${p.pendentes} coisas esperando você`}`}
            title="Aprovações"
            onClick={() => p.setTela("aprovacoes")}
          >
            <Icone nome="sino" tam={18} />
            {p.pendentes ? (
              <span className="topo-sino-n" aria-hidden="true">
                {p.pendentes}
              </span>
            ) : null}
          </button>
        ) : null}
        <MenuPerfil usuario={p.usuario} />
      </div>
    </header>
  );
}

/** Rola a barra de pílulas (só ela) até a escolhida aparecer inteira. */
function mostrarEscolhida(n: HTMLElement | null) {
  const a = n?.querySelector<HTMLElement>("[aria-current=page]");
  if (!n || !a) return;
  const r = a.getBoundingClientRect();
  const rn = n.getBoundingClientRect();
  // a folga cobre a borda esmaecida, para a escolhida não ficar embaixo dela
  if (r.left < rn.left) n.scrollLeft -= rn.left - r.left + 28;
  else if (r.right > rn.right) n.scrollLeft += r.right - rn.right + 28;
}

function SeletorObra({ obras, obra, resumo, trocar }: { obras: Obra[]; obra: Obra; resumo: ResumoDaObra | null; trocar: (id: string) => void }) {
  const { aberto, setAberto, caixa, tecla } = useMenu();
  const { podeOperar } = useCasca();
  const [busca, setBusca] = useState("");
  const q = busca
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const lista = q
    ? obras.filter((o) =>
        o.nome
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(q),
      )
    : obras;
  useEffect(() => {
    if (!aberto) setBusca("");
  }, [aberto]);
  return (
    <div className="seletor" ref={caixa} onKeyDown={tecla}>
      <button
        type="button"
        className="seletor-bt"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={[obra.nome, statusDaObra(obra, resumo)].filter(Boolean).join(" · ")}
        onClick={() => setAberto((a) => !a)}
      >
        <span className="dot" style={{ background: COR_STATUS[obra.status] }} aria-hidden="true" />
        <span className="seletor-t">
          <span className="seletor-nome">{obra.nome}</span>
          <span className="sr-only">, </span>
          <span className="seletor-st">{statusDaObra(obra, resumo)}</span>
        </span>
        <Icone nome="chevDown" tam={14} />
      </button>
      {aberto ? (
        <div className="ca-menu-pop seletor-pop" role="menu" aria-label="Trocar de obra">
          {obras.length > 6 ? (
            <label className="busca seletor-busca">
              <Icone nome="busca" tam={15} />
              <span className="sr-only">Buscar obra</span>
              <input
                data-foco
                type="search"
                placeholder="Buscar obra"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  // ↓ sai da busca para a lista; Enter com um resultado só já troca
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    e.stopPropagation(); // senão o menu também anda e pula o 1º item
                    caixa.current?.querySelector<HTMLElement>(".seletor-lista [role=menuitem]")?.focus();
                  } else if (e.key === "Enter" && lista.length === 1) {
                    setAberto(false);
                    trocar(lista[0]!.id);
                  }
                }}
              />
            </label>
          ) : null}
          <div className="seletor-lista">
            {lista.length ? null : <div className="seletor-vazio">Nenhuma obra com «{busca.trim()}».</div>}
            {lista.map((o) => (
              <button
                key={o.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-current={o.id === obra.id ? "true" : undefined}
                onClick={() => {
                  setAberto(false);
                  trocar(o.id);
                }}
              >
                <span className="dot" style={{ background: COR_STATUS[o.status] }} aria-hidden="true" />
                <span className="seletor-pop-n">{o.nome}</span>
                <span className="seletor-pop-st">{statusDaObra(o, resumo)}</span>
              </button>
            ))}
          </div>
          {podeOperar ? (
            <Link href="/obras/nova" role="menuitem" tabIndex={-1} className="seletor-nova">
              <Icone nome="plus" tam={15} />
              Nova obra
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
