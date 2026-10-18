import http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'
import { assets, scriptEntry, tvScriptEntry } from './app/assets.ts'
const router = createRouter({middleware:[staticFiles('./public',{index:false})]})
router.get('/assets/*', async ({request}) => (await assets.fetch(request)) ?? new Response('Asset not found', {status:404}))
type Entry = { scripts: { importMap: { imports?: Record<string,string> }; preloads: string[]; href: string }; title: string; noscript: string }
function page(entry: Entry) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#101211"><meta name="color-scheme" content="dark"><meta name="mobile-web-app-capable" content="yes"><title>${entry.title}</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/tv.css"><script type="importmap">${JSON.stringify(entry.scripts.importMap).replaceAll('<','\\u003c')}</script>${entry.scripts.preloads.map((h: string)=>`<link rel="modulepreload" href="${h}">`).join('')}<script type="module" src="${entry.scripts.href}"></script></head><body><div id="app"></div><noscript>${entry.noscript}</noscript></body></html>`
}
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}
router.get('/', () => new Response(page({scripts:scriptEntry,title:'Frequency · Radio',noscript:'Enable JavaScript to use the radio player.'}),{headers}))
router.get('/tv', () => new Response(page({scripts:tvScriptEntry,title:'Frequency TV · Public channels',noscript:'Enable JavaScript to open the channel guide.'}),{headers}))
router.get('/offline-assets.json',()=>Response.json([...new Set([scriptEntry.href,...scriptEntry.preloads,...Object.values(scriptEntry.importMap.imports ?? {}),tvScriptEntry.href,...tvScriptEntry.preloads,...Object.values(tvScriptEntry.importMap.imports ?? {})])]))
const server=http.createServer(createRequestListener(router.fetch))
server.listen(Number(process.env.PORT ?? 44100),()=>console.log('Frequency → http://localhost:'+(process.env.PORT ?? 44100)))
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{server.close();server.closeAllConnections()})
