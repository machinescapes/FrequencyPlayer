const CACHE='frequency-shell-v1'
const CORE=['/','/styles.css','/catalogue.json','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png']
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE)
  await cache.addAll(CORE)
  const response=await fetch('/offline-assets.json',{cache:'no-store'})
  if(!response.ok)throw Error('Cannot discover application assets')
  const queue=await response.json(),seen=new Set()
  // Remix compiles modules separately: cache the entire static ESM import graph.
  while(queue.length){const value=queue.shift();const url=new URL(value,self.location.origin);if(url.origin!==self.location.origin||seen.has(url.href))continue;seen.add(url.href)
    const res=await fetch(url);if(!res.ok)throw Error('Cannot cache '+url.pathname)
    await cache.put(url,res.clone())
    if(res.headers.get('content-type')?.includes('javascript')){const source=await res.text();for(const match of source.matchAll(/(?:from\s*|import\s*|import\s*\()\s*["']([^"']+)["']/g)){if(match[1].startsWith('.')||match[1].startsWith('/'))queue.push(new URL(match[1],url).href)}}
  }
})()))
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('frequency-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()))
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url)
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/')));return}
  if(CORE.includes(url.pathname)||url.pathname.startsWith('/assets/'))event.respondWith((async()=>{
    const cache=await caches.open(CACHE)
    try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response}catch{return await cache.match(event.request)??new Response('Unavailable offline',{status:503})}
  })())
})
