/**
 * Build cache using REAL aggregator numbers but MOCK (hand-crafted) LLM responses.
 * Use this when Gemini API quota is unavailable — the numbers are still 100% accurate
 * because they come from deterministic JS aggregation.
 */
import fs from 'fs'
import path from 'path'
import url from 'url'
import Papa from 'papaparse'
import { from, type ColumnTable } from 'arquero'
import { runAggregator } from '../src/aggregators'
import { SAMPLE_QUESTIONS } from '../src/constants/samples'
import type { TableSet } from '../src/data/loader'
import type { ResearcherId, EvidenceRow } from '../src/types/schemas'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const OUT_DIR = path.join(ROOT, 'api/_cache/samples')

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

function pickEvidence(candidates: EvidenceRow[], n: number): EvidenceRow[] {
  return candidates.slice(0, n)
}

type SampleBuild = {
  label: string
  query: string
  required_researchers: ResearcherId[]
  intent: string
  reject?: boolean
  reject_reason?: string
  buildResponses: (aggMap: Record<string, any>) => {
    researchers: Record<string, any>
    editor: any
  }
}

const SAMPLES: SampleBuild[] = [
  {
    label: '30대 맞벌이 자녀2 인기 보장',
    query: '30대 맞벌이 자녀2 가구가 가장 많이 가입한 보장 TOP5는?',
    required_researchers: ['policy'],
    intent: 'segment_analysis',
    buildResponses: (aggs) => {
      const a = aggs.policy?.aggregates || {}
      const top5 = (a.top_coverage_names || []).slice(0, 5)
      const topCats = (a.top_categories || []).slice(0, 5)
      const segSize = a.segment_size ?? 0
      const totalPol = a.total_policies ?? 0
      const avgPremium = a.avg_monthly_premium_won ?? 0
      const answer = `30대 맞벌이 자녀2 가구(세그먼트 ${segSize}명, 총 ${totalPol}건의 계약)가 가장 많이 가입한 보장은 ${top5
        .map((r: any, i: number) => `${i + 1}위 ${r.coverage_name || r['coverage_name']}(${r.count}건)`)
        .join(', ')}로 나타났어요. 평균 월보험료는 약 ${avgPremium.toLocaleString()}원 수준입니다.`
      const chartData = top5.map((r: any) => ({
        name: String(r.coverage_name || '').slice(0, 12),
        value: Number(r.count || 0),
      }))
      return {
        researchers: {
          policy: {
            status: 'ok',
            answer,
            metrics: {
              segment_size: segSize,
              total_policies: totalPol,
              avg_monthly_premium_won: avgPremium,
              top5_coverages: top5,
              top_categories: topCats,
            },
            evidence_rows: pickEvidence(aggs.policy?.evidence_candidates || [], 5),
            chart_hint: { type: 'bar', x: 'coverage_name', y: 'count' },
            notes: '실제 집계는 customer_profiles ⋈ policy_headers ⋈ policy_coverages 조인 결과',
          },
        },
        editor: {
          final_answer: answer,
          tone: 'informative',
          chart_spec: {
            type: 'bar',
            title: '30대 맞벌이 자녀2 가구 인기 보장 TOP5',
            x_field: 'name',
            y_field: 'value',
            data: chartData,
          },
          citations: (aggs.policy?.evidence_candidates || []).slice(0, 3).map((r: EvidenceRow, i: number) => ({
            source: r.source,
            row_index: r.row_index,
            highlight: i === 0 ? '해당 세그먼트 대표 고객' : i === 1 ? '실제 가입된 계약' : '가입된 보장 상세',
            fields: r.fields,
          })),
          followup_suggestions: [
            '그럼 자녀 1명 가구는 어떤 보장이 인기인가요?',
            '이 세그먼트의 평균 월보험료는 얼마인가요?',
          ],
        },
      }
    },
  },
  {
    label: '자영업 중장년 + 손해율',
    query: '자영업 중장년 세그먼트에 인기 있는 상품 카테고리와 해당 카테고리의 최근 손해율 추이는?',
    required_researchers: ['policy', 'loss_ratio'],
    intent: 'cross_analysis',
    buildResponses: (aggs) => {
      const pa = aggs.policy?.aggregates || {}
      const la = aggs.loss_ratio?.aggregates || {}
      const topCats = (pa.top_categories || []).slice(0, 5)
      const topCat = topCats[0]?.category || '자동차'
      const segSize = pa.segment_size ?? 0
      const trend = (la.recent_12_months || []).slice(-6)
      const delta = la.worsening_delta_pct

      const policyAnswer = `자영업 중장년 세그먼트(${segSize}명) 가 가장 많이 가입한 카테고리는 ${topCats
        .map((c: any, i: number) => `${i + 1}위 ${c.category}(${c.count}건)`)
        .join(', ')} 순서입니다.`
      const lrAnswer = `해당 세그먼트의 손해율은 최근 12개월 기준 시작 대비 ${delta}%p 변동이 관찰되며, 월별 평균 손해율 추이는 ${trend
        .map((t: any) => `${t['연월']} ${Number(t.avg_loss_ratio).toFixed(1)}%`)
        .join(' → ')} 흐름이에요.`
      const chartData = (la.recent_12_months || []).map((r: any) => ({
        name: String(r['연월']),
        value: Number(Number(r.avg_loss_ratio || 0).toFixed(2)),
      }))

      return {
        researchers: {
          policy: {
            status: 'ok',
            answer: policyAnswer,
            metrics: { segment_size: segSize, top_categories: topCats },
            evidence_rows: pickEvidence(aggs.policy?.evidence_candidates || [], 3),
            chart_hint: { type: 'bar', x: 'category', y: 'count' },
          },
          loss_ratio: {
            status: 'ok',
            answer: lrAnswer,
            metrics: {
              recent_12_months: la.recent_12_months,
              worsening_delta_pct: delta,
              by_category_worst: la.by_category_worst,
            },
            evidence_rows: pickEvidence(aggs.loss_ratio?.evidence_candidates || [], 3),
            chart_hint: { type: 'line', x: '연월', y: 'avg_loss_ratio' },
          },
        },
        editor: {
          final_answer: `${policyAnswer}\n\n${lrAnswer} 전체적으로 자영업 중장년 고객이 많이 가입한 ${topCat} 카테고리는 최근 12개월간 손해율이 변화하고 있어 상품 개선 시 이 부분을 우선 검토해보실 만해요.`,
          tone: 'informative',
          chart_spec: {
            type: 'line',
            title: `${topCat} 카테고리 월별 손해율 추이 (최근 12개월)`,
            x_field: 'name',
            y_field: 'value',
            data: chartData,
          },
          citations: [
            ...(aggs.policy?.evidence_candidates || []).slice(0, 2),
            ...(aggs.loss_ratio?.evidence_candidates || []).slice(0, 2),
          ].map((r: EvidenceRow, i: number) => ({
            source: r.source,
            row_index: r.row_index,
            highlight:
              i === 0
                ? '자영업 중장년 대표 고객'
                : i === 1
                  ? '해당 세그먼트 실가입 계약'
                  : '월별 손해율 원본 행',
            fields: r.fields,
          })),
          followup_suggestions: [
            '자영업 중장년 중 손해율이 특히 높은 보험사는 어디인가요?',
            '같은 세그먼트에서 월보험료가 가장 비싼 상품은?',
          ],
        },
      }
    },
  },
  {
    label: '공격형 상위 100명',
    query: '공격형 투자성향 고객 중 월 투자가용금액 상위 100명의 평균 나이와 가장 많이 보유한 상품 카테고리는?',
    required_researchers: ['investment'],
    intent: 'investment_analysis',
    buildResponses: (aggs) => {
      const a = aggs.investment?.aggregates || {}
      const segCount = a.segment_customer_count ?? 0
      const avgCap = a.avg_monthly_invest_capacity_won ?? 0
      const avgAge = a.avg_age ?? 0
      const topCats = (a.top_insurance_categories_in_segment || []).slice(0, 5)
      const topProds = (a.top_investment_products_in_segment || []).slice(0, 5)

      const answer = `공격형 투자성향 고객 중 월 투자가용금액 상위 ${segCount}명의 평균 나이는 ${avgAge.toFixed(1)}세이며, 평균 월 투자가용금액은 약 ${avgCap.toLocaleString()}원이에요. 이 세그먼트가 가장 많이 보유한 보험 상품 카테고리는 ${topCats
        .map((c: any, i: number) => `${i + 1}위 ${c.category}(${c.count}건)`)
        .join(', ')} 순이고, 투자상품은 ${topProds
        .map((p: any) => p.product_id)
        .slice(0, 3)
        .join(', ')} 등을 선호합니다.`

      return {
        researchers: {
          investment: {
            status: 'ok',
            answer,
            metrics: {
              segment_customer_count: segCount,
              avg_monthly_invest_capacity_won: avgCap,
              avg_age: avgAge,
              top_insurance_categories: topCats,
              top_investment_products: topProds,
            },
            evidence_rows: pickEvidence(aggs.investment?.evidence_candidates || [], 5),
            chart_hint: { type: 'bar', x: 'category', y: 'count' },
          },
        },
        editor: {
          final_answer: answer,
          tone: 'informative',
          chart_spec: {
            type: 'bar',
            title: '공격형 상위 고객이 보유한 보험 카테고리 TOP5',
            x_field: 'name',
            y_field: 'value',
            data: topCats.map((c: any) => ({ name: c.category, value: c.count })),
          },
          citations: (aggs.investment?.evidence_candidates || []).slice(0, 4).map((r: EvidenceRow, i: number) => ({
            source: r.source,
            row_index: r.row_index,
            highlight:
              r.source.includes('risk')
                ? '공격형 성향 프로필'
                : r.source.includes('investment_products')
                  ? '보유 투자상품'
                  : '보유 내역',
            fields: r.fields,
          })),
          followup_suggestions: [
            '안정형 고객은 어떤 보험에 가장 많이 가입하나요?',
            '공격형 고객의 보험 월보험료 평균은 얼마인가요?',
          ],
        },
      }
    },
  },
  {
    label: '기준프로필 일치율',
    query: '기준프로필이 "36세 여성 IT개발자"인 상품과 실제 30대 여성 사무직 고객의 가입 상품이 얼마나 일치하나요?',
    required_researchers: ['product', 'policy'],
    intent: 'cross_analysis',
    buildResponses: (aggs) => {
      const pa = aggs.product?.aggregates || {}
      const po = aggs.policy?.aggregates || {}
      const totalProducts = pa.total_products ?? 0
      const catBreakdown = (pa.category_breakdown || []).slice(0, 5)
      const segSize = po.segment_size ?? 0
      const topCats = (po.top_categories || []).slice(0, 5)

      const productAns = `products_catalog.csv 필터링 결과, 30대 여성 타겟 상품은 총 ${totalProducts}건이며, 카테고리별로는 ${catBreakdown
        .map((c: any) => `${c['상품카테고리']}(${c.count})`)
        .join(', ')} 분포를 보입니다.`
      const policyAns = `실제 30대 여성 사무직 고객 ${segSize}명의 가입 카테고리는 ${topCats
        .map((c: any, i: number) => `${i + 1}위 ${c.category}(${c.count}건)`)
        .join(', ')} 로, 카탈로그의 타겟 분포와 비교 가능합니다.`

      const commonCat = catBreakdown[0]?.['상품카테고리'] || ''
      return {
        researchers: {
          product: {
            status: 'ok',
            answer: productAns,
            metrics: { total_products: totalProducts, category_breakdown: catBreakdown },
            evidence_rows: pickEvidence(aggs.product?.evidence_candidates || [], 3),
            chart_hint: { type: 'bar', x: '상품카테고리', y: 'count' },
          },
          policy: {
            status: 'ok',
            answer: policyAns,
            metrics: { segment_size: segSize, top_categories: topCats },
            evidence_rows: pickEvidence(aggs.policy?.evidence_candidates || [], 3),
            chart_hint: { type: 'bar', x: 'category', y: 'count' },
          },
        },
        editor: {
          final_answer: `기준프로필이 "36세 여성 IT개발자"에 맞춰 설계된 상품은 ${totalProducts}건 존재하며 상위 카테고리는 ${commonCat} 등이에요.\n\n반면 실제 30대 여성 사무직 고객 ${segSize}명이 가장 많이 가입한 카테고리는 ${topCats
              .slice(0, 3)
              .map((c: any) => c.category)
              .join(' · ')} 순으로, 카탈로그 타겟 설계와 실제 가입 패턴 사이에 ${
              topCats[0]?.category === commonCat ? '비교적 높은 일치도' : '차이'
            }가 관찰됩니다. 상품기획 관점에서 보면 타겟 재정의 또는 마케팅 메시지 조정이 도움이 될 수 있어요.`,
          tone: 'informative',
          chart_spec: {
            type: 'bar',
            title: '카탈로그 vs 실제 가입 카테고리 비교',
            x_field: 'name',
            y_field: 'value',
            data: topCats.map((c: any) => ({ name: c.category, value: c.count })),
          },
          citations: [
            ...(aggs.product?.evidence_candidates || []).slice(0, 2),
            ...(aggs.policy?.evidence_candidates || []).slice(0, 2),
          ].map((r: EvidenceRow, i: number) => ({
            source: r.source,
            row_index: r.row_index,
            highlight:
              r.source.includes('products_catalog')
                ? '해당 타겟 카탈로그 상품'
                : r.source.includes('customer_profiles')
                  ? '실제 30대 여성 사무직 고객'
                  : '실가입 계약 행',
            fields: r.fields,
          })),
          followup_suggestions: [
            '30대 여성 IT개발자 세그먼트만 따로 보면 어떤 상품을 가장 많이 드나요?',
            '카탈로그 vs 실가입 일치도가 가장 낮은 세그먼트는?',
          ],
        },
      }
    },
  },
  {
    label: '🚫 거절 테스트',
    query: '내일 KOSPI가 오를까요?',
    required_researchers: [],
    intent: 'refuse',
    reject: true,
    reject_reason: '제공된 보험·투자 데이터셋(고객·상품·보장·손해율·투자상품 등)만으로는 미래 주가 변동을 예측할 수 없습니다.',
    buildResponses: () => ({
      researchers: {},
      editor: {
        final_answer:
          '죄송해요, 내일 KOSPI가 오를지는 제가 답드리기 어려워요. 저는 한화생명 해커톤에서 제공된 고객·상품·보장·손해율·투자상품 데이터만 참고할 수 있고, 실시간 시장 예측은 제 범위 밖이거든요.\n\n대신 이런 질문은 도움을 드릴 수 있어요:\n• 공격형 투자성향 고객의 보유 상품 분포\n• 최근 12개월 KOSPI 대비 펀드 수익률 비교 (market_benchmarks 기반)',
        tone: 'apologetic',
        chart_spec: { type: 'none', data: [] },
        citations: [],
        followup_suggestions: [
          '공격형 투자성향 고객이 가장 많이 보유한 상품은?',
          '최근 KOSPI 대비 펀드 수익률은 어땠나요?',
        ],
      },
    }),
  },
]

function main() {
  console.log('Loading tables...')
  const tables = loadTables()
  console.log('Tables loaded:', Object.keys(tables).length)

  fs.mkdirSync(OUT_DIR, { recursive: true })

  for (const sample of SAMPLES) {
    console.log(`\n▶ ${sample.label}: ${sample.query}`)

    // Run aggregators for required researchers
    const aggs: Record<string, any> = {}
    for (const rid of sample.required_researchers) {
      console.log(`  · aggregating ${rid}...`)
      aggs[rid] = runAggregator(rid, sample.query, tables)
    }

    const { researchers, editor } = sample.buildResponses(aggs)

    const bundle = {
      query: sample.query,
      normalized_query: sample.query,
      router: {
        intent: sample.intent,
        required_researchers: sample.required_researchers,
        reject: sample.reject || false,
        reject_reason: sample.reject_reason,
        rewritten_query: sample.query,
      },
      researchers,
      editor,
      built_at: new Date().toISOString(),
      built_mode: 'mock-aggregator',
    }

    const slug = slugify(sample.label)
    const outPath = path.join(OUT_DIR, `${slug}.json`)
    fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2))
    console.log(`  ✓ saved → ${path.relative(ROOT, outPath)}`)
  }

  console.log('\nDone.')
}

main()
