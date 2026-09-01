import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..'

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8')
}

describe('Docker image completeness', () => {
  it('copies every local module imported by server.mjs', () => {
    const source = read('server.mjs')
    const dockerfile = read('Dockerfile')

    const localImports = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
      .map(m => m[1])
      .filter(p => p.endsWith('.mjs'))

    assert.ok(localImports.length > 0,
      'expected server.mjs to have at least one local module import')

    for (const imp of localImports) {
      const filename = imp.split('/').pop()
      assert.ok(dockerfile.includes(`COPY ${filename} .`),
        `Dockerfile must COPY ${filename} (imported by server.mjs as '${imp}')`)
    }
  })

  it('copies every local module imported by memory-server.mjs', () => {
    const source = read('memory-server.mjs')
    const dockerfile = read('Dockerfile')

    const localImports = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
      .map(m => m[1])
      .filter(p => p.endsWith('.mjs'))

    for (const imp of localImports) {
      const filename = imp.split('/').pop()
      assert.ok(dockerfile.includes(`COPY ${filename} .`),
        `Dockerfile must COPY ${filename} (imported by memory-server.mjs as '${imp}')`)
    }
  })
})
