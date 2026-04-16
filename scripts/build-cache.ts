import fs from 'fs'
import path from 'path'
import url from 'url'
import Papa from 'papaparse'
import { from, type ColumnTable } from 'arquero'
import { runAggregator } from '../src/aggregators'
import { handleRouter, handleResearch, handleEditor } from '../api/_lib/core'
import { SAMPLE_QUESTIONS } from '../src/constants/samples'
import type { TableSet } from '../src/data/loader'
import type { ResearcherId } from '../src/types/schemas'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const OUT_DIR = path.join(ROOT, 'api/_cache/samples')

// Load .env manually so the script can run without `vite dev`
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!match) continue
    const [, k, rawV] = match
    const v = rawV.replace(/^["']|["']$/g, '')
    if (process.env[k] === undefined) process.env[k] = v
  }
}
loadDotEnv()

const FILES: Array<[keyof TableSet, string]> = [
  ['products', 'products_catalog.csv'],
  ['customers', 'customer_profiles.csv'],
  ['policies', 'policy_headers.csv'],
  ['coverages', 'policy_coverages.csv'],
  ['lossRatio', 'loss_ratio_timeseries.csv'],
  ['investments', 'investment_products.csv'],
  ['holdings', 'customer_holdings.csv'],
  ['nav', 'nav_timeseries.csv'],
  ['risk', 'risk_profiles.csv'],
  ['benchmarks', 'market_benchmarks.csv'],
  ['transactions', 'transactions.csv'],
]

function loadTables(): TableSet {
  const entries: Array<[keyof TableSet, ColumnTable]> = []
  for (const [key, file] of FILES) {
    const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf8')
    const cleaned = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    const parsed = Papa.parse(cleaned, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    })
    entries.push([key, from(parsed.data)])
  }
  return Object.fromEntries(entries) as TableSet
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^가-힣a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

async function buildOne(query: string, tables: TableSet) {
  console.log(`\n▶ ${query}`)
  // 1. Router
  console.log('  · router...')
  const routerRes: any = await handleRouter({ query, history_summary: '' })
  const { reject, required_researchers, rewritten_query } = routerRes
  console.log(`    reject=${reject} researchers=[${(required_researchers || []).join(',')}]`)

  // 2. Researchers (parallel where possible)
  const researchers: Record<string, any> = {}
  if (!reject && Array.isArray(required_researchers)) {
    for (const id of required_researchers as ResearcherId[]) {
      console.log(`  · researcher[${id}]...`)
      const agg = runAggregator(id, rewritten_query || query, tables)
      try {
        const res: any = await handleResearch({
          researcher_id: id,
          query: rewritten_query || query,
          aggregates: agg.aggregates,
          schema_snippet: agg.schema_snippet,
          evidence_candidates: agg.evidence_candidates,
        })
        researchers[id] = res
        console.log(`    status=${res.status}`)
      } catch (e: any) {
        console.warn(`    ⚠ researcher ${id} failed: ${e?.message || e}`)
      }
    }
  }

  // 3. Editor
  console.log('  · editor...')
  const editorRes: any = await handleEditor({
    query: rewritten_query || query,
    history_summary: '',
    researcher_responses: Object.entries(researchers).map(([id, response]) => ({ id, response })),
    rejected: Boolean(reject),
    reject_reason: routerRes.reject_reason,
  })
  console.log(`    tone=${editorRes.tone} chart=${editorRes.chart_spec?.type} citations=${editorRes.citations?.length || 0}`)

  return {
    query,
    normalized_query: rewritten_query || query,
    router: routerRes,
    researchers,
    editor: editorRes,
    built_at: new Date().toISOString(),
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY not set')
    process.exit(1)
  }

  console.log('Loading tables from', DATA_DIR)
  const tables = loadTables()
  console.log('Tables loaded:', Object.keys(tables).length)

  fs.mkdirSync(OUT_DIR, { recursive: true })

  for (const sample of SAMPLE_QUESTIONS) {
    try {
      const bundle = await buildOne(sample.query, tables)
      const slug = slugify(sample.label || sample.query)
      const outPath = path.join(OUT_DIR, `${slug}.json`)
      fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2))
      console.log(`✓ saved → ${path.relative(ROOT, outPath)}`)
    } catch (err: any) {
      console.error(`✗ failed for "${sample.query}": ${err?.message || err}`)
    }
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
