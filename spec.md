# Insurance-Buddy · spec.md

> 사번 2230070 · 한화생명 해커톤 심화 A02 · Multi-Researcher BI

---

## 1. 한 줄 요약
**Insurance-Buddy** 는 상품기획자가 자연어로 질문하면 4명의 리서처 에이전트가 각자 데이터셋을 병렬 탐색하고 편집자가 근거와 차트를 붙여 답해주는 **친근한 얼굴의 강력한 사내 BI 어시스턴트**다.

## 2. 타겟 사용자
- **Primary**: 한화생명 **상품기획자** — "어떤 세그먼트가 어떤 상품·보장을 원하는가"를 빠르게 검증하고 싶은 실무자
- **Secondary**: 손해율 분석가 / 투자상담 RM — 자기 각도 질문은 해당 리서처만 활성화되어 동일 UI로 흡수

### 페르소나 선정 근거 (데이터 적합도)
- `customer_profiles` 의 `persona_cluster`, `needs_tags`, `priority_need_1/2` 등 semantic 필드로 세그먼트 질문 다양성 최고
- `policy_headers` 5,258건이 고객×상품을 잇는 허브 역할 → 4 리서처가 모두 자연스럽게 활용됨
- 손해율·투자 페르소나는 메인 데이터셋이 1~2개로 편중되어 "무응답" 카드가 과다 발생

## 3. 핵심 기능
1. **자연어 질문 입력창 + 샘플 질문 5개 원클릭**
2. **Intent Router** 로 질문 의도를 분류해 필요한 리서처만 활성화 (무관한 리서처는 UI에 "무응답" 카드 표시)
3. **4 리서처 병렬 라이브 탐색** — 각 카드에 진행률 바 + 회색 상태 로그 스트리밍
4. **Editor 통합 답변** — 수치 요약 + 자동 선택된 차트 1개 + 인용 카드 (행 단위 evidence)
5. **환각 방지 가드** — 모든 집계는 JS (Papa Parse / arquero) 에서 결정적으로 계산, LLM 은 플랜·해석만 담당
6. **거절 케이스** — Router 가 데이터 범위 밖 질문을 감지하면 환각 없이 정중히 거절
7. **멀티턴 대화 맥락 유지** — 직전 2~3턴의 질문/답변 요약을 Router·Editor 프롬프트에 주입해 "그럼 여성은?" 같은 후속 질문 해석

## 4. 5 에이전트 역할 분담

| # | 에이전트 | 모델 | 입력 | 출력 | 담당 |
|---|---|---|---|---|---|
| 0 | `intent_router` | gemini-2.0-flash | user_query | `{intent, required_researchers[], reject, reject_reason}` | 의도 분류 · 필요한 리서처 선택 · 스코프 밖 질문 1차 거절 |
| 1 | `product_researcher` | gemini-2.5-pro | query + product catalog schema | `{answer, metrics, evidence_rows[], chart_hint}` | `products_catalog` 대상 상품 탐색 · 카테고리/타겟/보장 비교 |
| 2 | `policy_researcher` | gemini-2.5-pro | query + customer/policy schemas | 동일 | `customer_profiles` ⋈ `policy_headers` ⋈ `policy_coverages` 교차로 세그먼트 가입 패턴 · 니즈 매칭 |
| 3 | `loss_ratio_researcher` | gemini-2.5-pro | query + timeseries schema | 동일 | `loss_ratio_timeseries` 월×보험사×카테고리×연령×성별 손해율 추이 · 악화 상품 감지 |
| 4 | `investment_researcher` | gemini-2.5-pro | query + investment schemas | 동일 | `investment_products` / `customer_holdings` / `nav_timeseries` / `risk_profiles` / `market_benchmarks` / `transactions` 6종 탐색 |
| 5 | `editor` | gemini-2.5-pro | 활성 리서처 응답들 + 원질문 | `{final_answer, chart_spec, citations[], tone}` | 답변 통합 · 인용 강제 · 차트 타입 결정 (bar/line/pie/none) · 친근한 톤 정리 |

