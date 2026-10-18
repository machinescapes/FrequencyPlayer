import http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'
import { assets, scriptEntry } from './app/assets.ts'
const router = createRouter({middleware:[staticFiles('./public',{index:false})]})
router.get('/assets/*', ({request}) => assets.fetch(request))
router.get('/', () => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#101211"><meta name="color-scheme" content="dark"><meta name="apple-mobile-web-app-capable" content="yes"><title>Frequency · Your listening room</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg"><link rel="apple-touch-icon" href="/icon-192.png"><link rel="stylesheet" href="/styles.css"><script type="importmap">${JSON.stringify(scriptEntry.importMap).replaceAll('<','\\u003c')}</script>${scriptEntry.preloads.map(h=>`<link rel="modulepreload" href="${h}">`).join('')}<script type="module" src="${scriptEntry.href}"></script></head><body><p class="boot">Tuning in to Frequency…</p><noscript>Enable JavaScript to open your listening room.</noscript></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}}))
router.get('/offline-assets.json',()=>Response.json([...new Set([scriptEntry.href,...scriptEntry.preloads,...Object.values(scriptEntry.importMap.imports ?? {})])]))
const server=http.createServer(createRequestListener(router.fetch))
server.listen(Number(process.env.PORT ?? 44100),()=>console.log('Frequency → http://localhost:'+(process.env.PORT ?? 44100)))
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{server.close();server.closeAllConnections()})
