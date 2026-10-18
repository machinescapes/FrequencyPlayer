import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const output = path.join(root, 'dist')
const basePath = normalizeBasePath(process.env.PUBLIC_BASE_PATH ?? '/')

function normalizeBasePath(value) {
  const parts = value.split('/').filter(Boolean)
  return `/${parts.join('/')}${parts.length ? '/' : ''}`
}

await rm(output, { recursive: true, force: true })
await mkdir(path.join(output, 'assets'), { recursive: true })
await cp(path.join(root, 'public'), output, { recursive: true })
const buildVersion = Date.now().toString(36)
const serviceWorker = await readFile(path.join(output, 'sw.js'), 'utf8')
await writeFile(path.join(output, 'sw.js'), serviceWorker.replaceAll('__BUILD_VERSION__', buildVersion))

const [{ outputFiles }] = await Promise.all([
  build({
    entryPoints: {
      app: path.join(root, 'app/public/entry.tsx'),
      tv: path.join(root, 'app/public/tv-entry.tsx'),
    },
    outdir: path.join(output, 'assets'),
    splitting: true,
    chunkNames: '[name]-[hash]',
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    minify: true,
    write: false,
    define: { __APP_BASE_PATH__: JSON.stringify(basePath) },
    logLevel: 'info',
  }),
])

const bundle = outputFiles.find(file=>file.path.endsWith('/app.js'))
if (!bundle) throw new Error('The browser bundle was not generated.')
const bundleText = new TextDecoder().decode(bundle.contents)
if (bundleText.includes('Expected a Remix SPA response')) {
  throw new Error('The static Pages build must mount the client app directly, not use the Remix server SPA response router.')
}
for(const file of outputFiles)await writeFile(file.path,file.contents)

for (const sheet of ['styles.css', 'tv.css']) {
  const css = await readFile(path.join(root, 'public', sheet), 'utf8')
  const cssOutput = await build({
    stdin: { contents: css, loader: 'css', resolveDir: root },
    bundle: true,
    minify: true,
    write: false,
    logLevel: 'info',
  })
  await writeFile(path.join(output, sheet), cssOutput.outputFiles[0].contents)
}

function page({ title, script, description }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#101211">
    <meta name="color-scheme" content="dark">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <base href="${basePath}">
    <title>${title}</title>
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" href="icon.svg">
    <link rel="apple-touch-icon" href="icon-192.png">
    <link rel="stylesheet" href="styles.css">
    <link rel="stylesheet" href="tv.css">
    <script type="module" src="assets/${script}.js"></script>
  </head>
  <body><div id="app"></div><noscript>${description}</noscript></body>
</html>`
}

const html = page({ title: 'Frequency · Radio', script: 'app', description: 'Enable JavaScript to use the radio player.' })
const tvHtml = page({ title: 'Frequency TV · Public channels', script: 'tv', description: 'Enable JavaScript to open the channel guide.' })

await writeFile(path.join(output, 'index.html'), html)
await writeFile(path.join(output, 'tv.html'), tvHtml)
await writeFile(path.join(output, '404.html'), html)
await writeFile(path.join(output, '.nojekyll'), '')
await writeFile(path.join(output, 'build-info.json'), JSON.stringify({ basePath, builtAt: new Date().toISOString() }, null, 2))
console.log(`Built ${output} for ${basePath}`)
