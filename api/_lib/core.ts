import { generateJson } from './gemini.js'
import { ROUTER_SCHEMA, RESEARCHER_SCHEMA, EDITOR_SCHEMA } from './schemas.js'
import { buildRouterPrompt, buildResearcherPrompt, buildEditorPrompt } from './prompts.js'
import { getCachedRouter, getCachedResearch, getCachedEditor, findCached } from './cache.js'

const ROUTER_MODEL = process.env.GEMINI_ROUTER_MODEL || 'gemini-2.5-flash-lite'
const RESEARCHER_MODEL = process.env.GEMINI_RESEARCHER_MODEL || 'gemini-2.5-flash-lite'
const EDITOR_MODEL = process.env.GEMINI_EDITOR_MODEL || 'gemini-2.5-flash-lite'

export async function handleRouter(body: any) {
  const { query, history_summary } = body || {}
  if (!query) throw new Error('query is required')

  const cached = getCachedRouter(String(query))
  if (cached) return { ...cached, _cache: 'hit' }

  const prompt = buildRouterPrompt(String(query), String(history_summary || ''))
  const result: any = await generateJson(ROUTER_MODEL, prompt, ROUTER_SCHEMA)
  return result
}

export async function handleResearch(body: any) {
  const { researcher_id, query, aggregates, schema_snippet, evidence_candidates } = body || {}
  if (!researcher_id || !query) throw new Error('researcher_id and query are required')

  const cached = getCachedResearch(String(query), String(researcher_id))
  if (cached) return { ...cached, _cache: 'hit' }

  const prompt = buildResearcherPrompt({
    researcher_id,
    query,
    aggregates: aggregates || {},
    schema_snippet: schema_snippet || '',
    evidence_candidates: Array.isArray(evidence_candidates) ? evidence_candidates : [],
  })
  const result: any = await generateJson(RESEARCHER_MODEL, prompt, RESEARCHER_SCHEMA)
  return result
}

export async function handleEditor(body: any) {
  const { query, history_summary, researcher_responses, rejected, reject_reason } = body || {}
  if (!query) throw new Error('query is required')

  const cached = getCachedEditor(String(query))
  if (cached) return { ...cached, _cache: 'hit' }

  const prompt = buildEditorPrompt({
    query,
    historySummary: String(history_summary || ''),
    researcher_responses: Array.isArray(researcher_responses) ? researcher_responses : [],
    rejected: Boolean(rejected),
    reject_reason,
  })
  const result: any = await generateJson(EDITOR_MODEL, prompt, EDITOR_SCHEMA)
  return result
}

export async function handleHealth() {
  return {
    ok: true,
    env: Boolean(process.env.GEMINI_API_KEY),
    time: Date.now(),
  }
}

export async function handleCacheLookup(body: any) {
  const { query } = body || {}
  if (!query) throw new Error('query is required')
  const bundle = findCached(String(query))
  return { hit: Boolean(bundle), bundle }
}
