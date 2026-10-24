import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import LlmRuntime, { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId, SessionLogOffset, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Fork from '@deepseek-ai/dsh-subagent-fork-in-process'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { expect, it } from 'vitest'
import * as sourcePlugin from '../src/index'
import { CHILD_COMMAND, CLOSE_COMMAND, RUN_COMMAND } from '../src/shared'

// 仅模型输出可控；AgentLoop、fork、命令、工具限制和生命周期均使用真实宿主。
class AnswerAdapter extends LlmAdapter {
  requests: GenerateOptions[] = []
  hang = false
  gate?: Promise<void>
  async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.hang) {
      await new Promise<void>((_resolve, reject) => {
        if (options.signal?.aborted) { reject(new Error('已取消')); return }
        options.signal?.addEventListener('abort', () => reject(new Error('已取消')), { once: true })
      })
      return
    }
    const text = this.requests.length === 1 ? '主任务背景已确认' : '独立旁问答案'
    const gate = this.gate
    this.gate = undefined
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    if (gate) await gate
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}


// alpha.3：SubagentRuntime / 本地 fork 依赖 workingDirectory（ensure/set）。
class MemoryWorkingDirectory extends Service {
  constructor(ctx: Context) { super(ctx, 'workingDirectory') }
  get(session: { header: { cwd?: string } }) { return session.header.cwd }
  async ensure(agent: { session: { header: { cwd?: string } } }) { return agent.session.header.cwd ?? process.cwd() }
  async set(_agent: unknown, path: string) { return path }
}


// Only storage is in-memory. Continuation uses the real prompt, coldResume,
// AgentRegistry.resume, AgentLoop and settlement routing.
function memorySessions(ctx: Context) {
  const records = new Map<string, { header: SessionHeader; inheritedEventCount: ReturnType<typeof SessionLogOffset>; events: SessionEvent[] }>()
  const handle = (id: string) => {
    const record = records.get(id)!
    return {
      id, header: record.header, inheritedEventCount: record.inheritedEventCount, access: 'write',
      read: async () => ({ events: structuredClone(record.events), eventState: 'detached' }),
      append: async (events: readonly SessionEvent[]) => { record.events.push(...structuredClone(events)) },
      flush: async () => {}, close: async () => {}, [Symbol.asyncDispose]: async () => {},
    }
  }
  ctx.provide('sessionPersistence', {
    create: async (header: SessionHeader, options: { inheritedEventCount: ReturnType<typeof SessionLogOffset> }) => {
      records.set(header.id, { header, inheritedEventCount: options.inheritedEventCount, events: [] })
      return handle(header.id)
    },
    open: async (id: string) => handle(id),
    stat: async (id: string) => records.has(id) ? { header: records.get(id)!.header, revision: 'test' } : undefined,
  })
  ctx.provide('sessionQuery', {
    observeSession: async (id: string) => ({ ...records.get(id)!, [Symbol.dispose]() {} }),
  })
  return records
}

