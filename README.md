# Insurance-Buddy: Multi-Agent BI 챗봇

> 한화생명 보험 상품기획자를 위한 자연어 BI 분석 도구

한국어 자연어 질문을 입력하면, 4개의 전문 리서처 에이전트가 보험 데이터를 병렬 분석하고 에디터 에이전트가 최종 답변을 합성합니다.

---

## 주요 기능

- **자연어 질의** — 한국어로 질문하면 AI가 데이터를 분석하여 답변
- **5-Agent 파이프라인** — 라우터 → 4개 리서처(병렬) → 에디터
- **자동 차트 생성** — 답변에 적합한 차트(Bar/Line/Pie)를 자동 선택
- **증거 기반 답변** — 모든 수치는 실제 CSV 데이터에서 집계, 인용 카드로 출처 표시
- **환각 방지** — JS 집계 + 스키마 강제 + 증거 필수 인용의 3중 가드레일
- **범위 외 질문 거절** — 데이터와 무관한 질문은 정중하게 거절 (예: "KOSPI 오를까?")
- **멀티턴 대화** — 이전 대화 맥락을 유지하여 후속 질문 가능

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
| **Router** | 질문 의도 분석, 리서처 선택/거절 판단 | — |
| **Product Researcher** | 보험 상품 카탈로그 분석 | `products_catalog.csv` (172건) |
| **Policy Researcher** | 고객 세그먼트·계약 패턴 분석 | `customer_profiles.csv`, `policy_headers.csv`, `policy_coverages.csv` |
| **Loss Ratio Researcher** | 손해율 추이 분석 | `loss_ratio_timeseries.csv` (16,800건) |
| **Investment Researcher** | 투자 상품·고객 포트폴리오 분석 | `investment_products.csv`, `customer_holdings.csv` 외 4개 |
| **Editor** | 리서처 답변 합성, 차트 선택, 인용 검증 | — |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **프론트엔드** | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| **차트** | Recharts |
| **데이터 처리** | Arquero (JS 집계), Papa Parse (CSV 파싱) |
| **AI** | Google Gemini API (`gemini-2.5-flash-lite`) |
| **배포** | Vercel (정적 사이트 + Serverless Functions) |

---

## 프로젝트 구조

```
├── api/                    # Vercel 서버리스 함수
│   ├── router.ts           # POST /api/router (의도 분석)
│   ├── research.ts         # POST /api/research (리서처 4개 병렬)
│   ├── editor.ts           # POST /api/editor (답변 합성)
│   └── _lib/               # 공유 유틸 (Gemini SDK, 프롬프트, 스키마)
│
├── src/                    # React 프론트엔드
│   ├── components/         # UI 컴포넌트
│   ├── hooks/              # useMultiResearch (오케스트레이션)
│   ├── store/              # Zustand 상태 관리
│   ├── aggregators/        # JS 기반 데이터 집계 (policy, product, lossRatio, investment)
│   ├── data/               # CSV 로더 + 세그먼트 추출
│   └── types/              # TypeScript 인터페이스
│
├── data/                   # CSV 데이터셋 (11개 파일)
├── public/                 # 정적 자산 (로고, 파비콘)
└── scripts/                # 빌드 캐시 스크립트
```

---

## 실행 방법

### 사전 요구사항

- Node.js 20+
- Gemini API Key

### 로컬 개발

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env
# .env 파일에 GEMINI_API_KEY 입력

# 개발 서버 실행
npm run dev
```

### Vercel 배포

```bash
# Vercel CLI 설치 (미설치 시)
npm i -g vercel

# 환경변수 등록 + 배포
vercel env add GEMINI_API_KEY production
vercel --prod
```

---

## 샘플 질문

| # | 질문 | 활성 리서처 |
|---|------|-------------|
| 1 | "30대 맞벌이 자녀2 가구가 가장 많이 가입한 보장 TOP5는?" | Policy |
| 2 | "자영업 중장년 세그먼트의 손해율 추이는?" | Policy + Loss Ratio |
| 3 | "공격형 투자성향 고객 상위 100명의 평균 나이는?" | Investment + Policy |
| 4 | "기준프로필 '36세 여성 IT개발자' 일치율은?" | Product + Policy |
| 5 | "내일 KOSPI 오를까?" | 거절 (범위 외) |

---

## 환각 방지 전략

| 계층 | 방어 수단 |
|------|-----------|
| **데이터** | 모든 수치 집계는 JS(Arquero)에서 수행, LLM은 해석만 담당 |
| **프롬프트** | "aggregates 밖 숫자 금지", "evidence_rows 범위 내 선택" |
| **스키마** | Gemini `responseSchema`로 JSON 구조 강제 |
| **라우터** | 데이터 범위 밖 질문 사전 차단 |
| **에디터** | 리서처 응답 검증, 증거 없는 주장 제거 |

---

## 환경변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `GEMINI_API_KEY` | Google Gemini API 키 | O |
| `GEMINI_ROUTER_MODEL` | 라우터 모델 (기본: `gemini-2.5-flash-lite`) | X |
| `GEMINI_RESEARCHER_MODEL` | 리서처 모델 (기본: `gemini-2.5-flash-lite`) | X |
| `GEMINI_EDITOR_MODEL` | 에디터 모델 (기본: `gemini-2.5-flash-lite`) | X |

---

## 팀 정보

- **프로젝트 ID**: 2230070
- **과제**: 한화생명 해커톤 Advanced Track A02 — Multi-Researcher BI
