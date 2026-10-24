// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { neutralizeMarkdownImages } from '../src/client/answer-markdown'
import { CSS } from '../src/client/styles'
import { translate } from '../src/locales'

const harness = vi.hoisted(() => {
  const seen: string[] = []
  const labels: Array<{ code: { copyLabel: string; copiedLabel: string } }> = []
  const variants: Array<'body' | 'compact' | undefined> = []
  const state = { mode: 'host' as 'host' | 'throw' | 'missing' }
  return { seen, labels, variants, state }
})

function renderMath(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g
  let last = 0
  let key = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) nodes.push(text.slice(last, index))
    const tex = match[1] ?? match[2] ?? match[3] ?? match[4] ?? ''
    const display = match[1] !== undefined || match[2] !== undefined
    nodes.push(React.createElement('span', { key, className: display ? 'katex-display' : 'katex' }, tex))
    key += 1
    last = index + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

vi.mock('../src/client/host-markdown', () => ({
  loadHostMarkdownText: () => {
    if (harness.state.mode === 'missing') return null
    if (harness.state.mode === 'throw') return function ThrowMarkdown() { throw new Error('host markdown failed') }
    return function HostMarkdown({ text, labels, variant }: { text: string; labels: { code: { copyLabel: string; copiedLabel: string } }; variant?: 'body' | 'compact' }) {
      harness.seen.push(text)
      harness.labels.push(labels)
      harness.variants.push(variant)
      return React.createElement('div', { 'data-host-markdown': 'true' }, renderMath(text))
    }
  },
}))

import { BubbleView } from '../src/client/BubbleView'

let container: HTMLDivElement
let root: Root
const issue = '$N=8192$ 时这一步就要扫 8192 组向量。累加起来，生成整段长度为 $N$ 的序列总代价是 $O(N^2)$，这就是长上下文推理慢的根本原因。'

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  harness.seen.length = 0
  harness.labels.length = 0
  harness.variants.length = 0
  harness.state.mode = 'host'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const render = async (answer: string) => {
  await act(async () => root.render(React.createElement(BubbleView, {
    item: { id: 'request01', sessionId: 'session', question: '问题', answer, phase: 'done' },
    close: () => {},
    t: translate('zh'),
    collapsed: false,
    onToggleCollapse: () => {},
  })))
}

it('把公式原文交给宿主渲染，气泡里不再留下美元分隔符', async () => {
  await render(`${issue}\n\n\\(N\\) 与 $$O(N^2)$$ 和 \\[N=8192\\]`)
  expect(harness.seen[0]).toContain('$N=8192$')
  expect(harness.seen[0]).toContain('$O(N^2)$')
  expect(harness.seen[0]).toContain('\\(N\\)')
  expect(harness.seen[0]).toContain('$$O(N^2)$$')
  expect(harness.labels[0]?.code).toEqual({ copyLabel: '复制代码', copiedLabel: '已复制代码' })
  expect(container.querySelector('[data-host-markdown]')).not.toBeNull()
  expect(container.textContent).not.toContain('$N=8192$')
  expect(container.textContent).not.toContain('$O(N^2)$')
  expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(3)
  expect([...container.querySelectorAll('.katex, .katex-display')].map(node => node.textContent)).toEqual(expect.arrayContaining(['N=8192', 'N', 'O(N^2)', 'N=8192']))
})

it('使用主对话的正文变体，不给宿主渲染器套回退样式', async () => {
  await render('正文与主对话一致')
  expect(harness.variants).toEqual(['body'])
  expect(container.querySelector('.btw-answer [data-host-markdown]')).not.toBeNull()
  expect(container.querySelector('.btw-answer-fallback')).toBeNull()
})

it('交给宿主前去掉远程图片地址，但保留公式和代码块', async () => {
  await render('看 ![图片说明](https://example.com/tracker.png) 与 $N=8192$\n\n```\n![保留](https://example.com/in-code.png)\n```')
  expect(harness.seen[0]).toContain('图片说明')
  expect(harness.seen[0]).toContain('$N=8192$')
  expect(harness.seen[0]).not.toContain('tracker.png')
  expect(harness.seen[0]).toContain('https://example.com/in-code.png')
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).toContain('图片说明')
  expect(container.querySelector('.katex')?.textContent).toBe('N=8192')
})

it('宿主渲染器抛错时回退到文本，不把旁问气泡弄空白', async () => {
  harness.state.mode = 'throw'
  await render(`说明 ${issue}`)
  expect(container.textContent).toContain('说明')
  expect(container.textContent).toContain('$N=8192$')
  expect(container.querySelector('[data-host-markdown]')).toBeNull()
  expect(container.querySelector('.btw-answer-fallback')?.textContent).toContain('说明')
  expect(container.querySelector('script')).toBeNull()
})

it('没有宿主渲染器时保留原文，不加载远程图片', async () => {
  harness.state.mode = 'missing'
  await render('![图片说明](https://example.com/tracker.png)\n\n$N=8192$')
  expect(harness.seen).toEqual([])
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).toContain('图片说明')
  expect(container.textContent).toContain('$N=8192$')
  expect(container.querySelector('.btw-answer-fallback')).not.toBeNull()
})

