import type { Context, Fiber } from '@deepseek-ai/cordis'

// Public loader event; keep the loader itself out of the plugin dependency graph.
declare module '@deepseek-ai/cordis' {
  interface Events {
    'loader/volatile-update'(paths: readonly (readonly string[])[]): void
  }
}

export const SETTINGS_NAMESPACE = 'michengai-btw'
export const MODULE_KEYS = ['btw', 'annotations', 'reasoningShortcuts'] as const
export type ModuleKey = typeof MODULE_KEYS[number]
export type ModuleSettings = Record<ModuleKey, boolean>
export const DEFAULT_MODULE_SETTINGS: ModuleSettings = { btw: true, annotations: true, reasoningShortcuts: true }

/** Accept plain wire settings and the Host's live schema references. */
export function moduleSettings(value: unknown): ModuleSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(MODULE_KEYS.map(key => {
    const field = source[key]
    const current = field && typeof field === 'object' && 'get' in field && typeof field.get === 'function' ? field.get() : field
    return [key, typeof current === 'boolean' ? current : true]
  })) as ModuleSettings
}

/** Each feature has its own Cordis owner, so disabling one releases only its effects. */
export function moduleLifecycle(ctx: Context, mounts: Partial<Record<ModuleKey, (scope: Context) => void>>) {
  const active = new Map<ModuleKey, Fiber>()
  let desired = { ...DEFAULT_MODULE_SETTINGS }
  let closed = false
  let tail = Promise.resolve()
  const reconcile = async () => {
    for (const key of MODULE_KEYS) {
      const fiber = active.get(key)
      if (fiber && (!desired[key] || closed)) {
        active.delete(key)
        try { await fiber.dispose() } catch (error) { ctx.logger.warn(error) }
      }
    }
    if (closed) return
    for (const key of MODULE_KEYS) {
      const mount = mounts[key]
      if (desired[key] && mount && !active.has(key)) {
        const fiber = ctx.plugin(mount)
        active.set(key, fiber)
        try { await fiber.await() } catch (error) {
          // A feature failure must not block the other independent features.
          active.delete(key)
          ctx.logger.warn(error)
          try { await fiber.dispose() } catch (cleanupError) { ctx.logger.warn(cleanupError) }
        }
      }
    }
  }
  const update = (settings: ModuleSettings) => {
    desired = settings
    tail = tail.then(reconcile).catch(error => { ctx.logger.warn(error) })
    return tail
  }
  ctx.effect(() => async () => { closed = true; await tail; await reconcile() })
  return { update }
}
