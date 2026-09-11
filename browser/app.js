const app = document.getElementById('app')

const state = {
  user: null,
  sources: [],
  search: '',
  source: '',
  infoPage: null,
  llm: 'unknown'
}

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value)
    } else {
      node.setAttribute(key, value === true ? '' : value)
    }
  }
  for (const child of [children].flat()) {
    if (child === null || child === undefined || child === false) continue
    node.append(child instanceof Node ? child : document.createTextNode(String(child)))
  }
  return node
}

const render = (node) => {
  app.replaceChildren(node)
}

const fontControls = () => el('span', { class: 'font-controls' }, [
  el('button', {
    class: 'btn small',
    type: 'button',
    title: 'Decrease font size',
    onclick: () => adjustFontScale(-1)
  }, 'A−'),
  el('button', {
    class: 'btn small',
    type: 'button',
    title: 'Increase font size',
    onclick: () => adjustFontScale(1)
  }, 'A+')
])

const LLM_MESSAGES = {
  disabled: ['info', 'Memory compression is disabled.'],
  downloading: ['warn', 'Language model downloading… Compression will work after it finishes.'],
  starting: ['warn', 'Language model starting… Compression will work in a moment.'],
  'error-download': ['warn', 'Language model download failed. Compression will keep retrying.'],
  'error-start': ['warn', 'Language model failed to start. Compression will keep retrying.'],
  fatal: ['error', 'Startup failed.']
}

const llmBanner = () => {
  const kind = LLM_MESSAGES[state.llm]
  if (!kind) return null
  const [tone, text] = kind
  return el('div', { class: `message ${tone}`, 'data-role': 'llm-banner' }, text)
}

