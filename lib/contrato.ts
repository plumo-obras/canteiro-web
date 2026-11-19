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

/** `desfazendo_aprovacao`: o Desfazer da aprovação parou no meio; a API recusa editar o orçamento (409) até terminar. */
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
  /** Só no orçamento: medida, marca ou detalhe da linha ("0,60 x 2,10"). Ausente na API antiga. */
  complemento?: number | null;
}

export interface LeituraPlanilha {
  planilhas: string[];
  planilha: string;
  linha_cabecalho: number;
  colunas: { indice: number; titulo: string }[];
  amostra: string[][];
  sugestao: Mapeamento;
  /** "AAAA-MM" lido do título de uma coluna ou do topo da planilha; só sugestão para a data-base da obra. */
  data_base?: string | null;
  /** Banco de preços dito no topo da planilha ("SINAPI não desonerado"); só para mostrar. */
  banco?: string | null;
}

/** Um material do projeto estrutural levado para a obra (POST /obras/{id}/orcamento/materiais). */
export interface MaterialDoProjeto {
  nome: string;
  unidade: string;
  quantidade: Milesimos;
  valor_unitario: Centavos;
}

export type CurvaABC = "A" | "B" | "C";

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
  /** Contrato gravado pelo somar (planilha ou pranchas) ou pela ordem das etapas. Ausente na API antiga. */
  origem?: "somar" | "reordenar" | null;
  /** O nome da versão para a pessoa ("Materiais das pranchas", "Etapas reordenadas"). Ausente na API antiga. */
  rotulo?: string;
  /** O que o Desfazer desta versão faz, pronto; null = a tela diz o dela. */
  desfazer_texto?: string | null;
  /** A API resolve a cadeia (somar e reordenar substituem; o Desfazer desfaz). Ausente na API antiga. */
  situacao?: "vigente" | "substituida" | "desfeita";
  /** As linhas estão nas etapas da lista padrão (a ordem é a da lista e não muda). Ausente na API antiga. */
  padronizada?: boolean;
  /** "venda" = a planilha era o preço do cliente; os itens guardam o custo. Ausente na API antiga. */
  natureza?: "custo" | "venda";
  /** Na venda: o BDI usado para tirar o custo (centésimos de %). */
  bdi?: number;
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
  /**
   * No aditivo e no somar: de onde veio a etapa do item. "nome" = a etapa de mesmo nome no orçamento; "codigo" = a do
   * contrato com o mesmo fonte|código.
   */
  etapa_origem?: "planilha" | "nome" | "codigo" | "escolhida" | null;
  /** A etapa que estava na planilha do aditivo. */
  etapa_planilha?: string | null;
  /** No aditivo e no somar: o item do orçamento vigente que este parece repetir (quem decide é a pessoa). */
  repetido_de?: { item_id: string; descricao: string; quantidade: Milesimos; unidade: string } | null;
  /** Medida, marca ou detalhe da linha ("0,60 x 2,10"). */
  complemento?: string;
  /** O tópico do orçamento em que o item conta. */
  topico_id?: string | null;
  /** No orçamento padronizado: a etapa da planilha de onde o item veio (é o tópico dele); "" quando ela já é a etapa padrão. */
  grupo?: string;
  /** Na planilha de venda: o preço do cliente; `valor_unitario`/`total` são o custo. */
  valor_unitario_venda?: Centavos | null;
  total_venda?: Centavos | null;
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

/** Uma etapa da planilha e as etapas padrão para onde os itens dela foram (importação padronizada). */
export interface EncaixeEtapa {
  /** A chave da etapa na planilha ("7"): é ela que vai em `destinos`. */
  etapa_planilha: string;
  descricao: string;
  /** A etapa padrão da maior parte do valor. */
  destino: string;
  destino_nome: string;
  /** A pessoa escolheu o destino da etapa inteira. */
  escolhida: boolean;
  total: Centavos;
  /** A etapa da planilha aberta pelas etapas padrão; mais de uma na etapa mista ("ACABAMENTOS"). */
  etapas: { etapa: string; nome: string; total: Centavos; itens: number }[];
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
  /** Só na prévia do somar: o orçamento depois de somar (o vigente + `total`). */
  total_apos?: Centavos | null;
  /**
   * Só no somar que reordena: {chave de etapa da prévia: número com que ela é gravada}, das que mudam. As chaves
   * continuam valendo em `etapas_itens`; o número daqui é o que a tela mostra.
   */
  numeracao?: Record<string, string>;
  /** Os tópicos que os itens tocam (nível 2 da numeração ou a etapa da planilha, no padronizado). */
  topicos?: { etapa: string; id: string; nome: string; total: Centavos }[];
  /** As linhas foram encaixadas na lista padrão de etapas. */
  padronizada?: boolean;
  encaixe?: EncaixeEtapa[];
  /** A lista padrão, para trocar o destino. */
  etapas_disponiveis?: EtapaObra[];
  natureza?: "custo" | "venda";
  bdi?: number;
  /** Na venda: o total do cliente; `total` é o custo. */
  total_venda?: Centavos | null;
  versao_id: string | null;
  registro_id: string | null;
}

