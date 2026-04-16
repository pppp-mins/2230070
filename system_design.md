# Insurance-Buddy · system_design.md

> [spec.md](spec.md) 기반 상세 시스템 설계 및 2시간 타임박스 개발 플랜
> 사번 2230070 · 한화생명 해커톤 심화 A02

---

## 0. 설계 원칙

| # | 원칙 | 근거 |
|---|---|---|
| P1 | **결정적 집계 → LLM 해석** | 환각 금지 규칙(§4) 준수. 수치는 JS 가 계산, LLM 은 요약·톤·차트 힌트만 생성 |
| P2 | **라우팅 우선** | 불필요한 pro 모델 호출 비용·지연 절감. flash 가 1차 스코프 판단 |
| P3 | **스키마 고정** | 리서처·에디터 응답 JSON 스키마를 엄격 고정해 파싱 실패 최소화 (Gemini `responseSchema` 사용) |
| P4 | **인용 강제** | evidence_rows 비어있는 리서처 응답은 editor 에서 무효 처리 |
| P5 | **CSV 브라우저 로드** | 서버리스 cold-start 절약 · Papa Parse 로 초기 1회 로드 후 메모리 캐시 |
| P6 | **세션 스코프 멀티턴** | 대화는 브라우저 상태(Zustand)에만 유지. 서버 stateless |

---

## 1. 시스템 아키텍처

