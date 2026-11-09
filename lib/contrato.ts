/**
 * Tipos do contrato do MVP-0 (docs/contrato.md no canteiro-api), espelhando dominio/src/canteiro_dominio/modelos.py de lá.
 * Quantidade em milésimos e dinheiro em centavos, sempre inteiros: quem formata é o front (lib/formato.ts).
 * Datas chegam como texto ISO 8601 com fuso.
 */

export type Milesimos = number;
export type Centavos = number;
export type DataISO = string;

export type Papel = "viewer" | "admin" | "master";

export interface Usuario {
  id: string;
  nome: string;
  tenant_id: string;
  papel: Papel;
}

interface Documento {
  id: string;
  tenant_id: string;
  criado_em: DataISO;
}

/** `desfazendo_aprovacao`: o Desfazer da aprovação parou no meio; a API recusa o que mexe em Compras (409) até terminar. */
export type StatusObra = "em_andamento" | "em_orcamento" | "concluida" | "desfazendo_aprovacao";

export type Tipologia = "casa" | "sobrado" | "predio" | "galpao" | "reforma" | "comercial" | "outro";
export type Padrao = "baixo" | "normal" | "alto";
export type Regime = "empreitada" | "administracao";
export type Proprietario = "pf" | "pj";
/** As destinações da tabela VAU do SERO: é por elas (com UF e mês) que a Receita dá o valor do m². */
export type Destinacao =
  | "residencial_unifamiliar"
  | "residencial_multifamiliar"
  | "casa_popular"
  | "conjunto_habitacional"
  | "comercial"
  | "edificio_garagens"
  | "galpao";
export type Material = "alvenaria" | "mista" | "madeira";
export type Finalidade = "uso_proprio" | "venda" | "prestacao_servico";
export type CategoriaObra = "obra_nova" | "acrescimo" | "reforma" | "demolicao";

export interface Obra extends Documento {
  nome: string;
  cidade: string;
  cep: string;
  verba: Centavos;
  status: StatusObra;
  /** O registro a desfazer de novo para continuar, quando `status` é `desfazendo_aprovacao`. */
  desfazendo_registro_id?: string | null;
  endereco: string;
  uf: string;
  tipologia: Tipologia | null;
  /** m² em milésimos (142,5 m² = 142500); 0 = não informado. */
  area_construida: Milesimos;
  pavimentos: number;
  padrao: Padrao | null;
  regime: Regime | null;
  cliente: string;
  /** AAAA-MM-DD */
  inicio: string | null;
  prazo_meses: number;
  numero_contrato: string;
  /** Centésimos de ponto percentual (22,91% = 2291); 0 = não informado. */
  bdi: number;
  /** AAAA-MM: mês dos preços de referência. */
  data_base: string | null;
  // Dados fiscais (aba Tributos). Opcionais aqui: a demonstração e a API de antes não os mandam.
  /** Matrícula no CNO, só os 12 dígitos; "" = não informado. */
  cno?: string;
  proprietario?: Proprietario | null;
  destinacao?: Destinacao | null;
  material?: Material | null;
  /** m² em milésimos. */
  area_complementar?: Milesimos;
  area_descoberta?: Milesimos;
  /** VAU à mão, centavos por m²; 0 = usar a tabela VAU do SERO para a UF e a destinação. */
  vau?: Centavos;
  /** AAAA-MM do VAU à mão. */
  vau_referencia?: string | null;
  finalidade?: Finalidade | null;
  valor_terreno?: Centavos;
  /** Imóveis residenciais vendidos (redutor social do IBS/CBS). */
  unidades?: number;
  /** null = da tipologia (reforma) ou obra nova. */
  categoria?: CategoriaObra | null;
  /** DCTFWeb entregue em todos os meses da obra (condição do fator de ajuste do INSS). */
  dctfweb_em_dia?: boolean | null;
}

/** PATCH /obras/{id}: só os campos enviados mudam. */
export type DadosObra = Partial<Omit<Obra, keyof Documento | "status">>;
export type CorpoObra = DadosObra & { nome: string; chave_idempotencia: string };

/** Índices (0-based) das colunas da planilha; null = não mapeada. */
export interface Mapeamento {
  planilha: string;
  linha_cabecalho: number;
  /** Só no orçamento (EAP): nº do item ("3.2.1"), código e fonte (SINAPI, SEINFRA, próprio). */
  item: number | null;
  codigo: number | null;
  fonte: number | null;
  nome: number | null;
  unidade: number | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  saldo: number | null;
  curva: number | null;
}

export interface LeituraPlanilha {
  planilhas: string[];
  planilha: string;
  linha_cabecalho: number;
  colunas: { indice: number; titulo: string }[];
  amostra: string[][];
  sugestao: Mapeamento;
}

export interface LinhaOrcamento {
  linhas: number[];
  nome: string;
  unidade: string;
  quantidade: Milesimos;
  valor_unitario: Centavos;
  total: Centavos;
  curva: CurvaABC;
  saldo: Milesimos;
  situacao: "novo" | "atualiza";
  precisa_antes: Milesimos | null;
  valor_antes: Centavos | null;
}

