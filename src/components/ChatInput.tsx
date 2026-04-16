import { useState } from 'react'
import { Send, RotateCcw } from 'lucide-react'
import { SAMPLE_QUESTIONS } from '../constants/samples'
import { useStore } from '../store'
import { useMultiResearch } from '../hooks/useMultiResearch'

export function ChatInput() {
  const [value, setValue] = useState('')
  const isProcessing = useStore((s) => s.isProcessing)
  const messages = useStore((s) => s.messages)
  const clearMessages = useStore((s) => s.clearMessages)
  const { runQuery } = useMultiResearch()

  const submit = () => {
    if (!value.trim() || isProcessing) return
    runQuery(value.trim())
    setValue('')
  }

  return (
    <div className="border-t border-slate-200 bg-white/80 backdrop-blur">
      <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
        {messages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {SAMPLE_QUESTIONS.slice(0, 5).map((s) => (
              <button
                key={s.label}
                onClick={() => runQuery(s.query)}
                disabled={isProcessing}
                className="text-[10px] px-2.5 py-1 bg-white border border-slate-200 rounded-full text-slate-600 hover:border-orange-300 hover:text-orange-600 disabled:opacity-40 transition"
              >
                {s.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={clearMessages}
              disabled={isProcessing}
              className="text-[10px] px-2 py-1 text-slate-400 hover:text-slate-600 disabled:opacity-40 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> 새 대화
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl shadow-sm focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100 transition">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={
              isProcessing ? '에이전트가 답변 중이에요...' : '무엇이 궁금하세요? 예) 30대 맞벌이 자녀2 인기 보장'
            }
            className="flex-1 py-3 px-4 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
            disabled={isProcessing}
          />
          <button
            onClick={submit}
            disabled={isProcessing || !value.trim()}
            className="m-1.5 flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            전송
          </button>
        </div>
      </div>
    </div>
  )
}
