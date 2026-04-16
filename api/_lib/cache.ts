import fs from 'fs'
import path from 'path'
import url from 'url'

type CachedBundle = {
  query: string
  normalized_query: string
  router: any
  researchers: Record<string, any>
  editor: any
  built_at: string
}

let cache: Map<string, CachedBundle> | null = null

function normalize(q: string): string {
  return (q || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function resolveCacheDir(): string {
  const here = path.dirname(url.fileURLToPath(import.meta.url))
  return path.resolve(here, '../_cache/samples')
}

function loadCache(): Map<string, CachedBundle> {
  if (cache) return cache
  cache = new Map()
  const dir = resolveCacheDir()
  if (!fs.existsSync(dir)) return cache
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const bundle = JSON.parse(raw) as CachedBundle
      const key = normalize(bundle.query)
      cache.set(key, bundle)
      if (bundle.normalized_query) cache.set(normalize(bundle.normalized_query), bundle)
    } catch {}
  }
  return cache
}

export function findCached(query: string): CachedBundle | null {
  const map = loadCache()
  return map.get(normalize(query)) || null
}

export function getCachedRouter(query: string): any | null {
  return findCached(query)?.router ?? null
}

export function getCachedResearch(query: string, researcherId: string): any | null {
  const bundle = findCached(query)
  return bundle?.researchers?.[researcherId] ?? null
}

export function getCachedEditor(query: string): any | null {
  return findCached(query)?.editor ?? null
}

export function listCachedQueries(): string[] {
  return Array.from(loadCache().keys())
}