export interface PreviaOrcamento {
  aplicado: boolean;
  linhas: LinhaOrcamento[];
  ignoradas: { linha: number; texto: string; motivo: string }[];
  erros: { linha: number; campo: string | null; mensagem: string }[];
  total: Centavos;
  novos: number;
  atualizados: number;
  juntadas: number;
  /** Só depois de aplicada: uma entrada do registro por lote (é o que o Desfazer usa). */
  registro_ids?: string[];
}

/** Um material do projeto estrutural levado para a obra (POST /obras/{id}/orcamento/materiais). */
export interface MaterialDoProjeto {
  nome: string;
  unidade: string;
  quantidade: Milesimos;
  valor_unitario: Centavos;
}

export type CurvaABC = "A" | "B" | "C";

/** Serviço (terraplanagem, empreiteiro) não tem estoque: saldo 0, sem entrada/saída/ajuste; "a caminho" = contratado e não medido. */
export type TipoInsumo = "material" | "servico";

/* ---------- orçamento da obra (EAP, em versões) ---------- */

export type TipoVersao = "contrato" | "aditivo";

export interface VersaoOrcamento {
  id: string;
  obra_id: string;
  tipo: TipoVersao;
  /** 0 no contrato; 1, 2… nos aditivos. */
  numero: number;
  descricao: string;
  /** AAAA-MM-DD */
  data: string | null;
  arquivo: string;
  itens: number;
  etapas: number;
  total: Centavos;
  /** false = desfeita ou substituída. */
  ativa: boolean;
  substitui: string | null;
  /** A EntradaRegistro da importação: o Desfazer da versão usa este ID. */
  registro_id: string | null;
  criado_em: DataISO;
}

export interface ItemPrevia {
  ordem: number;
  tipo: "etapa" | "item";
  numero: string;
  nivel: number;
  /** Número da etapa raiz ("2" para "2.1.1"). */
  etapa: string;
  codigo: string;
  fonte: string;
  descricao: string;
  unidade: string;
  quantidade: Milesimos;
  valor_unitario: Centavos;
  total: Centavos;
  linha: number;
  /** No aditivo: de onde veio a etapa do item. "codigo" = a do contrato com o mesmo fonte|código. */
  etapa_origem?: "planilha" | "codigo" | "escolhida" | null;
  /** A etapa que estava na planilha do aditivo. */
  etapa_planilha?: string | null;
}

export interface ItemOrcamento extends ItemPrevia {
  id: string;
  obra_id: string;
  versao_id: string;
}

export interface EtapaPrevia {
  etapa: string;
  descricao: string;
  total: Centavos;
}

export interface PreviaVersao {
  aplicado: boolean;
  tipo: TipoVersao;
  itens: ItemPrevia[];
  ignoradas: { linha: number; texto: string; motivo: string }[];
  erros: { linha: number; campo: string | null; mensagem: string }[];
  avisos: { linha: number; mensagem: string }[];
  total: Centavos;
  n_itens: number;
  n_etapas: number;
  etapas: EtapaPrevia[];
  substitui: { versao_id: string; total: Centavos; itens: number } | null;
  versao_id: string | null;
  registro_id: string | null;
}

/** Previsto × realizado (Fase 3), somado das linhas dos pedidos pela etapa. Cancelado não conta. */
export interface Gasto {
  /** Pedidos em cotação. */
  cotando: Centavos;
  /** De aprovado em diante, pelo maior entre o pedido e o entregue. */
  comprometido: Centavos;
  /** Entregue ou medido, pelo preço do pedido. */
  realizado: Centavos;
}

export interface EtapaOrcamento extends Gasto {
  etapa: string;
  descricao: string;
  contratado: Centavos;
  aditivos: Centavos;
  atual: Centavos;
  /** atual − comprometido, calculado pela API (a tela não refaz a conta). */
  saldo: Centavos;
  /** Comprometido acima do orçado atual. */
  estourou: boolean;
}

/** `GET /obras/{id}/orcamento`. */
export interface Orcamento {
  versoes: VersaoOrcamento[];
  itens: (ItemOrcamento & { curva: CurvaABC | null })[];
  etapas: EtapaOrcamento[];
  /** Os gastos já incluem `sem_etapa` (gasto sem etapa ou em etapa fora das versões vigentes). */
  totais: Gasto & {
    contratado: Centavos;
    aditivos: Centavos;
    atual: Centavos;
    /** atual − comprometido. */
    saldo: Centavos;
    /** aditivos ÷ contratado em centésimos de % (294 = 2,94%); null sem contrato. */
    aditivos_pct: number | null;
    n_itens: number;
    n_etapas: number;
    sem_etapa: Gasto;
  };
}

/** `PATCH /obras/{id}/orcamento/itens/{item_id}`: ao menos um dos dois. */
export interface CorpoEditarItem {
  quantidade?: Milesimos;
  valor_unitario?: Centavos;
}

export interface ItemEditado {
  item: ItemOrcamento;
  total_versao: Centavos;
  registro_id: string;
}

/** O que acompanha a planilha no `POST …/orcamento/versoes`. */
export interface CorpoVersao {
  mapeamento: Mapeamento;
  tipo: TipoVersao;
  descricao?: string;
  data?: string | null;
  aplicar: boolean;
  chave_idempotencia?: string;
  /** No aditivo: `{ordem: etapa}` dos itens que a pessoa mudou de etapa na prévia. */
  etapas_itens?: Record<string, string>;
}