const api = async (path, opts = {}) => {
  const res = await fetch(`/browser.app${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  return data
}

const b64urlToBytes = (str) => {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

const bytesToB64url = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let raw = ''
  for (const byte of bytes) raw += String.fromCharCode(byte)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const debounce = (fn, delay) => {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

const navigate = (hash) => {
  if (location.hash === hash) {
    route()
  } else {
    location.hash = hash
  }
}

const FONT_SCALE_KEY = 's19y.fontScale'

const loadFontScale = () => {
  try {
    return Math.max(-1, Math.min(2, Number(localStorage.getItem(FONT_SCALE_KEY)) || 0))
  } catch {
    return 0
  }
}

const applyFontScale = (scale = loadFontScale()) => {
  const clamped = Math.max(-1, Math.min(2, scale))
  try {
    localStorage.setItem(FONT_SCALE_KEY, String(clamped))
  } catch {
  }
  if (clamped === 0) {
    document.documentElement.removeAttribute('data-font-scale')
  } else {
    document.documentElement.setAttribute('data-font-scale', String(clamped))
  }
}

const adjustFontScale = (delta) => {
  applyFontScale(loadFontScale() + delta)
}

const formatDate = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const priorityClass = (value) => {
  if (value >= 90) return 'imp-critical'
  if (value >= 67) return 'imp-high'
  if (value >= 33) return 'imp-mid'
  return 'imp-low'
}

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
  }
  const area = el('textarea', { readOnly: true })
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  let copied = true
  try {
    document.execCommand('copy')
  } catch {
    copied = false
  }
  area.remove()
  return copied
}

const isSafeUrl = (url) => {
  const decoded = url.replace(/&amp;/g, '&')
  if (/^https?:\/\//i.test(decoded)) return true
  if (/^(\/|\.{1,2}\/|#)/.test(decoded)) return true
  return !/^[a-z][a-z0-9+.-]*:/i.test(decoded)
}

const inlineMarkdown = (text) => {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    if (!isSafeUrl(url)) return label
    const external = /^https?:\/\//i.test(url.replace(/&amp;/g, '&'))
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
    return `<a href="${url}"${attrs}>${label}</a>`
  })
  return html
}

const mdNode = (tag, text) => {
  const node = el(tag, {})
  node.innerHTML = inlineMarkdown(text)
  return node
}

const renderMarkdown = (text) => {
  const container = el('div', { class: 'md' })
  const lines = String(text || '').split(/\r?\n/)
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (/^```/.test(line)) {
      index++
      const code = []
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index])
        index++
      }
      index++
      const codeNode = el('code', {})
      codeNode.innerHTML = escapeHtml(code.join('\n'))
      container.append(el('pre', {}, codeNode))
      continue
    }
    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)[0].length
      container.append(mdNode(`h${level}`, line.replace(/^#{1,3}\s+/, '')))
      index++
      continue
    }
    if (/^-\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line)
      const itemPattern = ordered ? /^\d+\.\s+/ : /^-\s+/
      const list = el(ordered ? 'ol' : 'ul', {})
      while (index < lines.length && itemPattern.test(lines[index])) {
        list.append(mdNode('li', lines[index].replace(/^(-|\d+\.)\s+/, '')))
        index++
      }
      container.append(list)
      continue
    }
    if (/^\s*\|.*\|\s*$/.test(line) &&
        index + 1 < lines.length &&
        /^\s*\|[\s|:-]+\|\s*$/.test(lines[index + 1])) {
      const header = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
      const align = lines[index + 1].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
      if (align.every(cell => /^:?-+:?\s*$/.test(cell))) {
        index += 2
        const tbody = el('tbody', {})
        while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
          const cells = lines[index].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
          const row = el('tr', {})
          for (let cell = 0; cell < header.length; cell++) {
            row.append(mdNode('td', cells[cell] ?? ''))
          }
          tbody.append(row)
          index++
        }
        const headRow = el('tr', {})
        for (const cell of header) {
          headRow.append(mdNode('th', cell))
        }
        const table = el('table', {})
        table.append(el('thead', {}, headRow), tbody)
        container.append(table)
        continue
      }
    }
    if (line.trim() === '') {
      index++
      continue
    }
    const paragraph = [line]
    index++
    while (index < lines.length && lines[index].trim() !== '' && !/^(```|#{1,3}\s|-\s|\d+\.\s)/.test(lines[index])) {
      paragraph.push(lines[index])
      index++
    }
    container.append(mdNode('p', paragraph.join(' ')))
  }
  return container
}

const SECURE_CONTEXT_HINT = 'Passkeys require a secure context (HTTPS or localhost). ' +
  'This page was loaded over an insecure origin, so the browser blocks WebAuthn. ' +
  'Serve the memory browser via HTTPS or access it through localhost. ' +
  'If the server was started with ADMIN_USER, you can sign in with that ' +
  'username and the generated password from the server logs instead.'

const assertWebAuthnAvailable = () => {
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
    throw new Error(SECURE_CONTEXT_HINT)
  }
}

const startAuthentication = async (options) => {
  assertWebAuthnAvailable()
  const publicKey = {
    challenge: b64urlToBytes(options.challenge),
    rpId: options.rpId,
    userVerification: options.userVerification || 'preferred'
  }
  if (options.allowCredentials && options.allowCredentials.length > 0) {
    publicKey.allowCredentials = options.allowCredentials.map(cred => ({
      id: b64urlToBytes(cred.id),
      type: 'public-key',
      transports: cred.transports
    }))
  }
  const credential = await navigator.credentials.get({ publicKey })
  return {
    id: credential.id,
    rawId: bytesToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToB64url(credential.response.clientDataJSON),
      authenticatorData: bytesToB64url(credential.response.authenticatorData),
      signature: bytesToB64url(credential.response.signature),
      userHandle: credential.response.userHandle ? bytesToB64url(credential.response.userHandle) : null
    }
  }
}

const startRegistration = async (options, fallbackUserId, fallbackName) => {
  assertWebAuthnAvailable()
  const publicKey = {
    challenge: b64urlToBytes(options.challenge),
    rp: options.rp,
    user: {
      id: b64urlToBytes(options.user?.id || fallbackUserId),
      name: options.user?.name || fallbackName,
      displayName: options.user?.displayName || options.user?.name || fallbackName
    },
    pubKeyCredParams: options.pubKeyCredParams || [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 }
    ],
    authenticatorSelection: options.authenticatorSelection || {
      residentKey: 'preferred',
      userVerification: 'preferred'
    },
    attestation: options.attestation || 'none'
  }
  if (options.excludeCredentials && options.excludeCredentials.length > 0) {
    publicKey.excludeCredentials = options.excludeCredentials.map(cred => ({
      id: b64urlToBytes(cred.id),
      type: 'public-key',
      transports: cred.transports
    }))
  }
  const credential = await navigator.credentials.create({ publicKey })
  return {
    id: credential.id,
    rawId: bytesToB64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bytesToB64url(credential.response.clientDataJSON),
      attestationObject: bytesToB64url(credential.response.attestationObject)
    }
  }
}

const logout = async () => {
  try {
    await api('/api/logout', { method: 'POST', body: '{}' })
  } catch {
  }
  state.user = null
  navigate('#/login')
}

const modalField = (label, control) => el('div', {}, [
  el('label', {}, label),
  control
])

const openMemoryModal = (memory = null, onSaved = null) => {
  const contentInput = el('textarea', { class: 'input', rows: 4, placeholder: 'Memory content', required: true })
  contentInput.value = memory ? memory.content : ''
  const priorityInput = el('input', { class: 'input', type: 'number', min: 0, max: 100, step: 1, required: true })
  priorityInput.value = memory ? memory.priority ?? 50 : 50
  const tagsInput = el('input', { class: 'input', type: 'text', placeholder: 'Comma-separated tags' })
  tagsInput.value = memory && memory.tags ? memory.tags.join(', ') : ''
  const sourceInput = el('input', { class: 'input', type: 'text', placeholder: 'e.g. chat, notes' })
  sourceInput.value = memory && memory.source ? memory.source : ''
  const error = el('div', { class: 'message error', hidden: true })
  const submit = el('button', { class: 'btn primary', type: 'submit' }, memory ? 'Save changes' : 'Create memory')
  const cancel = el('button', { class: 'btn', type: 'button' }, 'Cancel')

  const form = el('form', { class: 'card modal' }, [
    el('h2', { class: 'modal-title' }, memory ? 'Edit memory' : 'New memory'),
    modalField('Content', contentInput),
    modalField('Priority (0-100)', priorityInput),
    modalField('Tags', tagsInput),
    modalField('Source', sourceInput),
    error,
    el('div', { class: 'modal-actions' }, [cancel, submit])
  ])

  const close = () => overlay.remove()
  cancel.addEventListener('click', close)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    error.hidden = true
    submit.disabled = true
    const priority = Number.parseInt(priorityInput.value, 10)
    const body = {
      content: contentInput.value.trim(),
      priority: Number.isNaN(priority) ? 50 : Math.min(100, Math.max(0, priority)),
      tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean),
      source: sourceInput.value.trim()
    }
    try {
      if (memory) {
        await api(`/api/memories/${encodeURIComponent(memory.name)}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await api('/api/memories', { method: 'POST', body: JSON.stringify(body) })
      }
      close()
      if (onSaved) onSaved()
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
      submit.disabled = false
    }
  })

  const overlay = el('div', { class: 'modal-overlay' }, form)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })
  document.body.append(overlay)
  contentInput.focus()
}

