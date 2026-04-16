export type Segment = {
  age_band?: string
  age_min?: number
  age_max?: number
  gender?: '남성' | '여성'
  family?: string
  income_band?: string
  occupation?: string
  persona_cluster?: string
  child_count_min?: number
  driver_status?: string
  risk_label?: '안정형' | '중립형' | '공격형'
  keywords?: string[]
}

const AGE_BANDS: Array<{ re: RegExp; band: string; min: number; max: number }> = [
  { re: /20대/, band: '20대', min: 20, max: 29 },
  { re: /30대/, band: '30대', min: 30, max: 39 },
  { re: /40대/, band: '40대', min: 40, max: 49 },
  { re: /50대/, band: '50대', min: 50, max: 59 },
  { re: /60대/, band: '60대', min: 60, max: 69 },
  { re: /70대/, band: '70대', min: 70, max: 79 },
  { re: /중장년/, band: '중장년', min: 45, max: 64 },
  { re: /청년|젊은/, band: '청년', min: 20, max: 34 },
]

const INCOME_BANDS: Array<{ re: RegExp; band: string }> = [
  { re: /300만원\s*이하|저소득/, band: '300만원 이하' },
  { re: /300[-~–]500|300\s*만원\s*대|중위소득/, band: '300-500만원' },
  { re: /500[-~–]800/, band: '500-800만원' },
  { re: /800[-~–]1200/, band: '800-1200만원' },
  { re: /1200\s*만원\s*이상|고소득/, band: '1200만원 이상' },
]

export function extractSegment(query: string): Segment {
  const seg: Segment = {}
  const q = query || ''

  for (const b of AGE_BANDS) {
    if (b.re.test(q)) {
      seg.age_band = b.band
      seg.age_min = b.min
      seg.age_max = b.max
      break
    }
  }

  if (/여성|여자|여인/.test(q)) seg.gender = '여성'
  else if (/남성|남자/.test(q)) seg.gender = '남성'

  if (/맞벌이\s*자녀\s*2|맞벌이자녀2/.test(q)) seg.family = '맞벌이자녀2'
  else if (/맞벌이\s*자녀\s*1|맞벌이자녀1/.test(q)) seg.family = '맞벌이자녀1'
  else if (/외벌이\s*자녀\s*2|외벌이자녀2/.test(q)) seg.family = '외벌이자녀2'
  else if (/외벌이\s*자녀\s*1|외벌이자녀1/.test(q)) seg.family = '외벌이자녀1'
  else if (/1인\s*가구|싱글|독신/.test(q)) seg.family = '1인가구'
  else if (/무자녀|자녀\s*없/.test(q)) seg.family = '무자녀'

  const childMatch = q.match(/자녀\s*(\d+)/)
  if (childMatch) seg.child_count_min = parseInt(childMatch[1], 10)

  for (const b of INCOME_BANDS) {
    if (b.re.test(q)) {
      seg.income_band = b.band
      break
    }
  }

  if (/자영업/.test(q)) seg.occupation = '자영업'
  else if (/IT|개발/.test(q)) seg.occupation = 'IT개발자'
  else if (/사무직/.test(q)) seg.occupation = '사무직'
  else if (/생산직/.test(q)) seg.occupation = '생산직'
  else if (/공무원/.test(q)) seg.occupation = '공무원'

  if (/공격형|적극형/.test(q)) seg.risk_label = '공격형'
  else if (/중립형|중도형/.test(q)) seg.risk_label = '중립형'
  else if (/안정형|보수형/.test(q)) seg.risk_label = '안정형'

  if (/자가운전|운전자/.test(q)) seg.driver_status = '자가운전'
  else if (/비운전/.test(q)) seg.driver_status = '비운전'

  seg.keywords = q.match(/[가-힣A-Za-z]{2,}/g) || []
  return seg
}
