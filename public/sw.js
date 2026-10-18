const CACHE='frequency-shell-v__BUILD_VERSION__'
const CORE=['./','./styles.css','./assets/app.js','./catalogue.json','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png']
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE)
  await cache.addAll(CORE)
})()))
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('frequency-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()))
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()})
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url)
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./')));return}
  if(CORE.some(path=>url.pathname.endsWith(path.replace('./','')))||url.pathname.includes('/assets/'))event.respondWith((async()=>{
    const cache=await caches.open(CACHE)
    try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response}catch{return await cache.match(event.request)??new Response('Unavailable offline',{status:503})}
  })())
})
