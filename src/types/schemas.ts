export type ResearcherId = 'product' | 'policy' | 'loss_ratio' | 'investment'

export const ALL_RESEARCHERS: ResearcherId[] = ['product', 'policy', 'loss_ratio', 'investment']

export const RESEARCHER_META: Record<
  ResearcherId,
  { label: string; icon: string; color: string; datasets: string[] }
> = {
  product: {
    label: '상품 리서처',
    icon: '📦',
    color: 'from-orange-400 to-amber-500',
    datasets: ['products_catalog.csv'],
  },
  policy: {
    label: '가입·고객 리서처',
    icon: '👥',
    color: 'from-blue-400 to-indigo-500',
    datasets: ['customer_profiles.csv', 'policy_headers.csv', 'policy_coverages.csv'],
  },
  loss_ratio: {
    label: '손해율 리서처',
    icon: '📉',
    color: 'from-rose-400 to-red-500',
    datasets: ['loss_ratio_timeseries.csv'],
  },
  investment: {
    label: '투자 리서처',
    icon: '💰',
    color: 'from-emerald-400 to-teal-500',
    datasets: [
      'investment_products.csv',
      'customer_holdings.csv',
      'nav_timeseries.csv',
      'risk_profiles.csv',
      'market_benchmarks.csv',
      'transactions.csv',
    ],
  },
}

export type RouterRequest = {
  query: string
  history_summary: string
}

export type RouterResponse = {
  intent: string
  required_researchers: ResearcherId[]
  reject: boolean
  reject_reason?: string
  rewritten_query: string
}

export type EvidenceRow = {
  source: string
  row_index: number
  fields: Record<string, any>
}

export type ChartHint = {
  type: 'bar' | 'line' | 'pie' | 'none'
  x?: string
  y?: string
  series?: string[]
}

export type ResearcherResponse = {
  status: 'ok' | 'no_data' | 'refuse'
  answer: string
  metrics: Record<string, any>
  evidence_rows: EvidenceRow[]
  chart_hint: ChartHint
  notes?: string
}

export type ResearchRequest = {
  researcher_id: ResearcherId
  query: string
  aggregates: Record<string, any>
  schema_snippet: string
  evidence_candidates: EvidenceRow[]
}

export type ChartSpec = {
  type: 'bar' | 'line' | 'pie' | 'none'
  title?: string
  x_field?: string
  y_field?: string
  data: any[]
}

export type Citation = {
  source: string
  row_index: number
  highlight: string
  fields: Record<string, any>
}

export type EditorResponse = {
  final_answer: string
  tone: 'friendly' | 'apologetic' | 'informative'
  chart_spec: ChartSpec
  citations: Citation[]
  followup_suggestions?: string[]
}

export type EditorRequest = {
  query: string
  history_summary: string
  researcher_responses: Array<{ id: ResearcherId; response: ResearcherResponse }>
  rejected: boolean
  reject_reason?: string
}

export type ResearcherRuntimeState = {
  status: 'idle' | 'running' | 'done' | 'no_response' | 'error'
  progress: number
  logs: string[]
  response: ResearcherResponse | null
}

export type AssistantPhase = 'routing' | 'researching' | 'editing' | 'done' | 'error'

export type UserMessage = {
  kind: 'user'
  id: string
  text: string
  timestamp: number
}

export type AssistantMessage = {
  kind: 'assistant'
  id: string
  timestamp: number
  query: string
  rewritten_query: string
  phase: AssistantPhase
  in_progress: boolean
  router: RouterResponse | null
  researchers: Record<ResearcherId, ResearcherRuntimeState>
  editor: EditorResponse | null
  reject_reason: string | null
  from_cache: boolean
  timeline_expanded: boolean
}

export type ChatMessage = UserMessage | AssistantMessage
