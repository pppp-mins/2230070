import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { useStore } from '../store'
import { UserBubble } from './UserBubble'
import { AssistantBubble } from './AssistantBubble'
import { SAMPLE_QUESTIONS } from '../constants/samples'
import { useMultiResearch } from '../hooks/useMultiResearch'

export function ChatMessages() {
  const messages = useStore((s) => s.messages)
  const isProcessing = useStore((s) => s.isProcessing)
  const { runQuery } = useMultiResearch()
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-white border border-orange-200 shadow-sm flex items-center justify-center mb-4">
          <img src="/brand/favicon.ico" alt="" className="w-9 h-9 object-contain" />
        </div>
        <p className="text-sm text-slate-500 mt-1">
          아래 추천 질문을 눌러서 바로 시작해보세요.
        </p>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
          {SAMPLE_QUESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => runQuery(s.query)}
              disabled={isProcessing}
              className="group text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-orange-300 hover:shadow-sm transition disabled:opacity-40"
            >
              <div className="text-[11px] font-semibold text-orange-600 mb-0.5">{s.label}</div>
              <div className="text-xs text-slate-600 line-clamp-2">{s.query}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-400">
          <MessageSquare className="w-3 h-3" /> 또는 직접 질문을 입력해 보세요
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.map((m) =>
          m.kind === 'user' ? <UserBubble key={m.id} msg={m} /> : <AssistantBubble key={m.id} msg={m} />,
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
