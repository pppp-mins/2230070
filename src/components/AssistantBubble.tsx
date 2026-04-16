import { Lightbulb } from 'lucide-react'
import type { AssistantMessage } from '../types/schemas'
import { AgentTimeline } from './AgentTimeline'
import { ChartRenderer } from './ChartRenderer'
import { CitationCard } from './CitationCard'
import { useMultiResearch } from '../hooks/useMultiResearch'
import { useStore } from '../store'

export function AssistantBubble({ msg }: { msg: AssistantMessage }) {
  const { runQuery } = useMultiResearch()
  const isProcessing = useStore((s) => s.isProcessing)
  const editor = msg.editor

  return (
    <div className="flex items-start gap-3 mb-6 fade-in">
      <div className="shrink-0 w-9 h-9 rounded-full bg-white border border-orange-200 shadow-sm flex items-center justify-center overflow-hidden">
        <img src="/brand/favicon.ico" alt="Insurance-Buddy" className="w-6 h-6 object-contain" />
      </div>
      <div className="flex-1 min-w-0 max-w-[90%]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-slate-700">Insurance-Buddy</span>
          <span className="text-[9px] text-slate-400">
            {new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <AgentTimeline msg={msg} />

        {msg.in_progress && !editor && (
          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:300ms]" />
              <span className="text-[10px] text-slate-400 ml-2">
                {msg.phase === 'routing'
                  ? '의도 분석 중...'
                  : msg.phase === 'researching'
                    ? '4 리서처가 데이터를 탐색하고 있어요...'
                    : msg.phase === 'editing'
                      ? '편집자가 답변을 정리하고 있어요...'
                      : '생각 중...'}
              </span>
            </div>
          </div>
        )}

        {editor && (
          <div
            className={`border rounded-2xl rounded-tl-sm px-5 py-4 space-y-4 bg-gradient-to-br fade-in ${
              editor.tone === 'apologetic'
                ? 'from-slate-50 to-slate-100 border-slate-200'
                : editor.tone === 'informative'
                  ? 'from-blue-50/60 to-indigo-50/60 border-indigo-100'
                  : 'from-orange-50/60 to-amber-50/60 border-orange-100'
            }`}
          >
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {editor.final_answer}
            </p>

            {editor.chart_spec && editor.chart_spec.type !== 'none' && editor.chart_spec.data?.length > 0 && (
              <div className="bg-white/70 backdrop-blur rounded-xl p-3 border border-white">
                <ChartRenderer spec={editor.chart_spec} />
              </div>
            )}

            {editor.citations && editor.citations.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-slate-500 mb-1.5">📎 근거 데이터</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {editor.citations.map((c, i) => (
                    <CitationCard key={i} citation={c} />
                  ))}
                </div>
              </div>
            )}

            {editor.followup_suggestions && editor.followup_suggestions.length > 0 && (
              <div className="pt-3 border-t border-white/70">
                <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mb-1.5">
                  <Lightbulb className="w-3 h-3" /> 이어서 물어볼까요?
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {editor.followup_suggestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => runQuery(q)}
                      disabled={isProcessing}
                      className="text-[10px] px-2.5 py-1 bg-white border border-slate-200 rounded-full text-slate-600 hover:border-orange-300 hover:text-orange-600 disabled:opacity-40 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
