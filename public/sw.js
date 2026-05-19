const CACHE = 'vstays-shell-v1'
const ASSETS = ['/']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
})
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api') || e.request.url.includes('supabase')) return
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
})
