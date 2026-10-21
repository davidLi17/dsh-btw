import { Context, Service } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import LlmRuntime, { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as Fork from '@deepseek-ai/dsh-subagent-fork-in-process'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import { describe, expect, it } from 'vitest'
import * as sourcePlugin from '../src/index'
import { CLOSE_COMMAND, RUN_COMMAND } from '../src/shared'

class MemoryWorkingDirectory extends Service {
  constructor(ctx: Context) { super(ctx, 'workingDirectory') }
  get(session: { header: { cwd?: string } }) { return session.header.cwd }
  async ensure(agent: { session: { header: { cwd?: string } } }) { return agent.session.header.cwd ?? process.cwd() }
  async set(_agent: unknown, path: string) { return path }
}

function* textAnswer(text: string): Generator<StreamChunk> {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

function* readFile(id: string, path: string): Generator<StreamChunk> {
  const callId = ToolCallId(id)
  const args = JSON.stringify({ path })
  yield { type: 'block-start', index: 0, blockType: 'tool-call' }
  yield { type: 'tool-call-delta', index: 0, id: callId, name: 'read_file', argumentsDelta: args }
  yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: callId, name: 'read_file', arguments: args } }
  yield { type: 'finish', reason: { kind: 'tool-calls' } }
}

describe('BTW 工具执行继承宿主权限且不污染父会话', () => {
  it.each(['allow', 'guard', 'approval'] as const)('真实工具调用、结果与回答闭环，宿主策略=%s', async policy => {
    const denied = policy !== 'allow'
    const rejection = policy === 'approval' ? 'the user rejected tool' : 'HOST_POLICY_DENIED'
    const ctx = new Context()
    try {
      new MemoryWorkingDirectory(ctx)
      for (const service of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry, CommandRuntime]) {
        await ctx.plugin(service).await()
      }
      await ctx.plugin(AgentLoop, { agents: [] }).await()
      await ctx.plugin(SubagentRuntime).await()
      await ctx.plugin(Fork, { providerName: 'fork' }).await()
      const executed: string[] = []
      ctx.tools.register({
        name: 'read_file',
        description: '读取指定文件',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
        execute: async (args) => {
          const path = (args as { path: string }).path
          executed.push(path)
          return `FILE_CONTENT: ${path}`
        },
      })
      const requests: GenerateOptions[] = []
      let parentStep = 0
      let childStep = 0
      class ToolAdapter extends LlmAdapter {
        async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
        async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
          requests.push(options)
          if (options.sessionId === 'parent-tool-context') {
            if (++parentStep === 1) yield* readFile('parent-call', 'parent.json')
            else yield* textAnswer('主任务已读完 parent.json')
          } else if (++childStep === 1) {
            yield* readFile('btw-call', 'child.json')
          } else {
            const result = options.messages.at(-1)
            expect(result?.role).toBe('tool')
            expect(JSON.stringify(result)).toContain(denied ? rejection : 'FILE_CONTENT: child.json')
            yield* textAnswer(denied ? '宿主权限拒绝了读取。' : '旁问已读取 child.json。')
          }
        }
      }
      ctx.llm.registerAdapter(['test'], new ToolAdapter())
      const parent = await ctx.agentLoop.create(SessionId('parent-tool-context'), { provider: 'test', model: 'test' }, { cwd: process.cwd() })
      parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '读取 parent.json' }] }))
      await parent.whenIdle()
      const before = JSON.stringify(parent.session.deriveMessages())
      expect(before).toContain('parent-call')
      expect(before).toContain('FILE_CONTENT: parent.json')
      // Host policy is installed independently of BTW and must survive its disposal.
      let approvalPrompts = 0
      if (policy === 'approval') {
        await ctx.plugin(ApprovalService, { policy: 'ask' }).await()
        ctx.on('tools/pre-execute', async (exec, next) => exec.agent?.id !== parent.id
          ? { kind: 'ask', reason: 'Need approval' } : next())
        ctx.on('approval/request', async () => { approvalPrompts++; return 'allowed-once' })
      }
      const releaseHostGuard = ctx.tools.guard(({ agent }) =>
        policy === 'guard' && agent?.id !== parent.id ? 'HOST_POLICY_DENIED' : undefined)
      const plugin = ctx.plugin(sourcePlugin)
      await plugin.await()
      const result = await ctx.commands.execute(parent,
        `/${RUN_COMMAND} ${JSON.stringify({ id: 'request-tool-context', question: '读取 child.json 并解释。' })}`,
        [], new AbortController().signal)
      expect(result?.result).toMatchObject({ kind: 'success', text: denied ? '宿主权限拒绝了读取。' : '旁问已读取 child.json。' })
      expect(childStep).toBe(2)
      expect(executed).toEqual(denied ? ['parent.json'] : ['parent.json', 'child.json'])
      const childRequest = requests[2]!
      expect(childRequest.tools?.some(tool => tool.name === 'read_file')).toBe(true)
      expect(JSON.stringify(childRequest.messages)).toContain('parent-call')
      expect(JSON.stringify(childRequest.messages)).toContain('FILE_CONTENT: parent.json')
      expect(JSON.stringify(childRequest.messages)).not.toContain('当前没有任何可用工具')
      expect(JSON.stringify(parent.session.deriveMessages())).toBe(before)
      await expect.poll(() => ctx.agents.list().length).toBe(1)
      await plugin.dispose()
      expect(ctx.agents.get(parent.id)).toBe(parent)
      if (policy === 'approval') {
        expect(approvalPrompts).toBe(0) // The host pins delegated approval policy to never.
        expect(ctx.approval.overrideOf(parent.session)).toBeUndefined()
      }
      if (policy === 'guard') {
        const stillDenied = await ctx.tools.execute({ name: 'read_file', callId: ToolCallId('after-dispose'), arguments: { path: 'blocked.json' }, signal: new AbortController().signal })
        expect(stillDenied.isError).toBe(true)
        expect(JSON.stringify(stillDenied)).toContain('HOST_POLICY_DENIED')
        expect(executed).toEqual(['parent.json'])
      }
      await releaseHostGuard()
    } finally { await ctx.fiber.dispose() }
  }, 15_000)

  it.each(['close', 'unload'] as const)('运行中的真实工具可通过 %s 取消并释放子代理', async action => {
    const ctx = new Context()
    try {
      new MemoryWorkingDirectory(ctx)
      for (const service of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry, CommandRuntime]) await ctx.plugin(service).await()
      await ctx.plugin(AgentLoop, { agents: [] }).await()
      await ctx.plugin(SubagentRuntime).await()
      await ctx.plugin(Fork, { providerName: 'fork' }).await()
      let started = false
      let aborted = false
      ctx.tools.register({
        name: 'read_file', description: '挂起直到取消的测试工具',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
        execute: async (_args, { signal }) => {
          started = true
          return new Promise<string>((_resolve, reject) => {
            const stop = () => { aborted = true; reject(new Error('tool cancelled')) }
            if (signal.aborted) stop()
            else signal.addEventListener('abort', stop, { once: true })
          })
        },
      })
      class HangingToolAdapter extends LlmAdapter {
        async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
        async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
          if (options.sessionId === 'parent-cancel-tool') yield* textAnswer('主任务仍可用')
          else yield* readFile('hanging-call', 'pending.json')
        }
      }
      ctx.llm.registerAdapter(['test'], new HangingToolAdapter())
      const parent = await ctx.agentLoop.create(SessionId('parent-cancel-tool'), { provider: 'test', model: 'test' }, { cwd: process.cwd() })
      const before = JSON.stringify(parent.session.deriveMessages())
      const plugin = ctx.plugin(sourcePlugin)
      await plugin.await()
      const execute = (line: string) => ctx.commands.execute(parent, line, [], new AbortController().signal)
      const pending = execute(`/${RUN_COMMAND} ${JSON.stringify({ id: 'request-cancel-tool', question: '读取 pending.json' })}`)
      await expect.poll(() => started).toBe(true)
      if (action === 'close') expect((await execute(`/${CLOSE_COMMAND} request-cancel-tool`))?.result.kind).toBe('success')
      else await plugin.dispose()
      expect((await pending)?.result.kind).toBe('error')
      expect(aborted).toBe(true)
      await expect.poll(() => ctx.agents.list().length).toBe(1)
      expect(JSON.stringify(parent.session.deriveMessages())).toBe(before)
      expect(ctx.agents.get(parent.id)).toBe(parent)
      await plugin.dispose()
      parent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '继续主任务' }] }))
      await parent.whenIdle()
      expect(JSON.stringify(parent.session.deriveMessages())).toContain('主任务仍可用')
    } finally { await ctx.fiber.dispose() }
  }, 15_000)

})
