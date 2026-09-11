import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 's19y-info-'))

process.env.DATA_DIR = dataDir

describe('Info routes', () => {
  let base
  let server

  before(async () => {
    const express = (await import('express')).default
    const { createInfoRouter } = await import('../info-routes.mjs')
    const { writeInfoPage } = await import('../info-store.mjs')
    await writeInfoPage('priorities', '# Priorities\n\nBody\n')
    await writeInfoPage('agents', '# Server instructions\n\nBody\n')
    const app = express()
    app.use('/info', createInfoRouter('test-api-key'))
    server = app.listen(0)
    base = `http://127.0.0.1:${server.address().port}/info`
  })

  after(async () => {
    await server.close()
    delete process.env.DATA_DIR
    rmSync(dataDir, { recursive: true, force: true })
  })

  it('rejects requests without a valid API key', async () => {
    const res = await fetch(`${base}/`)
    assert.strictEqual(res.status, 401)
  })

  it('lists the pages including agents for an authenticated agent', async () => {
    const res = await fetch(`${base}/`, { headers: { 'x-api-key': 'test-api-key' } })
    assert.strictEqual(res.status, 200)
    const body = await res.json()
    assert.ok(body.pages.some(p => p.name === 'agents'))
    assert.ok(body.pages.some(p => p.name === 'priorities'))
  })

  it('serves a page by name', async () => {
    const res = await fetch(`${base}/priorities`, { headers: { 'x-api-key': 'test-api-key' } })
    assert.strictEqual(res.status, 200)
    assert.match(res.headers.get('content-type'), /text\/markdown/)
  })

  it('accepts an optional .md suffix (agents.md compat)', async () => {
    const res = await fetch(`${base}/agents.md`, { headers: { 'x-api-key': 'test-api-key' } })
    assert.strictEqual(res.status, 200)
    const text = await res.text()
    assert.match(text, /# Server instructions/)
  })

  it('serves the agents page without a suffix too', async () => {
    const res = await fetch(`${base}/agents`, { headers: { 'x-api-key': 'test-api-key' } })
    assert.strictEqual(res.status, 200)
  })

  it('returns 404 for unknown pages', async () => {
    const res = await fetch(`${base}/missing`, { headers: { 'x-api-key': 'test-api-key' } })
    assert.strictEqual(res.status, 404)
  })
})