export interface Insumo extends Documento {
  obra_id: string;
  nome: string;
  unidade: string;
  precisa_ate_o_fim: Milesimos;
  curva: CurvaABC;
  /** Preço unitário do orçamento; 0 = sem preço. */
  valor_unitario: Centavos;
  /** Ausente nas respostas antigas = material. */
  tipo?: TipoInsumo;
  /** A etapa do orçamento de onde o item saiu (chave de `GET …/etapas`); null ou ausente = sem etapa. */
  etapa?: string | null;
}

/** Calculada por `regras.conta_de_falta` na API. O front só mostra; nunca refaz a conta. */
export interface Conta {
  precisa: Milesimos;
  saldo: Milesimos;
  a_caminho: Milesimos;
  cotando: Milesimos;
  transferencia: Milesimos;
  falta: Milesimos;
  comprar: Milesimos;
  /** Serviço já entregue (medido). Ausente em API antiga. */
  medido?: Milesimos;
}

export interface ItemInsumo {
  insumo: Insumo;
  conta: Conta;
}

export type TipoMovimento = "entrada" | "saida" | "ajuste" | "transferencia_entrada" | "transferencia_saida";

export interface Movimento extends Documento {
  obra_id: string;
  insumo_id: string;
  tipo: TipoMovimento;
  quantidade: Milesimos;
  destino: string | null;
  origem_doc: string | null;
  quem: string; // nome legível de quem lançou
  usuario_id?: string | null;
  origem: string;
  desfaz: string | null;
}

/** `POST /obras/{id}/insumos`: o que chegou ou foi comprado fora da planilha. `precisa_ate_o_fim` 0 = fora da conta. */
export interface CorpoInsumo {
  nome: string;
  unidade: string;
  tipo?: TipoInsumo;
  curva?: CurvaABC;
  precisa_ate_o_fim?: Milesimos;
  /** Preço de referência (centavos); vem da tabela oficial quando o item é cadastrado a partir dela. */
  valor_unitario?: Centavos;
}

/** `POST /obras/{id}/movimentos`. Ajuste leva o sinal na quantidade (+ achou, − sumiu); os outros tipos, > 0. */
export interface CorpoMovimento {
  insumo_id: string;
  tipo: "entrada" | "saida" | "ajuste";
  quantidade: Milesimos;
  destino?: string | null;
  origem_doc?: string | null;
  /** Apropriação do consumo: obrigatória na saída quando a obra tem orçamento importado. */
  etapa?: string | null;
  chave_idempotencia: string;
}

/** `GET /obras/{id}/etapas`: as etapas das versões vigentes. Lista vazia = obra sem orçamento, etapa opcional. */
export interface EtapaObra {
  etapa: string;
  descricao: string;
}

/* ---------- suprimentos: fornecedores, pedidos com linhas e recebimentos ---------- */

/** Do tenant, vale para todas as obras. `cnpj` só dígitos ou "". */
export interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  telefone: string;
  email: string;
}
export type CorpoFornecedor = Partial<Omit<Fornecedor, "id">> & { nome: string };

/**
 * `parcial` = recebeu parte, o resto continua a caminho. `conferido` a tela chama de "Recebido". `recebido` é o status
 * antigo (chegou, falta conferir), que só a demonstração ainda usa.
 */
export type StatusPedido = "em_cotacao" | "aprovado" | "enviado" | "em_transito" | "parcial" | "recebido" | "conferido" | "cancelado";

export interface LinhaPedido {
  insumo_id: string;
  nome: string;
  unidade: string;
  tipo: TipoInsumo;
  etapa: string | null;
  quantidade: Milesimos;
  valor_unitario: Centavos;
  /** quantidade × unitário, arredondado ao centavo. */
  total: Centavos;
  recebida: Milesimos;
  /** quantidade − recebida pela regra do domínio; 0 em pedido conferido ou cancelado. */
  falta_entregar: Milesimos;
}

export interface Pedido {
  id: string;
  numero: string;
  obra_id: string;
  fornecedor: string;
  fornecedor_id: string | null;
  previsao: string | null;
  observacao: string;
  status: StatusPedido;
  /** Soma dos `total` das linhas. */
  valor: Centavos;
  /** AAAA-MM-DD da última entrega; null sem entrega (ausente em API antiga). */
  recebido_em?: string | null;
  /** Quantos recebimentos (entregas) o pedido já teve. */
  recebimentos: number;
  /** Soma dos gastos confirmados como pagamento deste pedido (só informa: o custo conta pela entrega). */
  pago?: Centavos;
  criado_em: DataISO;
  linhas: LinhaPedido[];
}

export interface CorpoLinhaPedido {
  insumo_id: string;
  quantidade: Milesimos;
  valor_unitario: Centavos;
  etapa?: string | null;
}

/** `POST /obras/{id}/pedidos`: 1 a 50 linhas, sem repetir insumo. `aprovado` cria já aprovado. */
export interface CorpoPedido {
  fornecedor_id?: string | null;
  fornecedor: string;
  previsao?: string | null;
  observacao?: string;
  aprovado: boolean;
  linhas: CorpoLinhaPedido[];
  /** A mesma chave devolve o pedido já criado; com outro conteúdo, 409. */
  chave_idempotencia?: string;
}

