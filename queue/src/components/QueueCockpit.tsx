import { useEffect, useState } from 'react'
import { Layers, Plus, ShieldCheck } from 'lucide-react'
import { useQueueStore } from '../store/useQueueStore'
import { ActiveDecisionDetail } from './ActiveDecisionDetail'
import { QueueList } from './QueueList'

export function QueueCockpit() {
  const selectedCardId = useQueueStore((s) => s.selectedCardId)
  const cards = useQueueStore((s) => s.cards)
  const exitingCardIds = useQueueStore((s) => s.exitingCardIds)
  const auditLog = useQueueStore((s) => s.auditLog)
  const ledgerHash = useQueueStore((s) => s.ledgerHash)
  const signCard = useQueueStore((s) => s.signCard)
  const rejectCard = useQueueStore((s) => s.rejectCard)
  const delegateCard = useQueueStore((s) => s.delegateCard)
  const simulateEvent = useQueueStore((s) => s.simulateEvent)

  const [flash, setFlash] = useState<string | null>(null)

  const selected =
    cards.find((c) => c.cardId === selectedCardId && c.status === 'pending') ?? null
  const pendingCount = cards.filter((c) => c.status === 'pending').length
  const exiting = selectedCardId ? exitingCardIds.includes(selectedCardId) : false

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedCardId) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return
        }
        if (target.closest('[data-queue-action]')) return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (target?.closest('[data-queue-item]')) target.blur()
        const sig = signCard(selectedCardId)
        if (sig) setFlash(`Signed · ${sig.slice(0, 22)}…`)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedCardId, signCard])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 3200)
    return () => window.clearTimeout(t)
  }, [flash])

  function handleSign() {
    if (!selectedCardId) return
    const sig = signCard(selectedCardId)
    if (sig) setFlash(`Signed · ${sig.slice(0, 22)}…`)
  }

  function handleReject() {
    if (!selectedCardId) return
    rejectCard(selectedCardId)
    setFlash('Rejected · card left the active queue')
  }

  function handleDelegate() {
    if (!selectedCardId) return
    delegateCard(selectedCardId)
    setFlash('Delegated · handed to sub-agent')
  }

  function handleSimulate() {
    const id = simulateEvent()
    setFlash(`Simulated event · ${id}`)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-desk-900 text-slate-100">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-desk-700 bg-desk-800/80 px-6 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
            <span className="font-mono text-sm font-bold tracking-widest text-emerald-400">
              AIA // KERNEL v1.0.4
            </span>
          </div>
          <span className="text-desk-500">|</span>
          <div className="hidden items-center gap-2 font-mono text-xs text-slate-400 sm:flex">
            <span>
              NODE: <strong className="text-slate-200">DESK-LOCAL-01</strong>
            </span>
            <span className="text-desk-500">•</span>
            <span>
              KEY: <strong className="text-emerald-400">0x7F9…3B2A (SECURE)</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded border border-desk-600 bg-desk-700 px-3 py-1.5 font-mono text-xs md:flex">
            <span className="text-slate-400">LEDGER HASH:</span>
            <span className="font-semibold text-indigo-400">{ledgerHash}</span>
          </div>
          <button
            type="button"
            onClick={handleSimulate}
            className="flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 font-mono text-xs font-semibold text-white shadow-lg shadow-indigo-900/30 transition hover:bg-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>SIMULATE EVENT</span>
          </button>
        </div>
      </header>

      {flash ? (
        <div
          role="status"
          className="toast-in absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-lg border border-emerald-500/40 bg-emerald-950/90 px-4 py-2 font-mono text-xs text-emerald-200 shadow-xl"
        >
          {flash}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-full max-w-96 shrink-0 flex-col border-r border-desk-700 bg-desk-800/40">
          <div className="flex items-center justify-between border-b border-desk-700 bg-desk-800/60 p-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-400" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                Active Decision Queue
              </h2>
            </div>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/20 px-2 py-0.5 font-mono text-xs text-indigo-300">
              {pendingCount}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <QueueList />
          </div>

          <div className="flex items-center justify-between border-t border-desk-700 bg-desk-800/30 p-3 font-mono text-[11px] text-slate-500">
            <span>SHORTCUT: [ENTER] TO SIGN</span>
            <span className="text-indigo-400">HITL ACTIVE</span>
          </div>

          {auditLog.length > 0 ? (
            <div className="max-h-28 overflow-y-auto border-t border-desk-700 px-3 py-2">
              {auditLog.slice(0, 4).map((ev) => (
                <div key={ev.id} className="truncate font-mono text-[10px] text-slate-500">
                  <span className="text-indigo-400">{ev.action}</span> · {ev.detail}
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-desk-900">
          {!selected ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-desk-700 bg-desk-800 text-slate-600">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="mb-1 font-mono text-sm font-semibold text-slate-400">
                NO ACTIVE CARD SELECTED
              </h3>
              <p className="max-w-sm text-xs text-slate-500">
                Select an item from the queue on the left to inspect payload diffs and
                cryptographically authorize agent execution.
              </p>
            </div>
          ) : (
            <ActiveDecisionDetail
              card={selected}
              exiting={exiting}
              onSign={handleSign}
              onReject={handleReject}
              onDelegate={handleDelegate}
            />
          )}
        </section>
      </div>
    </div>
  )
}
