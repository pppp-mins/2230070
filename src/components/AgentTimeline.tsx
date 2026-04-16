import { CheckCircle2, Circle, Loader2, AlertCircle, ChevronDown, ChevronUp, Cpu, Database, Sparkles } from 'lucide-react'
import type { AssistantMessage, ResearcherId } from '../types/schemas'
import { RESEARCHER_META, ALL_RESEARCHERS } from '../types/schemas'
import { useStore } from '../store'

type Props = { msg: AssistantMessage }

function ResearcherRow({ msg, id }: { msg: AssistantMessage; id: ResearcherId }) {
  const meta = RESEARCHER_META[id]
  const state = msg.researchers[id]
  const isRunning = state.status === 'running'
  const isDone = state.status === 'done'
  const isNoResp = state.status === 'no_response'
  const isError = state.status === 'error'

  return (
    <div
      className={`flex gap-3 py-2 ${isNoResp ? 'opacity-50' : ''}`}
    >
      <div className="shrink-0 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-sm">
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
        ) : isDone ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : isNoResp ? (
          <Circle className="w-3.5 h-3.5 text-slate-300" />
        ) : (
          <span className="text-xs">{meta.icon}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-700">
            {meta.icon} {meta.label}
          </span>
          <span className="text-[9px] font-mono text-slate-400 truncate">
            {meta.datasets[0]}
            {meta.datasets.length > 1 && ` +${meta.datasets.length - 1}`}
          </span>
          {isNoResp && <span className="ml-auto text-[9px] text-slate-400">라우팅 제외</span>}
          {isDone && <span className="ml-auto text-[9px] text-emerald-600">✓ 답변 있음</span>}
          {isRunning && <span className="ml-auto text-[9px] text-orange-600">탐색 중</span>}
        </div>
        {(isRunning || isDone || isError) && (
          <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isDone ? 'bg-emerald-400' : 'bg-gradient-to-r from-orange-400 to-rose-400'
              }`}
              style={{ width: `${state.progress}%` }}
            />
          </div>
        )}
        {state.logs.length > 0 && (
          <div className="mt-1 space-y-0.5 font-mono text-[9px] text-slate-400">
            {state.logs.slice(-3).map((log, i) => (
              <div key={i} className="truncate fade-in">
                · {log}
              </div>
            ))}
          </div>
        )}
        {state.response?.status === 'ok' && state.response.answer && (
          <div className="mt-1.5 text-[10px] text-slate-600 bg-white/60 border border-slate-100 rounded p-1.5 line-clamp-2 fade-in">
            {state.response.answer}
          </div>
        )}
      </div>
    </div>
  )
}

export function AgentTimeline({ msg }: Props) {
  const toggleTimeline = useStore((s) => s.toggleTimeline)
  const phaseLabel =
    msg.phase === 'routing'
      ? '라우터 · 의도 분류 중'
      : msg.phase === 'researching'
        ? '리서처 · 병렬 탐색 중'
        : msg.phase === 'editing'
          ? '편집자 · 답변 통합 중'
          : msg.phase === 'error'
            ? '오류 발생'
            : '완료'

  const activeCount = ALL_RESEARCHERS.filter((id) => msg.researchers[id].status === 'done').length
  const totalActive = msg.router?.required_researchers?.length ?? 0

  return (
    <div className="mb-3 bg-slate-50/70 border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => toggleTimeline(msg.id)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-100/60 transition"
      >
        <div className="flex items-center gap-2">
          <Cpu
            className={`w-3.5 h-3.5 ${msg.in_progress ? 'text-orange-500 animate-pulse' : 'text-slate-400'}`}
          />
          <span className="text-[11px] font-semibold text-slate-700">
            멀티 에이전트 탐색
          </span>
          <span className="text-[10px] text-slate-500">· {phaseLabel}</span>
          {msg.from_cache && (
            <span className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">
              캐시
            </span>
          )}
          {!msg.in_progress && totalActive > 0 && (
            <span className="text-[9px] text-slate-400">
              · {activeCount}/{totalActive} 리서처 응답
            </span>
          )}
        </div>
        {msg.timeline_expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>
      {msg.timeline_expanded && (
        <div className="px-4 py-3 border-t border-slate-200 space-y-3 bg-white/50">
          {msg.router && (
            <div className="flex items-start gap-2 text-[10px]">
              <Database className="w-3 h-3 mt-0.5 text-slate-400 shrink-0" />
              <div className="flex-1">
                <span className="text-slate-500">Router (flash) → </span>
                {msg.router.reject ? (
                  <span className="text-rose-500 font-semibold">refuse</span>
                ) : (
                  <>
                    <span className="font-semibold text-slate-700">
                      {msg.router.required_researchers?.join(', ') || 'none'}
                    </span>
                    {msg.rewritten_query && msg.rewritten_query !== msg.query && (
                      <div className="mt-0.5 text-slate-400 font-mono text-[9px]">
                        rewritten: {msg.rewritten_query}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {ALL_RESEARCHERS.map((id) => (
              <ResearcherRow key={id} msg={msg} id={id} />
            ))}
          </div>
          {msg.editor && !msg.in_progress && (
            <div className="flex items-start gap-2 text-[10px] pt-1 border-t border-slate-100">
              <Sparkles className="w-3 h-3 mt-0.5 text-orange-400 shrink-0" />
              <div className="flex-1">
                <span className="text-slate-500">Editor (pro) → </span>
                <span className="font-semibold text-slate-700">
                  {msg.editor.chart_spec?.type} chart · {msg.editor.citations?.length || 0} citations
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
