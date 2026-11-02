/**
 * Tipos do contrato do MVP-0 (docs/contrato.md), espelhando packages/dominio/src/canteiro_dominio/modelos.py.
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

export type StatusObra = "em_andamento" | "em_orcamento" | "concluida";

export type Tipologia = "casa" | "sobrado" | "predio" | "galpao" | "reforma" | "comercial" | "outro";
export type Padrao = "baixo" | "normal" | "alto";
export type Regime = "empreitada" | "administracao";

export interface Obra extends Documento {
  nome: string;
  cidade: string;
  cep: string;
  verba: Centavos;
  status: StatusObra;
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
}

/** `GET /obras/{id}/orcamento`. */
export interface Orcamento {
  versoes: VersaoOrcamento[];
  itens: (ItemOrcamento & { curva: CurvaABC | null })[];
  etapas: EtapaOrcamento[];
  /** Os gastos já incluem `sem_etapa` (gasto sem etapa ou em etapa fora das versões vigentes). */
  totais: Gasto & { contratado: Centavos; aditivos: Centavos; atual: Centavos; n_itens: number; n_etapas: number; sem_etapa: Gasto };
}

/** O que acompanha a planilha no `POST …/orcamento/versoes`. */
export interface CorpoVersao {
  mapeamento: Mapeamento;
  tipo: TipoVersao;
  descricao?: string;
  data?: string | null;
  aplicar: boolean;
  chave_idempotencia?: string;
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
  /** Quantos recebimentos (entregas) o pedido já teve. */
  recebimentos: number;
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
export type TipoProposta = "criar_pedido" | "avancar_pedido" | "ajuste_estoque";

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
  | Partial<Pick<DadosAjusteEstoque, "quantidade" | "motivo">>;

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
}

export interface PrazoCronograma {
  termino_contratual: string | null;
  termino_projetado: string | null;
  /** Meses, arredondado (meio mês para cima); negativo = adiantada. */
  atraso_meses: number | null;
  /** Décimos de mês, interpolado dentro do mês (1,4 mês = 14); negativo = adiantada. */
  atraso_decimos?: number | null;
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

/** `GET /obras/{id}/cronograma`. Sem cronograma: `inicio` null e `meses` 0. */
export interface Cronograma {
  inicio: string | null;
  meses: number;
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
