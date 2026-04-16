import { useState } from 'react'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'
import type { Citation } from '../types/schemas'

export function CitationCard({ citation }: { citation: Citation }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      onClick={() => setOpen(!open)}
      className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs hover:border-orange-300 transition cursor-pointer select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-slate-500">
          <FileText className="w-3 h-3" />
          <span className="font-mono text-[10px]">{citation.source}</span>
          <span className="text-slate-300">·</span>
          <span className="text-[10px]">row #{citation.row_index}</span>
        </div>
        <span className="text-slate-400">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </span>
      </div>
      <div className="mt-1.5 text-slate-700 font-medium line-clamp-2">{citation.highlight}</div>
      {open && citation.fields && (
        <div className="mt-2 pt-2 border-t border-slate-200 font-mono text-[10px] text-slate-500 space-y-0.5 max-h-48 overflow-auto scrollbar-thin">
          {Object.entries(citation.fields).map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <span className="text-slate-400 shrink-0">{k}:</span>
              <span className="truncate">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
