import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'

const ROOT = dirname(fileURLToPath(import.meta.url)) + '/..'
const TMP = join(ROOT, 'tmp', 'tls-test')
const CERT = join(ROOT, 'tmp', 'hq.lan+2.pem')
const KEY = join(ROOT, 'tmp', 'hq.lan+2-key.pem')

let mod

before(async () => {
  mod = await import('../tls-options.mjs')
  await mkdir(TMP, { recursive: true })
})

it('returns null when no certificate files exist', async () => {
  assert.strictEqual(await mod.loadTlsOptions(null, null), null)
  assert.strictEqual(
    await mod.loadTlsOptions(join(TMP, 'missing.pem'), join(TMP, 'missing-key.pem')),
    null
  )
})

it('throws when only one of the two is present', async () => {
  const onlyCert = join(TMP, 'only-cert.pem')
  await writeFile(onlyCert, 'stub')
  await assert.rejects(
    () => mod.loadTlsOptions(onlyCert, join(TMP, 'missing-key.pem')),
    /both a certificate and a key/
  )
})

it('loads a valid PEM pair from the repo examples', async () => {
  const certCopy = join(TMP, 'cert.pem')
  const keyCopy = join(TMP, 'key.pem')
  await copyFile(CERT, certCopy)
  await copyFile(KEY, keyCopy)
  const options = await mod.loadTlsOptions(certCopy, keyCopy)
  assert.ok(options)
  assert.ok(options.cert.toString().includes('BEGIN CERTIFICATE'))
  assert.ok(options.key.toString().includes('BEGIN PRIVATE KEY'))
})

it('throws a descriptive error when the PEM files are corrupt', async () => {
  const corruptCert = join(TMP, 'corrupt-cert.pem')
  const corruptKey = join(TMP, 'corrupt-key.pem')
  await writeFile(corruptCert, 'this is not a valid certificate')
  await writeFile(corruptKey, 'this is not a valid key')
  await assert.rejects(
    () => mod.loadTlsOptions(corruptCert, corruptKey),
    /could not be parsed/
  )
})