/** `PATCH /pedidos/{id}`. */
export interface CorpoEditarPedido {
  previsao?: string | null;
  observacao?: string;
}

/** `POST /pedidos/{id}/avancar`: os status sem entrega; `conferido` vindo de `parcial` encerra o resto. */
export interface CorpoAvancar {
  para: StatusPedido;
  quantidade_recebida?: Milesimos;
  nf?: string;
}

export interface CorpoRecebimento {
  nf_numero?: string | null;
  nf_data?: string | null;
  nf_valor?: Centavos | null;
  /** `indice` = posição da linha no pedido. */
  linhas: { indice: number; quantidade: Milesimos }[];
  chave_idempotencia: string;
}

export interface Recebimento {
  id: string;
  numero: number;
  nf_numero: string | null;
  nf_data: string | null;
  nf_valor: Centavos | null;
  /** Soma das linhas pelo preço do pedido. */
  valor: Centavos;
  criado_em: DataISO;
  quem: string;
  linhas: { indice: number; insumo_id: string; nome: string; unidade: string; quantidade: Milesimos; valor: Centavos; etapa: string | null }[];
}

export interface RespostaRecebimento {
  recebimento: Recebimento;
  pedido: Pedido;
  registro_id: string | null;
}

/** As escritas da tela devolvem o ID da EntradaRegistro criada: é o que o "Desfazer" do aviso usa. */
export type ComRegistro<T> = T & { registro_id?: string | null };

export type StatusProposta = "pendente" | "aprovada" | "recusada" | "desfeita";
export type TipoProposta = "criar_pedido" | "avancar_pedido" | "ajuste_estoque" | "registrar_entrega";
/**
 * O que aprovar faz, decidido pela API ao criar a proposta: o botão diz a consequência por ele. "conferido" num pedido
 * parcial ENCERRA o resto (nada entra); num pedido que chegou, dá entrada. Proposta antiga vem sem o campo.
 */
export type EfeitoProposta = "compra" | "entrada" | "encerramento" | "cancelamento" | "status" | "ajuste";

export interface DadosCriarPedido {
  insumo_id: string;
  quantidade: Milesimos;
  fornecedor: string;
  valor: Centavos;
  previsao?: string | null;
}
export interface DadosAvancarPedido {
  pedido_id: string;
  para: StatusPedido;
  quantidade_recebida?: Milesimos | null;
  nf?: string | null;
}
export interface DadosAjusteEstoque {
  insumo_id: string;
  quantidade: Milesimos;
  motivo: string;
}
/** Entrega proposta: o mesmo corpo do "Registrar entrega" (POST /pedidos/{id}/recebimentos), sem a chave. */
export interface DadosRegistrarEntrega {
  pedido_id: string;
  linhas: { indice: number; quantidade: Milesimos }[];
  nf_numero?: string;
  /** AAAA-MM-DD */
  nf_data?: string | null;
  nf_valor?: Centavos | null;
  /** A pessoa confirmou que chegou mais do que faltava. */
  confirmar_excesso?: boolean;
}

export interface Proposta extends Documento {
  obra_id: string;
  tipo: TipoProposta;
  titulo: string;
  conta: string;
  /** Por que o agente propõe, em uma frase. */
  justificativa?: string;
  fonte: string;
  dados: Record<string, unknown>;
  /** Alguém mudou os dados antes de aprovar: `dados` é o que foi executado, `dados_originais` o que o agente propôs. */
  ajustada?: boolean;
  dados_originais?: Record<string, unknown> | null;
  sugerido_por: string;
  status: StatusProposta;
  decidido_por: string | null;
  decidido_em: DataISO | null;
  motivo_recusa: string | null;
  decidido_por_nome: string | null;
  /** A EntradaRegistro da execução: o que o Desfazer usa, inclusive depois de recarregar a tela. */
  registro_id?: string | null;
  efeito?: EfeitoProposta | null;
}

export interface EntradaRegistro extends Documento {
  obra_id: string | null;
  quem: string; // nome legível
  quem_nome?: string;
  usuario_id?: string;
  origem: string;
  texto: string;
  proposta_id: string | null;
  desfazer: Record<string, unknown> | null;
  desfeito: boolean;
}

/** O que dá para mudar antes de aprovar, por tipo (o resto da proposta é fixo). */
export type AjustesProposta =
  | Partial<Pick<DadosCriarPedido, "quantidade" | "fornecedor" | "valor" | "previsao">>
  | Partial<Pick<DadosAvancarPedido, "quantidade_recebida" | "nf">>
  | Partial<Pick<DadosAjusteEstoque, "quantidade" | "motivo">>
  | Partial<Pick<DadosRegistrarEntrega, "linhas" | "nf_numero" | "nf_data" | "nf_valor" | "confirmar_excesso">>;

/** Resposta de `POST /propostas/{id}/aprovar`. */
export interface RespostaAprovar {
  proposta: Proposta;
  registro: EntradaRegistro;
}

export interface RespostaEntrar {
  acesso: string;
  renovacao: string;
  usuario: Usuario;
}

/* ---------- SSE do POST /conversa ---------- */

