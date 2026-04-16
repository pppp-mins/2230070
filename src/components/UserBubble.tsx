import type { UserMessage } from '../types/schemas'

export function UserBubble({ msg }: { msg: UserMessage }) {
  return (
    <div className="flex justify-end mb-4 fade-in">
      <div className="max-w-[80%]">
        <div className="bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-2xl rounded-br-sm px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
        </div>
        <div className="text-[9px] text-slate-400 text-right mt-1">
          {new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}
