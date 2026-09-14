import { useEffect, useState } from 'react'
import { useQueueStore } from '../store/useQueueStore'
import { ActiveDecisionDetail } from './ActiveDecisionDetail'
import { QueueList } from './QueueList'

export function QueueCockpit() {
  const selectedCardId = useQueueStore((s) => s.selectedCardId)
  const cards = useQueueStore((s) => s.cards)
  const exitingCardIds = useQueueStore((s) => s.exitingCardIds)
  const auditLog = useQueueStore((s) => s.auditLog)
  const signCard = useQueueStore((s) => s.signCard)
  const rejectCard = useQueueStore((s) => s.rejectCard)
  const delegateCard = useQueueStore((s) => s.delegateCard)

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
        // Let Reject / Delegate (and Yes) handle their own activation — do not also sign.
        if (target.closest('[data-queue-action]')) {
          return
        }
      }
      const isEnter = e.key === 'Enter'
      const isCmdEnter = isEnter && (e.metaKey || e.ctrlKey)
      if (isEnter || isCmdEnter) {
        e.preventDefault()
        // If a queue row still has focus, blur so Enter does not re-toggle selection.
        if (target?.closest('[data-queue-item]')) {
          target.blur()
        }
        const sig = signCard(selectedCardId)
        if (sig) {
          setFlash(`Signed · ${sig.slice(0, 22)}…`)
        }
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
    setFlash('Delegated · awaiting human hand-off')
  }

  return (
    <div className="cockpit relative flex min-h-dvh flex-col text-[var(--ink)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="atmosphere-orb atmosphere-orb-a" />
        <div className="atmosphere-orb atmosphere-orb-b" />
        <div className="grid-fade" />
      </div>

      <header className="relative z-10 border-b border-[var(--line)] bg-black/20 px-4 py-4 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-teal-400/90">
              Sovereign · local-first
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight md:text-4xl">
              <span className="bg-gradient-to-r from-teal-200 via-white to-amber-200 bg-clip-text text-transparent">
                AIA
              </span>{' '}
              <span className="text-[var(--ink)]">Queue</span>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
              Human-in-the-loop cockpit. Review, audit, and cryptographically sign high-stakes agent
              decisions.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3.5 py-2 text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                Pending
              </p>
              <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-teal-300">
                {pendingCount}
              </p>
            </div>
          </div>
        </div>
      </header>

      {flash ? (
        <div
          role="status"
          className="relative z-20 mx-auto mt-3 w-[min(920px,94vw)] rounded-xl border border-teal-400/35 bg-teal-500/15 px-4 py-2.5 text-sm text-teal-100 shadow-lg animate-[fadeSlide_0.35s_ease]"
        >
          {flash}
        </div>
      ) : null}

      <main className="relative z-10 mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <aside className="border-b border-[var(--line)] md:border-b-0 md:border-r md:border-[var(--line)]">
          <div className="sticky top-0 flex h-full max-h-[calc(100dvh-7.5rem)] flex-col p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                Active queue
              </h2>
              <span className="font-mono text-[10px] text-[var(--muted)]">risk → FIFO</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <QueueList />
            </div>
            {auditLog.length > 0 ? (
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                  Audit trail
                </p>
                <ul className="max-h-28 space-y-1.5 overflow-y-auto">
                  {auditLog.slice(0, 5).map((ev) => (
                    <li
                      key={ev.id}
                      className="truncate font-mono text-[11px] text-[var(--muted)]"
                      title={ev.detail}
                    >
                      <span className="text-teal-400/80">{ev.action}</span> · {ev.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="min-h-[420px] p-4 md:p-6">
          <div className="h-full min-h-[420px] rounded-2xl border border-[var(--line)] bg-[var(--panel)]/90 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-sm md:p-6">
            {selected ? (
              <ActiveDecisionDetail
                card={selected}
                exiting={exiting}
                onSign={handleSign}
                onReject={handleReject}
                onDelegate={handleDelegate}
              />
            ) : (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--ink)]">
                  No card selected
                </p>
                <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
                  Pick a decision from the queue to inspect the payload diff and authorize with Yes.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