it('回退正文保留标题、链接、代码和表格的语义，不执行 HTML 或加载图片', async () => {
  harness.state.mode = 'missing'
  await render('# 标题\n\n正文与 **强调**，`const n = 1` 和 [链接](https://example.com/docs)。\n\n```js\nconst n = 1\n```\n\n| 列 | 值 |\n| --- | --- |\n| A | 1 |\n\n![图片](https://example.com/image.png)\n\n<script>alert(1)</script>')
  const fallback = container.querySelector('.btw-answer-fallback')!
  expect(fallback.querySelector('h1')?.textContent).toBe('标题')
  expect(fallback.querySelector('strong')?.textContent).toBe('强调')
  expect(fallback.querySelector('p code')?.textContent).toBe('const n = 1')
  expect(fallback.querySelector('pre code.language-js')?.textContent).toBe('const n = 1\n')
  expect(fallback.querySelector('a')?.getAttribute('href')).toBe('https://example.com/docs')
  expect(fallback.querySelector('a')?.getAttribute('rel')).toBe('noreferrer noopener')
  expect(fallback.querySelector('table tbody td')?.textContent).toBe('A')
  expect(fallback.querySelector('img, script')).toBeNull()
})

it('正文容器只控制布局，不覆盖宿主的字号、颜色或 Markdown 子元素样式', () => {
  const nativeRules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selectors = '']) =>
    selectors.split(',').some(selector => /^\.btw-answer(?:$|[\s>:+~.#])/.test(selector.trim())),
  )
  expect(nativeRules.length).toBeGreaterThan(0)
  for (const [, selectors, declarations] of nativeRules) {
    expect(selectors).not.toMatch(/\.btw-answer(?:\s|>)+(?:\*|p\b|h[1-6]\b|code\b|pre\b|a\b|blockquote\b)/)
    expect(declarations).not.toMatch(/(?:^|;)(?:font(?:-[\w-]+)?|line-height|color|background(?:-[\w-]+)?):/)
    expect(declarations).not.toContain('!important')
  }
  expect(CSS).not.toMatch(/\.btw-answer[^{}]*\*[^{}]*\{[^}]*color:/)
})

it('回退使用正文主题字体和主前景色，链接、代码和紧凑工具栏保持各自语义', () => {
  const fallback = CSS.match(/\.btw-answer-fallback\{([^}]*)\}/)?.[1]
  expect(fallback).toContain('font:var(--dsw-font-markdown-base,16px/1.6 sans-serif)')
  expect(fallback).toContain('color:var(--dsw-alias-label-primary)')
  expect(CSS).toMatch(/\.btw-answer-fallback a\{[^}]*color:var\(--dsw-alias-link\)/)
  expect(CSS).toMatch(/\.btw-answer-fallback code\{[^}]*font-family:var\(--ds-font-family-code,Consolas,monospace\)/)
  expect(CSS).toMatch(/\.btw-question\{[^}]*font-size:13px/)
  expect(CSS).toMatch(/\.btw-actions button\{[^}]*width:28px;height:28px/)
})

it('侧边栏文本按钮保持紧凑，窄容器允许工具栏和长标签换行', () => {
  const button = CSS.match(/\.btw-actions button\.btw-action-sidebar\{([^}]*)\}/)?.[1]
  expect(button).toContain('display:inline-flex')
  expect(button).toContain('width:auto')
  expect(button).toContain('max-width:100%')
  expect(button).toContain('gap:5px')
  expect(button).toContain('border-radius:6px')
  expect(button).toContain('min-height:28px')
  expect(button).toContain('overflow-wrap:anywhere')
  expect(CSS).toMatch(/\.btw-header\{[^}]*flex-wrap:wrap/)
  expect(CSS).toMatch(/\.btw-actions\{[^}]*flex-wrap:wrap[^}]*max-width:100%/)
  expect(CSS).toMatch(/@media\(max-width:480px\)\{[^\n]*\.btw-actions button\.btw-action-sidebar\{min-height:36px\}/)
  expect(CSS).toMatch(/\.btw-sidebar-status\{[^}]*color:var\(--dsw-alias-label-secondary\)[^}]*font-size:12px[^}]*overflow-wrap:anywhere/)
})

it('图片中和跳过代码，空替代文字使用占位', () => {
  expect(neutralizeMarkdownImages('`![a](https://example.com/a.png)` ![b](https://example.com/b.png)', '图片')).toBe('`![a](https://example.com/a.png)` b')
  expect(neutralizeMarkdownImages('`` `![a](https://example.com/a.png)` `` ![b](https://example.com/b.png)', '图片')).toBe('`` `![a](https://example.com/a.png)` `` b')
  expect(neutralizeMarkdownImages('![](https://example.com/c.png)', '图片')).toBe('图片')
})

it('客户端构建把宿主 Markdown 留在基座 require', () => {
  const source = readFileSync('src/client/host-markdown.ts', 'utf8')
  const build = readFileSync('scripts/build.mjs', 'utf8')
  expect(source).toContain("require('@deepseek-ai/dsh-client-ui-primitives')")
  expect(build).toContain("'@deepseek-ai/dsh-client-ui-primitives'")
})
