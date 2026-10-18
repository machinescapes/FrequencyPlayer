const CACHE='frequency-shell-v__BUILD_VERSION__'
const CORE=['./','./styles.css','./catalogue.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./offline-assets.json']
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE)
  const response=await fetch('./offline-assets.json',{cache:'no-store'})
  if(!response.ok)throw new Error(`Offline asset manifest returned ${response.status}`)
  const assets=await response.json()
  if(!Array.isArray(assets)||assets.some(asset=>typeof asset!=='string'))throw new Error('Offline asset manifest is invalid')
  await cache.addAll([...new Set([...CORE,...assets])])
})()))
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('frequency-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()))
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()})
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url)
  if(event.request.method!=='GET'||url.origin!==self.location.origin||['audio','video'].includes(event.request.destination)||event.request.headers.has('Range'))return
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./')));return}
  if(CORE.some(path=>url.pathname.endsWith(path.replace('./','')))||(url.pathname.includes('/assets/')&&url.pathname.endsWith('.js')))event.respondWith((async()=>{
    const cache=await caches.open(CACHE)
    try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response}catch{return await cache.match(event.request)??new Response('Unavailable offline',{status:503})}
  })())
})