### 1.1 런타임 토폴로지

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Browser (Vercel Edge)                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  React + Vite (SPA)                                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │  │
│  │  │ UI Components│  │ Zustand Store│  │ Data Layer           │  │  │
│  │  │ - QueryBar   │  │ - session    │  │ - Papa Parse loader  │  │  │
│  │  │ - 4 Cards    │  │ - researchers│  │ - arquero tables     │  │  │
│  │  │ - Editor     │  │ - history    │  │ - deterministic      │  │  │
│  │  │ - Citations  │  │              │  │   aggregators        │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │  │
│  │         │                 │                     │              │  │
│  │         └─────────────────┴─────────────────────┘              │  │
│  │                           │                                    │  │
│  │                           ▼                                    │  │
│  │                 ┌───────────────────┐                          │  │
│  │                 │ Orchestrator Hook │                          │  │
│  │                 │ (useMultiResearch)│                          │  │
│  │                 └─────────┬─────────┘                          │  │
│  └───────────────────────────┼────────────────────────────────────┘  │
│                              ▼                                       │
│                  ┌───────────────────────┐                           │
│                  │  fetch /api/*         │                           │
│                  └───────────┬───────────┘                           │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      Vercel Serverless Functions                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐  │
│  │/api/router   │ │/api/research │ │ /api/editor  │ │/api/health  │  │
│  │ gemini flash │ │ gemini pro   │ │ gemini pro   │ │ diagnostic  │  │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └─────────────┘  │
│         │                │                │                          │
│         └────────────────┴────────────────┘                          │
│                          ▼                                           │
│                 ┌─────────────────┐                                  │
│                 │ Google Gen AI   │                                  │
│                 │ SDK (Gemini)    │                                  │
│                 └─────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 책임 분리
- **Browser (React)**: CSV 로드·집계·UI 렌더·상태관리·오케스트레이션 루프
- **Serverless (`api/*`)**: Gemini API 키 보호 · LLM 호출 프록시 (stateless) · JSON 스키마 검증
- **Gemini**: 의도 분류 · 자연어 해석 · 차트 힌트 생성 · 톤 통합

### 1.3 요청 라이프사이클

```
T0  사용자 질문 전송
T1  Zustand: history + currentQuery 업데이트
T2  /api/router 호출 (flash, ~0.5s)
      입력: { query, history_summary }
      출력: { intent, required_researchers[], reject, reject_reason }
T3  reject=true → Editor 거절 응답 생성 (skip T4~T5) → 종료
T4  JS 집계 레이어 병렬 실행
      각 리서처별 aggregator 함수 실행 (동기, ~수십ms)
      → { aggregates: {...}, schema_snippet: "..." }
T5  선택된 리서처만 /api/research 병렬 호출 (pro, ~1~2s 각)
      입력: { researcher_id, query, aggregates, schema_snippet, history_summary }
      출력: { status, answer, metrics, evidence_rows, chart_hint, notes }
      UI: 카드별 진행률 바 애니메이션, 완료 시 ✓
T6  /api/editor 호출 (pro, ~1~2s)
      입력: { query, researcher_responses[], history_summary }
      출력: { final_answer, chart_spec, citations[], tone }
T7  UI 렌더: 통합답변 + Recharts + 인용 카드
T8  Zustand: history 에 질문·답변 요약 푸시 (다음 턴용)
```

**총 예상 지연**: 2.5~4.5초 (flash 0.5 + 병렬 pro 1.5 + editor pro 1.5 + 오버헤드)

---

## 2. 에이전트 상세 설계

### 2.1 intent_router (gemini-2.0-flash)

**입력**
```ts
{
  query: string,
  history_summary: string  // 직전 2턴 요약 (빈 문자열 가능)
}
```

**Gemini responseSchema (구조화 출력 강제)**
```json
{
  "type": "object",
  "properties": {
    "intent": {"type": "string", "enum": ["product_lookup","segment_analysis","loss_ratio_trend","investment_analysis","cross_analysis","refuse"]},
    "required_researchers": {
      "type": "array",
      "items": {"type": "string", "enum": ["product","policy","loss_ratio","investment"]}
    },
    "reject": {"type": "boolean"},
    "reject_reason": {"type": "string"},
    "rewritten_query": {"type": "string"}
  },
  "required": ["intent","required_researchers","reject","rewritten_query"]
}
```

**프롬프트 골격**
```
You are an intent router for an insurance BI assistant.
Available datasets:
- product: products_catalog.csv (172 products)
- policy: customer_profiles + policy_headers + policy_coverages
- loss_ratio: loss_ratio_timeseries (monthly by insurer/category/age/gender)
- investment: 6 investment CSVs

Rules:
1. If the query cannot be answered from these datasets → reject=true
2. If query depends on prior turn context, rewrite it to be self-contained in rewritten_query
3. Only include researchers whose datasets are actually needed
4. If multiple, include all

Conversation so far: {history_summary}
Current query: {query}

Return JSON.
```

**Few-shot 예시 3개**
- "30대 남성이 가장 많이 가입한 상품?" → `{product,policy}`
- "그럼 여성은?" (이전 맥락: 30대 남성) → rewritten "30대 여성이 가장 많이 가입한 상품?" → `{product,policy}`
- "내일 주가 오를까?" → `reject=true`

### 2.2 리서처 4종 (gemini-2.5-pro)

**공통 입력**
```ts
{
  researcher_id: "product" | "policy" | "loss_ratio" | "investment",
  query: string,         // rewritten_query
  aggregates: object,    // JS 가 미리 계산한 숫자 결과
  schema_snippet: string, // 해당 CSV 컬럼 설명
  evidence_candidates: {source,row_index,fields}[]  // JS 가 뽑은 후보 행
}
```

**공통 responseSchema**
```json
{
  "type": "object",
  "properties": {
    "status": {"type": "string", "enum": ["ok","no_data","refuse"]},
    "answer": {"type": "string"},
    "metrics": {"type": "object"},
    "evidence_rows": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source": {"type": "string"},
          "row_index": {"type": "integer"},
          "fields": {"type": "object"}
        },
        "required": ["source","row_index","fields"]
      }
    },
    "chart_hint": {
      "type": "object",
      "properties": {
        "type": {"type": "string", "enum": ["bar","line","pie","none"]},
        "x": {"type": "string"},
        "y": {"type": "string"},
        "series": {"type": "array", "items": {"type": "string"}}
      },
      "required": ["type"]
    },
    "notes": {"type": "string"}
  },
  "required": ["status","answer","metrics","evidence_rows","chart_hint"]
}
```

**리서처별 전용 프롬프트 차별점**
- `product_researcher`: "카탈로그의 target_age / category / 주요보장 필드 매칭을 우선하라"
- `policy_researcher`: "customer_profiles 의 persona_cluster/needs_tags 와 policy_coverages 의 coverage_group 을 교차하라"
- `loss_ratio_researcher`: "시계열 추이 질문은 line chart, 세그먼트 비교는 bar chart"
- `investment_researcher`: "risk_grade 와 risk_profiles.risk_label 를 연결하라"

**핵심 규칙** (모든 리서처 공통 prompt 에 포함)
```
- Use ONLY numbers from `aggregates`. Do NOT compute your own.
- Every claim in `answer` must be backed by at least one entry in `evidence_rows`.
- If `aggregates` is empty or irrelevant → status="no_data"
- `evidence_rows` must come from `evidence_candidates` (do not fabricate)
```

### 2.3 editor (gemini-2.5-pro)

**입력**
```ts
{
  query: string,
  history_summary: string,
  researcher_responses: ResearcherResponse[],
  rejected: boolean,
  reject_reason?: string
}
```

**responseSchema**
```json
{
  "type": "object",
  "properties": {
    "final_answer": {"type": "string"},
    "tone": {"type": "string", "enum": ["friendly","apologetic","informative"]},
    "chart_spec": {
      "type": "object",
      "properties": {
        "type": {"type": "string", "enum": ["bar","line","pie","none"]},
        "title": {"type": "string"},
        "x_field": {"type": "string"},
        "y_field": {"type": "string"},
        "data": {"type": "array"}
      }
    },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source": {"type": "string"},
          "row_index": {"type": "integer"},
          "highlight": {"type": "string"},
          "fields": {"type": "object"}
        }
      }
    },
    "followup_suggestions": {
      "type": "array",
      "items": {"type": "string"}
    }
  },
  "required": ["final_answer","tone","chart_spec","citations"]
}
```

**프롬프트 골격**
```
You are the editor synthesizing multiple researcher responses into one answer.
Rules:
1. Cite at least one evidence row per substantive claim.
2. Pick exactly one chart from the researchers' chart_hints — the one that best visualizes the answer.
3. If `rejected=true`, produce a polite, friendly refusal. No fabrication.
4. Tone: friendly but precise. Avoid corporate stiffness.
5. Suggest 2 followup questions the user could ask next (based on remaining datasets).
```

---

## 3. 데이터 레이어 설계

### 3.1 CSV 로더

```ts
// src/data/loader.ts
import Papa from 'papaparse'
import { from } from 'arquero'

export type TableSet = {
  products: Table
  customers: Table
  policies: Table
  coverages: Table
  lossRatio: Table
  investments: Table
  holdings: Table
  nav: Table
  risk: Table
  benchmarks: Table
  transactions: Table
}

export async function loadAll(): Promise<TableSet> {
  const files = [
    ['products','/data/products_catalog.csv'],
    ['customers','/data/customer_profiles.csv'],
    ['policies','/data/policy_headers.csv'],
    ['coverages','/data/policy_coverages.csv'],
    ['lossRatio','/data/loss_ratio_timeseries.csv'],
    ['investments','/data/investment_products.csv'],
    ['holdings','/data/customer_holdings.csv'],
    ['nav','/data/nav_timeseries.csv'],
    ['risk','/data/risk_profiles.csv'],
    ['benchmarks','/data/market_benchmarks.csv'],
    ['transactions','/data/transactions.csv'],
  ]
  const entries = await Promise.all(files.map(async ([key, path]) => {
    const text = await fetch(path).then(r => r.text())
    const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true })
    return [key, from(parsed.data)]
  }))
  return Object.fromEntries(entries) as TableSet
}
```

**최적화**:
- Vite `public/data/*.csv` 경로로 정적 서빙
- 앱 초기 마운트 시 1회 로드 → Zustand `dataStore.tables`
- 전체 용량 ~68k 행. gzip 후 약 3~5MB. 첫 로드 2~3초 예상 → 로딩 스플래시 표시

### 3.2 결정적 집계기 (aggregators)

리서처별로 질문 유형을 몇 개 카테고리로 분류하고, 각 카테고리에 대응하는 집계 함수를 미리 구현한다.

```ts
// src/aggregators/policy.ts
export function policyAggregate(query: string, tables: TableSet) {
  // 1. query 에서 세그먼트 키워드 추출 (간단 규칙 + LLM 보조는 v2)
  const seg = extractSegment(query)  // { age_band?, gender?, family?, income?, persona? }

  // 2. customer_profiles 필터
  let customers = tables.customers
  if (seg.age_band) customers = customers.filter(/*...*/)
  if (seg.gender) customers = customers.filter(/*...*/)

  // 3. policies 와 inner join
  const joined = customers
    .join(tables.policies, 'customer_id')
    .join(tables.coverages, 'policy_id')

  // 4. 다양한 집계 산출
  return {
    segment_size: customers.numRows(),
    top_categories: joined.groupby('category').count().orderby(desc('count')).objects({limit: 5}),
    top_coverages: joined.groupby('coverage_group').count().orderby(desc('count')).objects({limit: 5}),
    evidence_candidates: joined.slice(0, 10).objects()
  }
}
```

**리서처 × 집계 함수 매트릭스**

| 리서처 | 주요 집계 함수 | 반환 필드 |
|---|---|---|
| product | `productAggregate` | categories_count, target_age_distribution, top_premium_products, keyword_matches |
| policy | `policyAggregate` | segment_size, top_categories, top_coverages, top_insurers, needs_vs_coverage |
| loss_ratio | `lossRatioAggregate` | monthly_trend, worst_top5, best_top5, segment_heatmap |
| investment | `investmentAggregate` | risk_grade_distribution, avg_monthly_capacity, top_products_by_return, segment_holdings |

**세그먼트 추출 전략**:
- v1: 간단한 정규식 + 키워드 맵 (`/30대|20대/`, `/남성|여성/`, `/자녀\s*\d+/`)
- 추출 실패 시 LLM 에 플랜 생성 위임은 v2 stretch

### 3.3 증거 행 (evidence_candidates)
- 각 aggregator 가 반환 시 원본 행 5~10개 동봉
- `row_index` 는 arquero 의 `_row` 인덱스 사용
- 리서처 LLM 은 이 후보 중에서 최종 evidence 를 선택

---

## 4. 프론트엔드 구조

### 4.1 디렉터리

```
src/
├── main.tsx
├── App.tsx
├── components/
│   ├── QueryBar.tsx          # 입력창 + 샘플 칩
│   ├── ResearcherCard.tsx    # 단일 카드 (진행률/로그/상태)
│   ├── ResearcherGrid.tsx    # 4 카드 그리드
│   ├── EditorPanel.tsx       # 통합 답변 + 차트
│   ├── CitationCard.tsx      # 인용 카드 (클릭 시 전체 행)
│   ├── ChartRenderer.tsx     # chart_spec → Recharts 매핑
│   ├── HistorySidebar.tsx    # 대화 이력 토글
│   └── LoadingSplash.tsx     # CSV 초기 로드 스플래시
├── hooks/
│   ├── useDataLoad.ts        # CSV 로드
│   ├── useMultiResearch.ts   # 오케스트레이션 루프 (router→research→editor)
│   └── useHistory.ts         # 멀티턴 히스토리 관리
├── aggregators/
│   ├── product.ts
│   ├── policy.ts
│   ├── lossRatio.ts
│   └── investment.ts
├── data/
│   ├── loader.ts
│   └── segment.ts            # 세그먼트 추출 유틸
├── api-client/
│   ├── router.ts             # fetch wrapper
│   ├── research.ts
│   └── editor.ts
├── store/
│   └── index.ts              # Zustand (data, session, history, ui)
├── types/
│   └── schemas.ts            # ResearcherResponse, EditorResponse, RouterResponse
└── constants/
    ├── models.ts             # ROUTER_MODEL, PRO_MODEL
    └── samples.ts            # 샘플 질문 5개
