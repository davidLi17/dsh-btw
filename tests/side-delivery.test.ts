import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { installSideDelivery, markSideChild } from '../src/server/side-delivery'

const notice = (child: string) => createUserMessage({
  source: { kind: 'subagent-settled', form: 'notice', summary: 'Done', senderSessionId: SessionId(child) },
  content: [{ type: 'text', text: 'Side answer, kept as reference.' }],
})
function parent(session = Session.create(SessionId('parent'))) {
  const send = vi.fn()
  return { id: session.id, session, send } as unknown as Agent & { send: typeof send }
}
function install(agent: Agent) {
  const ctx = new Context()
  ctx.provide('agents', { list: () => [agent] })
  const dispose = installSideDelivery(ctx)
  return { ctx, dispose }
}

it('only exact BTW completion becomes passive; ordinary tasks and user messages retain routing', async () => {
  const agent = parent()
  const original = agent.send
  markSideChild(agent, SessionId('btw-child'))
  const { ctx, dispose } = install(agent)
  const message = notice('btw-child')
  agent.send(message, 'next-turn', true)
  expect(original).toHaveBeenLastCalledWith(message, 'next-step', false)
  agent.send(message, 'next-step', true) // busy parent's steer also remains non-waking
  expect(original).toHaveBeenLastCalledWith(message, 'next-step', false)
  const ordinary = notice('ordinary-child')
  agent.send(ordinary, 'next-turn', true)
  expect(original).toHaveBeenLastCalledWith(ordinary, 'next-turn', true)
  const user = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue' }] })
  agent.send(user, 'next-turn', true)
  expect(original).toHaveBeenLastCalledWith(user, 'next-turn', true)
  dispose()
  expect(agent.send).toBe(original)
  await ctx.fiber.dispose()
})

it('restores child routing from a cold parent session log without process-local IDs', async () => {
  const before = parent()
  markSideChild(before, SessionId('btw-child'))
  const events = before.session.snapshotEvents()
  const restored = Session.fromRestore(before.id, events, before.session.header, SessionLogOffset(0), 'shared-frozen')
  const agent = parent(restored)
  const original = agent.send
  const { ctx, dispose } = install(agent)
  const message = notice('btw-child')
  agent.send(message, 'next-turn', true)
  expect(original).toHaveBeenCalledWith(message, 'next-step', false)
  expect(restored.deriveMessages()).toEqual([]) // routing record is not a prompt
  dispose()
  await ctx.fiber.dispose()
})

it('does not adopt routing records inherited by another fork', async () => {
  const before = parent()
  markSideChild(before, SessionId('btw-child'))
  const events = before.session.snapshotEvents()
  const session = Session.create(SessionId('another-parent'), events, { ...before.session.header, id: SessionId('another-parent'), isSeeded: true, parentSession: before.id }, SessionLogOffset(events.length))
  const agent = parent(session)
  const original = agent.send
  const { ctx, dispose } = install(agent)
  const message = notice('btw-child')
  agent.send(message, 'next-turn', true)
  expect(original).toHaveBeenCalledWith(message, 'next-turn', true)
  dispose()
  await ctx.fiber.dispose()
})