/** O que a etapa já gastou: os gastos confirmados por comprovante. */
export interface GastoNoOrcamento {
  gasto: Centavos;
}

/** As contas de orçado × gasto de uma etapa ou de um tópico, prontas da API. */
export interface ContasOrcado extends GastoNoOrcamento {
  contratado: Centavos;
  aditivos: Centavos;
  atual: Centavos;
  /** atual − gasto ("falta gastar"), calculado pela API (a tela não refaz a conta). */
  saldo: Centavos;
  /** Gastou acima do orçado atual. */
  estourou: boolean;
}

export interface TopicoOrcamento extends ContasOrcado {
  /** null = o que entrou só na etapa ("Sem tópico"). */
  topico_id: string | null;
  nome: string;
  origem: "orcamento" | "manual" | null;
}

export interface EtapaOrcamento extends ContasOrcado {
  etapa: string;
  descricao: string;
  /** A etapa aberta por tópico; somados dão a etapa. Vazio quando ela não tem tópico. Ausente na API antiga. */
  topicos?: TopicoOrcamento[];
  /** O que a previsão da obra estimou, fora do orçado (o cronograma soma os dois). Ausente na API antiga. */
  estimado?: Centavos;
  /** O preço do cliente da etapa (planilha de venda); null sem ela. */
  venda?: Centavos | null;
}

/** `GET /obras/{id}/orcamento`. */
export interface Orcamento {
  versoes: VersaoOrcamento[];
  itens: (ItemOrcamento & { curva: CurvaABC | null })[];
  etapas: EtapaOrcamento[];
  /** Os gastos já incluem `sem_etapa` (gasto sem etapa ou em etapa fora das versões vigentes). */
  totais: GastoNoOrcamento & {
    contratado: Centavos;
    aditivos: Centavos;
    atual: Centavos;
    /** atual − gasto. */
    saldo: Centavos;
    /** aditivos ÷ contratado em centésimos de % (294 = 2,94%); null sem contrato. */
    aditivos_pct: number | null;
    n_itens: number;
    n_etapas: number;
    sem_etapa: GastoNoOrcamento;
    /** Fora do orçado: a soma do `estimado` das etapas. Ausente na API antiga. */
    estimado?: Centavos;
    /** O preço do cliente da obra (planilha de venda); null sem ela. */
    venda?: Centavos | null;
  };
}

/** `POST /obras/{id}/orcamento/etapas/ordem`: todas as etapas do vigente (pela chave, "1", "2"…), na ordem nova. */
export interface CorpoOrdemEtapas {
  ordem: string[];
  chave_idempotencia: string;
  /** O contrato vigente sobre o qual a tela montou a ordem; outro vigente = 409 (a numeração mudou). */
  versao_id?: string;
}

/** Um contrato novo no lugar do vigente, com as etapas renumeradas 1..N; o Desfazer religa o anterior. */
export interface OrdemEtapasGravada {
  versao_id: string;
  registro_id: string;
  etapas: { etapa: string; descricao: string }[];
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
  /** No aditivo e no somar: `{ordem: etapa}` dos itens que a pessoa mudou de etapa na prévia. */
  etapas_itens?: Record<string, string>;
  /** Antes de aprovar, com orçamento vigente: grava o vigente + a planilha como o novo orçamento (não é aditivo). */
  somar?: boolean;
  /** `ordem` dos itens da planilha que não entram (ex.: os que repetem o que já está no orçamento). */
  ignorar_itens?: number[];
  /** Orçamento novo: encaixa cada linha na lista padrão de etapas. */
  padronizar?: boolean;
  /** O que a pessoa trocou no encaixe: {etapa da planilha: etapa padrão} ou {"linha:N": etapa padrão}. */
  destinos?: Record<string, string>;
  /** "venda" = a planilha é o preço do cliente (com BDI); o custo sai com o `bdi`. */
  natureza?: "custo" | "venda";
  /** Centésimos de % (22,91% = 2291); sem ele, o BDI da obra. */
  bdi?: number;
}

