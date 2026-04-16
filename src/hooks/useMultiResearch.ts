import { useCallback } from 'react'
import { useStore, summarizeMessagesForHistory } from '../store'
import { callRouter, callResearch, callEditor } from '../api-client'
import { runAggregator } from '../aggregators'
import { ALL_RESEARCHERS, type ResearcherId } from '../types/schemas'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const jitter = (base: number, spread = 150) => base + Math.random() * spread

export function useMultiResearch() {
  const runQuery = useCallback(async (query: string) => {
    const s0 = useStore.getState()
    if (!s0.tables || s0.isProcessing || !query.trim()) return

    s0.setProcessing(true)
    s0.appendUserMessage(query.trim())
    const asstId = s0.appendAssistantMessage(query.trim())

    const getState = () => useStore.getState()
    const update = (fn: (s: ReturnType<typeof getState>) => void) => fn(getState())

    try {
      const historySummary = summarizeMessagesForHistory(getState().messages)

      // Phase 1 · Router
      update((s) => s.setAssistantPhase(asstId, 'routing'))
      await sleep(jitter(250))
      const routerRes = await callRouter({ query, history_summary: historySummary })
      const fromCache = Boolean((routerRes as any)._cache === 'hit')
      update((s) =>
        s.setAssistantRouter(asstId, routerRes, routerRes.rewritten_query || query),
      )
      update((s) => s.updateAssistant(asstId, { from_cache: fromCache }))
      await sleep(jitter(200))

      // Reject path
      if (routerRes.reject) {
        update((s) => s.markAssistantInactiveResearchers(asstId, ALL_RESEARCHERS))
        update((s) => s.setAssistantPhase(asstId, 'editing'))
        await sleep(jitter(350))
        const editorRes = await callEditor({
          query: routerRes.rewritten_query || query,
          history_summary: historySummary,
          researcher_responses: [],
          rejected: true,
          reject_reason: routerRes.reject_reason,
        })
        update((s) => s.setAssistantEditor(asstId, editorRes))
        update((s) => s.finishAssistant(asstId))
        return
      }

      const active = routerRes.required_researchers
      const inactive = ALL_RESEARCHERS.filter((id) => !active.includes(id))
      update((s) => s.markAssistantInactiveResearchers(asstId, inactive))

      // Phase 2 · Researchers
      update((s) => s.setAssistantPhase(asstId, 'researching'))
      const rewritten = routerRes.rewritten_query || query
      const tables = getState().tables!

      await Promise.all(
        active.map(async (id: ResearcherId, idx: number) => {
          await sleep(idx * 100) // stagger
          update((s) => s.setAssistantResearcherStatus(asstId, id, 'running'))
          update((s) => s.setAssistantResearcherProgress(asstId, id, 10))
          update((s) => s.pushAssistantResearcherLog(asstId, id, '질문 분석 중...'))
          await sleep(jitter(220))

          update((s) => s.setAssistantResearcherProgress(asstId, id, 30))
          update((s) => s.pushAssistantResearcherLog(asstId, id, '데이터 필터링 중...'))
          const agg = runAggregator(id, rewritten, tables)
          await sleep(jitter(160))

          update((s) => s.setAssistantResearcherProgress(asstId, id, 55))
          update((s) =>
            s.pushAssistantResearcherLog(
              asstId,
              id,
              `증거 후보 ${agg.evidence_candidates.length}건 · 집계 지표 ${Object.keys(agg.aggregates).length}개`,
            ),
          )
          await sleep(jitter(180))

          update((s) => s.setAssistantResearcherProgress(asstId, id, 78))
          update((s) => s.pushAssistantResearcherLog(asstId, id, 'Gemini 해석 요청 중...'))

          try {
            const res = await callResearch({
              researcher_id: id,
              query: rewritten,
              aggregates: agg.aggregates,
              schema_snippet: agg.schema_snippet,
              evidence_candidates: agg.evidence_candidates,
            })
            update((s) => s.setAssistantResearcherResponse(asstId, id, res))
            update((s) =>
              s.pushAssistantResearcherLog(
                asstId,
                id,
                res.status === 'ok' ? '답변 준비 완료 ✓' : `상태: ${res.status}`,
              ),
            )
          } catch (e: any) {
            update((s) => s.setAssistantResearcherStatus(asstId, id, 'error'))
            update((s) => s.pushAssistantResearcherLog(asstId, id, `오류: ${e?.message || e}`))
          }
        }),
      )

      // Phase 3 · Editor
      update((s) => s.setAssistantPhase(asstId, 'editing'))
      await sleep(jitter(300))
      const msg = getState().messages.find((m) => m.kind === 'assistant' && m.id === asstId) as any
      const responses = active
        .map((id) => {
          const r = msg?.researchers?.[id]?.response
          return r ? { id, response: r } : null
        })
        .filter(Boolean) as Array<{ id: ResearcherId; response: any }>

      const editorRes = await callEditor({
        query: rewritten,
        history_summary: historySummary,
        researcher_responses: responses,
        rejected: false,
      })
      update((s) => s.setAssistantEditor(asstId, editorRes))
      await sleep(jitter(200))
      update((s) => s.finishAssistant(asstId))
    } catch (err: any) {
      update((s) => s.finishAssistant(asstId, `처리 중 오류: ${err?.message || err}`))
    } finally {
      useStore.getState().setProcessing(false)
    }
  }, [])

  return { runQuery }
}
