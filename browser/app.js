const app = document.getElementById('app')

const state = {
  user: null,
  sources: [],
  search: '',
  source: ''
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

const formatDate = (iso) => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

const importanceClass = (value) => {
  if (value >= 9) return 'imp-max'
  if (value >= 7) return 'imp-high'
  if (value >= 4) return 'imp-med'
  return 'imp-low'
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

const openMemoryModal = (memory = null, onSaved = null) => {
  const contentInput = el('textarea', { class: 'input', rows: 4, placeholder: 'Memory content', required: true })
  contentInput.value = memory ? memory.content : ''
  const importanceInput = el('input', { class: 'input', type: 'number', min: 1, max: 10, step: 1, required: true })
  importanceInput.value = memory ? memory.importance : 5
  const tagsInput = el('input', { class: 'input', type: 'text', placeholder: 'Comma-separated tags' })
  tagsInput.value = memory && memory.tags ? memory.tags.join(', ') : ''
  const sourceInput = el('input', { class: 'input', type: 'text', placeholder: 'e.g. chat, notes' })
  sourceInput.value = memory && memory.source ? memory.source : ''
  const error = el('div', { class: 'message error', hidden: true })
  const submit = el('button', { class: 'btn primary', type: 'submit' }, memory ? 'Save changes' : 'Create memory')
  const cancel = el('button', { class: 'btn', type: 'button' }, 'Cancel')

  const field = (label, control) => el('div', {}, [
    el('label', {}, label),
    control
  ])

  const form = el('form', { class: 'card modal' }, [
    el('h2', { class: 'modal-title' }, memory ? 'Edit memory' : 'New memory'),
    field('Content', contentInput),
    field('Importance (1-10)', importanceInput),
    field('Tags', tagsInput),
    field('Source', sourceInput),
    error,
    el('div', { class: 'modal-actions' }, [cancel, submit])
  ])

  const close = () => overlay.remove()
  cancel.addEventListener('click', close)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    error.hidden = true
    submit.disabled = true
    const importance = Number.parseInt(importanceInput.value, 10)
    const body = {
      content: contentInput.value.trim(),
      importance: Number.isNaN(importance) ? 5 : Math.min(10, Math.max(1, importance)),
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
    return el('article', { class: 'card memory-card' }, [
      el('div', { class: 'card-head' }, [
        el('span', { class: `badge ${importanceClass(memory.importance)}` }, `Importance ${memory.importance}`),
        memory.source ? el('span', { class: 'source' }, memory.source) : null
      ]),
      el('p', { class: 'memory-content' }, memory.content || memory.name),
      memory.tags && memory.tags.length > 0
        ? el('div', { class: 'chips' }, memory.tags.map(tag => el('span', { class: 'chip' }, tag)))
        : null,
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
    isSuperuser
      ? el('button', {
          class: 'btn small primary',
          type: 'button',
          onclick: () => openMemoryModal(null, loadMemories)
        }, 'New memory')
      : null,
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
    el('main', { class: 'page' }, [status, grid])
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

  const topbar = el('header', { class: 'topbar' }, [
    el('span', { class: 'brand' }, 'S19y Memory'),
    el('span', { class: 'spacer' }),
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
      tokenError
    ])
  ]))

  loadUsers()
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
  if (hash === '#/login' || hash === '#/register') {
    navigate('#/memories')
    return
  }
  renderMemories()
}

const boot = async () => {
  try {
    const data = await api('/api/session')
    state.user = data.user
  } catch {
    state.user = null
  }
  window.addEventListener('hashchange', route)
  route()
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