export type NivelFerramenta = "consulta" | "propoe";

export interface UsoConversa {
  tokens: number;
  custo: number;
}

export type EventoConversa =
  | { tipo: "texto"; delta: string }
  // O agente refaz a resposta (o modelo mandou JSON ilegível): tira do balão o texto desta tentativa, que termina nele.
  | { tipo: "descartar"; texto: string }
  | { tipo: "ferramenta"; nome: string; nivel: NivelFerramenta; resumo: string }
  | { tipo: "proposta"; proposta: Proposta }
  | { tipo: "fim"; sessao_id: string; uso: UsoConversa }
  | { tipo: "erro"; mensagem: string };

export interface CorpoConversa {
  sessao_id?: string | null;
  obra_id?: string | null;
  texto: string;
}

/* ---------- página inicial e conta (Web v2) ---------- */

/** `GET /obras/resumo`: um por obra, somado na API (nada de agregação no banco). */
export interface ResumoObra {
  obra: Obra;
  /** Propostas pendentes. */
  pendencias: number;
  /** Insumos com `Conta.comprar > 0`. */
  falta_comprar: number;
  /** Pedidos ainda não conferidos nem cancelados. */
  pedidos_abertos: number;
  valor_pedidos_abertos: Centavos;
  /** Pedidos recebidos esperando a conferência da NF. */
  nf_para_conferir: number;
  ultima_atividade: DataISO | null;
  /** Tem orçamento (versão vigente ou lista de materiais). Ausente em API antiga. */
  tem_orcamento?: boolean;
  /** O prazo do cronograma (o mesmo do GET /obras/{id}/cronograma); null sem cronograma. */
  prazo?: PrazoCronograma | null;
}

/** `GET /obras/{id}/hoje`: o que importa hoje, determinístico, com as contas prontas. */
export type PrioridadeHoje = "pede_voce" | "atencao" | "a_caminho" | "ok";

export interface AcaoHoje {
  /** Os nomes de tela da web ("suprimentos" é Compras). */
  tela: string;
  rotulo: string;
  filtro: { etapa?: string; status?: string } | null;
}

export interface PontoHoje {
  tipo: string;
  prioridade: PrioridadeHoje;
  titulo: string;
  detalhe: string;
  acao: AcaoHoje | null;
}

export interface EventoSemana {
  /** AAAA-MM-DD */
  data: string;
  tipo: "entrega" | "inicio_etapa";
  titulo: string;
  detalhe: string;
  acao: AcaoHoje | null;
}

export interface HojeNaObra {
  hoje: string;
  resumo: {
    situacao: "no_prazo" | "atrasada" | "sem_medicao";
    frase: string;
    /** Quantos pontos pedem a pessoa, mesmo os cortados pelo limite. */
    esperando: number;
    /** null sem cronograma; `semana_atual` null antes do início, e passa do total se atrasar. */
    semana_atual?: number | null;
    semanas_total?: number | null;
  };
  pontos: PontoHoje[];
  /** Quantos pontos ficaram de fora do limite de 6. */
  mais: number;
  semana: EventoSemana[];
}

/** Valores de IA em microdólares (1 US$ = 1.000.000), inteiros como o resto do dinheiro. */
export type Microdolares = number;

export interface Creditos {
  saldo_microdolares: Microdolares;
  franquia: Microdolares;
  chave_propria: boolean;
  usuario_id?: string;
  tenant_id?: string;
}

/** Situação da chave própria da Anthropic. Nunca traz a chave: só os 4 últimos caracteres. */
export interface ChavePropria {
  ativa: boolean;
  final: string | null;
  cadastrada_em: DataISO | null;
}

/** `GET /conta`. */
export interface MinhaConta {
  usuario: { id: string; nome: string; email: string; papel: Papel };
  tenant: { id: string; nome: string };
  chave_propria: ChavePropria | null;
  creditos: Creditos;
}

export interface SomaUso {
  custo: Microdolares;
  tokens: number;
}

/** `GET /uso?de&ate`: dias sem consumo não vêm na lista. */
export interface RelatorioUso {
  total: SomaUso;
  por_dia: (SomaUso & { dia: string })[];
  por_obra: (SomaUso & { obra_id: string | null })[];
  por_rota: (SomaUso & { rota: string })[];
}

/* ---------- cronograma físico-financeiro e medição (Fase 4) ---------- */

/** Centésimos de ponto percentual: 12,5% = 1250; 100% = 10000. */
export type Centesimos = number;

export interface EtapaCronograma {
  etapa: string;
  descricao: string;
  /** Orçado atual da etapa (centavos). */
  atual: Centavos;
  /** Um por mês do cronograma; a etapa soma 10000 ou é toda zero (fora do cronograma). */
  percentuais: Centesimos[];
  medido_acumulado: Centesimos;
}

export interface MesCronograma {
  /** AAAA-MM */
  mes: string;
  previsto: Centavos;
  previsto_acumulado: Centavos;
  pct_previsto_acumulado: Centesimos;
  /** null depois da última medição. */
  medido: Centavos | null;
  medido_acumulado: Centavos | null;
  pct_medido_acumulado: Centesimos | null;
  /** Previsto acumulado pela linha de base (o cronograma original), para a 3ª linha da curva S. */
  pct_base_acumulado?: Centesimos | null;
}

