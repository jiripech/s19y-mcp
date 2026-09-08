import { describe, it } from 'node:test'
import assert from 'node:assert'

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
})
