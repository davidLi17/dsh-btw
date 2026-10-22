import z from '@deepseek-ai/schemastery'

/** Native settings forms expose volatile fields without replacing unrelated modules. */
export const Config = z.object({
  btw: z.boolean().default(true).description('BTW / 独立旁问').volatile(),
  annotations: z.boolean().default(true).description('Annotations / 原文批注').volatile(),
  reasoningShortcuts: z.boolean().default(true).description('Reasoning Shortcuts / 思考强度快捷键').volatile(),
})