const deleteMemory = async (name, onDeleted = null) => {
  if (!confirm('Delete this memory?')) return
  try {
    await api(`/api/memories/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (onDeleted) onDeleted()
  } catch (err) {
    alert(err.message)
  }
}

const openInfoModal = async (page = null, onSaved = null) => {
  let initialContent = ''
  let loadError = null
  if (page) {
    try {
      const data = await api(`/api/info/${encodeURIComponent(page.name)}`)
      initialContent = data.content
    } catch (err) {
      loadError = err.message
    }
  }
  const nameInput = el('input', { class: 'input', type: 'text', placeholder: 'e.g. usage-guide', required: true })
  nameInput.value = page ? page.name : ''
  if (page) nameInput.disabled = true
  const contentInput = el('textarea', { class: 'input', rows: 12, placeholder: 'Markdown content', required: true })
  contentInput.value = initialContent
  const error = el('div', { class: 'message error', hidden: true })
  if (loadError) {
    error.textContent = loadError
    error.hidden = false
  }
  const submit = el('button', { class: 'btn primary', type: 'submit' }, page ? 'Save changes' : 'Create page')
  const cancel = el('button', { class: 'btn', type: 'button' }, 'Cancel')

  const form = el('form', { class: 'card modal' }, [
    el('h2', { class: 'modal-title' }, page ? 'Edit info page' : 'New info page'),
    modalField('Name', nameInput),
    modalField('Content (markdown)', contentInput),
    error,
    el('div', { class: 'modal-actions' }, [cancel, submit])
  ])

  const close = () => overlay.remove()
  cancel.addEventListener('click', close)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    error.hidden = true
    submit.disabled = true
    try {
      if (page) {
        await api(`/api/info/${encodeURIComponent(page.name)}`, { method: 'PUT', body: JSON.stringify({ content: contentInput.value }) })
      } else {
        await api('/api/info', { method: 'POST', body: JSON.stringify({ name: nameInput.value.trim(), content: contentInput.value }) })
      }
      close()
      if (onSaved) onSaved()
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
      submit.disabled = false
    }
  })

  const overlay = el('div', { class: 'modal-overlay' }, form)
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })
  document.body.append(overlay)
  contentInput.focus()
}

const deleteInfoPage = async (name, onDeleted = null) => {
  if (!confirm(`Delete info page "${name}"?`)) return
  try {
    await api(`/api/info/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (onDeleted) onDeleted()
  } catch (err) {
    alert(err.message)
  }
}

const renderLogin = () => {
  const nameInput = el('input', {
    class: 'input',
    type: 'text',
    name: 'name',
    placeholder: 'Username',
    autocomplete: 'username webauthn',
    required: true
  })
  const passwordInput = el('input', {
    class: 'input',
    type: 'password',
    name: 'password',
    placeholder: 'Password (optional)',
    autocomplete: 'current-password'
  })
  const error = el('div', { class: 'message error', hidden: true })
  const submit = el('button', { class: 'btn primary', type: 'submit' }, 'Sign in')

  const warnings = []
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
    warnings.push(el('div', { class: 'message warn' }, SECURE_CONTEXT_HINT))
  }

  const form = el('form', { class: 'card auth-card' }, [
    el('h1', { class: 'title' }, 'S19y Memory'),
    el('p', { class: 'subtitle' }, 'Sign in with your passkey or password'),
    llmBanner(),
    nameInput,
    passwordInput,
    ...warnings,
    error,
    submit,
    el('p', { class: 'alt-link' }, ['No account yet? ', el('a', { href: '#/register' }, 'Register')])
  ])

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    error.hidden = true
    submit.disabled = true
    try {
      const begin = await api('/api/login/begin', {
        method: 'POST',
        body: JSON.stringify({
          name: nameInput.value.trim(),
          password: passwordInput.value || undefined
        })
      })
      if (begin.passwordLogin) {
        state.user = begin.user
        navigate('#/memories')
        return
      }
      const assertion = await startAuthentication(begin.options)
      const finish = await api('/api/login/finish', {
        method: 'POST',
        body: JSON.stringify({ userId: begin.userId, response: assertion })
      })
      state.user = finish.user
      navigate('#/memories')
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
    } finally {
      submit.disabled = false
    }
  })

  render(el('div', { class: 'auth-wrap' }, form))
}