export interface PrazoCronograma {
  termino_contratual: string | null;
  termino_projetado: string | null;
  /** Meses, arredondado (meio mês para cima); negativo = adiantada. */
  atraso_meses: number | null;
  /** Décimos de mês, interpolado dentro do mês (1,4 mês = 14); negativo = adiantada. */
  atraso_decimos?: number | null;
  /** O mesmo contra a linha de base: o atraso que reprogramar não apaga. */
  termino_base?: string | null;
  atraso_base_decimos?: number | null;
  atraso_base_meses?: number | null;
  pct_previsto_na_medicao: Centesimos | null;
  pct_medido: Centesimos | null;
  mes_referencia: string | null;
}

export interface Medicao {
  id: string;
  numero: number;
  mes: string;
  etapas: { etapa: string; pct_acumulado: Centesimos; pct_periodo: Centesimos; valor_periodo: Centavos }[];
  valor: Centavos;
  pct_obra_acumulado: Centesimos;
  observacao: string;
  quem: string;
  criado_em: DataISO;
  /** Se a API mandar, o Desfazer usa direto; senão a tela procura no registro. */
  registro_id?: string | null;
}

/** `GET /obras/{id}/resumo`: só os blocos que a web lê (o resto do contrato — entregas, almoxarifado — é do agente). */
export interface ResumoDaObra {
  obra: Obra;
  financeiro: {
    tem_orcamento: boolean;
    orcado_atual: Centavos;
    comprometido: Centavos;
    realizado: Centavos;
    saldo: Centavos;
    /** Orçado atual − realizado, nunca negativo. Opcional: a API de antes não manda. */
    falta_gastar?: Centavos;
    /** Realizado sobre o orçado, em centésimos de ponto (4,8% = 480); null sem orçado. */
    realizado_pct?: number | null;
    etapas_estouradas?: unknown[];
  };
  cronograma: {
    cadastrado: boolean;
    /** AAAA-MM */
    termino_contratual: string | null;
    /** AAAA-MM; null sem medição. */
    termino_projetado: string | null;
    /** Décimos de mês (1,4 mês = 14); null sem medição. */
    atraso_decimos: number | null;
    etapas_atrasadas?: unknown[];
  };
  entregas?: { atrasadas?: unknown[] };
  pendencias?: { propostas: number };
}

/** `GET /obras/{id}/cronograma`. Sem cronograma: `inicio` null e `meses` 0. */
export interface Cronograma {
  inicio: string | null;
  meses: number;
  /** O primeiro cronograma (ou o último marcado como nova linha de base). */
  base?: { inicio: string; meses: number } | null;
  /** Quantas reprogramações depois da base. */
  revisoes?: number;
  etapas: EtapaCronograma[];
  mensal: MesCronograma[];
  medicoes: Medicao[];
  prazo: PrazoCronograma;
  registro_id?: string | null;
}

export interface CorpoCronograma {
  inicio: string;
  meses: number;
  etapas: { etapa: string; percentuais: Centesimos[] }[];
  /** Este cronograma passa a ser a base (o atraso volta a ser medido contra ele). */
  nova_linha_base?: boolean;
  /** Aditivo de prazo: grava `meses` no prazo da obra na mesma operação (o Desfazer volta os dois). */
  atualizar_prazo_da_obra?: boolean;
}

export interface CorpoMedicao {
  mes: string;
  etapas: { etapa: string; pct_acumulado: Centesimos }[];
  observacao?: string;
  chave_idempotencia: string;
}

export interface RespostaMedicao {
  medicao: Medicao;
  cronograma: Cronograma;
  registro_id?: string | null;
}

/** `GET /obras/{id}/desembolso`: o que já saiu por mês e o que ainda vai sair (servicos/desembolso.py na API). */
export interface MesDesembolso {
  mes: string;
  /** Gastos confirmados pagos no mês. */
  pago: Centavos;
  /** O cronograma vigente para o mês. */
  previsto: Centavos;
  /** O que ainda vai sair no mês se a obra voltar ao ritmo do cronograma; 0 antes do mês corrente. */
  projetado: Centavos;
  /** O mesmo no ritmo medido até aqui. */
  projetado_no_ritmo: Centavos;
}

export interface EtapaDesembolso {
  etapa: string;
  descricao: string;
  atual: Centavos;
  realizado: Centavos;
  executado_pct: Centesimos;
  falta: Centavos;
  devido_agora: Centavos;
  sem_cronograma: boolean;
}

export interface Desembolso {
  mes_atual: string;
  /** De onde vem o avanço: a medição, os gastos (obra sem medição) ou nada (sem cronograma). */
  base: "medicao" | "gastos" | "sem_cronograma";
  mes_referencia: string | null;
  atraso_meses: number;
  /** % medido ÷ % previsto na última medição (10000 = no ritmo do plano). */
  ritmo_pct: Centesimos;
  termino_projetado: string | null;
  termino_no_ritmo: string | null;
  meses: MesDesembolso[];
  etapas: EtapaDesembolso[];
  totais: {
    orcado: Centavos;
    realizado: Centavos;
    pago: Centavos;
    falta: Centavos;
    custo_final: Centavos;
    desvio: Centavos;
    entregue_sem_pagamento: Centavos;
    sem_mes: Centavos;
  };
}

