import { Router } from 'express'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listInfoPages, readInfoPage } from './info-store.mjs'

const dataDir = process.env.DATA_DIR || '/app/data'
const agentsFile = join(dataDir, 'AGENTS.md')

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
    if (req.params.name === 'agents.md') {
      try {
        const content = await readFile(agentsFile, 'utf8')
        return res.type('text/markdown').send(content)
      } catch {
        return res.status(404).json({ error: 'Page not found' })
      }
    }
    const page = await readInfoPage(req.params.name)
    if (!page) {
      return res.status(404).json({ error: 'Page not found' })
    }
    res.type('text/markdown').send(page.content)
  })

  return router
}
