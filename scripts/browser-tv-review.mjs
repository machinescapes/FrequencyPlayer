// Focused regressions for PR #14 review threads; uses the same external Playwright setup.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.BROWSER_BASE_URL ?? 'http://localhost:44100'
const prefix = process.env.BROWSER_EVIDENCE_PREFIX ?? 'frq-05-review-dev'
await mkdir('docs/screenshots', { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
const errors = []
context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
await context.addInitScript(origin => {
  if (location.origin !== origin) return
  localStorage.setItem('frequency.favouritesSetup', 'true')
  if (!localStorage.getItem('review-favourites-seeded')) {
    localStorage.setItem('frequency.favourites.v2', JSON.stringify(['watch:GB:review-london', 'watch:GB:unavailable']))
    localStorage.setItem('review-favourites-seeded', 'true')
  }
}, new URL(base).origin)
const page = await context.newPage()
await page.clock.install()
let generation = 1, fail = false, builtinRequests = 0, remoteRequests = 0
const now = Date.now(), start = now - 3600000, end = now + 8 * 86400000
const channels = [{ id: 'BBCOneLondonHD.uk', name: 'Review London' }, { id: 'BBCNews.uk', name: 'Review News' }]
const guide = () => ({ id: 'uk-builtin', name: 'UK guide fixture', fetchedAt: Date.now(), channels, programmes: channels.map(ch => ({ stationId: ch.id, title: `Built-in v${generation}`, start, end })) })
const time = value => new Date(value).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
const xml = title => `<tv><channel id="BBCOneLondonHD.uk"><display-name>Review London</display-name></channel><programme channel="BBCOneLondonHD.uk" start="${time(start)}" stop="${time(end)}"><title>${title}</title></programme></tv>`
await context.route('**/catalogue.json', route => route.fulfill({ json: { version: 1, items: [] } }))
await context.route('**/tv/default.m3u', route => route.fulfill({ body: '#EXTM3U\n#EXTINF:-1 tvg-id="BBCOne.uk@LondonHD",Review London\nhttps://review-fixture.test/london.m3u8\n#EXTINF:-1 tvg-id="BBCNews.uk@UKHD",Review News\nhttps://review-fixture.test/news.m3u8\n' }))
await context.route('**/tv/GB.json', route => route.fulfill({ json: { version: 1, items: [{ id: 'GB:review-london', title: 'Legacy London', epgId: 'BBCOneLondonHD.uk', playback: 'hls', url: 'https://review-fixture.test/london.m3u8', streamUrl: 'https://review-fixture.test/london.m3u8' }] } }))
await context.route('**/tv/index.json', route => route.fulfill({ json: { version: 1, countries: [{ code: 'GB', name: 'UK' }, { code: 'FR', name: 'France' }] } }))
await context.route('**/epg/freeview.json', route => route.fulfill({ status: 204 }))
await context.route('https://www.nts.live/**', route => route.fulfill({ json: { results: [] } }))
await context.route('**/epg/tv.json', async route => {
  builtinRequests++; const value = guide(); await new Promise(resolve => setTimeout(resolve, 100))
  await route.fulfill(fail ? { status: 503, body: 'Unavailable' } : { json: value })
})
await context.route('https://review-fixture.test/guide.xml', async route => {
  remoteRequests++; const value = xml(`Remote v${generation}`); await new Promise(resolve => setTimeout(resolve, 100))
  await route.fulfill(fail ? { status: 503, body: 'Unavailable' } : { contentType: 'application/xml', body: value, headers: { 'access-control-allow-origin': '*' } })
})
const open = () => page.getByRole('button', { name: '＋ Add channels', exact: true }).click()
const close = () => page.getByRole('button', { name: 'Close channel management' }).click()
const shot = name => page.screenshot({ path: `docs/screenshots/${prefix}-${name}.png` })
const programme = title => page.getByRole('button', { name: new RegExp('^' + title + ',') }).first().waitFor()
try {
  await page.goto(`${base}/?scope=watch&view=channels`)
  await page.getByRole('button', { name: 'Remove favourite Review London', exact: true }).waitFor()
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('frequency.favourites.v2')))
  assert.ok(migrated.includes('watch:channel:bbconelondon.uk')); assert.ok(!migrated.includes('watch:GB:review-london')); assert.ok(migrated.includes('watch:GB:unavailable'))
  await page.getByRole('button', { name: 'Remove favourite Review London', exact: true }).click()
  await page.getByRole('combobox', { name: 'TV country' }).selectOption('FR'); await page.getByRole('combobox', { name: 'TV country' }).selectOption('GB')
  await page.getByRole('button', { name: 'Favourite Review London', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Remove favourite Review London', exact: true }).count(), 0)
  await page.reload(); await page.getByRole('button', { name: 'Favourite Review London', exact: true }).waitFor()
  await open(); await page.getByRole('checkbox', { name: 'Enable feed Free-TV UK' }).check(); await page.getByRole('checkbox', { name: 'Enable feed Free-TV UK' }).uncheck(); await close()
  assert.equal(await page.getByRole('button', { name: 'Remove favourite Review London', exact: true }).count(), 0)
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('frequency.tv.favourite.removals')).includes('watch:channel:bbconelondon.uk')))
  await shot('01-removal-persists')
  await open(); await page.getByText('Programme guide (XMLTV)', { exact: true }).click(); await page.getByRole('textbox', { name: 'XMLTV URL', exact: true }).fill('https://review-fixture.test/guide.xml'); await page.getByRole('button', { name: 'Load guide URL', exact: true }).click(); await page.getByText(/Guide loaded: 1 channels, 1 programmes/).waitFor(); await close()
  await page.getByRole('button', { name: '☷ Guide', exact: true }).click(); await programme('Remote v1'); await programme('Built-in v1')
  generation = 2
  const beforeBuiltin = builtinRequests, beforeRemote = remoteRequests
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); document.dispatchEvent(new Event('visibilitychange')) })
  await programme('Remote v2'); await programme('Built-in v2')
  assert.equal(builtinRequests, beforeBuiltin + 1); assert.equal(remoteRequests, beforeRemote + 1)
  await shot('02-online-refresh')
  generation = 3; await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await programme('Remote v3'); await programme('Built-in v3'); await shot('03-visible-refresh')
  fail = true; await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await open(); await page.getByRole('alert').filter({ hasText: 'keeping saved listings' }).waitFor(); await shot('04-failure-retains-guide'); await close(); await programme('Remote v3'); await programme('Built-in v3')
  fail = false; generation = 4; await page.clock.fastForward(6 * 60 * 60 * 1000)
  await programme('Remote v4'); await programme('Built-in v4'); await shot('05-six-hour-refresh')
  await open(); const details = page.locator('details.tv-guide-settings'); if (!await details.evaluate(e => e.open)) await details.locator('summary').click()
  await page.getByLabel('XMLTV file', { exact: true }).setInputFiles({ name: 'uploaded.xml', mimeType: 'application/xml', buffer: Buffer.from(xml('Uploaded guide')) })
  await page.getByText(/uploaded.xml · 1 guide channels/).waitFor(); await close(); await programme('Uploaded guide')
  const uploadedRemoteCount = remoteRequests
  generation = 5; await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await programme('Built-in v5'); await programme('Uploaded guide'); assert.equal(remoteRequests, uploadedRemoteCount)
  await shot('06-upload-not-refetched')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ base, prefix, favouriteRemoval: 'persists across country/feed changes and reload; unmapped legacy retained', guideRefresh: 'online, visible, six-hour; deduped concurrent events; cached failure; uploaded guide retained', builtinRequests, remoteRequests, pageErrors: errors }, null, 2))
} catch (error) { await page.screenshot({ path: `/tmp/${prefix}-failure.png` }); console.error((await page.locator('body').innerText()).slice(-4000)); throw error }
finally { await browser.close() }
