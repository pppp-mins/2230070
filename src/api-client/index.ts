import type {
  RouterRequest,
  RouterResponse,
  ResearchRequest,
  ResearcherResponse,
  EditorRequest,
  EditorResponse,
} from '../types/schemas'

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`)
  }
  const data = await res.json()
  if ((data as any).error) throw new Error((data as any).error)
  return data as TRes
}

export function callRouter(req: RouterRequest) {
  return post<RouterRequest, RouterResponse>('/api/router', req)
}

export function callResearch(req: ResearchRequest) {
  return post<ResearchRequest, ResearcherResponse>('/api/research', req)
}

export function callEditor(req: EditorRequest) {
  return post<EditorRequest, EditorResponse>('/api/editor', req)
}