const renderRegister = () => {
  const nameInput = el('input', {
    class: 'input',
    type: 'text',
    name: 'name',
    placeholder: 'Username',
    autocomplete: 'username',
    required: true
  })
  const tokenInput = el('input', {
    class: 'input',
    type: 'text',
    name: 'token',
    placeholder: 'Registration token',
    autocomplete: 'off'
  })
  const error = el('div', { class: 'message error', hidden: true })
  const submit = el('button', { class: 'btn primary', type: 'submit' }, 'Create passkey')

  const warnings = []
  if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
    warnings.push(el('div', { class: 'message warn' }, SECURE_CONTEXT_HINT))
  }

  const form = el('form', { class: 'card auth-card' }, [
    el('h1', { class: 'title' }, 'S19y Memory'),
    el('p', { class: 'subtitle' }, 'Create an account with a passkey'),
    llmBanner(),
    nameInput,
    tokenInput,
    el('p', { class: 'hint' }, 'Token is required unless you are the first user.'),
    ...warnings,
    error,
    submit,
    el('p', { class: 'alt-link' }, ['Already registered? ', el('a', { href: '#/login' }, 'Sign in')])
  ])

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    error.hidden = true
    submit.disabled = true
    try {
      const begin = await api('/api/register/begin', {
        method: 'POST',
        body: JSON.stringify({
          name: nameInput.value.trim(),
          token: tokenInput.value.trim() || undefined
        })
      })
      const attestation = await startRegistration(begin.options, begin.userId, nameInput.value.trim())
      const finish = await api('/api/register/finish', {
        method: 'POST',
        body: JSON.stringify({ userId: begin.userId, response: attestation })
      })
      state.user = finish.user
      navigate('#/memories')
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
    } finally {
      submit.disabled = false
    }
  })

  render(el('div', { class: 'auth-wrap' }, form))
}

