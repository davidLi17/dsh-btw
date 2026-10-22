import { expect, it } from 'vitest'
import { parseRequest } from '../src/shared'
import { SideJobs } from '../src/server/jobs'

it('请求保留界面语言，兼容未传语言的旧客户端', () => {
  expect(parseRequest('{"id":"request01","question":"你好","locale":"en"}')).toMatchObject({ locale: 'en' })
  expect(parseRequest('{"id":"request01","question":"你好"}')).toMatchObject({ locale: 'zh' })
})

it('英文界面的空回答与重复提交提示使用英文', async () => {
  const jobs = new SideJobs(async () => ({ result: Promise.resolve({ stopReason: 'completed', output: [] }), dispose: async () => {} }))
  expect((await jobs.ask('session', 'request01', '你好', undefined, undefined, 'en')).text).toBe('The model returned no text.')
  expect((await jobs.ask('session', 'request01', '你好', undefined, undefined, 'en')).text).toBe('This side question was already submitted or closed.')
})

it('英文界面不会改写中文模型回答', async () => {
  const jobs = new SideJobs(async () => ({ result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: '原始回答' }] }), dispose: async () => {} }))
  expect((await jobs.ask('session', 'request02', '你好', undefined, undefined, 'en')).text).toBe('原始回答')
})

it('插件元数据解释两项功能，标注整合维护者并保留升级身份', async () => {
  const { readFileSync } = await import('node:fs')
  const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
  const zh = read('../locale/zh.json'), en = read('../locale/en.json'), pkg = read('../package.json')
  expect(zh.meta.title).toBe('原文批注与旁问')
  expect(en.meta.title).toBe('Annotations & Side Ask')
  expect(zh.meta.description).toContain('davidLi17')
  expect(zh.meta.description).toContain('Codex 原文批注')
  expect(zh.meta.description).not.toContain('不执行工具')
  expect(en.meta.description).not.toContain('without running tools')
  expect(pkg.author.name).toBe('davidLi17（整合修改）')
  expect(pkg.name).toBe('@michengai/dsh-btw')
})
