import { expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

it('package gate requires all third-party licenses and excludes secret files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lhg-package-'))
  const files = ['lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'cordis.patch.yml', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md', 'CHANGELOG.zh-CN.md', 'locale/en.json', 'locale/zh.json', 'LICENSE', 'ANNOTATIONS-LICENSE', 'VOICE-LICENSE']
  const check = () => {
    const archive = join(directory, 'test.tgz')
    execFileSync('tar', ['-czf', archive, '-C', directory, ...[...files, '.env'].map(file => `package/${file}`).filter(file => existsSync(join(directory, file)))])
    return spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/check-package.mjs', import.meta.url)), archive], { encoding: 'utf8' })
  }
  try {
    for (const file of files) { const path = join(directory, 'package', file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '') }
    expect(check().status).toBe(0)
    rmSync(join(directory, 'package/ANNOTATIONS-LICENSE'))
    expect(check().status).not.toBe(0)
    writeFileSync(join(directory, 'package/ANNOTATIONS-LICENSE'), '')
    rmSync(join(directory, 'package/VOICE-LICENSE'))
    expect(check().status).not.toBe(0)
    writeFileSync(join(directory, 'package/VOICE-LICENSE'), '')
    writeFileSync(join(directory, 'package/.env'), 'example=not-a-secret')
    expect(check().status).not.toBe(0)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
