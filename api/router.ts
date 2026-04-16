import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleRouter } from './_lib/core.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const result = await handleRouter(req.body)
    res.status(200).json(result)
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) })
  }
}
