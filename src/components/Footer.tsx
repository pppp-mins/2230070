export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <img src="/brand/hanwha-logo.svg" alt="한화생명" className="h-5 brightness-0 invert opacity-80" />
          <span className="text-[10px] text-slate-500">· Insurance-Buddy</span>
        </div>
        <p className="text-[10px] text-slate-400 text-center sm:text-right">
          © Hanwha Life Insurance Co.,Ltd. All Rights Reserved.
        </p>
      </div>
    </footer>
  )
}
