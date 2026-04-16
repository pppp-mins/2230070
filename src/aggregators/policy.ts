import { op, desc } from 'arquero'
import type { TableSet } from '../data/loader'
import { extractSegment } from '../data/segment'
import type { EvidenceRow } from '../types/schemas'

export type AggregatorResult = {
  aggregates: Record<string, any>
  evidence_candidates: EvidenceRow[]
  schema_snippet: string
}

const POLICY_SCHEMA = `
customer_profiles.csv: customer_id, age, gender, occupation, family_structure, income_band, residence_region, driver_status, persona_cluster, child_count, homeowner_flag, priority_need_1, priority_need_2, needs_tags
policy_headers.csv: policy_id, customer_id, product_code, product_name, insurer, category, status, start_date, monthly_premium, scenario_code
policy_coverages.csv: policy_id, coverage_code, coverage_name, coverage_group, insured_amount, deductible_flag, rider_flag
`.trim()

export function policyAggregate(query: string, tables: TableSet): AggregatorResult {
  const seg = extractSegment(query)

  let customers = tables.customers
  const filters: string[] = []

  if (seg.age_min !== undefined && seg.age_max !== undefined) {
    const lo = seg.age_min
    const hi = seg.age_max
    customers = customers.params({ lo, hi }).filter((d: any, $: any) => d.age >= $.lo && d.age <= $.hi)
    filters.push(`age∈[${lo},${hi}]`)
  }
  if (seg.gender) {
    const g = seg.gender
    customers = customers.params({ g }).filter((d: any, $: any) => d.gender === $.g)
    filters.push(`gender=${seg.gender}`)
  }
  if (seg.family) {
    const f = seg.family
    customers = customers.params({ f }).filter((d: any, $: any) => d.family_structure === $.f)
    filters.push(`family=${seg.family}`)
  }
  if (seg.income_band) {
    const ib = seg.income_band
    customers = customers.params({ ib }).filter((d: any, $: any) => d.income_band === $.ib)
    filters.push(`income=${seg.income_band}`)
  }
  if (seg.occupation) {
    const occ = seg.occupation
    customers = customers
      .params({ occ })
      .filter((d: any, $: any) => d.occupation && op.includes(d.occupation, $.occ, 0))
    filters.push(`occupation~${seg.occupation}`)
  }
  if (seg.child_count_min !== undefined) {
    const cc = seg.child_count_min
    customers = customers.params({ cc }).filter((d: any, $: any) => d.child_count >= $.cc)
    filters.push(`children≥${cc}`)
  }

  const segmentSize = customers.numRows()
  if (segmentSize === 0) {
    return {
      aggregates: { segment_size: 0, filters, note: 'no customers matched segment' },
      evidence_candidates: [],
      schema_snippet: POLICY_SCHEMA,
    }
  }

  const policies = tables.policies.semijoin(customers, [['customer_id']])

  const topCategories = policies
    .groupby('category')
    .rollup({ count: () => op.count() })
    .orderby(desc('count'))
    .objects({ limit: 8 })

  const topInsurers = policies
    .groupby('insurer')
    .rollup({ count: () => op.count() })
    .orderby(desc('count'))
    .objects({ limit: 8 })

  const coverages = tables.coverages.semijoin(policies, [['policy_id']])

  const topCoverageGroups = coverages
    .groupby('coverage_group')
    .rollup({ count: () => op.count() })
    .orderby(desc('count'))
    .objects({ limit: 8 })

  const topCoverageNames = coverages
    .groupby('coverage_name')
    .rollup({ count: () => op.count() })
    .orderby(desc('count'))
    .objects({ limit: 10 })

  const avgPremium = policies.numRows()
    ? Math.round(
        (policies.array('monthly_premium') as any[]).reduce((s: number, v: any) => s + (Number(v) || 0), 0) /
          policies.numRows(),
      )
    : 0

  const evidence_candidates: EvidenceRow[] = []
  const custSample = customers.objects({ limit: 3 }) as any[]
  custSample.forEach((row, i) => {
    evidence_candidates.push({
      source: 'customer_profiles.csv',
      row_index: i,
      fields: row,
    })
  })
  const polSample = policies.objects({ limit: 5 }) as any[]
  polSample.forEach((row, i) => {
    evidence_candidates.push({
      source: 'policy_headers.csv',
      row_index: i,
      fields: row,
    })
  })
  const covSample = coverages.objects({ limit: 5 }) as any[]
  covSample.forEach((row, i) => {
    evidence_candidates.push({
      source: 'policy_coverages.csv',
      row_index: i,
      fields: row,
    })
  })

  return {
    aggregates: {
      segment_filters: filters,
      segment_size: segmentSize,
      total_policies: policies.numRows(),
      total_coverages: coverages.numRows(),
      avg_monthly_premium_won: avgPremium,
      top_categories: topCategories,
      top_insurers: topInsurers,
      top_coverage_groups: topCoverageGroups,
      top_coverage_names: topCoverageNames,
    },
    evidence_candidates,
    schema_snippet: POLICY_SCHEMA,
  }
}