// --- Gastos da obra: árvore, comprovantes e revisão (docs/contrato.md, "Gastos da obra") ---

export interface TopicoNaArvore {
  id: string;
  nome: string;
}

/** Etapa fixa (chave como "eletrica") ou extra da obra ("x-<id>"), com os tópicos dela. Arquivadas não vêm. */
export interface EtapaNaArvore {
  chave: string;
  nome: string;
  /** O que entra nela (vazio em etapa extra). */
  inclui: string;
  fixa: boolean;
  topicos: TopicoNaArvore[];
  /**
   * Em mudança na API ("opção 2"): `orcamento` quando a obra tem orçamento e as etapas são as dele (chave = código,
   * nome = descrição); `padrao` nas etapas fixas. Pode vir em cada etapa ou no topo da resposta (o cliente desce o do
   * topo para cada etapa); ausente = `padrao`.
   */
  origem?: "orcamento" | "padrao";
  /** Código da etapa do orçamento, se a API mandar separado da chave. */
  codigo?: string;
}

export interface EtapaExtra {
  id: string;
  chave: string;
  obra_id: string;
  nome: string;
  arquivado: boolean;
}

export interface Topico {
  id: string;
  obra_id: string;
  etapa: string;
  nome: string;
  arquivado: boolean;
}

export type StatusComprovante = "a_revisar" | "confirmado" | "descartado";

export interface Comprovante {
  id: string;
  obra_id: string;
  tipo_conteudo: string;
  tamanho: number;
  legenda: string;
  quem: string;
  status: StatusComprovante;
  /** A leitura da IA (crua); a tela usa a `revisao` do detalhe, já pronta. */
  leitura: unknown | null;
  erro_leitura: string | null;
  lido_em: DataISO | null;
  gasto_id: string | null;
  motivo_descarte: string;
  criado_em: DataISO;
  ja_existia?: boolean;
  registro_id?: string | null;
}

/** lido = a IA leu com certeza (opção já marcada) · conferir = dúvida, nenhuma marcada · vazio = não leu. */
export type EstadoCampo = "lido" | "conferir" | "vazio";

export interface OpcaoRevisao {
  /** Centavos (valor), "AAAA-MM-DD" (data) ou texto. */
  valor: number | string;
  rotulo: string;
  motivo: string;
  fornecedor_id: string | null;
}

export interface CampoRevisao {
  estado: EstadoCampo;
  opcoes: OpcaoRevisao[];
  escolhido: number | null;
}

export interface OpcaoClassificacao {
  etapa: string;
  topico_id: string | null;
  rotulo: string;
  motivo: string;
}

export interface Revisao {
  valor: CampoRevisao;
  data_pagamento: CampoRevisao;
  favorecido: CampoRevisao;
  descricao: CampoRevisao;
  classificacao: { estado: EstadoCampo; opcoes: OpcaoClassificacao[]; escolhido: number | null };
  tipo_documento: string | null;
  situacao_pagamento: "pago" | "a_pagar" | "incerto" | null;
  avisos: string[];
  observacoes: string | null;
}

export interface ComprovanteDetalhe extends Comprovante {
  revisao: Revisao;
}

export interface CorpoConfirmar {
  valor: Centavos;
  data_pagamento: string;
  favorecido: string;
  descricao: string;
  /** null = "Ver depois": entra sem etapa e conta só no total da obra. */
  etapa: string | null;
  topico_id?: string | null;
  fornecedor_id?: string | null;
  pedido_id?: string | null;
}

/** Gasto confirmado (dinheiro que saiu). Não confundir com `Gasto` do orçamento (cotando/comprometido/realizado). */
export interface GastoObra {
  id: string;
  obra_id: string;
  comprovante_id: string | null;
  valor: Centavos;
  data_pagamento: string;
  favorecido: string;
  fornecedor_id: string | null;
  descricao: string;
  /** null = sem etapa, a definir ("Ver depois"). */
  etapa: string | null;
  etapa_nome?: string;
  etapa_origem?: string;
  topico_id: string | null;
  pedido_id: string | null;
  quem: string;
  estornado: boolean;
  criado_em: DataISO;
  /** O que o pagamento comprova no INSS da obra; null = a classificar. */
  natureza_fiscal?: NaturezaFiscal | null;
  /** IBS/CBS destacado na nota (crédito). */
  ibs_cbs?: Centavos;
  /** Na nota de mão de obra: traz o CNO da obra. */
  nf_cno?: boolean | null;
  /** Retenção de 11% destacada na nota. */
  retencao?: Centavos;
}

// --- tributos da obra (estimativa: INSS da aferição e IBS/CBS) ---

export type NaturezaFiscal =
  | "folha"
  | "mao_de_obra_nf"
  | "gps"
  | "autonomo_mei"
  | "pre_moldado"
  | "concreto_usinado"
  | "mao_de_obra_sem_nf"
  | "material"
  | "equipamento"
  | "outros";