const renderMemories = () => {
  let requestSeq = 0

  const status = el('div', { class: 'message error', hidden: true })
  const grid = el('div', { class: 'grid' })
  const searchInput = el('input', { class: 'input search', type: 'search', placeholder: 'Search memories…' })
  const sourceSelect = el('select', { class: 'input select' })
  const isSuperuser = state.user?.role === 'superuser'

  const rebuildSourceOptions = () => {
    const selected = state.source
    sourceSelect.replaceChildren(
      el('option', { value: '' }, 'All sources'),
      ...state.sources.map(source => el('option', { value: source }, source))
    )
    sourceSelect.value = selected
    if (sourceSelect.value !== selected) {
      state.source = ''
      sourceSelect.value = ''
    }
  }

  const loadSources = async () => {
    try {
      const data = await api('/api/memories')
      state.sources = [...new Set(data.memories.map(m => m.source).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
      rebuildSourceOptions()
    } catch {
    }
  }

  const memoryCard = (memory) => {
    const priority = memory.priority ?? 50
    const chips = [
      ...(memory.tags || []).map(tag => el('span', { class: 'chip' }, tag)),
      memory.u && memory.u !== 'Unclaimed' ? el('span', { class: 'chip' }, memory.u) : null,
      memory.p && memory.p !== 'Unclaimed' ? el('span', { class: 'chip' }, memory.p) : null
    ].filter(Boolean)
    const idBadge = el('button', {
      class: 'badge id-badge',
      type: 'button',
      title: `Copy ID: ${memory.name}`,
      onclick: async (event) => {
        event.stopPropagation()
        const badge = event.currentTarget
        if (await copyText(memory.name)) {
          badge.textContent = 'Copied'
          badge.classList.add('copied')
          setTimeout(() => {
            badge.textContent = memory.name
            badge.classList.remove('copied')
          }, 1200)
        }
      }
    }, memory.name)
    return el('article', { class: 'card memory-card' }, [
      el('div', { class: 'card-head' }, [
        el('div', { class: 'card-head-start' }, [
          idBadge,
          memory.exp != null && memory.exp * 1000 < Date.now()
            ? el('span', { class: 'badge imp-critical' }, 'Expired')
            : null
        ]),
        el('div', { class: 'card-head-end' }, [
          el('span', { class: `badge ${priorityClass(priority)}` }, `Priority ${priority}`),
          memory.source ? el('span', { class: 'source' }, memory.source) : null
        ])
      ]),
      el('p', { class: 'memory-content' }, memory.content || memory.name),
      chips.length > 0 ? el('div', { class: 'chips' }, chips) : null,
      isSuperuser && !memory.system
        ? el('div', { class: 'card-actions' }, [
            el('button', {
              class: 'btn small',
              type: 'button',
              onclick: () => openMemoryModal(memory, loadMemories)
            }, 'Edit'),
            el('button', {
              class: 'btn small danger',
              type: 'button',
              onclick: () => deleteMemory(memory.name, loadMemories)
            }, 'Delete')
          ])
        : null
    ])
  }

  const loadMemories = async () => {
    const seq = ++requestSeq
    const params = new URLSearchParams()
    if (state.source) params.set('source', state.source)
    if (state.search) params.set('search', state.search)
    const query = params.toString()
    try {
      const data = await api('/api/memories' + (query ? `?${query}` : ''))
      if (seq !== requestSeq) return
      status.hidden = true
      grid.replaceChildren()
      if (data.memories.length === 0) {
        grid.append(el('div', { class: 'empty' }, state.search || state.source ? 'No matches' : 'No memories yet'))
        return
      }
      for (const memory of data.memories) grid.append(memoryCard(memory))
    } catch (err) {
      if (seq !== requestSeq) return
      grid.replaceChildren()
      status.textContent = err.message
      status.hidden = false
    }
  }

  const debouncedSearch = debounce(loadMemories, 300)

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim()
    debouncedSearch()
  })

  sourceSelect.addEventListener('change', () => {
    state.source = sourceSelect.value
    loadMemories()
  })

  const topbar = el('header', { class: 'topbar' }, [
    el('span', { class: 'brand' }, 'S19y Memory'),
    searchInput,
    sourceSelect,
    el('span', { class: 'spacer' }),
    fontControls(),
    isSuperuser
      ? el('button', {
          class: 'btn small primary',
          type: 'button',
          onclick: () => openMemoryModal(null, loadMemories)
        }, 'New memory')
      : null,
    el('a', { class: 'btn small', href: '#/info' }, 'Info'),
    isSuperuser ? el('a', { class: 'btn small', href: '#/admin' }, 'Admin') : null,
    el('span', { class: 'user-badge' }, [
      el('span', { class: 'user-badge-name' }, state.user.name),
      el('span', { class: 'user-badge-role' }, state.user.role)
    ]),
    el('button', { class: 'btn small', type: 'button', onclick: logout }, 'Logout')
  ])

  searchInput.value = state.search
  rebuildSourceOptions()
  grid.append(el('div', { class: 'empty' }, 'Loading…'))

  render(el('div', { class: 'page-shell' }, [
    topbar,
    el('main', { class: 'page' }, [llmBanner(), status, grid])
  ]))

  loadSources()
  loadMemories()
}

