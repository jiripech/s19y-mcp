import { access, readFile } from 'node:fs/promises'
import { X509Certificate, createPrivateKey } from 'node:crypto'

const exists = async (path) => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Returns { cert, key } when both PEM files are readable, or null when TLS
// is not configured (no certificate files present). Gracefully falls back
// to plain HTTP when the default cert.pem / key.pem files are missing.
export async function loadTlsOptions(certPath, keyPath) {
  const cert = certPath ? await exists(certPath) : false
  const key = keyPath ? await exists(keyPath) : false

  if (!cert && !key) {
    return null
  }
  if (!cert || !key) {
    const missing = cert ? keyPath : certPath
    throw new Error(`TLS enabled requires both a certificate and a key, but ${missing} was not found`)
  }

  const [certPem, keyPem] = await Promise.all([
    readFile(certPath),
    readFile(keyPath)
  ])
  try {
    new X509Certificate(certPem)
    createPrivateKey(keyPem)
  } catch (err) {
    throw new Error(`TLS enabled requires valid PEM files, but ${certPath} or ${keyPath} could not be parsed: ${err.message}`)
  }
  return { cert: certPem, key: keyPem }
}