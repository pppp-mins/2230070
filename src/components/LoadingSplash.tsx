import { useStore } from '../store'

export function LoadingSplash() {
  const progress = useStore((s) => s.dataLoadProgress)
  const err = useStore((s) => s.dataLoadError)
  const pct = Math.round((progress.loaded / Math.max(1, progress.total)) * 100)
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50">
      <div className="text-center space-y-6 max-w-md">
        <div className="text-6xl animate-pulse">🛡️</div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Insurance-Buddy</h1>
          <p className="text-sm text-slate-500">한화생명 BI · 데이터 준비 중</p>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-400 to-rose-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 font-mono">
          {progress.loaded} / {progress.total} · {progress.current || '초기화 중...'}
        </p>
        {err && <div className="text-xs text-red-500 font-mono">⚠ {err}</div>}
      </div>
    </div>
  )
}
