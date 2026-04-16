import { useDataLoad } from './hooks/useDataLoad'
import { useStore } from './store'
import { LoadingSplash } from './components/LoadingSplash'
import { ChatMessages } from './components/ChatMessages'
import { ChatInput } from './components/ChatInput'
import { Footer } from './components/Footer'

export default function App() {
  useDataLoad()
  const dataLoaded = useStore((s) => s.dataLoaded)

  if (!dataLoaded) return <LoadingSplash />

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-orange-50/30 via-white to-rose-50/30">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => { useStore.getState().clearMessages() }}
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            <img src="/brand/hanwha-logo.svg" alt="한화생명" className="h-7" />
            <div className="border-l border-slate-200 pl-3 text-left">
              <div className="text-sm font-bold text-slate-800">Insurance-Buddy</div>
              <div className="text-[10px] text-slate-500">상품기획 자연어 BI</div>
            </div>
          </button>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-600">online</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <ChatMessages />
        <ChatInput />
      </main>

      <Footer />
    </div>
  )
}
