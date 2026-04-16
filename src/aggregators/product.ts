import { op, desc } from 'arquero'
import type { TableSet } from '../data/loader'
import { extractSegment } from '../data/segment'
import type { EvidenceRow } from '../types/schemas'
import type { AggregatorResult } from './policy'

const PRODUCT_SCHEMA = `
products_catalog.csv: 상품코드, 보험사, 상품명, 상품카테고리, 타겟연령, 월보험료_기준, 기준보험료_원, 보험료납입주기, 기준프로필, 주요보장1, 주요보장2, 주요보장3, 특약옵션, 가입조건
`.trim()

export function productAggregate(query: string, tables: TableSet): AggregatorResult {
  const seg = extractSegment(query)
  let products = tables.products
  const filters: string[] = []

  const categoryKeywords = ['자동차', '화재', '어린이', '건강', '종합', '암', '치아', '운전자', '실손', '연금', '상해']
  const matchedCat = categoryKeywords.find((c) => query.includes(c))
  if (matchedCat) {
    const mc = matchedCat
    products = products
      .params({ mc })
      .filter((d: any, $: any) => d['상품카테고리'] && op.includes(d['상품카테고리'], $.mc, 0))
    filters.push(`category~${matchedCat}`)
  }

  if (seg.age_band) {
    const band = seg.age_band
    products = products
      .params({ band })
      .filter(
        (d: any, $: any) =>
          d['타겟연령'] &&
          (op.includes(d['타겟연령'], $.band, 0) || op.includes(d['타겟연령'], '전연령', 0)),
      )
    filters.push(`target_age~${seg.age_band}`)
  }

  if (seg.gender) {
    const g = seg.gender
    const opposite = seg.gender === '남성' ? '여성' : '남성'
    products = products
      .params({ g, opposite })
      .filter((d: any, $: any) => !d['기준프로필'] || !op.includes(d['기준프로필'], $.opposite, 0))
  }

  const total = products.numRows()

  const categoryBreakdown = products
    .groupby('상품카테고리')
    .rollup({
      count: () => op.count(),
      avg_premium: (d: any) => op.mean(d['월보험료_기준']),
    })
    .orderby(desc('count'))
    .objects({ limit: 10 })

  const insurerBreakdown = products
    .groupby('보험사')
    .rollup({ count: () => op.count() })
    .orderby(desc('count'))
    .objects({ limit: 8 })

  const topByPremium = products
    .orderby(desc('월보험료_기준'))
    .objects({ limit: 5 })

  const evidence_candidates: EvidenceRow[] = []
  const sample = products.objects({ limit: 10 }) as any[]
  sample.forEach((row, i) => {
    evidence_candidates.push({
      source: 'products_catalog.csv',
      row_index: i,
      fields: row,
    })
  })

  return {
    aggregates: {
      filters,
      total_products: total,
      category_breakdown: categoryBreakdown,
      insurer_breakdown: insurerBreakdown,
      top_by_premium: topByPremium,
    },
    evidence_candidates,
    schema_snippet: PRODUCT_SCHEMA,
  }
}
