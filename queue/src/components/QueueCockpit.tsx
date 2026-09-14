import { useEffect, useState } from 'react'
import { Layers, Menu, Plus, ShieldCheck, X } from 'lucide-react'
import { useIsMobile } from '../lib/useIsMobile'
import { useQueueStore } from '../store/useQueueStore'
import { ActiveDecisionDetail } from './ActiveDecisionDetail'
import { QueueList } from './QueueList'

export function QueueCockpit() {
  const isMobile = useIsMobile()
  const selectedCardId = useQueueStore((s) => s.selectedCardId)
  const cards = useQueueStore((s) => s.cards)
  const exitingCardIds = useQueueStore((s) => s.exitingCardIds)
  const auditLog = useQueueStore((s) => s.auditLog)
  const ledgerHash = useQueueStore((s) => s.ledgerHash)
  const signCard = useQueueStore((s) => s.signCard)
  const rejectCard = useQueueStore((s) => s.rejectCard)
  const delegateCard = useQueueStore((s) => s.delegateCard)
  const simulateEvent = useQueueStore((s) => s.simulateEvent)
  const selectCard = useQueueStore((s) => s.selectCard)

  const [flash, setFlash] = useState<string | null>(null)
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  const selected =
    cards.find((c) => c.cardId === selectedCardId && c.status === 'pending') ?? null
  const pendingCount = cards.filter((c) => c.status === 'pending').length
  const exiting = selectedCardId ? exitingCardIds.includes(selectedCardId) : false

  useEffect(() => {
    if (!isMobile) setMobileInspectorOpen(false)
  }, [isMobile])

  useEffect(() => {
    if (isMobile && !selected) setMobileInspectorOpen(false)
  }, [isMobile, selected])

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
        if (sig) {
          setFlash(`Signed · ${sig.slice(0, 22)}…`)
          navigator.vibrate?.(40)
          if (isMobile) setMobileInspectorOpen(false)
        }
      }
      if (e.key === 'Escape' && isMobile && mobileInspectorOpen) {
        setMobileInspectorOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedCardId, signCard, isMobile, mobileInspectorOpen])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 3200)
    return () => window.clearTimeout(t)
  }, [flash])

  function handleSign() {
    if (!selectedCardId) return
    const sig = signCard(selectedCardId)
    if (sig) {
      navigator.vibrate?.(40)
      setFlash(`Signed · ${sig.slice(0, 22)}…`)
      if (isMobile) setMobileInspectorOpen(false)
    }
  }

  function handleReject() {
    if (!selectedCardId) return
    rejectCard(selectedCardId)
    setFlash('Rejected · card left the active queue')
    if (isMobile) setMobileInspectorOpen(false)
  }

  function handleDelegate() {
    if (!selectedCardId) return
    delegateCard(selectedCardId)
    setFlash('Delegated · handed to sub-agent')
    if (isMobile) setMobileInspectorOpen(false)
  }

  function handleSimulate() {
    const id = simulateEvent()
    setFlash(`Simulated event · ${id}`)
  }

  function openMobileInspector(cardId: string) {
    selectCard(cardId)
    if (isMobile) setMobileInspectorOpen(true)
  }

  const showMobileSheet = isMobile && mobileInspectorOpen && selected

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-desk-900 text-slate-100">
      <header className="z-20 flex shrink-0 items-center justify-between gap-2 border-b border-desk-700 bg-desk-800/90 px-3 py-2 pt-safe backdrop-blur md:h-14 md:px-6 md:py-0">
        <div className="flex min-w-0 items-center gap-2 md:gap-4">
          <img
            src="/aia-logo.svg"
            alt="AIA"
            className="h-8 w-8 shrink-0 rounded-md md:h-9 md:w-9"
            width={36}
            height={36}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-aia-teal-bright md:h-2.5 md:w-2.5" />
              <span className="truncate font-mono text-xs font-bold tracking-widest text-aia-teal-bright md:text-sm">
                AIA // KERNEL v1.0.4
              </span>
            </div>
            <div className="mt-0.5 hidden items-center gap-2 font-mono text-[10px] text-slate-400 sm:flex md:text-xs">
              <span>
                NODE: <strong className="text-slate-200">DESK-LOCAL-01</strong>
              </span>
              <span className="text-desk-500">•</span>
              <span>
                KEY: <strong className="text-aia-teal-bright">0x7F9…3B2A</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            className="touch-target inline-flex items-center justify-center rounded-lg border border-desk-600 bg-desk-700 px-2 font-mono text-[10px] text-aia-orange md:hidden"
            onClick={() => setStatusOpen((v) => !v)}
            aria-expanded={statusOpen}
            aria-label="Status details"
          >
            {statusOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <div className="hidden max-w-[160px] truncate rounded border border-desk-600 bg-desk-700 px-2.5 py-1.5 font-mono text-[10px] md:block md:max-w-none md:text-xs">
            <span className="text-slate-400">LEDGER </span>
            <span className="font-semibold text-aia-orange">{ledgerHash}</span>
          </div>
          <button
            type="button"
            onClick={handleSimulate}
            className="touch-target inline-flex items-center gap-1.5 rounded-lg bg-aia-teal px-3 font-mono text-[10px] font-semibold text-white shadow-lg shadow-aia-teal-deep/30 transition hover:bg-aia-teal-bright md:text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="md:hidden">+</span>
            <span className="hidden md:inline">SIMULATE EVENT</span>
          </button>
        </div>
      </header>

      {statusOpen ? (
        <div className="z-20 space-y-1 border-b border-desk-700 bg-desk-800 px-4 py-3 font-mono text-[11px] text-slate-400 md:hidden">
          <div>
            NODE: <strong className="text-slate-200">DESK-LOCAL-01</strong>
          </div>
          <div>
            KEY: <strong className="text-aia-teal-bright">0x7F9…3B2A (SECURE)</strong>
          </div>
          <div>
            LEDGER: <strong className="text-aia-orange">{ledgerHash}</strong>
          </div>
        </div>
      ) : null}

      {flash ? (
        <div
          role="status"
          className="toast-in absolute left-1/2 top-16 z-40 w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border border-aia-teal/40 bg-desk-800/95 px-4 py-2.5 font-mono text-xs text-teal-100 shadow-xl"
        >
          {flash}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Queue list: full width on mobile, fixed column on desktop */}
        <aside
          className={`flex min-h-0 flex-col border-desk-700 bg-desk-800/40 ${
            showMobileSheet ? 'hidden' : 'flex w-full'
          } md:flex md:w-full md:max-w-96 md:shrink-0 md:border-r`}
        >
          <div className="flex items-center justify-between border-b border-desk-700 bg-desk-800/60 p-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-aia-teal-bright" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-300">
                Active Decision Queue
              </h2>
            </div>
            <span className="rounded-full border border-aia-teal/35 bg-aia-teal/20 px-2.5 py-1 font-mono text-xs text-teal-200">
              {pendingCount}
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-safe">
            <QueueList onOpenCard={openMobileInspector} />
          </div>

          <div className="hidden items-center justify-between border-t border-desk-700 bg-desk-800/30 p-3 font-mono text-[11px] text-slate-500 md:flex">
            <span>SHORTCUT: [ENTER] TO SIGN</span>
            <span className="text-aia-teal-bright">HITL ACTIVE</span>
          </div>

          {auditLog.length > 0 ? (
            <div className="hidden max-h-28 overflow-y-auto border-t border-desk-700 px-3 py-2 md:block">
              {auditLog.slice(0, 4).map((ev) => (
                <div key={ev.id} className="truncate font-mono text-[10px] text-slate-500">
                  <span className="text-aia-teal-bright">{ev.action}</span> · {ev.detail}
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        {/* Desktop inspector pane */}
        <section className="relative hidden min-h-0 flex-1 flex-col overflow-hidden bg-desk-900 md:flex">
          {!selected ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-desk-700 bg-desk-800 text-aia-teal/50">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="mb-1 font-mono text-sm font-semibold text-slate-400">
                NO ACTIVE CARD SELECTED
              </h3>
              <p className="max-w-sm text-xs text-slate-500">
                Select an item from the queue to inspect payload diffs and cryptographically
                authorize agent execution.
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

      {/* Mobile full-screen slide-up inspector */}
      {showMobileSheet && selected ? (
        <div className="fixed inset-0 z-50 flex flex-col md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="backdrop-in absolute inset-0 bg-black/55"
            aria-label="Dismiss inspector"
            onClick={() => setMobileInspectorOpen(false)}
          />
          <div className="sheet-up relative mt-auto flex h-[min(96dvh,100%)] w-full flex-col overflow-hidden rounded-t-2xl border-t border-aia-teal/30 bg-desk-900 shadow-2xl">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-desk-500" aria-hidden />
            <ActiveDecisionDetail
              card={selected}
              exiting={exiting}
              mobileMode
              onClose={() => setMobileInspectorOpen(false)}
              onSign={handleSign}
              onReject={handleReject}
              onDelegate={handleDelegate}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
