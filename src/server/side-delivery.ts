import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { appendPluginRecord, pluginRecordOf, type SessionId } from '@deepseek-ai/dsh-session'
import type { SideChildAddress } from '../shared'

const CHILD_RECORD = 'plugin:michengai-btw/child'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:michengai-btw/child': { parentId: string; childId: string; requestId?: string }
  }
}

/** Result routing belongs to the durable conversation, not its first activation. */
export function markSideChild(parent: Agent, childId: SessionId, requestId?: string): void {
  appendPluginRecord(parent.session, CHILD_RECORD, { parentId: parent.id, childId, ...(requestId === undefined ? {} : { requestId }) })
}

/** Only the exact parent's own successful admission record can address a child. */
export function sideChildAddress(parent: Agent, requestId: string): SideChildAddress | undefined {
  for (const event of parent.session.ownEvents()) {
    const record = pluginRecordOf(event)
    if (record?.type !== CHILD_RECORD) continue
    const data = record.data as { parentId?: unknown; requestId?: unknown; childId?: unknown } | null
    if (data?.parentId === parent.id && data.requestId === requestId && typeof data.childId === 'string') {
      return { parentSessionId: parent.id, childSessionId: data.childId, mode: 'continuable' }
    }
  }
  return undefined
}

export function installSideDelivery(ctx: Context): () => void {
  const restorers = new Map<Agent, () => void>()
  const attach = (agent: Agent) => {
    if (restorers.has(agent)) return
    const original = agent.send
    const wrapped: Agent['send'] = function (this: Agent, message, target, wakeup) {
      const source = message.source
      const sideResult = source?.kind === 'subagent-settled' && agent.session.ownEvents().some(event => {
        const record = pluginRecordOf(event)
        if (record?.type !== CHILD_RECORD) return false
        const data = record.data as { parentId?: unknown; childId?: unknown }
        return data?.parentId === agent.id && data.childId === source.senderSessionId
      })
      // Preserve attributed reference context without scheduling a new parent turn.
      return original.call(this, message, sideResult ? 'next-step' : target, sideResult ? false : wakeup)
    }
    agent.send = wrapped
    restorers.set(agent, () => { if (agent.send === wrapped) agent.send = original })
  }
  const offCreated = ctx.on('agent/created', ({ agent }) => { attach(agent); return undefined })
  const offDisposed = ctx.on('agent/disposed', ({ agent }) => {
    restorers.get(agent)?.()
    restorers.delete(agent)
  })
  for (const agent of ctx.get('agents')?.list() ?? []) attach(agent)
  return () => {
    offCreated()
    offDisposed()
    for (const restore of restorers.values()) restore()
    restorers.clear()
  }
}
