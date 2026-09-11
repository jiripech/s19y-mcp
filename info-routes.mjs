import { Router } from 'express'
import { listInfoPages, readInfoPage } from './info-store.mjs'

export function createInfoRouter(apiKey) {
  const router = Router()

  const auth = (req, res, next) => {
    const key = req.headers['x-api-key']
    if (!key || !apiKey || key !== apiKey) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API key' })
    }
    next()
  }

  router.get('/', auth, async (req, res) => {
    res.json({ pages: await listInfoPages() })
  })

  router.get('/:name', auth, async (req, res) => {
    const name = req.params.name.replace(/\.md$/, '')
    const page = await readInfoPage(name)
    if (!page) {
      return res.status(404).json({ error: 'Page not found' })
    }
    res.type('text/markdown').send(page.content)
  })

  return router
}