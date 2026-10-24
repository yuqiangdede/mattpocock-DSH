/**
 * Session-scoped observable over the Host-authoritative coding Work Item. The
 * Remote read is authoritative; a forwarded change event only schedules a new
 * read, so a late or repeated event can never publish a stale record.
 *
 * @module @deepseek-ai/dsh-client-ui-matt-skill-launcher/client/workflow-source
 */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { CodingWorkflowChanged, WorkItem } from '@deepseek-ai/dsh-coding-workflow/client'

/** One authoritative read, or a definite failure carrying a displayable message. */
export type CodingWorkflowRead =
  | { readonly ok: true; readonly value: WorkItem | null }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** What the launcher renders for one Session's task. */
export interface CodingWorkflowSnapshot {
  /** Current durable record, or null when the Session owns no task. */
  readonly item: WorkItem | null
  /** Latest read failure, cleared by the next successful read. */
  readonly error: string | null
  /** Whether the first read is still pending. */
  readonly loading: boolean
}

/** Live inputs of one Session's workflow source. */
export interface CodingWorkflowSourceDeps {
  /** Authoritative read of the Session's current task. */
  readonly read: () => Promise<CodingWorkflowRead>
  /** Subscribe to accepted mutations of the task. */
  readonly subscribeChange: (listener: (change: CodingWorkflowChanged) => void) => () => void
  /** Subscribe to transport resets that invalidate prior reads. */
  readonly subscribeReset: (listener: () => void) => () => void
}

/** Compare two snapshots by value so an unchanged read publishes nothing. */
function sameSnapshot(left: CodingWorkflowSnapshot, right: CodingWorkflowSnapshot): boolean {
  return left.item === right.item && left.error === right.error && left.loading === right.loading
}

/**
 * Create one registrant-private workflow source. Subscriptions start on the
 * first observer and release every listener when the last one leaves.
 * @param deps - read, change, and reset inputs.
 * @returns stable snapshot source consumed by `useWorkflow`.
 */
export function createCodingWorkflowSource(deps: CodingWorkflowSourceDeps): HostObservable<CodingWorkflowSnapshot> {
  let snapshot: CodingWorkflowSnapshot = { item: null, error: null, loading: true }
  let observers = 0
  let disposers: (() => void)[] = []
  let readEpoch = 0
  const listeners = new Set<() => void>()

  const publish = (next: CodingWorkflowSnapshot): void => {
    if (sameSnapshot(snapshot, next)) return
    snapshot = next
    for (const listener of listeners) listener()
  }

  /** Read the authoritative record; a superseded read publishes nothing. */
  const refresh = async (): Promise<void> => {
    const epoch = ++readEpoch
    const result = await deps.read()
    if (epoch !== readEpoch) return
    if (result.ok) publish({ item: result.value, error: null, loading: false })
    else publish({ item: snapshot.item, error: result.error.message, loading: false })
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      if (observers === 0) {
        disposers = [
          deps.subscribeChange(() => { void refresh() }),
          deps.subscribeReset(() => { void refresh() }),
        ]
        void refresh()
      }
      observers += 1
      return () => {
        listeners.delete(listener)
        observers -= 1
        if (observers > 0) return
        for (const dispose of disposers) dispose()
        disposers = []
      }
    },
  }
}
