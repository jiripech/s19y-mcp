const CACHE_NAME = 's19y-browser-__BUILD_TAG__'
const APP_PREFIX = '/browser.app/'
const PRECACHE_URLS = [
  '/browser.app/',
  '/browser.app/index.html',
  '/browser.app/style.css',
  '/browser.app/app.js',
  '/browser.app/manifest.json',
  '/browser.app/icon.svg'
]
const STATIC_ASSETS = [
  '/browser.app/style.css',
  '/browser.app/app.js',
  '/browser.app/manifest.json',
  '/browser.app/icon.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith(`${APP_PREFIX}api/`)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(`${APP_PREFIX}index.html`, copy))
          return response
        })
        .catch(() => caches.match(`${APP_PREFIX}index.html`))
    )
    return
  }

  if (request.method === 'GET' && STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
  }
})
