# Insurance-Buddy

> 자연어 질문 하나에 5개 에이전트가 보험 데이터를 병렬 분석하는 BI 챗봇

---

## 만든 것 요약

**Insurance-Buddy**는 한화생명 상품기획자를 위한 자연어 BI 도구입니다. 사용자가 한국어로 질문을 입력하면:

1. **Router Agent**가 질문 의도를 분류하고 필요한 리서처를 선택합니다
2. 선택된 **4개 Researcher Agent** 중 해당되는 에이전트가 병렬로 데이터를 탐색합니다
3. **Editor Agent**가 리서처 답변을 통합하여 차트·인용 카드와 함께 최종 답변을 생성합니다

모든 수치 계산은 JS(Arquero)에서 결정적으로 수행하고, LLM은 해석·요약만 담당하여 환각을 방지합니다. 챗봇 스타일 UI에서 멀티 에이전트의 실시간 동작 과정을 시각적으로 확인할 수 있습니다.

---

## 기술 스택 · 사용한 오픈소스 라이브러리

| 영역 | 기술 | 라이선스 |
|------|------|----------|
| **프론트엔드** | React 18, TypeScript 5.5, Vite 5 | MIT |
| **스타일링** | Tailwind CSS 3.4 | MIT |
| **상태관리** | Zustand 4.5 | MIT |
| **차트** | Recharts 2.12 | MIT |
| **데이터 집계** | Arquero 6.0 (join/groupby/rollup) | BSD-3 |
| **CSV 파싱** | Papa Parse 5.4 | MIT |
| **아이콘** | Lucide React 0.400 | ISC |
| **AI / LLM** | Google Gen AI SDK (`@google/genai`) — Gemini 2.5 Flash Lite | Apache-2.0 |
| **배포** | Vercel (정적 사이트 + Serverless Functions) | — |
| **폰트** | Pretendard Variable (CDN) | OFL |
| **브랜드 자산** | 한화생명 공식 favicon + logo.svg | 한화생명 |

---

## 로컬 실행 방법