export interface INSSObra {
  situacao: "calculado" | "isenta" | "sem_dados";
  /** Por que não calculou (sem_dados) ou por que é isenta. */
  motivos: string[];
  /** Área para cálculo do SERO (equivalência + redução das complementares). */
  area_equivalente: Milesimos;
  custo_obra: Centavos;
  /** Mão de obra presumida não decadente, com todas as reduções. */
  rmt: Centavos;
  /** Centésimos de ponto (10000 = sem redução). */
  fator_social: number;
  percentual_rmt?: number;
  percentual_categoria?: number;
  pre_moldado?: "reduziu" | "virou_mista" | null;
  nao_decadente?: number;
  /** O que abate da RMT: remunerações corrigidas pela Selic + crédito do concreto. */
  comprovado: Centavos;
  comprovado_por_natureza: Partial<Record<NaturezaFiscal, Centavos>>;
  credito_concreto?: Centavos;
  credito_autonomo?: Centavos;
  base: Centavos;
  inss_sem_fator_ajuste?: Centavos;
  inss: Centavos;
  /** Fator de ajuste (só PF): zera o INSS com remuneração declarada suficiente e a DCTFWeb em dia. */
  fator_ajuste?: "nao_se_aplica" | "aplicado" | "atingido" | "nao_atingido";
  fator_ajuste_minimo?: number;
  creditos_fator_ajuste?: Centavos;
  /** Remuneração declarada que falta para o INSS da aferição zerar. */
  falta_fator_ajuste?: Centavos;
  /** Quanto o INSS cairia se a mão de obra sem nota (ou com nota sem o CNO) fosse comprovada. */
  economia_com_notas: Centavos;
  mao_de_obra_sem_nf: Centavos;
  notas_sem_cno?: Centavos;
  selic_faltando?: string[];
  avisos?: string[];
  /** A conta pronta, linha a linha. */
  linhas: string[];
}

export interface IBSCBSObra {
  situacao: "calculado" | "nao_incide" | "sem_dados";
  motivos: string[];
  aliquota_efetiva: number;
  valor_operacao: Centavos;
  redutor_ajuste: Centavos;
  redutor_social: Centavos;
  base: Centavos;
  debito: Centavos;
  creditos: Centavos;
  a_pagar: Centavos;
  /** A frase da fase da transição no ano corrente. */
  transicao: string;
  linhas: string[];
}

export interface GastoAClassificar {
  id: string;
  valor: Centavos;
  data_pagamento: string;
  favorecido: string;
  descricao: string;
  natureza_fiscal: NaturezaFiscal | null;
  nf_cno?: boolean | null;
}

/** GET /obras/{id}/tributos */
export interface TributosObra {
  obra_id: string;
  cno: string;
  /** AAAA-MM do VAU usado na conta (o informado ou o vigente da tabela). */
  vau_referencia: string | null;
  /** Centavos por m²; 0 = sem VAU (a conta fica sem_dados). */
  vau_usado?: Centavos;
  /** informado = o VAU à mão da obra; tabela_sero = o vigente da tabela da Receita. */
  vau_fonte?: "informado" | "tabela_sero" | null;
  /** A destinação usada (a da obra, ou a que sai do tipo de obra). */
  destinacao?: Destinacao | null;
  categoria?: CategoriaObra;
  /** AAAA-MM: o mês em que a conta supõe a aferição (hoje). */
  afericao?: string;
  /** AAAA-MM da última Selic carregada. */
  selic_ate?: string | null;
  inss: INSSObra;
  ibs_cbs: IBSCBSObra;
  /** Gastos avulsos sem natureza fiscal (contam zero no INSS). */
  a_classificar: number;
  valor_a_classificar: Centavos;
  /** Até 20 pagamentos de mão de obra sem nota (ou com nota sem o CNO), maiores primeiro. */
  sem_nota: GastoAClassificar[];
  /** Até 20 gastos a classificar, maiores primeiro. */
  pendentes: GastoAClassificar[];
  /** Percentuais usados, com a fonte (para o contador conferir). */
  parametros: { inss: Record<string, unknown>; ibs_cbs: Record<string, unknown> };
  aviso: string;
}

export interface CorpoFiscalGasto {
  natureza_fiscal: NaturezaFiscal | null;
  ibs_cbs?: Centavos;
  /** Só na mao_de_obra_nf: a nota traz o CNO e o endereço da obra. */
  nf_cno?: boolean | null;
  /** Só na mao_de_obra_nf: os 11% retidos, em centavos. */
  retencao?: Centavos;
}

export interface Confirmacao {
  gasto: GastoObra;
  comprovante: Comprovante;
  registro_id: string;
}

export interface ResumoGastos {
  /** Gastos avulsos confirmados: é o que soma no realizado. */
  total: Centavos;
  /** Gastos ligados a pedido (o custo já conta pela entrega). */
  pagamentos_de_pedidos: Centavos;
  a_revisar: number;
  /** Gastos em "Ver depois": contam na obra e em nenhuma etapa. Ausente em API antiga. */
  a_definir?: Centavos;
  /** A linha com `etapa` null é a dos gastos sem etapa. */
  etapas: { etapa: string | null; nome: string; total: Centavos; topicos: { topico_id: string | null; nome: string; total: Centavos }[] }[];
}

/** O que o agente responde em `POST /leituras/comprovante` (a leitura, ou o erro, já está gravada no comprovante). */
export interface RespostaLeitura {
  ok: boolean;
  mensagem?: string;
}