const renderAdmin = () => {
  const status = el('div', { class: 'message error', hidden: true })
  const userList = el('div', { class: 'user-list' })

  const loadUsers = async () => {
    try {
      const data = await api('/api/users')
      status.hidden = true
      userList.replaceChildren()
      if (data.users.length === 0) {
        userList.append(el('div', { class: 'empty' }, 'No users'))
        return
      }
      for (const user of data.users) {
        userList.append(el('div', { class: 'card user-row' }, [
          el('div', {}, [
            el('span', { class: 'user-name' }, user.name),
            el('span', { class: 'user-meta' }, `${user.role} · joined ${formatDate(user.createdAt)}`)
          ]),
          user.id !== state.user.id
            ? el('button', {
                class: 'btn small danger',
                type: 'button',
                onclick: () => deleteUser(user)
              }, 'Delete')
            : null
        ]))
      }
    } catch (err) {
      status.textContent = err.message
      status.hidden = false
    }
  }

  const deleteUser = async (user) => {
    if (user.id === state.user.id) return
    if (!confirm(`Delete user "${user.name}"?`)) return
    try {
      await api('/api/users', { method: 'DELETE', body: JSON.stringify({ userId: user.id }) })
      await loadUsers()
    } catch (err) {
      status.textContent = err.message
      status.hidden = false
    }
  }

  const tokenInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'New registration token',
    autocomplete: 'off',
    required: true
  })
  const tokenOk = el('div', { class: 'message success', hidden: true })
  const tokenError = el('div', { class: 'message error', hidden: true })

  const tokenForm = el('form', { class: 'token-row' }, [
    tokenInput,
    el('button', { class: 'btn primary', type: 'submit' }, 'Save token')
  ])

  tokenForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    tokenOk.hidden = true
    tokenError.hidden = true
    try {
      await api('/api/registration-token', {
        method: 'PUT',
        body: JSON.stringify({ token: tokenInput.value.trim() })
      })
      tokenOk.textContent = 'Registration token updated'
      tokenOk.hidden = false
      tokenInput.value = ''
    } catch (err) {
      tokenError.textContent = err.message
      tokenError.hidden = false
    }
  })

  const infoList = el('div', { class: 'user-list' })

  const loadInfoPages = async () => {
    try {
      const data = await api('/api/info')
      status.hidden = true
      infoList.replaceChildren()
      if (data.pages.length === 0) {
        infoList.append(el('div', { class: 'empty' }, 'No info pages'))
        return
      }
      for (const page of data.pages) {
        infoList.append(el('div', { class: 'card user-row' }, [
          el('div', {}, [
            el('span', { class: 'user-name' }, page.name),
            el('span', { class: 'user-meta' }, `${formatBytes(page.size)} · updated ${formatDate(page.updatedAt)}`)
          ]),
          el('div', { class: 'card-actions' }, [
            el('button', {
              class: 'btn small',
              type: 'button',
              onclick: () => {
                state.infoPage = page.name
                navigate('#/info')
              }
            }, 'Open'),
            el('button', {
              class: 'btn small',
              type: 'button',
              onclick: () => openInfoModal(page, loadInfoPages)
            }, 'Edit'),
            el('button', {
              class: 'btn small danger',
              type: 'button',
              onclick: () => deleteInfoPage(page.name, loadInfoPages)
            }, 'Delete')
          ])
        ]))
      }
    } catch (err) {
      status.textContent = err.message
      status.hidden = false
    }
  }

  const topbar = el('header', { class: 'topbar' }, [
    el('span', { class: 'brand' }, 'S19y Memory'),
    el('span', { class: 'spacer' }),
    fontControls(),
    el('a', { class: 'btn small', href: '#/memories' }, 'Back to memories'),
    el('span', { class: 'user-badge' }, [
      el('span', { class: 'user-badge-name' }, state.user.name),
      el('span', { class: 'user-badge-role' }, state.user.role)
    ]),
    el('button', { class: 'btn small', type: 'button', onclick: logout }, 'Logout')
  ])

  render(el('div', { class: 'page-shell' }, [
    topbar,
    el('main', { class: 'page' }, [
      status,
      el('h2', { class: 'section-title' }, 'Users'),
      userList,
      el('h2', { class: 'section-title' }, 'Registration token'),
      el('p', { class: 'hint' }, 'New users need this token to register, unless the first account is being created.'),
      tokenForm,
      tokenOk,
      tokenError,
      el('h2', { class: 'section-title' }, 'Info pages'),
      el('p', { class: 'hint' }, 'Markdown pages every signed-in user can read under Info.'),
      infoList
    ])
  ]))

  loadUsers()
  loadInfoPages()
}