### 공통 리서처 응답 JSON 스키마 (v1)
```json
{
  "status": "ok | no_data | refuse",
  "answer": "한 문단 자연어 요약",
  "metrics": { "key1": "value", ... },
  "evidence_rows": [
    { "source": "policy_headers.csv", "row_index": 1234, "fields": {...} }
  ],
  "chart_hint": { "type": "bar|line|pie|none", "x": "...", "y": "..." },
  "notes": "가정·한계"
}
```

### 에이전트 프롬프트 설계 요약
- **Router**: "아래 4 리서처 중 질문에 답할 수 있는 것만 고르라. 데이터에 없으면 refuse." — few-shot 3개
- **Researcher 공통**: "아래 컬럼 스키마 안에서만 답하라. 실제 행 인덱스를 evidence_rows 에 반드시 포함하라. 값은 JS 집계 결과(`aggregates` prop)를 사용하라."
- **Editor**: "각 리서처의 evidence_rows 중 최소 1개를 final_answer 에서 반드시 인용하라. 지어내지 말라. 차트 힌트가 2개 이상이면 질문 의도에 가장 맞는 1개만 고르라."

## 5. 데이터 플로우

```
┌────────────────────────────────────────────────────────────────────┐
│  사용자 질문                                                        │
└───────────┬────────────────────────────────────────────────────────┘
            ▼
┌──────────────────────┐
│ intent_router (flash)│  → required_researchers = ["product","policy"]
└───────────┬──────────┘
            │        ┌─────────────────────────────────────────────┐
            │        │  JS 집계 레이어 (Papa Parse + arquero)       │
            │        │  - CSV 로드/캐시 (브라우저 메모리)            │
            │        │  - 질문별 결정적 집계 함수 매핑              │
            │        └────────────┬────────────────────────────────┘
            ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│product_researcher│ │policy_researcher│ │loss_ratio_rchr. │ │invest_researcher│
│  products_catalog│ │ customer_profile│ │loss_ratio_ts    │ │ investment_prod │
│                  │ │ policy_headers  │ │                 │ │ customer_holding│
│                  │ │ policy_coverages│ │                 │ │ nav_timeseries  │
│                  │ │                 │ │                 │ │ risk_profiles   │
│                  │ │                 │ │                 │ │ market_benchmark│
│                  │ │                 │ │                 │ │ transactions    │
└────────┬─────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                     │                    │                    │
         └──────────┬──────────┴────────────────────┴────────────────────┘
                    ▼
            ┌───────────────┐
            │ editor (pro)  │  통합 답변 + chart_spec + citations
            └───────┬───────┘
                    ▼
            ┌───────────────┐
            │   UI 렌더링    │
            └───────────────┘
```

### 데이터 사용 매핑

| 리서처 | 사용 CSV | 주요 집계 |
|---|---|---|
| product | `products_catalog.csv` | 카테고리/타겟연령/월보험료 분포, 키워드 매칭 |
| policy | `customer_profiles.csv` + `policy_headers.csv` + `policy_coverages.csv` | 세그먼트별 가입률, 보장 TOP-N, needs_tags 교차 |
| loss_ratio | `loss_ratio_timeseries.csv` | 월별 손해율 추이, 악화 TOP-N, 세그먼트별 비교 |
| investment | `investment_products.csv` / `customer_holdings.csv` / `nav_timeseries.csv` / `risk_profiles.csv` / `market_benchmarks.csv` / `transactions.csv` | 위험등급별 분포, 고객 월 투자가용금액, 수익률 추이 |

## 6. UI 구조 스케치