### 사전 요구사항
- Node.js 20+
- Gemini API Key ([Google AI Studio](https://aistudio.google.com/) 에서 무료 발급)

### 설치 및 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에서 GEMINI_API_KEY=your_key 입력

# 3. 개발 서버 실행
npm run dev
# → http://localhost:5173/ 에서 확인
```

### 환경변수 설정

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `GEMINI_API_KEY` | Google Gemini API 키 (필수) | — |
| `GEMINI_ROUTER_MODEL` | 라우터 모델 | `gemini-2.5-flash-lite` |
| `GEMINI_RESEARCHER_MODEL` | 리서처 모델 | `gemini-2.5-flash-lite` |
| `GEMINI_EDITOR_MODEL` | 에디터 모델 | `gemini-2.5-flash-lite` |

### Vercel 배포

```bash
vercel env add GEMINI_API_KEY production
vercel --prod
```

---

## 5 에이전트 프롬프트 설계 요약

### Agent 0 · `intent_router` (Flash Lite)

**역할**: 질문 의도 분류, 필요한 리서처 선택, 범위 외 질문 거절, 멀티턴 맥락 rewriting

**프롬프트 핵심 설계**:
- 4개 데이터셋(product/policy/loss_ratio/investment)의 스키마 요약을 제공
- 질문 → `{intent, required_researchers[], reject, rewritten_query}` JSON 반환
- 3개 few-shot 예시 포함 (세그먼트 분석 / 교차 분석 / 거절)
- 멀티턴: 직전 대화 요약(history_summary)을 프롬프트에 주입, 후속 질문을 self-contained query로 rewrite

**Gemini 설정**: `responseSchema` 강제, `temperature: 0.2`

### Agent 1~4 · `product / policy / loss_ratio / investment` Researcher (Flash Lite)

**역할**: 각자 담당 데이터셋에서 JS 사전 집계 결과를 해석하고 자연어 답변 생성

**프롬프트 핵심 설계**:
- 에이전트별 역할 정의 (예: "가입·고객 리서처. customer_profiles + policy_headers + policy_coverages를 교차해 세그먼트 가입 패턴과 니즈 매칭을 분석합니다")
- **사전 집계 결과**(JS Arquero 결정적 계산)를 JSON으로 주입 → "여기 있는 숫자만 사용하세요. 직접 계산/추정 금지"
- **증거 행 후보** 5~15개를 제공 → "이 중에서만 evidence_rows 선택. 행을 지어내지 마세요"
- 집계 결과가 비어있으면 `status="no_data"` 반환 강제
- `chart_hint`로 적합한 차트 타입(bar/line/pie/none) 추천
- 응답: `{status, answer, metrics, evidence_rows[], chart_hint}` 고정 스키마

### Agent 5 · `editor` (Flash Lite)

**역할**: 리서처 응답 통합, 인용 검증, 차트 선택, 톤 조절

**프롬프트 핵심 설계**:
- "리서처 답변에 없는 숫자 금지" — 환각 완전 차단
- evidence_rows 중 2~4개를 골라 highlight(한 줄 설명)를 붙여 citation 생성
- 리서처들의 chart_hint 중 질문에 가장 적합한 1개를 선택, 실제 data 배열로 변환
- 톤: friendly(일반) / informative(분석) / apologetic(거절)
- 후속 질문 2개 자동 제안 (남은 데이터셋 활용)
- 거절 경로: 별도 프롬프트 — "한화생명 BI 데이터 범위를 안내하고 답 가능한 질문 예시 2개 제시"

### 환각 방지 3중 가드레일

| 계층 | 방어 수단 |
|------|-----------|
| **데이터** | 모든 수치 집계는 JS(Arquero)에서 수행, LLM은 해석만 담당 |
| **프롬프트** | "aggregates 밖 숫자 금지", "evidence_rows 범위 내 선택만 허용" |
| **스키마** | Gemini `responseSchema`로 JSON 구조 강제, 필수 필드 누락 방지 |
| **라우터** | 데이터 범위 밖 질문 사전 차단 (reject=true) |
| **에디터** | 리서처 응답 검증, 증거 없는 주장 필터링 |

---

## 과제설명서 "완성 기준" 체크리스트 결과

| 기준 | 결과 | 비고 |
|------|------|------|
| 샘플 질문 4개에서 정확한 수치 답변 + 차트 | ✅ 통과 | 아래 샘플 케이스 결과 참조 |
| 거절 질문에서 환각 없이 거절 | ✅ 통과 | "내일 KOSPI 오를까?" → 정중한 거절 + 대안 제시 |
| 리서처 카드 4개가 UI에 모두 표시 (무응답 허용) | ✅ 통과 | 라우팅 결과에 따라 활성/무응답 구분 표시 |

---

## 샘플 케이스 결과

### 케이스 1: "30대 맞벌이 자녀2 가구가 가장 많이 가입한 보장 TOP5는?"

| 항목 | 결과 |
|------|------|
| **활성 리서처** | Policy |
| **세그먼트 크기** | 52명 · 161건 계약 |
| **TOP5 보장** | 1위 치과보강특약(43건), 2위 입원일당확장(41건), 3위 운전자벌금(37건), 4위 암진단가산(30건), 5위 해외의료확장(30건) |
| **평균 월보험료** | 94,852원 |
| **차트** | Bar chart ✅ |
| **인용** | customer_profiles · policy_headers · policy_coverages 각 행 첨부 ✅ |

### 케이스 2: "자영업 중장년 세그먼트에 인기 있는 상품 카테고리와 해당 카테고리의 최근 손해율 추이는?"

| 항목 | 결과 |
|------|------|
| **활성 리서처** | Policy + Loss Ratio |
| **세그먼트 크기** | 39명 |
| **TOP 카테고리** | 종신(25건), 연금(24건), 화재(24건), 실손(22건), 여행자(20건) |
| **손해율 추이** | 최근 12개월 월별 평균 손해율 line chart 표시 |
| **차트** | Line chart ✅ |
| **인용** | policy + loss_ratio 양측 evidence 첨부 ✅ |

### 케이스 3: "공격형 투자성향 고객 상위 100명의 평균 나이와 가장 많이 보유한 상품 카테고리는?"

| 항목 | 결과 |
|------|------|
| **활성 리서처** | Investment |
| **세그먼트 크기** | 100명 |
| **평균 나이** | 47.7세 |
| **평균 월 투자가용금액** | 2,190,000원 |
| **TOP 보험 카테고리** | 종신(64건) 1위 |
| **차트** | Bar chart ✅ |
| **인용** | risk_profiles · investment_products · customer_holdings 행 첨부 ✅ |

### 케이스 4: "기준프로필 '36세 여성 IT개발자' 상품과 실제 30대 여성 사무직 고객의 가입 상품 일치율은?"

| 항목 | 결과 |
|------|------|
| **활성 리서처** | Product + Policy |
| **카탈로그 필터** | 해당 프로필 매칭 상품 탐색 |
| **실제 가입** | 30대 여성 사무직 10명 — 여행자·연금·어린이 카테고리 상위 |
| **차트** | Bar chart ✅ |
| **인용** | products_catalog + customer_profiles 행 첨부 ✅ |

### 케이스 5 (거절): "내일 KOSPI가 오를까요?"

| 항목 | 결과 |
|------|------|
| **활성 리서처** | 없음 (전원 무응답) |
| **거절 사유** | "제공된 보험·투자 데이터셋으로 미래 주가 변동 예측 불가" |
| **답변 톤** | apologetic — 정중한 거절 + 대안 질문 2개 제시 |
| **환각 여부** | ❌ 없음 ✅ |

---

## 아키텍처

```
사용자 질문
    │
    ▼
┌──────────┐    ┌─────────────────────────────────────┐
│  Router  │───▶│  Intent 분석 · 필요 리서처 선택     │
└──────────┘    └─────────────────────────────────────┘
    │
    ▼ (병렬 실행)
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ 상품     │  │ 계약/    │  │ 손해율   │  │ 투자     │
│ 리서처   │  │ 고객     │  │ 리서처   │  │ 리서처   │
│          │  │ 리서처   │  │          │  │          │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
    │              │              │              │
    └──────────────┴──────────────┴──────────────┘
                        │
                        ▼
                 ┌──────────┐
                 │  Editor  │  → 최종 답변 + 차트 + 인용
                 └──────────┘
```

| 에이전트 | 역할 | 데이터 |
|----------|------|--------|
| **Router** | 질문 의도 분류, 리서처 선택, 거절 판단, 멀티턴 rewriting | — |
| **Product Researcher** | 보험 상품 카탈로그 분석 | `products_catalog.csv` (172건) |
| **Policy Researcher** | 고객 세그먼트·계약 패턴 분석 | `customer_profiles.csv`, `policy_headers.csv`, `policy_coverages.csv` |
| **Loss Ratio Researcher** | 손해율 추이 분석 | `loss_ratio_timeseries.csv` (16,800건) |
| **Investment Researcher** | 투자 상품·고객 포트폴리오 분석 | `investment_products.csv`, `customer_holdings.csv` 외 4개 |
| **Editor** | 리서처 답변 통합, 차트 선택, 인용 검증, 톤 조정 | — |

---

## 프로젝트 구조

```
├── api/                    # Vercel 서버리스 함수
│   ├── router.ts           # POST /api/router (의도 분석)
│   ├── research.ts         # POST /api/research (리서처)
│   ├── editor.ts           # POST /api/editor (답변 합성)
│   ├── _lib/               # 공유 유틸 (Gemini SDK, 프롬프트, 스키마, 캐시)
│   └── _cache/samples/     # 추천 질의 사전 캐시 (5개 JSON)
│
├── src/                    # React 프론트엔드
│   ├── components/         # 챗봇 UI (ChatMessages, AgentTimeline, ChartRenderer 등)
│   ├── hooks/              # useMultiResearch (오케스트레이션)
│   ├── store/              # Zustand 메시지 기반 상태 관리
│   ├── aggregators/        # JS 결정적 집계 (policy, product, lossRatio, investment)
│   ├── data/               # CSV 로더 + 세그먼트 추출
│   └── types/              # TypeScript 인터페이스
│
├── data/                   # CSV 데이터셋 (11개 파일)
├── public/brand/           # 한화생명 로고 · 파비콘
├── scripts/                # 캐시 빌드 스크립트
├── spec.md                 # 기획서
└── system_design.md        # 시스템 설계서
```
