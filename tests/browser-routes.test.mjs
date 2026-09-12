import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const testDataDir = join(process.cwd(), 'tmp', 'test-browser-routes-data')
process.env.DATA_DIR = testDataDir
mkdirSync(testDataDir, { recursive: true })

after(() => {
  rmSync(testDataDir, { recursive: true, force: true })
})

describe('Browser router module', () => {
  it('imports without side effects and exposes the factory', async () => {
    const mod = await import('../browser-routes.mjs')
    assert.strictEqual(typeof mod.createBrowserRouter, 'function')
    assert.strictEqual(typeof mod.generateAdminPassword, 'function')
  })

  it('creates a router with and without admin credentials', async () => {
    const { createBrowserRouter } = await import('../browser-routes.mjs')
    const router1 = createBrowserRouter({})
    const router2 = createBrowserRouter({}, { adminUser: 'admin', adminPassword: 'abc12345' })
    assert.ok(router1)
    assert.ok(router2)
    assert.ok(router1.stack.length > 0)
    assert.strictEqual(router2.stack.length, router1.stack.length)
  })

  it('generates 8-character [a-z0-9] passwords', async () => {
    const { generateAdminPassword } = await import('../browser-routes.mjs')
    for (let i = 0; i < 50; i++) {
      const password = generateAdminPassword()
      assert.strictEqual(password.length, 8)
      assert.match(password, /^[a-z0-9]{8}$/)
    }
  })

  it('rotates the admin one-time password after a successful password login', async () => {
    const express = (await import('express')).default
    const { createBrowserRouter } = await import('../browser-routes.mjs')
    const { cookieName } = await import('../browser-sessions.mjs')

    let rotated = null
    const first = 'aaaaaaaa'
    const router = createBrowserRouter({}, {
      adminUser: 'admin',
      adminPassword: first,
      rotateAdminPasswordOnUse: async () => {
        rotated = 'bbbbbbbb'
        return rotated
      }
    })
    const app = express()
    app.use(express.json())
    app.use(router)
    const server = app.listen(0)
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const res = await fetch(`${base}/api/login/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'admin', password: first })
      })
      assert.strictEqual(res.status, 200)
      assert.strictEqual(rotated, 'bbbbbbbb')
    } finally {
      server.close()
    }
  })

  it('exposes the agent pool and registry to the superuser', async () => {
    const express = (await import('express')).default
    const { createBrowserRouter } = await import('../browser-routes.mjs')

    const router = createBrowserRouter({}, { adminUser: 'admin', adminPassword: 'aaaaaaaa' })
    const app = express()
    app.use(express.json())
    app.use(router)
    const server = app.listen(0)
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const login = await fetch(`${base}/api/login/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'admin', password: 'aaaaaaaa' })
      })
      assert.strictEqual(login.status, 200)
      const cookie = login.headers.get('set-cookie').split(';')[0]

      const poolRes = await fetch(`${base}/api/agent-pool`, {
        headers: { Cookie: cookie }
      })
      assert.strictEqual(poolRes.status, 200)
      const poolBody = await poolRes.json()
      assert.ok(Array.isArray(poolBody.pool.available))
      assert.strictEqual(typeof poolBody.pool.total, 'number')

      const agentsRes = await fetch(`${base}/api/agents`, {
        headers: { Cookie: cookie }
      })
      assert.strictEqual(agentsRes.status, 200)
      const body = await agentsRes.json()
      assert.ok(body.pool)
      assert.ok(Array.isArray(body.identities))
      assert.ok(Array.isArray(body.sessions))
    } finally {
      server.close()
    }
  })

  it('exposes and updates the registration token for the superuser', async () => {
    const express = (await import('express')).default
    const { createBrowserRouter } = await import('../browser-routes.mjs')

    const router = createBrowserRouter({}, { adminUser: 'admin', adminPassword: 'aaaaaaaa' })
    const app = express()
    app.use(express.json())
    app.use(router)
    const server = app.listen(0)
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const login = await fetch(`${base}/api/login/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'admin', password: 'aaaaaaaa' })
      })
      assert.strictEqual(login.status, 200)
      const cookie = login.headers.get('set-cookie').split(';')[0]

      const get1 = await fetch(`${base}/api/registration-token`, {
        headers: { Cookie: cookie }
      })
      assert.strictEqual(get1.status, 200)
      const body1 = await get1.json()
      assert.strictEqual(typeof body1.token, 'string')
      assert.ok(body1.token.length > 0)
      assert.strictEqual(body1.managedByEnv, false)

      const put = await fetch(`${base}/api/registration-token`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ token: 'brand-new-token' })
      })
      assert.strictEqual(put.status, 200)
      const putBody = await put.json()
      assert.strictEqual(putBody.success, true)
      assert.strictEqual(putBody.token, 'brand-new-token')

      const get2 = await fetch(`${base}/api/registration-token`, {
        headers: { Cookie: cookie }
      })
      assert.strictEqual(get2.status, 200)
      const body2 = await get2.json()
      assert.strictEqual(body2.token, 'brand-new-token')
    } finally {
      server.close()
    }
  })

  it('rejects empty registration tokens', async () => {
    const express = (await import('express')).default
    const { createBrowserRouter } = await import('../browser-routes.mjs')

    const router = createBrowserRouter({}, { adminUser: 'admin', adminPassword: 'aaaaaaaa' })
    const app = express()
    app.use(express.json())
    app.use(router)
    const server = app.listen(0)
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const login = await fetch(`${base}/api/login/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'admin', password: 'aaaaaaaa' })
      })
      assert.strictEqual(login.status, 200)
      const cookie = login.headers.get('set-cookie').split(';')[0]

      const put = await fetch(`${base}/api/registration-token`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ token: '   ' })
      })
      assert.strictEqual(put.status, 400)
    } finally {
      server.close()
    }
  })
})