```

### 4.2 상태 관리 (Zustand)

```ts
type AppState = {
  // data (immutable after load)
  tables: TableSet | null
  dataLoaded: boolean

  // session
  currentQuery: string
  isProcessing: boolean

  // per-researcher live state
  researchers: {
    [key in ResearcherId]: {
      status: 'idle'|'running'|'done'|'no_response'|'error'
      progress: number
      logs: string[]
      response: ResearcherResponse | null
    }
  }

  // editor result
  editorResult: EditorResponse | null

  // multi-turn history
  history: HistoryEntry[]  // {query, answer_summary, timestamp}

  // actions
  runQuery: (q: string) => Promise<void>
  resetSession: () => void
}
```

### 4.3 오케스트레이션 훅

```ts
// src/hooks/useMultiResearch.ts
export function useMultiResearch() {
  const store = useStore()

  async function runQuery(query: string) {
    store.setProcessing(true)
    store.resetResearchers()

    // 1. Router
    const historySummary = summarizeHistory(store.history)
    const routerRes = await callRouter({ query, history_summary: historySummary })

    if (routerRes.reject) {
      const rejectAnswer = await callEditor({ query, rejected: true, reject_reason: routerRes.reject_reason, history_summary: historySummary, researcher_responses: [] })
      store.setEditorResult(rejectAnswer)
      store.markUnusedResearchers(['product','policy','loss_ratio','investment'])
      return
    }

    const activeIds = routerRes.required_researchers
    const inactiveIds = ALL_RESEARCHERS.filter(id => !activeIds.includes(id))
    store.markUnusedResearchers(inactiveIds)

    // 2. JS 집계 + LLM 병렬 호출
    const promises = activeIds.map(async (id) => {
      store.setResearcherStatus(id, 'running')
      store.pushLog(id, '데이터 로드 중...')
      const agg = runAggregator(id, routerRes.rewritten_query, store.tables!)
      store.setProgress(id, 40)
      store.pushLog(id, `${agg.evidence_candidates.length}개 후보 행 확보`)
      const res = await callResearch({
        researcher_id: id,
        query: routerRes.rewritten_query,
        aggregates: agg.aggregates,
        schema_snippet: SCHEMAS[id],
        evidence_candidates: agg.evidence_candidates
      })
      store.setProgress(id, 100)
      store.setResearcherResponse(id, res)
    })
    await Promise.all(promises)

    // 3. Editor
    const editorRes = await callEditor({
      query: routerRes.rewritten_query,
      history_summary: historySummary,
      researcher_responses: activeIds.map(id => store.researchers[id].response!),
      rejected: false
    })
    store.setEditorResult(editorRes)

    // 4. History push
    store.pushHistory({
      query,
      answer_summary: editorRes.final_answer.slice(0, 200),
      timestamp: Date.now()
    })

    store.setProcessing(false)
  }

  return { runQuery }
}
```

### 4.4 진행률 로그 스트리밍 UX

Gemini 자체 streaming 대신 **클라이언트 측 가짜 스트리밍** 으로 충분:
```
0%   "질문 분석 중..."
20%  "관련 데이터 선별 중..."
40%  "14,523 행 필터링..."
60%  "집계 계산 중..."
80%  "LLM 해석 대기..."
100% "답변 준비 완료 ✓"
```
`setTimeout` + Framer Motion 진행률 바로 ~1.5초 페이크 스트리밍. 실제 호출은 병렬로 진행.

### 4.5 차트 렌더링

```ts
// chart_spec.type → Recharts 컴포넌트 매핑
switch(spec.type) {
  case 'bar':  return <BarChart data={spec.data}>...</BarChart>
  case 'line': return <LineChart data={spec.data}>...</LineChart>
  case 'pie':  return <PieChart data={spec.data}>...</PieChart>
  case 'none': return null
}
```

Tailwind + Framer Motion 으로 스무스 등장 애니메이션.

---

## 5. 서버리스 API 설계

### 5.1 공통 구조
```ts
// api/_lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export function getModel(name: string, responseSchema: object) {
  return client.getGenerativeModel({
    model: name,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema
    }
  })
}
```

### 5.2 `/api/router.ts`
```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getModel } from './_lib/gemini'
import { ROUTER_SCHEMA } from './_lib/schemas'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { query, history_summary } = req.body
  const model = getModel('gemini-2.0-flash', ROUTER_SCHEMA)
  const prompt = buildRouterPrompt(query, history_summary)
  const result = await model.generateContent(prompt)
  const parsed = JSON.parse(result.response.text())
  res.status(200).json(parsed)
}
```

### 5.3 `/api/research.ts`
- 요청마다 `researcher_id` 를 보고 해당 리서처의 전용 프롬프트 조립
- pro 모델 사용
- 타임아웃 가드 (20초)

### 5.4 `/api/editor.ts`
- `rejected=true` 경로: 거절 전용 프롬프트
- 정상 경로: 통합 프롬프트

### 5.5 에러 처리
- Gemini 응답이 JSON 파싱 실패 → 1회 재시도, 그래도 실패 시 `status: error` 반환
- 서버리스 함수 내 try/catch 로 500 대신 200 + `{error: ...}` 반환 (프론트 렌더 유지)

### 5.6 환경변수
```
GEMINI_API_KEY=xxx   # 유일한 secret
```
모델명·온도는 `api/_lib/constants.ts` 에 상수.

---

## 6. 멀티턴 맥락 유지

### 6.1 히스토리 데이터 구조
```ts
type HistoryEntry = {
  id: string
  query: string
  rewritten_query: string
  answer_summary: string  // editor final_answer 의 첫 200자
  timestamp: number
  active_researchers: ResearcherId[]
}
```

### 6.2 summary 방식
직전 **최대 3턴** 을 다음 포맷으로 압축해 Router·Editor 프롬프트에 주입:
```
[Turn 1] Q: 30대 맞벌이 자녀2 인기 보장 TOP5
         A: 자녀상해(234건), 실손(198건), 치과(145건)…