it('真实 fork 继承已完成上下文、独立回答并可取消，主任务保持可用', async () => {
  const ctx = new Context()
  try {
    new MemoryWorkingDirectory(ctx)
    for (const service of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry, CommandRuntime]) await ctx.plugin(service).await()
    await ctx.plugin(AgentLoop, { agents: [] }).await()
    await ctx.plugin(SubagentRuntime).await()
    await ctx.plugin(Fork, { providerName: 'fork' }).await()
    const records = memorySessions(ctx)
    const adapter = new AnswerAdapter()
    ctx.llm.registerAdapter(['test'], adapter)
    const parent = await ctx.agentLoop.create(SessionId('btw-parent'), { provider: 'test', model: 'test' }, { cwd: process.cwd() })
    parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '主任务背景' }] }))
    await parent.whenIdle()
    const bundle = new URL('../lib/index.js', import.meta.url).href
    const implementation = process.env.DSH_BTW_BUNDLE === '1' ? await import(/* @vite-ignore */ bundle) as typeof sourcePlugin : sourcePlugin
    const plugin = ctx.plugin(implementation)
    await plugin.await()
    const execute = (line: string) => ctx.commands.execute(parent, line, [], new AbortController().signal)
    const answered = await execute(`/${RUN_COMMAND} ${JSON.stringify({ id: 'request01', question: '旁问专属问题', reference: '选中时固定的正文片段' })}`)
    expect(answered?.result).toMatchObject({ kind: 'success', text: '独立旁问答案' })
    const request = adapter.requests.at(-1)!
    expect(JSON.stringify(request.messages)).toContain('主任务背景')
    expect(JSON.stringify(request.messages)).toContain('旁问专属问题')
    expect(JSON.stringify(request.messages)).toContain('选中时固定的正文片段')
    expect(JSON.stringify({ system: request.system, messages: request.messages })).toContain('一次性旁问助手')
    expect(JSON.stringify({ system: request.system, messages: request.messages })).not.toContain('当前没有任何可用工具')
    // 命令结果会进入审计日志，但不得进入主任务的模型上下文。
    expect(JSON.stringify(parent.session.deriveMessages())).not.toContain('独立旁问答案')
    expect(JSON.stringify(parent.session.deriveMessages())).not.toContain('选中时固定的正文片段')
    await expect.poll(() => ctx.agents.list().length).toBe(1)
    const resolved = await execute(`/${CHILD_COMMAND} request01`)
    expect(resolved?.result.kind).toBe('success')
    const address = JSON.parse(resolved!.result.text!)
    expect(address).toMatchObject({ parentSessionId: parent.id, mode: 'continuable' })
    expect(records.get(address.childSessionId)?.header.origin).toBe('subagent')
    expect((await execute(`/${CHILD_COMMAND} unknown-request`))?.result.kind).toBe('error')

    adapter.hang = true
    const pending = execute(`/${RUN_COMMAND} ${JSON.stringify({ id: 'request02', question: '等待取消' })}`)
    await expect.poll(() => adapter.requests.length).toBe(3)
    const liveAddress = JSON.parse((await execute(`/${CHILD_COMMAND} request02`))!.result.text!)
    expect(liveAddress.childSessionId).not.toBe(address.childSessionId)
    expect(ctx.agents.get(liveAddress.childSessionId)).toBeDefined()
    expect(adapter.requests).toHaveLength(3) // opening while running did not rerun
    expect((await execute(`/${CLOSE_COMMAND} request02`))?.result.kind).toBe('success')
    expect((await pending)?.result.kind).toBe('error')
    await expect.poll(() => ctx.agents.list().length).toBe(1)
    expect(ctx.agents.get(parent.id)).toBe(parent)
    adapter.hang = false
    parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '继续主任务' }] }))
    await parent.whenIdle()
    expect(adapter.requests).toHaveLength(4)

    // Reopen the *completed and disposed* original BTW child through the browser API.
    const childId = SessionId(address.childSessionId)
    expect(ctx.agents.get(childId)).toBeUndefined()
    const parentTurns = parent.session.ownEvents().filter(event => event.type === 'turn/start').length
    await ctx.subagents.prompt({ parentSessionId: parent.id, childSessionId: childId,
      requestId: 'side-followup' as never, mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: '继续旁问，不要唤醒主任务' }],
    }, new AbortController().signal)
    await ctx.subagents.waitForChildren(parent)
    await parent.whenIdle()
    expect(adapter.requests).toHaveLength(5) // child only, no sixth parent request
    expect(parent.status).toBe('idle')
    expect(parent.session.ownEvents().filter(event => event.type === 'turn/start')).toHaveLength(parentTurns)
    expect(ctx.agents.get(childId)).toBeUndefined() // resumed activation also cleaned up
    expect(parent.inbox.nextStep.some(message => message.source?.kind === 'subagent-settled')).toBe(true)
    await ctx.subagents.prompt({ parentSessionId: parent.id, childSessionId: childId,
      requestId: 'side-followup-again' as never, mode: 'continuable', delivery: 'queue', content: [{ type: 'text', text: '再追问一次，同一旁问继续' }],
    }, new AbortController().signal)
    await ctx.subagents.waitForChildren(parent)
    expect(adapter.requests).toHaveLength(6)
    expect(parent.session.ownEvents().filter(event => event.type === 'turn/start')).toHaveLength(parentTurns)
    expect(JSON.parse((await execute(`/${CHILD_COMMAND} request01`))!.result.text!)).toEqual(address)
    expect([...records.values()].filter(row => row.header.origin === 'subagent')).toHaveLength(2)
    // A continuation queued while the initial answer is streaming stays in
    // the same activation; BTW's final cleanup must not discard it.
    let release = () => {}
    adapter.gate = new Promise<void>(resolve => { release = resolve })
    const streaming = execute(`/${RUN_COMMAND} ${JSON.stringify({ id: 'request03', question: '流式旁问' })}`)
    try {
      await expect.poll(() => adapter.requests.length).toBe(7)
      const streamingAddress = JSON.parse((await execute(`/${CHILD_COMMAND} request03`))!.result.text!)
      await ctx.subagents.prompt({ ...streamingAddress, requestId: 'queued-side-followup' as never,
        delivery: 'queue', content: [{ type: 'text', text: '等回答结束后继续这一条' }],
      }, new AbortController().signal)
      expect(adapter.requests).toHaveLength(7)
      release()
      expect((await streaming)?.result.kind).toBe('success')
      expect(adapter.requests).toHaveLength(8)
      expect(JSON.stringify(adapter.requests.at(-1)!.messages)).toContain('等回答结束后继续这一条')
      expect(parent.session.ownEvents().filter(event => event.type === 'turn/start')).toHaveLength(parentTurns)
      expect([...records.values()].filter(row => row.header.origin === 'subagent')).toHaveLength(3)
    } finally { release() }
    await plugin.dispose()
  } finally { await ctx.fiber.dispose() }
}, 15_000)

