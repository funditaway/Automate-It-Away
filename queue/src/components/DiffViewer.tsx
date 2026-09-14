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
        Payload Diff Inspector (`card_ui.json`)
      </div>
      <div className="grid grid-cols-1 gap-4 font-mono text-xs md:grid-cols-2">
        <div className="overflow-x-auto rounded-lg border border-red-900/40 bg-desk-800 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-red-400">
            <span aria-hidden>−</span>
            <span>BEFORE STATE</span>
          </div>
          <pre className="whitespace-pre-wrap text-slate-400">
            {JSON.stringify(before ?? {}, null, 2)}
          </pre>
        </div>
        <div className="overflow-x-auto rounded-lg border border-emerald-900/40 bg-desk-800 p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold text-emerald-400">
            <span aria-hidden>+</span>
            <span>PROPOSED AFTER STATE</span>
          </div>
          <pre className="whitespace-pre-wrap text-slate-200">
            {JSON.stringify(after ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
