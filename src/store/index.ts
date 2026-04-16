import { create } from 'zustand'
import type { TableSet } from '../data/loader'
import type {
  ResearcherId,
  ResearcherResponse,
  ResearcherRuntimeState,
  EditorResponse,
  RouterResponse,
  AssistantMessage,
  ChatMessage,
  AssistantPhase,
} from '../types/schemas'
import { ALL_RESEARCHERS } from '../types/schemas'
import { HISTORY_ANSWER_CAP, HISTORY_TURN_CAP } from '../constants/models'

const emptyResearcher = (): ResearcherRuntimeState => ({
  status: 'idle',
  progress: 0,
  logs: [],
  response: null,
})

const initialResearchers = (): Record<ResearcherId, ResearcherRuntimeState> =>
  Object.fromEntries(ALL_RESEARCHERS.map((id) => [id, emptyResearcher()])) as Record<
    ResearcherId,
    ResearcherRuntimeState
  >

type AppState = {
  tables: TableSet | null
  dataLoaded: boolean
  dataLoadError: string | null
  dataLoadProgress: { loaded: number; total: number; current: string }

  messages: ChatMessage[]
  isProcessing: boolean

  setTables: (t: TableSet) => void
  setDataError: (msg: string) => void
  setDataProgress: (loaded: number, total: number, current: string) => void

  setProcessing: (v: boolean) => void
  appendUserMessage: (text: string) => string
  appendAssistantMessage: (query: string) => string
  updateAssistant: (id: string, partial: Partial<AssistantMessage>) => void
  setAssistantPhase: (id: string, phase: AssistantPhase) => void
  setAssistantResearcherStatus: (
    id: string,
    researcherId: ResearcherId,
    status: ResearcherRuntimeState['status'],
  ) => void
  setAssistantResearcherProgress: (id: string, researcherId: ResearcherId, p: number) => void
  pushAssistantResearcherLog: (id: string, researcherId: ResearcherId, log: string) => void
  setAssistantResearcherResponse: (
    id: string,
    researcherId: ResearcherId,
    r: ResearcherResponse,
  ) => void
  markAssistantInactiveResearchers: (id: string, ids: ResearcherId[]) => void
  setAssistantRouter: (id: string, router: RouterResponse, rewritten: string) => void
  setAssistantEditor: (id: string, editor: EditorResponse) => void
  finishAssistant: (id: string, rejectReason?: string | null) => void
  toggleTimeline: (id: string) => void
  clearMessages: () => void
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export const useStore = create<AppState>((set, get) => ({
  tables: null,
  dataLoaded: false,
  dataLoadError: null,
  dataLoadProgress: { loaded: 0, total: 11, current: '' },

  messages: [],
  isProcessing: false,

  setTables: (t) => set({ tables: t, dataLoaded: true, dataLoadError: null }),
  setDataError: (msg) => set({ dataLoadError: msg }),
  setDataProgress: (loaded, total, current) =>
    set({ dataLoadProgress: { loaded, total, current } }),

  setProcessing: (v) => set({ isProcessing: v }),

  appendUserMessage: (text) => {
    const id = newId()
    set((s) => ({ messages: [...s.messages, { kind: 'user', id, text, timestamp: Date.now() }] }))
    return id
  },

  appendAssistantMessage: (query) => {
    const id = newId()
    const msg: AssistantMessage = {
      kind: 'assistant',
      id,
      timestamp: Date.now(),
      query,
      rewritten_query: query,
      phase: 'routing',
      in_progress: true,
      router: null,
      researchers: initialResearchers(),
      editor: null,
      reject_reason: null,
      from_cache: false,
      timeline_expanded: true,
    }
    set((s) => ({ messages: [...s.messages, msg] }))
    return id
  },

  updateAssistant: (id, partial) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.kind === 'assistant' && m.id === id ? { ...m, ...partial } : m,
      ),
    })),

  setAssistantPhase: (id, phase) => get().updateAssistant(id, { phase }),

  setAssistantResearcherStatus: (id, researcherId, status) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.kind !== 'assistant' || m.id !== id) return m
        return {
          ...m,
          researchers: {
            ...m.researchers,
            [researcherId]: { ...m.researchers[researcherId], status },
          },
        }
      }),
    })),

  setAssistantResearcherProgress: (id, researcherId, p) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.kind !== 'assistant' || m.id !== id) return m
        return {
          ...m,
          researchers: {
            ...m.researchers,
            [researcherId]: { ...m.researchers[researcherId], progress: p },
          },
        }
      }),
    })),

  pushAssistantResearcherLog: (id, researcherId, log) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.kind !== 'assistant' || m.id !== id) return m
        return {
          ...m,
          researchers: {
            ...m.researchers,
            [researcherId]: {
              ...m.researchers[researcherId],
              logs: [...m.researchers[researcherId].logs, log],
            },
          },
        }
      }),
    })),

  setAssistantResearcherResponse: (id, researcherId, r) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.kind !== 'assistant' || m.id !== id) return m
        return {
          ...m,
          researchers: {
            ...m.researchers,
            [researcherId]: {
              ...m.researchers[researcherId],
              response: r,
              status: r.status === 'ok' ? 'done' : 'no_response',
              progress: 100,
            },
          },
        }
      }),
    })),

  markAssistantInactiveResearchers: (id, ids) =>
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.kind !== 'assistant' || m.id !== id) return m
        const researchers = { ...m.researchers }
        for (const rid of ids) {
          researchers[rid] = { ...researchers[rid], status: 'no_response', progress: 100 }
        }
        return { ...m, researchers }
      }),
    })),

  setAssistantRouter: (id, router, rewritten) =>
    get().updateAssistant(id, { router, rewritten_query: rewritten }),

  setAssistantEditor: (id, editor) => get().updateAssistant(id, { editor }),

  finishAssistant: (id, rejectReason) =>
    get().updateAssistant(id, {
      in_progress: false,
      phase: rejectReason ? 'error' : 'done',
      reject_reason: rejectReason ?? null,
      timeline_expanded: false,
    }),

  toggleTimeline: (id) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.kind === 'assistant' && m.id === id
          ? { ...m, timeline_expanded: !m.timeline_expanded }
          : m,
      ),
    })),

  clearMessages: () => set({ messages: [] }),
}))

export function summarizeMessagesForHistory(messages: ChatMessage[]): string {
  const asst = messages.filter((m) => m.kind === 'assistant') as AssistantMessage[]
  const recent = asst.slice(-HISTORY_TURN_CAP)
  if (!recent.length) return ''
  return recent
    .map((h, i) => {
      const ans = h.editor?.final_answer?.slice(0, HISTORY_ANSWER_CAP) || '(답변 없음)'
      return `[Turn ${i + 1}] Q: ${h.query}\n         A: ${ans}`
    })
    .join('\n')
}
