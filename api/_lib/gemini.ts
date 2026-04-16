import { GoogleGenAI } from '@google/genai'

let cached: GoogleGenAI | null = null

export function getClient(): GoogleGenAI {
  if (cached) return cached
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY missing in environment. Set it in .env / Vercel env.')
  }
  cached = new GoogleGenAI({ apiKey })
  return cached
}

export async function generateJson<T = unknown>(
  model: string,
  prompt: string,
  responseSchema: object,
): Promise<T> {
  const client = getClient()
  const result = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema as any,
      temperature: 0.2,
    },
  })
  const text = (result as any).text ?? (result as any).response?.text?.() ?? ''
  if (!text) {
    throw new Error('Empty response from Gemini')
  }
  try {
    return JSON.parse(text) as T
  } catch (err) {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0]) as T
    }
    throw new Error(`Failed to parse Gemini JSON: ${String(err)}`)
  }
}
