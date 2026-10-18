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
    entryPoints: [path.join(root, 'app/public/entry.tsx')],
    bundle: true,
    format: 'esm',
    target: ['es2022'],
    minify: true,
    write: false,
    define: { __APP_BASE_PATH__: JSON.stringify(basePath) },
    logLevel: 'info',
  }),
])

const bundle = outputFiles[0]
if (!bundle) throw new Error('The browser bundle was not generated.')
await writeFile(path.join(output, 'assets/app.js'), bundle.contents)

const styles = await readFile(path.join(root, 'public/styles.css'), 'utf8')
const cssOutput = await build({
  stdin: { contents: styles, loader: 'css', resolveDir: root },
  bundle: true,
  minify: true,
  write: false,
  logLevel: 'info',
})
await writeFile(path.join(output, 'styles.css'), cssOutput.outputFiles[0].contents)

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#101211">
    <meta name="color-scheme" content="dark">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <base href="${basePath}">
    <title>Frequency · Your listening room</title>
    <link rel="manifest" href="manifest.webmanifest">
    <link rel="icon" href="icon.svg">
    <link rel="apple-touch-icon" href="icon-192.png">
    <link rel="stylesheet" href="styles.css">
    <script type="module" src="assets/app.js"></script>
  </head>
  <body><p class="boot">Tuning in to Frequency…</p><noscript>Enable JavaScript to open your listening room.</noscript></body>
</html>`

await writeFile(path.join(output, 'index.html'), html)
await writeFile(path.join(output, '404.html'), html)
await writeFile(path.join(output, '.nojekyll'), '')
await writeFile(path.join(output, 'build-info.json'), JSON.stringify({ basePath, builtAt: new Date().toISOString() }, null, 2))
console.log(`Built ${output} for ${basePath}`)
