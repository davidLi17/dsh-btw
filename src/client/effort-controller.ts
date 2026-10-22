import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ModelDirectory, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

export type EffortDirection = 1 | -1
export type EffortDirectory = Pick<ModelDirectory, 'store' | 'select'>

function same(a: ModelSelection | null, b: ModelSelection | null): boolean {
  return a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort
}

/** Use only the provider's ordered catalog; unknown/default-less selections are inert. */
export function effortPosition(state: ModelDirectoryState) {
  const current = state.current
  if (!current || state.routable !== true) return undefined
  const reasoning = state.groups.find(group => group.id === current.provider)?.models.find(model => model.id === current.model)?.reasoning
  if (!reasoning || reasoning.efforts.length < 2) return undefined
  const index = reasoning.efforts.findIndex(level => level.id === (current.reasoningEffort ?? reasoning.defaultEffort))
  if (index < 0) return undefined
  return { current, efforts: reasoning.efforts, index }
}

interface Queue {
  directory: EffortDirectory
  moves: EffortDirection[]
  stop: AbortController
}

/** Serialize each session independently; only durable directory confirmation advances a queue. */
export class EffortController {
  private readonly queues = new Map<string, Queue>()
  private disposed = false
  constructor(private readonly directoryFor: (id: string) => EffortDirectory, private readonly timeoutMs = 5000) {}

  /** Returns whether the gesture belongs to this feature (including clamped boundaries). */
  move(sessionId: string, direction: EffortDirection): boolean {
    if (this.disposed) return false
    let directory: EffortDirectory
    try { directory = this.directoryFor(sessionId) } catch { return false }
    const existing = this.queues.get(sessionId)
    if (existing && existing.directory !== directory) this.cancel(sessionId)
    const queue = this.queues.get(sessionId)
    const state = directory.store.getSnapshot()
    if (!effortPosition(state)) return false
    if (queue && !queue.stop.signal.aborted) { queue.moves.push(direction); return true }
    if (state.status !== 'ready' || state.pending !== null) return false
    const created: Queue = { directory, moves: [direction], stop: new AbortController() }
    this.queues.set(sessionId, created)
    void this.drain(sessionId, created)
    return true
  }

  cancel(sessionId: string): void {
    const queue = this.queues.get(sessionId)
    queue?.stop.abort()
    this.queues.delete(sessionId)
  }

  reset(): void {
    for (const id of this.queues.keys()) this.cancel(id)
  }

  dispose(): void {
    this.disposed = true
    this.reset()
  }

  private async drain(id: string, queue: Queue): Promise<void> {
    let expected = queue.directory.store.getSnapshot().current
    try {
      while (queue.moves.length && !queue.stop.signal.aborted) {
        if (this.directoryFor(id) !== queue.directory) return
        const state = queue.directory.store.getSnapshot()
        const position = effortPosition(state)
        if (!position || !same(state.current, expected) || state.status !== 'ready' || state.pending !== null) return
        const direction = queue.moves.shift()!
        const next = position.efforts[position.index + direction]
        if (!next) continue
        const target = { provider: position.current.provider, model: position.current.model, reasoningEffort: next.id }
        if (!await this.selectConfirmed(queue, position.current, target)) return
        expected = target
      }
    } catch { /* The host selector owns RPC errors; never retry an uncertain selection. */ }
    finally { if (this.queues.get(id) === queue) this.queues.delete(id) }
  }

  private selectConfirmed(queue: Queue, before: ModelSelection, target: ModelSelection): Promise<boolean> {
    return new Promise(resolve => {
      const { directory, stop } = queue
      let settled = false
      let acknowledged = false
      let off = () => {}
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (accepted: boolean) => {
        if (settled) return
        settled = true
        off()
        clearTimeout(timer)
        stop.signal.removeEventListener('abort', abort)
        if (!accepted) stop.abort()
        resolve(accepted)
      }
      const abort = () => finish(false)
      const check = () => {
        const state = directory.store.getSnapshot()
        if (stop.signal.aborted || state.status === 'error' || state.status === 'loading' || state.status === 'idle'
          || !effortPosition(state)?.efforts.some(level => level.id === target.reasoningEffort) || (!same(state.current, before) && !same(state.current, target))
          || (state.pending !== null && !same(state.pending, target))) return finish(false)
        if (acknowledged && state.status === 'ready' && state.pending === null && same(state.current, target)) finish(true)
      }
      off = directory.store.subscribe(check)
      stop.signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => finish(false), this.timeoutMs)
      if (stop.signal.aborted) return finish(false)
      // subscribe before submission: detect transient external selections even while RPC is pending.
      try {
        directory.select(target).then(result => {
          if (!result.ok) return finish(false)
          acknowledged = true
          check()
        }, () => finish(false))
      } catch { finish(false) }
    })
  }
}