```
┌──────────────────────────────────────────────────────────────┐
│  🤖 Insurance-Buddy                              [상품기획 모드] │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  💬 무엇이 궁금하세요?                          [ 전송 → ]│  │
│  └────────────────────────────────────────────────────────┘  │
│  샘플:[ 30대 맞벌이… ][ 손해율 악화… ][ 자녀2 가구… ][ …거절 ] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│  │📦 product    │ │👥 policy     │ │📉 loss_ratio │ │💰 invest │ │
│  │▓▓▓▓▓░░ 70%   │ │▓▓▓▓▓▓▓ 100% │ │  무응답      │ │ 무응답   │ │
│  │· 카탈로그 로드│ │· join 실행… │ │              │ │          │ │
│  │· 필터 2건    │ │· 세그먼트…  │ │              │ │          │ │
│  │✓ 답변 있음   │ │✓ 답변 있음  │ │              │ │          │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  📝 Editor 통합 답변                                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  30대 맞벌이 자녀2 가구가 가장 많이 가입한 보장은…      │  │
│  │  [bar chart · Recharts]                                 │  │
│  │                                                          │  │
│  │  📎 인용 카드                                            │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │  │
│  │  │policy_headers│ │policy_covera.│ │customer_prof.│    │  │
│  │  │row #1234     │ │row #5678     │ │row #42       │    │  │
│  │  │P000123 …     │ │골절진단비 …  │ │C00042 …      │    │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 인터랙션 포인트
- 샘플 질문 칩은 원클릭으로 입력창 채우고 자동 전송
- 각 리서처 카드: 진행률 바 + 회색 상태 로그 (Claude 웹 스타일) · 완료 시 ✓ 아이콘 · 무응답 시 회색 처리
- 인용 카드: 클릭하면 원본 CSV 행 전체 펼침 (hover 시 source 파일명 툴팁)

## 7. 기술 스택
- **프론트**: Vite + React + TypeScript + Tailwind + Recharts + Framer Motion(로그 스트림 애니메이션)
- **데이터 처리**: Papa Parse (CSV 로드) + arquero (join/groupby 결정적 집계)
- **서버리스 API (`api/`)**:
  - `api/router.ts` — intent_router 호출
  - `api/research.ts` — 개별 리서처 호출 (병렬)
  - `api/editor.ts` — editor 호출
- **LLM**: Google Gen AI SDK · `gemini-2.0-flash` (router) · `gemini-2.5-pro` (4 리서처 + editor)
- **배포**: Vercel `api/*` 서버리스 함수 포함
- **환경변수**: `.env` → `GEMINI_API_KEY` 만 (모델명·온도는 코드 상수)

## 8. 샘플 질문 5개 (상품기획자 관점 재구성)
1. "30대 맞벌이 자녀2 가구가 가장 많이 가입한 보장 TOP5는?" → policy 단독
2. "자영업 중장년 세그먼트에 인기 있는 상품 카테고리와 해당 카테고리의 최근 손해율 추이는?" → policy + loss_ratio
3. "공격형 투자성향 고객 중 월 투자가용금액 상위 100명의 평균 나이와 보유 보험 카테고리는?" → investment + policy
4. "기준프로필이 '36세 여성 IT개발자' 인 상품들과 실제로 해당 세그먼트 고객이 가입한 상품이 얼마나 일치하나요?" → product + policy
5. (거절) "내일 KOSPI가 오를까요?" → router 거절 · 환각 없이 "제공 데이터 범위 밖입니다" 안내

## 9. 완성 기준 매핑

| 과제 체크리스트 | 구현 지점 |
|---|---|
| 샘플 질문 4개에서 정확한 수치 + 차트 | JS 결정적 집계 + Recharts 자동 선택 |
| 거절 질문 환각 없이 거절 | `intent_router` 1차 필터 + editor 최종 톤 조정 |
| 리서처 카드 4개 모두 UI 표시 (무응답 허용) | 항상 4카드 마운트, 비활성 리서처는 회색 "무응답" 상태 |

## 10. 범위 제외 (v1 아웃)
- 쿼리 플랜 JSON 라이브 토글 → 시간 남으면 stretch goal
- 대화 히스토리 영구 저장 (서버/DB) → 브라우저 메모리 내 세션 유지만

## 11. 배포 정보
- **프로젝트명**: `hanwha-2230070-insurance-buddy` (Vercel)
- **제출**: `spec.md` + `README.md` + Vercel 최종 URL → `jonhyuk0922@naver.com` (제목: `한화생명 2230070`)
