import { op, desc } from 'arquero'
import type { TableSet } from '../data/loader'
import { extractSegment } from '../data/segment'
import type { EvidenceRow } from '../types/schemas'
import type { AggregatorResult } from './policy'

const LOSS_RATIO_SCHEMA = `
loss_ratio_timeseries.csv: 연월, 보험사, 상품카테고리, 연령대, 성별, 가입건수, 청구건수, 경과보험료_원, 청구금액_원, 손해율(%)
`.trim()

export function lossRatioAggregate(query: string, tables: TableSet): AggregatorResult {
  const seg = extractSegment(query)
  let lr = tables.lossRatio
  const filters: string[] = []

  if (seg.age_band) {
    const band = seg.age_band
    lr = lr.params({ band }).filter((d: any, $: any) => d['연령대'] === $.band)
    filters.push(`age_band=${seg.age_band}`)
  }
  if (seg.gender) {
    const g = seg.gender
    lr = lr.params({ g }).filter((d: any, $: any) => d['성별'] === $.g)
    filters.push(`gender=${seg.gender}`)
  }

  const categoryKeywords = ['자동차', '화재', '어린이', '건강', '종합', '암', '치아', '운전자', '실손', '연금', '상해']
  const matchedCat = categoryKeywords.find((c) => query.includes(c))
  if (matchedCat) {
    const mc = matchedCat
    lr = lr.params({ mc }).filter((d: any, $: any) => d['상품카테고리'] === $.mc)
    filters.push(`category=${matchedCat}`)
  }

  const rows = lr.numRows()
  if (rows === 0) {
    return {
      aggregates: { note: 'no rows after filtering', filters },
      evidence_candidates: [],
      schema_snippet: LOSS_RATIO_SCHEMA,
    }
  }

  const monthlyTrend = lr
    .groupby('연월')
    .rollup({
      avg_loss_ratio: (d: any) => op.mean(d['손해율(%)']),
      total_claims: (d: any) => op.sum(d['청구건수']),
      total_premium: (d: any) => op.sum(d['경과보험료_원']),
    })
    .orderby('연월')
    .objects()

  const byInsurer = lr
    .groupby('보험사')
    .rollup({
      avg_loss_ratio: (d: any) => op.mean(d['손해율(%)']),
      rows: () => op.count(),
    })
    .orderby(desc('avg_loss_ratio'))
    .objects({ limit: 10 })

  const byCategory = lr
    .groupby('상품카테고리')
    .rollup({
      avg_loss_ratio: (d: any) => op.mean(d['손해율(%)']),
      rows: () => op.count(),
    })
    .orderby(desc('avg_loss_ratio'))
    .objects({ limit: 10 })

  const recent12 = monthlyTrend.slice(-12) as any[]
  const worseningTrend =
    recent12.length >= 2
      ? (recent12[recent12.length - 1].avg_loss_ratio - recent12[0].avg_loss_ratio).toFixed(2)
      : 'n/a'

  const evidence_candidates: EvidenceRow[] = []
  const sample = lr.orderby(desc('연월')).objects({ limit: 10 }) as any[]
  sample.forEach((row, i) => {
    evidence_candidates.push({
      source: 'loss_ratio_timeseries.csv',
      row_index: i,
      fields: row,
    })
  })

  return {
    aggregates: {
      filters,
      total_rows: rows,
      monthly_trend: monthlyTrend,
      recent_12_months: recent12,
      worsening_delta_pct: worseningTrend,
      by_insurer_worst: byInsurer,
      by_category_worst: byCategory,
    },
    evidence_candidates,
    schema_snippet: LOSS_RATIO_SCHEMA,
  }
}