[Turn 2] Q: 그럼 자녀1 가구는?
         A: 실손(301건), 어린이종합(220건)…
```

### 6.3 rewriting 책임
- **Router 가 rewritten_query 를 반환** → 리서처·에디터는 self-contained query 로 작업
- "그럼 여성은?" → rewriter 가 "30대 맞벌이 자녀2 여성 가구가 가장 많이 가입한 보장 TOP5" 로 확장

### 6.4 UI
- 우측 사이드바 토글로 대화 이력 리스트
- "🔄 새 대화" 버튼으로 history clear

---

## 7. 환각 방지 가드레일 요약

| 층 | 방어선 |
|---|---|
| 데이터 | 모든 수치 계산을 JS (arquero) 에서 결정적으로 수행 |
| 프롬프트 | "aggregates 밖 숫자 금지" · "evidence_candidates 밖 행 인용 금지" 명시 |
| 스키마 | Gemini responseSchema 로 필드 누락 차단 · evidence_rows 필수 |
| 검증 | 에디터 단계에서 researcher 응답의 `evidence_rows` 가 비어있으면 해당 응답 무시 |
| 라우팅 | Router 가 스코프 밖 질문 사전 차단 |

---

## 8. 2시간 개발 플랜 (타임박스)

| 구간 | 시간 | 작업 | 완료 기준 |
|---|---|---|---|
| **Phase 0** · 부트스트랩 | 0:00~0:15 (15분) | Vite+React+TS 프로젝트 생성 · Tailwind · Recharts · arquero · Papa Parse 설치 · Vercel 프로젝트 link · `.env` 세팅 · `public/data/*.csv` 복사 | `npm run dev` 기동 확인 |
| **Phase 1** · 데이터 레이어 | 0:15~0:40 (25분) | `loader.ts` 구현 · 4개 aggregator 중 `policy` 1개만 완전 구현 · 나머지는 skeleton | 브라우저 콘솔에서 policyAggregate("30대 남성") 호출해 숫자 나옴 |
| **Phase 2** · API 함수 | 0:40~1:00 (20분) | `/api/router.ts` · `/api/research.ts` · `/api/editor.ts` · `_lib/gemini.ts` · `_lib/schemas.ts` · Gemini SDK 연동 · curl 로 각 엔드포인트 smoke test | 로컬 `vercel dev` 에서 각 API 수동 호출 성공 |
| **Phase 3** · 오케스트레이션 | 1:00~1:25 (25분) | Zustand store · `useMultiResearch` 훅 · `QueryBar`·`ResearcherGrid`·`ResearcherCard`·`EditorPanel` 최소 버전 · 샘플 질문 1개 end-to-end | 샘플 질문 1개가 전체 파이프라인 통과 · 답변 텍스트 렌더 |
| **Phase 4** · 남은 aggregator | 1:25~1:40 (15분) | `product` · `lossRatio` · `investment` aggregator 구현 | 4개 리서처 모두 병렬 동작 |
| **Phase 5** · UI 완성 | 1:40~1:55 (15분) | 인용 카드 · Recharts 차트 · 진행률 바 애니메이션 · 샘플 칩 · Tailwind 스타일링 · 멀티턴 sidebar | 샘플 질문 4개 + 거절 1개 모두 잘 동작 |
| **Phase 6** · 배포·검증 | 1:55~2:00 (5분) | `vercel --prod` · URL 접속 · 샘플 질문 스모크 · `README.md` 초안 | Vercel URL 에서 샘플 질문 답변 정상 |

### 8.1 리스크 & 대응

| 리스크 | 대응 |
|---|---|
| CSV 전체 로드가 느림 | 가장 큰 `loss_ratio` 만 lazy load 로 분리 (해당 카드 활성 시에만 fetch) |
| Gemini JSON 파싱 실패 | `responseSchema` 필수 사용 + 재시도 1회 + 실패시 `no_data` fallback |
| 세그먼트 추출 미흡 | 정규식 fail 시 aggregator 가 전체 데이터 top-N 반환 |
| pro 모델 지연 (>3초) | Router=flash 로 거절 조기 종료 · 리서처 병렬화 유지 |
| 멀티턴 히스토리 프롬프트 토큰 폭증 | 최대 3턴 + 각 200자 요약 cap |
| Vercel 빌드 실패 | Phase 2 끝나자마자 1회 preview deploy 해서 조기 검증 |

### 8.2 MVP vs Nice-to-have 경계
- **MVP 필수** (완성 기준 체크리스트 항목): 샘플 질문 4 정상 + 거절 1 정상 + 4 카드 표시 + 인용
- **Nice-to-have** (시간 남으면): 멀티턴 sidebar UI · followup_suggestions 렌더 · 쿼리플랜 토글 · Framer Motion 세부 애니

---

## 9. 테스트 & 검증 체크리스트

### 9.1 개발 중 smoke test
- [ ] `/api/router` 가 정상 JSON 반환 (curl)
- [ ] `/api/research` 가 `evidence_rows` 비어있지 않음
- [ ] `/api/editor` 가 `chart_spec.type ∈ {bar,line,pie,none}`
- [ ] 각 aggregator 가 console 에서 숫자 반환

### 9.2 완성 기준 검증 (과제설명서)
- [ ] 샘플 질문 1: "30대 맞벌이 자녀2 인기 보장 TOP5" → policy 단독 활성, 숫자 + bar chart
- [ ] 샘플 질문 2: "자영업 중장년 인기 카테고리 + 손해율 추이" → policy + loss_ratio 동시 활성
- [ ] 샘플 질문 3: "공격형 상위 100명 평균 나이/보험" → investment + policy
- [ ] 샘플 질문 4: "기준프로필 일치율" → product + policy
- [ ] 거절: "내일 KOSPI 오를까" → 모든 카드 무응답 + 정중한 거절 문구
- [ ] 멀티턴: 질문 2 이후 "그럼 여성은?" 정상 해석

### 9.3 규칙 준수
- [ ] `.env` 가 git 에 안 올라감
- [ ] 모든 숫자·고객ID·상품명이 실제 데이터에 존재
- [ ] 외부 데이터 사용 없음
- [ ] 오픈소스 라이선스 MIT/Apache/BSD 만 사용

---

## 10. 배포 & 제출

### 10.1 Vercel 설정
```
Project name: hanwha-2230070-insurance-buddy
Framework: Vite
Build command: npm run build
Output dir: dist
Env vars: GEMINI_API_KEY (Production)
```

### 10.2 README.md 포함 항목 (완주 후 작성)
- 앱 요약
- 기술 스택 · 라이브러리 목록
- 로컬 실행: `npm install && npm run dev`
- 배포: `vercel --prod`
- 5 에이전트 프롬프트 설계 요약 (본 문서 §2 참조)
- 완성 기준 체크리스트 결과
- 샘플 케이스 결과 스크린샷

### 10.3 제출
- 수신: `jonhyuk0922@naver.com`
- 제목: `한화생명 2230070`
- 본문: Vercel URL + 소감 1줄
- 첨부: `spec.md` · `README.md`

---

## 11. 파일 산출 목록

| 파일 | 설명 |
|---|---|
| `spec.md` | 한 장 기획서 (이미 작성) |
| `system_design.md` | 본 문서 (상세 설계 + 개발 플랜) |
| `README.md` | 완주 후 작성 |
| `src/**` | React 소스 |
| `api/**` | Vercel 서버리스 함수 |
| `public/data/*.csv` | 플랫 복사된 데이터 |
| `.env.local` | `GEMINI_API_KEY` (git ignore) |
| `vercel.json` | 필요시 함수 설정 |
| `package.json` | 의존성 |
