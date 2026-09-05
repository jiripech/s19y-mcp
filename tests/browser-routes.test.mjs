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
})
