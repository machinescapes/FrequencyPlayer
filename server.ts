import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequestListener } from 'remix/node-fetch-server'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'
import { assets, scriptEntry } from './app/assets.ts'
const router = createRouter({middleware:[staticFiles('./public',{index:false})]})
router.get('/epg/freeview.json', async () => {
  try {
    return new Response(await readFile('./public/epg/freeview.json'), {headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return new Response(null, {status:204,headers:{'Cache-Control':'no-store'}})
  }
})
router.get('/assets/*', async ({request}) => (await assets.fetch(request)) ?? new Response('Asset not found', {status:404}))
type Entry = { scripts: { importMap: { imports?: Record<string,string> }; preloads: string[]; href: string }; title: string; noscript: string }
function page(entry: Entry) {
  // The entry module is already the script src; preloading it as well is
  // redundant and triggers Chrome's "preloaded but not used" warning.
  const preloads = entry.scripts.preloads.filter(href => href !== entry.scripts.href)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#101211"><meta name="color-scheme" content="dark"><meta name="mobile-web-app-capable" content="yes"><title>${entry.title}</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="stylesheet" href="/styles.css"><script type="importmap">${JSON.stringify(entry.scripts.importMap).replaceAll('<','\\u003c')}</script>${preloads.map((h: string)=>`<link rel="modulepreload" href="${h}">`).join('')}<script type="module" src="${entry.scripts.href}"></script></head><body><div id="app"></div><noscript>${entry.noscript}</noscript></body></html>`
}
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}
router.get('/', () => new Response(page({scripts:scriptEntry,title:'Frequency · Watch and listen',noscript:'Enable JavaScript to use the player.'}),{headers}))
// /tv was its own page; it is now the Watch scope of the one app.
router.get('/tv', () => Response.redirect('/?scope=watch&view=channels',302))
// The real guide is generated at deploy time (public/epg is gitignored). If a
// local run has produced one, staticFiles serves it first; otherwise fall back
// to a valid empty schedule so the client does not log a 404 on every load.
router.get('/epg/freeview.json', async () => {
  try { return new Response(await readFile('./public/epg/freeview.json'), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' } }) }
  catch { return emptySchedule() }
})
function emptySchedule() {
  const now = Date.now()
  return Response.json({
    version: 1,
    source: 'freeview',
    sourceUrl: 'https://www.freeview.co.uk/',
    revision: 'development',
    fetchedAt: now,
    coverageStart: now - 86400000,
    coverageEnd: now + 7 * 86400000,
    programmes: [],
  }, { headers: { 'Cache-Control': 'no-cache' } })
}
router.get('/offline-assets.json',()=>Response.json([...new Set([scriptEntry.href,...scriptEntry.preloads,...Object.values(scriptEntry.importMap.imports ?? {})])]))
const server=http.createServer(createRequestListener(router.fetch))
server.listen(Number(process.env.PORT ?? 44100),()=>console.log('Frequency → http://localhost:'+(process.env.PORT ?? 44100)))
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{server.close();server.closeAllConnections()})
