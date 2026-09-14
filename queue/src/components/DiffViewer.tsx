interface DiffViewerProps {
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export function DiffViewer({ before, after }: DiffViewerProps) {
  if (!before && !after) {
    return <p className="font-mono text-xs text-slate-500">No diff attached to this card.</p>
  }

  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
        Payload Diff Inspector
      </div>
      {/* Stacked on mobile, side-by-side from md up */}
      <div className="grid grid-cols-1 gap-3 font-mono text-xs md:grid-cols-2 md:gap-4">
        <div className="overflow-x-auto rounded-lg border border-aia-alert/35 bg-desk-800 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-red-400">
            <span aria-hidden>−</span>
            <span>BEFORE STATE</span>
          </div>
          <pre className="whitespace-pre-wrap break-words text-slate-400">
            {JSON.stringify(before ?? {}, null, 2)}
          </pre>
        </div>
        <div className="overflow-x-auto rounded-lg border border-aia-teal/40 bg-desk-800 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-teal-300">
            <span aria-hidden>+</span>
            <span>PROPOSED AFTER STATE</span>
          </div>
          <pre className="whitespace-pre-wrap break-words text-slate-200">
            {JSON.stringify(after ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
