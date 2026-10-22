import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context as ContextType } from '@deepseek-ai/cordis'
import type { ToolRuntime as RuntimeType } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDefinition } from '@deepseek-ai/dsh-commands'
import { apply, inject } from '../src/index'
import { RUN_COMMAND } from '../src/shared'

// 默认验证锁文件中的宿主版本；允许显式指定旧版依赖图做兼容回归。
const runtimeRoot = process.env.DSH_RUNTIME_ROOT ?? fileURLToPath(new URL('../node_modules', import.meta.url))
const modulePath = (name: string) => pathToFileURL(join(runtimeRoot, '@deepseek-ai', name, 'lib', 'index.js')).href
const runtimeVersion = JSON.parse(readFileSync(join(runtimeRoot, '@deepseek-ai', 'dsh-tools', 'package.json'), 'utf8')).version
afterEach(() => { vi.useRealTimers() })

describe(`DSH ${runtimeVersion} 真实运行时`, () => {
  const load = async () => {
    const { Context } = await import(/* @vite-ignore */ modulePath('cordis')) as { Context: typeof ContextType }
    const { ToolRuntime } = await import(/* @vite-ignore */ modulePath('dsh-tools')) as { ToolRuntime: typeof RuntimeType }
    const { createScope } = await import(/* @vite-ignore */ modulePath('dsh-scope')) as {
      createScope(ctx: ContextType, key: object): { ctx: ContextType; dispose(): Promise<void> }
    }
    return { Context, ToolRuntime, createScope }
  }

  it('根 fiber 拒绝 effect 时仍能激活并注册 btw', async () => {
    const { Context, ToolRuntime } = await load()
    const ctx = new Context()
    ctx.provide('sessions', { list: () => [] })
    ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {}, getSectionOrder: () => 0 })
    new ToolRuntime(ctx)
    const commands = new Map<string, CommandDefinition>()
    ctx.provide('commands', { register: (command: CommandDefinition) => { commands.set(command.name, command); return () => { commands.delete(command.name) } } })
    ctx.provide('subagents', { getProvider: () => undefined })
    const fiber = ctx.root.fiber as { effect(execute: () => unknown, label?: string): unknown }
    const rootEffect = fiber.effect.bind(ctx.root.fiber)
    fiber.effect = (execute, label) => {
      if (label === 'tools.guard()') throw new Error('dsh-tui: root.effect is unavailable from a plugin activation')
      return rootEffect(execute, label)
    }
    const plugin = ctx.plugin({ apply, inject })
    try {
      await plugin.await()
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error))
    }
    expect(commands.has('btw')).toBe(true)
    await plugin.dispose()
    await ctx.fiber.dispose()
  })

  it('subagents.start 保留独立角色且不覆盖宿主工具权限', async () => {
    const { Context, ToolRuntime, createScope } = await load()
    const ctx = new Context()
    ctx.provide('sessions', { list: () => [] })
    ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {}, getSectionOrder: () => 0 })
    new ToolRuntime(ctx)
    const commands = new Map<string, CommandDefinition>()
    ctx.provide('commands', { register: (command: CommandDefinition) => { commands.set(command.name, command); return () => { commands.delete(command.name) } } })

    const child = { session: {} } as Agent & { ctx?: ContextType }
    let scope: { ctx: ContextType; dispose(): Promise<void> }
    const dispose = vi.fn(async () => {})
    const startLegacy = vi.fn(async (_provider: string, options: {
      parent: Agent
      label: string
      toolFilter?: { allow: readonly string[] }
      persona: string
      prompt: readonly { type: string; text: string }[]
    }) => {
      scope = createScope(ctx, child)
      child.ctx = scope.ctx
      // Legacy start keeps its independent persona without an empty tool allowlist.
      expect(options).not.toHaveProperty('toolFilter')
      expect(options.persona).toContain('一次性旁问助手')
      return { result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'start 回退答案' }] }), localAgent: child, dispose }
    })

    ctx.provide('subagents', {
      getProvider: () => ({ inheritsParentContext: true, capabilities: { toolFilter: true, persona: true } }),
      start: startLegacy,
    })

    const plugin = ctx.plugin({ apply, inject })
    await plugin.await()

    const outcome = await commands.get(RUN_COMMAND)!.handler({
      agent: { session: { header: { id: 'main' } } },
      rawInput: JSON.stringify({ id: 'legacy-req', question: '旧版问题' }),
      signal: new AbortController().signal,
    } as never)

    expect(outcome).toEqual({ kind: 'success', text: 'start 回退答案' })
    expect(startLegacy).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce() // 正常完成在 SideJobs execute 结束时调用 cleanup 释放

    // Legacy child-local tools remain executable, subject to host policy.
    const currentScope = scope!
    currentScope.ctx.tools.register({ name: 'legacy_tool', description: '测试工具', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, v) => [{ type: 'text', text: String(v) }] }, execute: vi.fn(async () => 'allowed') })
    const blocked = await ctx.tools.execute({ name: 'legacy_tool', callId: 'test-call' as never, arguments: {}, agent: child, signal: new AbortController().signal })
    expect(blocked.isError).not.toBe(true)
    expect(JSON.stringify(blocked.content)).toContain('allowed')

    await plugin.dispose()
    if (scope!) await scope.dispose()
    await ctx.fiber.dispose()
  })

  it('插件卸载等待子代理清理，不注册额外工具保护', async () => {
    const { Context } = await load()
    const ctx = new Context()
    ctx.provide('sessions', { list: () => [] })
    const commands = new Map<string, CommandDefinition>()
    let protectedNow = false
    let finishCleanup!: () => void
    let cleanupStarted = false
    ctx.provide('tools', { guard: () => ctx.effect(() => { protectedNow = true; return () => { protectedNow = false } }) })
    ctx.provide('commands', { register: (command: CommandDefinition) => { commands.set(command.name, command); return () => { commands.delete(command.name) } } })
    ctx.provide('subagents', {
      getProvider: () => ({ inheritsParentContext: true, capabilities: { agentOptions: true, agentPreset: false, outputSchema: true, depthLimit: true } }),
      start: async () => ({ result: new Promise(() => {}), dispose: () => { cleanupStarted = true; return new Promise<void>(resolve => { finishCleanup = resolve }) } }),
    })
    const plugin = ctx.plugin({ apply, inject })
    await plugin.await()
    const answer = commands.get(RUN_COMMAND)!.handler({ agent: { session: { header: { id: 'main' } } }, rawInput: JSON.stringify({ id: 'request-123', question: '问题' }), signal: new AbortController().signal } as never)
    await Promise.resolve()
    const unload = plugin.dispose()
    await vi.waitFor(() => expect(cleanupStarted).toBe(true))
    expect(protectedNow).toBe(false)
    finishCleanup()
    await unload
    await answer
    expect(protectedNow).toBe(false)
    await ctx.fiber.dispose()
  })

  it('卸载清理挂起时按时退出，宿主保护不被插件释放', async () => {
    const { Context, ToolRuntime, createScope } = await load()
    const ctx = new Context()
    ctx.provide('sessions', { list: () => [] })
    ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {}, getSectionOrder: () => 0 })
    new ToolRuntime(ctx)
    const commands = new Map<string, CommandDefinition>()
    ctx.provide('commands', { register: (command: CommandDefinition) => { commands.set(command.name, command); return () => { commands.delete(command.name) } } })
    let finishCleanup!: () => void
    const cleanup = new Promise<void>(resolve => { finishCleanup = resolve })
    const dispose = vi.fn(() => cleanup)
    const releaseHostGuard = ctx.tools.guard(() => 'HOST_POLICY_DENIED')
    const child = { session: {} } as Agent & { ctx?: ContextType }
    let scope: { ctx: ContextType; dispose(): Promise<void> }
    ctx.provide('subagents', {
      getProvider: () => ({ inheritsParentContext: true, capabilities: { agentOptions: true, agentPreset: false, outputSchema: true, depthLimit: true } }),
      start: async () => {
        scope = createScope(ctx, child)
        child.ctx = scope.ctx
        return { result: new Promise(() => {}), localAgent: child, dispose }
      },
    })
    const plugin = ctx.plugin({ apply, inject })
    await plugin.await()
    vi.useFakeTimers()
    const answer = commands.get(RUN_COMMAND)!.handler({ agent: { session: { header: { id: 'main' } } }, rawInput: JSON.stringify({ id: 'request-123', question: '问题' }), signal: new AbortController().signal } as never)
    await vi.advanceTimersByTimeAsync(0)
    const body = vi.fn(async () => 'executed')
    scope!.ctx.tools.register({ name: 'orphan_tool', description: '未释放子代理的工具', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }, execute: body })
    const unload = plugin.dispose()
    const finished = vi.fn()
    void unload.then(finished)
    await vi.advanceTimersByTimeAsync(5_001)
    expect(finished).toHaveBeenCalledTimes(1)
    expect(commands.has(RUN_COMMAND)).toBe(false)
    expect((await answer)?.kind).toBe('error')
    expect(dispose).toHaveBeenCalledTimes(1)
    const blocked = await ctx.tools.execute({ name: 'orphan_tool', callId: 'orphan' as never, arguments: {}, agent: child, signal: new AbortController().signal })
    expect(blocked.isError).toBe(true)
    expect(body).not.toHaveBeenCalled()
    finishCleanup()
    await vi.advanceTimersByTimeAsync(0)
    const released = await ctx.tools.execute({ name: 'orphan_tool', callId: 'released' as never, arguments: {}, agent: child, signal: new AbortController().signal })
    expect(released.isError).toBe(true)
    expect(JSON.stringify(released)).toContain('HOST_POLICY_DENIED')
    expect(body).not.toHaveBeenCalled()
    await releaseHostGuard()
    const allowed = await ctx.tools.execute({ name: 'orphan_tool', callId: 'allowed' as never, arguments: {}, agent: child, signal: new AbortController().signal })
    expect(allowed.isError).not.toBe(true)
    expect(body).toHaveBeenCalledTimes(1)
    await scope!.dispose()
    await ctx.fiber.dispose()
  })

  it('卸载时启动仍挂起，迟到句柄被清理且无额外保护', async () => {
    const { Context } = await load()
    const ctx = new Context()
    ctx.provide('sessions', { list: () => [] })
    const commands = new Map<string, CommandDefinition>()
    let protectedNow = false
    let finishStart!: (run: { result: Promise<unknown>; localAgent?: object; dispose: () => Promise<void> }) => void
    ctx.provide('tools', { guard: () => ctx.effect(() => { protectedNow = true; return () => { protectedNow = false } }) })
    ctx.provide('commands', { register: (command: CommandDefinition) => { commands.set(command.name, command); return () => { commands.delete(command.name) } } })
    ctx.provide('subagents', {
      getProvider: () => ({ inheritsParentContext: true, capabilities: { agentOptions: true, agentPreset: false, outputSchema: true, depthLimit: true } }),
      start: () => new Promise(resolve => { finishStart = resolve as typeof finishStart }),
    })
    const plugin = ctx.plugin({ apply, inject })
    await plugin.await()
    vi.useFakeTimers()
    const answer = commands.get(RUN_COMMAND)!.handler({ agent: { session: { header: { id: 'main' } } }, rawInput: JSON.stringify({ id: 'request-123', question: '问题' }), signal: new AbortController().signal } as never)
    const unload = plugin.dispose()
    await vi.advanceTimersByTimeAsync(5_001)
    await expect(unload).resolves.toBeUndefined()
    expect(protectedNow).toBe(false)
    const dispose = vi.fn(async () => {})
    finishStart({ result: new Promise(() => {}), dispose })
    await vi.advanceTimersByTimeAsync(0)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(protectedNow).toBe(false)
    expect((await answer)?.kind).toBe('error')
    await ctx.fiber.dispose()
  })
})
