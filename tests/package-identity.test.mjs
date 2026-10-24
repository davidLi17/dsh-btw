import { readFileSync } from 'node:fs'
import { test as it } from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const packageName = '@davidli/dsh-lhg-btw'

it('package, lock, Cordis patch and release archive use the renamed package', () => {
  const pkg = JSON.parse(read('package.json'))
  const lock = JSON.parse(read('package-lock.json'))
  assert.equal(pkg.name, packageName)
  for (const manifest of [lock, lock.packages['']]) {
    assert.equal(manifest.name, packageName)
    assert.equal(manifest.version, pkg.version)
  }
  assert.equal(read('cordis.patch.yml'), `- insert:\n    - id: michengai-btw\n      name: '${packageName}'\n`)
  assert.ok(read('.github/workflows/publish.yml').includes('artifacts/davidli-dsh-lhg-btw-$($package.version).tgz'))
})

it('retains persisted settings, side-question identity and author notices', () => {
  assert.ok(read('src/module-settings.ts').includes("export const SETTINGS_NAMESPACE = 'michengai-btw'"))
  assert.ok(read('src/index.ts').includes("export const name = 'michengai-btw'"))
  assert.ok(read('src/server/side-delivery.ts').includes("const CHILD_RECORD = 'plugin:michengai-btw/child'"))
  const pkg = JSON.parse(read('package.json'))
  assert.ok(pkg.contributors.some(author => author.url === 'https://github.com/MichengAI/dsh-btw'))
  assert.equal(pkg.license, 'Apache-2.0')
  assert.ok(read('ANNOTATIONS-LICENSE').includes('deepseekharness-plugin contributors'))
  assert.ok(read('VOICE-LICENSE').includes('MIT License'))
})

it('annotation storage and protocol retain their existing namespace', () => {
  assert.ok(read('src/annotations/core.js').includes("export const SOURCE = 'dsh-codex-annotations'"))
  assert.ok(read('src/annotations/core.js').includes('export const STORAGE_PREFIX = `${SOURCE}:v1:`'))
})
