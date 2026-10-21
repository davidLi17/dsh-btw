import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-subagent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { CLOSE_COMMAND, MAX_QUESTION_LENGTH, parseRequest, questionWithReference, RUN_COMMAND } from './shared'
import { DEFAULT_TIMEOUT_MS, SideJobs } from './server/jobs'
import { translate } from './locales'
import { hideInternalCommands } from './server/command-visibility'

export const name = 'michengai-btw'
export const inject = ['commands', 'subagents', 'tools']

interface SideAgent {
  ctx?: {
    systemPrompt: {
      section(spec: { name: string; order: number; text: string }): () => void
      getSectionOrder(name: string): number
    }
  }
}

/** 宿主命令只负责接入与身份绑定，不创建 HTTP 或持久侧聊接口。 */
export function apply(ctx: Context): void {
  ctx.effect(() => hideInternalCommands(ctx.commands))
  const jobs = new SideJobs(async request => {
    // 0.2.1-rc.1 起只有 startActivation；0.2.0-rc.1 与 0.2.0-rc.2 仍只有 start。
    const provider = ctx.subagents.getProvider('fork')
    const t = translate(request.locale)
    if (!provider?.inheritsParentContext) {
      throw new Error(t('error.provider'))
    }
    const label = t('agent.name')
    const promptText = `${t('agent.promptPrefix')}\n\n${request.question}`
    // Reuse the host fork/tool runtime; do not override its permissions or approvals.
    const subagents = ctx.subagents as unknown as {
      startActivation?: (spec: {
        provider: string
        label: string
        childId: ReturnType<typeof SessionId>
        request: { parent: Agent; prompt: readonly { type: string; text: string }[] }
        signal: AbortSignal
        delivery: 'caller'
      }) => Promise<{ result: Promise<{ stopReason: string; output: readonly { type: string; text?: string }[] }>; dispose(): Promise<void> }>
      start?: (provider: string, options: {
        parent: Agent
        label: string
        signal: AbortSignal
        persona: string
        prompt: readonly { type: string; text: string }[]
      }) => Promise<{ result: Promise<{ stopReason: string; output: readonly { type: string; text?: string }[] }>; localAgent?: object; dispose(): Promise<void> }>
    }
    if (typeof subagents.startActivation === 'function') {
      const childId = SessionId(globalThis.crypto.randomUUID())
      const stopCreated = ctx.on('agent/created', ({ agent }) => {
        if (agent.id !== childId) return undefined
        const scoped = agent as SideAgent
        if (scoped.ctx?.systemPrompt) {
          scoped.ctx.systemPrompt.section({
            name: PERSONA_PREFIX_SECTION,
            order: scoped.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
            text: t('agent.persona'),
          })
        }
        return undefined
      })
      let activation
      try {
        activation = await subagents.startActivation({
          provider: 'fork',
          label,
          childId,
          request: {
            parent: request.context as Agent,
            prompt: [{ type: 'text', text: promptText }],
          },
          signal: request.signal,
          delivery: 'caller',
        })
      } finally {
        stopCreated()
      }
      return {
        result: activation.result,
        dispose: async () => {
          await activation.dispose()
        },
      }
    }
    if (typeof subagents.start !== 'function') {
      throw new Error(t('error.provider'))
    }
    const run = await subagents.start('fork', {
      parent: request.context as Agent,
      label,
      signal: request.signal,
      persona: t('agent.persona'),
      prompt: [{ type: 'text', text: promptText }],
    })
    return {
      result: run.result,
      dispose: async () => {
        await run.dispose()
      },
    }
  }, DEFAULT_TIMEOUT_MS, {
    onError: error => ctx.logger.warn(error),
  })
  ctx.effect(() => () => jobs.dispose())

  ctx.effect(() => ctx.commands.register({
    name: 'btw',
    description: translate()('command.description'),
    input: { hint: translate()('command.hint') },
    recordInput: false,
    handler: invocation => {
      const question = invocation.rawInput.trim()
      if (!question) return { kind: 'error', text: translate()('error.empty') }
      if (question.length > MAX_QUESTION_LENGTH) return { kind: 'error', text: translate()('error.length') }
      return jobs.ask(invocation.agent.session.header.id, globalThis.crypto.randomUUID(), question, invocation.signal, invocation.agent)
    },
  }))
  ctx.effect(() => ctx.commands.register({
    name: RUN_COMMAND,
    description: translate()('command.internalRun'),
    recordInput: false,
    handler: invocation => {
      try {
        const request = parseRequest(invocation.rawInput)
        return jobs.ask(invocation.agent.session.header.id, request.id, questionWithReference(request.question, request.reference, request.locale), invocation.signal, invocation.agent, request.locale)
      } catch (error) { return { kind: 'error', text: error instanceof Error ? error.message : translate()('error.request') } }
    },
  }))
  ctx.effect(() => ctx.commands.register({
    name: CLOSE_COMMAND,
    description: translate()('command.internalClose'),
    recordInput: false,
    handler: invocation => {
      const id = invocation.rawInput.trim()
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(id)) return { kind: 'error', text: translate()('error.id') }
      return jobs.close(invocation.agent.session.header.id, id)
    },
  }))
}
