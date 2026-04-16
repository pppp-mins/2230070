import { op, desc } from 'arquero'
import type { TableSet } from '../data/loader'
import { extractSegment } from '../data/segment'
import type { EvidenceRow } from '../types/schemas'
import type { AggregatorResult } from './policy'

const INVESTMENT_SCHEMA = `
investment_products.csv: product_id, product_name, product_type, asset_class, provider, risk_grade, annual_fee_pct, min_subscription_won, launch_date, benchmark, distribution_type
customer_holdings.csv: customer_id, product_id, units, avg_cost_nav, opened_date, auto_invest_flag
risk_profiles.csv: customer_id, risk_score, risk_label, investment_horizon, monthly_invest_capacity_won, primary_goal, survey_date
nav_timeseries.csv: product_id, date, nav, daily_return_pct
transactions.csv: tx_id, customer_id, product_id, tx_date, tx_type, units, nav_at_tx, amount_won, channel
market_benchmarks.csv: index_name, month, close, monthly_return_pct
`.trim()

export function investmentAggregate(query: string, tables: TableSet): AggregatorResult {
  const seg = extractSegment(query)
  const filters: string[] = []

  let risk = tables.risk
  if (seg.risk_label) {
    const lbl = seg.risk_label
    risk = risk.params({ lbl }).filter((d: any, $: any) => d.risk_label === $.lbl)
    filters.push(`risk_label=${seg.risk_label}`)
  }

  const topN = /상위\s*(\d+)/.exec(query)
  const limit = topN ? parseInt(topN[1], 10) : 100
  const topRiskTable = risk.orderby(desc('monthly_invest_capacity_won')).slice(0, limit)
  const topCustomers = topRiskTable.objects() as any[]
  const topCustomerCount = topCustomers.length

  const avgCapacity =
    topCustomers.reduce((s: number, r: any) => s + (Number(r.monthly_invest_capacity_won) || 0), 0) /
    Math.max(1, topCustomerCount)

  const joinedCust = tables.customers.semijoin(topRiskTable, [['customer_id']])

  const avgAge = joinedCust.numRows()
    ? (joinedCust.array('age') as any[]).reduce((s: number, v: any) => s + (Number(v) || 0), 0) /
      joinedCust.numRows()
    : 0

  const segmentPolicies = tables.policies.semijoin(topRiskTable, [['customer_id']])
  const topInsuranceCategories = segmentPolicies
    .groupby('category')
    .rollup({ count: () => op.count() })
    .orderby(desc('count'))
    .objects({ limit: 5 })

  const segmentHoldings = tables.holdings.semijoin(topRiskTable, [['customer_id']])
  const topInvestmentProducts = segmentHoldings
    .groupby('product_id')
    .rollup({ count: () => op.count(), total_units: (d: any) => op.sum(d.units) })
    .orderby(desc('count'))
    .objects({ limit: 5 })

  const riskGradeDist = tables.investments
    .groupby('risk_grade')
    .rollup({ count: () => op.count() })
    .orderby('risk_grade')
    .objects()

  const assetClassDist = tables.investments
    .groupby('asset_class')
    .rollup({ count: () => op.count() })
    .orderby(desc('count'))
    .objects({ limit: 10 })

  const evidence_candidates: EvidenceRow[] = []
  const riskSample = risk.objects({ limit: 5 }) as any[]
  riskSample.forEach((row, i) =>
    evidence_candidates.push({ source: 'risk_profiles.csv', row_index: i, fields: row }),
  )
  const invSample = tables.investments.objects({ limit: 5 }) as any[]
  invSample.forEach((row, i) =>
    evidence_candidates.push({ source: 'investment_products.csv', row_index: i, fields: row }),
  )
  const holdSample = segmentHoldings.objects({ limit: 5 }) as any[]
  holdSample.forEach((row, i) =>
    evidence_candidates.push({ source: 'customer_holdings.csv', row_index: i, fields: row }),
  )

  return {
    aggregates: {
      filters,
      segment_customer_count: topCustomerCount,
      top_n_requested: limit,
      avg_monthly_invest_capacity_won: Math.round(avgCapacity),
      avg_age: Number(avgAge.toFixed(1)),
      top_insurance_categories_in_segment: topInsuranceCategories,
      top_investment_products_in_segment: topInvestmentProducts,
      risk_grade_distribution_all: riskGradeDist,
      asset_class_distribution_all: assetClassDist,
    },
    evidence_candidates,
    schema_snippet: INVESTMENT_SCHEMA,
  }
}