/** `GET /obras/{id}/etapas`: as etapas das versões vigentes. Lista vazia = obra sem orçamento, etapa opcional. */
export interface EtapaObra {
  etapa: string;
  descricao: string;
}

/* ---------- fornecedores ---------- */

/** Do tenant, vale para todas as obras; a leitura do comprovante casa o CNPJ lido com eles. `cnpj` só dígitos ou "". */
export interface Fornecedor {
  id: string;
  nome: string;
  cnpj: string;
  contato: string;
  telefone: string;
  email: string;
}
export type CorpoFornecedor = Partial<Omit<Fornecedor, "id">> & { nome: string };

/** As escritas da tela devolvem o ID da EntradaRegistro criada: é o que o "Desfazer" do aviso usa. */
export type ComRegistro<T> = T & { registro_id?: string | null };

export type StatusProposta = "pendente" | "aprovada" | "recusada" | "desfeita";
/** O agente só propõe o cronograma da obra; aprovar grava-o. */
export type TipoProposta = "cronograma";
/** O que aprovar faz, decidido pela API ao criar a proposta: o botão diz a consequência por ele. */
export type EfeitoProposta = "cronograma";

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
  ultima_atividade: DataISO | null;
  /** Tem orçamento (versão vigente ou lista de materiais). Ausente em API antiga. */
  tem_orcamento?: boolean;
  /** O prazo do cronograma (o mesmo do GET /obras/{id}/cronograma); null sem cronograma. */
  prazo?: PrazoCronograma | null;
}

/** `GET /obras/{id}/hoje`: o que importa hoje, determinístico, com as contas prontas. */
export type PrioridadeHoje = "pede_voce" | "atencao" | "a_caminho" | "ok";

export interface AcaoHoje {
  /** Os nomes de tela da web (`Tela` em componentes/sessoes.ts). */
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
  tipo: "inicio_etapa";
  titulo: string;
  detalhe: string;
  acao: AcaoHoje | null;
}

export interface HojeNaObra {
  hoje: string;
  resumo: {
    situacao: "no_prazo" | "atrasada" | "sem_medicao";
    frase: string;
    /** Uma por proposta pendente, mais os pontos que pedem a pessoa (mesmo os cortados pelo limite). */
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
  /** Nome de quem conectou (null se a pessoa não existe mais). Opcional até a API nova subir. */
  conectada_por?: string | null;
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

/** `GET /obras/{id}/resumo`: só os blocos que a web lê (o resto do contrato é do agente). */
export interface ResumoDaObra {
  obra: Obra;
  financeiro: {
    tem_orcamento: boolean;
    orcado_atual: Centavos;
    /** Os gastos confirmados da obra. */
    gasto: Centavos;
    saldo: Centavos;
    /** Orçado atual − gasto, nunca negativo. */
    falta_gastar?: Centavos;
    /** Os gastos confirmados; o mesmo que `gasto`. */
    pago?: Centavos;
    /** Gasto sobre o orçado, em centésimos de ponto (4,8% = 480); null sem orçado. */
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
  gasto: Centavos;
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
    gasto: Centavos;
    pago: Centavos;
    falta: Centavos;
    custo_final: Centavos;
    desvio: Centavos;
    sem_mes: Centavos;
  };
}

// --- Gastos da obra: árvore, comprovantes e revisão (docs/contrato.md, "Gastos da obra") ---

export interface TopicoNaArvore {
  id: string;
  nome: string;
  /** "orcamento" = sai da planilha (não se renomeia nem se arquiva); "manual" = criado na obra. Ausente na API antiga. */
  origem?: "orcamento" | "manual";
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
   * topo para cada etapa); ausente = `padrao`. `extra` = etapa extra da obra (chave `x-<id>`).
   */
  origem?: "orcamento" | "padrao" | "extra";
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
}

/** Gasto confirmado (dinheiro que saiu). Não confundir com `GastoNoOrcamento` (a soma por etapa). */
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
  /** Gastos confirmados: é o que soma no gasto do orçamento. */
  total: Centavos;
  a_revisar: number;
  /** Gastos em "Ver depois": contam na obra e em nenhuma etapa. Ausente em API antiga. */
  a_definir?: Centavos;
  /** A linha com `etapa` null é a dos gastos sem etapa. */
  etapas: {
    etapa: string | null;
    nome: string;
    total: Centavos;
    topicos: { topico_id: string | null; nome: string; total: Centavos }[];
  }[];
}

/** O que o agente responde em `POST /leituras/comprovante` (a leitura, ou o erro, já está gravada no comprovante). */
export interface RespostaLeitura {
  ok: boolean;
  mensagem?: string;
}