const renderInfo = () => {
  const isSuperuser = state.user?.role === 'superuser'
  const status = el('div', { class: 'message error', hidden: true })
  const pageList = el('div', { class: 'info-list' })
  const pageView = el('article', { class: 'card info-view' })
  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'Search pages…' })

  let pages = []
  let contents = {}
  let selected = state.infoPage
  let mode = 'preview'
  state.infoPage = null

  const renderView = () => {
    pageView.replaceChildren()
    if (!selected) {
      pageView.append(el('div', { class: 'empty' }, 'No info pages'))
      return
    }
    pageView.append(el('div', { class: 'info-head' }, [
      el('h2', { class: 'info-title' }, selected),
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'btn small',
          type: 'button',
          onclick: () => {
            mode = mode === 'source' ? 'preview' : 'source'
            renderView()
          }
        }, mode === 'source' ? 'Preview' : 'Source'),
        ...(isSuperuser ? [
          el('button', {
            class: 'btn small',
            type: 'button',
            onclick: () => openInfoModal({ name: selected }, loadPages)
          }, 'Edit'),
          el('button', {
            class: 'btn small danger',
            type: 'button',
            onclick: () => deleteInfoPage(selected, loadPages)
          }, 'Delete')
        ] : [])
      ])
    ]))
    if (mode === 'source') {
      pageView.append(el('pre', { class: 'md-source' }, contents[selected] || ''))
    } else {
      pageView.append(renderMarkdown(contents[selected] || ''))
    }
  }

  const renderList = () => {
    const query = searchInput.value.trim().toLowerCase()
    pageList.replaceChildren()
    const filtered = query
      ? pages.filter(page => page.name.toLowerCase().includes(query) || String(contents[page.name] || '').toLowerCase().includes(query))
      : pages
    if (filtered.length === 0) {
      pageList.append(el('div', { class: 'empty' }, query ? 'No matches' : 'No info pages'))
      return
    }
    for (const page of filtered) {
      pageList.append(el('button', {
        class: page.name === selected ? 'info-item active' : 'info-item',
        type: 'button',
        onclick: () => {
          selected = page.name
          renderList()
          renderView()
        }
      }, [
        el('span', { class: 'info-item-name' }, page.name),
        el('span', { class: 'info-item-meta' }, `${formatBytes(page.size)} · updated ${formatDate(page.updatedAt)}`)
      ]))
    }
  }

  const loadPages = async () => {
    try {
      const data = await api('/api/info')
      pages = data.pages
      contents = {}
      await Promise.all(pages.map(async (page) => {
        try {
          const pageData = await api(`/api/info/${encodeURIComponent(page.name)}`)
          contents[page.name] = pageData.content
        } catch {
          contents[page.name] = ''
        }
      }))
      if (!pages.some(page => page.name === selected)) {
        const preferred = pages.find(page => page.name === 'index') || pages[0]
        selected = preferred ? preferred.name : null
      }
      status.hidden = true
      renderList()
      renderView()
    } catch (err) {
      pageList.replaceChildren()
      pageView.replaceChildren()
      status.textContent = err.message
      status.hidden = false
    }
  }

  searchInput.addEventListener('input', () => renderList())

  const topbar = el('header', { class: 'topbar' }, [
    el('span', { class: 'brand' }, 'S19y Memory'),
    el('span', { class: 'spacer' }),
    fontControls(),
    isSuperuser
      ? el('button', {
          class: 'btn small primary',
          type: 'button',
          onclick: () => openInfoModal(null, loadPages)
        }, 'New page')
      : null,
    el('a', { class: 'btn small', href: '#/memories' }, 'Back to memories'),
    el('span', { class: 'user-badge' }, [
      el('span', { class: 'user-badge-name' }, state.user.name),
      el('span', { class: 'user-badge-role' }, state.user.role)
    ]),
    el('button', { class: 'btn small', type: 'button', onclick: logout }, 'Logout')
  ])

  pageList.append(el('div', { class: 'empty' }, 'Loading…'))
  pageView.append(el('div', { class: 'empty' }, 'Loading…'))

  render(el('div', { class: 'page-shell' }, [
    topbar,
    el('main', { class: 'page' }, [
      status,
      el('div', { class: 'info-layout' }, [
        el('aside', { class: 'info-side' }, [searchInput, pageList]),
        el('section', { class: 'info-main' }, pageView)
      ])
    ])
  ]))

  loadPages()
}

const route = () => {
  const hash = location.hash || '#/memories'
  if (!state.user) {
    if (hash === '#/register') {
      renderRegister()
    } else {
      renderLogin()
    }
    return
  }
  if (hash === '#/admin') {
    if (state.user.role === 'superuser') {
      renderAdmin()
    } else {
      navigate('#/memories')
    }
    return
  }
  if (hash === '#/info') {
    renderInfo()
    return
  }
  if (hash === '#/login' || hash === '#/register') {
    navigate('#/memories')
    return
  }
  renderMemories()
}

const loadLlmStatus = async () => {
  try {
    const data = await api('/api/status', { method: 'GET' })
    state.llm = data.llm || 'unknown'
  } catch {
    state.llm = 'unknown'
  }
}

const boot = async () => {
  applyFontScale()
  await loadLlmStatus()
  try {
    const data = await api('/api/session')
    state.user = data.user
  } catch {
    state.user = null
  }
  window.addEventListener('hashchange', () => {
    loadLlmStatus()
    route()
  })
  await route()
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {})
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    })
  }
}

boot()