it('旁问完成通知不打开主回合，用户下一条消息才消费参考；普通子任务仍唤醒', async () => {
  const ctx = new Context()
  try {
    for (const service of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) await ctx.plugin(service).await()
    await ctx.plugin(AgentLoop, { agents: [] }).await()
    const adapter = new AnswerAdapter()
    ctx.llm.registerAdapter(['test'], adapter)
    const parent = await ctx.agentLoop.create(SessionId('delivery-parent'), { provider: 'test', model: 'test' })
    const { installSideDelivery, markSideChild } = await import('../src/server/side-delivery')
    const dispose = installSideDelivery(ctx)
    markSideChild(parent, SessionId('side-child'))
    const notice = (id: string) => createUserMessage({
      source: { kind: 'subagent-settled', form: 'notice', summary: 'Done', senderSessionId: SessionId(id) },
      content: [{ type: 'text', text: '只供参考的旁问结果' }],
    })
    parent.followup(notice('side-child'))
    await parent.whenIdle()
    expect(parent.status).toBe('idle')
    expect(adapter.requests).toHaveLength(0)
    expect(parent.session.ownEvents().filter(e => e.type === 'turn/start')).toHaveLength(0)
    expect(parent.inbox.nextStep).toHaveLength(1)
    parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '现在继续' }] }))
    await parent.whenIdle()
    expect(adapter.requests).toHaveLength(1)
    expect(JSON.stringify(adapter.requests[0]!.messages)).toContain('只供参考的旁问结果')
    parent.followup(notice('ordinary-child'))
    await parent.whenIdle()
    expect(adapter.requests).toHaveLength(2)
    dispose()
  } finally { await ctx.fiber.dispose() }
}, 15_000)
