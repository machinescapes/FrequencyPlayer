// Run with an external Playwright install; see docs/tv-feeds.md.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')

const base = process.env.BROWSER_BASE_URL ?? 'http://localhost:44100'
const prefix = process.env.BROWSER_EVIDENCE_PREFIX ?? 'frq-05-dev'
const screenshots = 'docs/screenshots'
await mkdir(screenshots, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const errors = [], observations = []
const segment = await readFile(new URL('../test/fixtures/tv/segment.bin', import.meta.url))
let newChannel = false, invalidRefresh = false, failPrimary = false
const row = (id, title, path) => `#EXTINF:-1 tvg-id="${id}" group-title="Test channels",${title}\nhttps://frequency-fixture.test/${path}\n`
const playlist = () => '#EXTM3U\n' + row('Demo.uk@HD', 'Demo HD', 'good.m3u8') + row('Demo.uk@SD', 'Demo SD', 'backup.m3u8') + row('Dead.uk', 'Dead channel', 'missing.m3u8') + row('Blocked.uk', 'Blocked channel', 'denied.m3u8') + row('External.uk', 'External channel', 'external.mpd') + row('Unknown.uk', 'Mystery channel', 'other.m3u8') + (newChannel ? row('Fresh.uk', 'New discovery', 'new.m3u8') : '')
const timestamp = time => new Date(time).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
const xml = () => `<tv><channel id="Demo.uk"><display-name>Demo guide</display-name></channel><programme channel="Demo.uk" start="${timestamp(Date.now() - 60000)}" stop="${timestamp(Date.now() + 3600000)}"><title>Fixture live programme</title><desc>Deterministic browser guide</desc></programme></tv>`
async function setup(context) {
  await context.addInitScript(origin => { if (location.origin !== origin) return; localStorage.setItem('frequency.favouritesSetup', 'true'); if (localStorage.getItem('frequency.favourites.v2') === null) localStorage.setItem('frequency.favourites.v2', '[]') }, new URL(base).origin)
  await context.route('https://frequency-fixture.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    const headers = { 'access-control-allow-origin': '*' }
    if (path === '/feed.m3u') return route.fulfill({ headers, contentType: 'audio/x-mpegurl', body: invalidRefresh ? 'invalid playlist' : playlist() })
    if (path === '/invalid.m3u') return route.fulfill({ headers, body: 'not a playlist' })
    if (path === '/guide.xml') return route.fulfill({ headers, contentType: 'application/xml', body: xml() })
    if (path === '/bad.xml') return route.fulfill({ headers, body: '<tv><broken></tv>' })
    if (path === '/segment.ts') return route.fulfill({ headers, contentType: 'video/mp2t', body: segment })
    if (path === '/missing.m3u8' || path === '/good.m3u8' && failPrimary) return route.fulfill({ headers, status: 404, body: 'Gone' })
    if (path === '/denied.m3u8') return route.fulfill({ headers, status: 403, body: 'VPN required' })
    if (path === '/slow.m3u8') { await new Promise(resolve => setTimeout(resolve, 2000)); return route.abort().catch(() => {}) }
    if (path.endsWith('.m3u8')) return route.fulfill({ headers, contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.000,\nhttps://frequency-fixture.test/segment.ts\n#EXT-X-ENDLIST\n' })
    return route.fulfill({ headers, contentType: 'text/plain', body: 'External destination fixture' })
  })
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
}
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
await setup(context)
const page = await context.newPage()
const manager = page.getByRole('dialog', { name: 'Add channels', exact: true })
async function shot(name) { await page.screenshot({ path: `${screenshots}/${prefix}-${name}.png` }) }
async function open() { if (!await manager.isVisible()) await page.getByRole('button', { name: '＋ Add channels', exact: true }).click() }
async function close() { await page.getByRole('button', { name: 'Close channel management' }).click() }
async function search(value) { await page.getByRole('searchbox', { name: 'Find feed channels' }).fill(value) }
async function expand(summary) { const node = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: summary }) }).last(); if (!await node.evaluate(e => e.open)) await node.locator('summary').click() }
async function expectText(text) { await page.getByText(text, { exact: true }).first().waitFor() }
async function importUrl(name, url) { await page.getByRole('textbox', { name: 'Feed name', exact: true }).fill(name); await page.getByRole('textbox', { name: 'Playlist URL', exact: true }).fill(url); await page.getByRole('button', { name: 'Import feed', exact: true }).click() }
try {
  await page.goto(`${base}/?scope=watch&view=channels`)
  await page.waitForFunction(() => document.querySelectorAll('article.card').length > 200)
  assert.ok(await page.locator('article.card').count() > 200)
  await shot('01-default-watch'); observations.push('Real committed IPTV-org UK default renders more than 200 grouped channels.')
  await open(); await page.getByRole('checkbox', { name: 'Enable feed IPTV-org UK' }).waitFor(); await shot('02-default-manager')
  await page.getByRole('checkbox', { name: 'Enable feed IPTV-org UK' }).uncheck(); assert.equal(await page.getByRole('checkbox', { name: 'Enable feed Free-TV UK' }).isChecked(), false); await page.getByRole('checkbox', { name: 'Enable feed Free-TV UK' }).check(); await close(); await page.getByRole('combobox', { name: 'Filter TV feed' }).selectOption('freetv:GB'); assert.ok(await page.locator('article.card').count() > 30); await shot('17-optional-free-tv'); await open(); await page.getByRole('checkbox', { name: 'Enable feed Free-TV UK' }).uncheck(); await close()
  await page.getByText('No channels match this filter.', { exact: false }).waitFor(); await shot('03-empty-add-channels')
  await page.locator('.empty-message').getByRole('button', { name: 'Add channels', exact: true }).first().click(); assert.equal(await manager.isVisible(), true)
  await importUrl('Test UK', 'https://frequency-fixture.test/feed.m3u'); await expectText('6 enabled · 6 entries'); await shot('04-imported-channels')
  assert.equal(await page.getByRole('checkbox', { name: /^Enable channel / }).count(), 6)
  await page.getByRole('button', { name: 'Verify channels', exact: true }).click()
  await page.getByText(/^Complete · 6\/6 checked/).waitFor({ timeout: 45000 })
  assert.equal(await page.getByRole('checkbox', { name: 'Enable channel Dead channel', exact: true }).isChecked(), false)
  assert.equal(await page.getByRole('checkbox', { name: 'Enable channel Blocked channel', exact: true }).isChecked(), true)
  assert.match(await manager.innerText(), /3 working · 1 failed · 1 inconclusive · 1 external/)
  await shot('05-verification-results'); observations.push('Real muted fixture playback verified; HTTP404 excluded, HTTP403 inconclusive retained, external unchanged.')
  await page.getByRole('checkbox', { name: 'Enable channel Dead channel', exact: true }).check()
  await search('Demo'); await page.getByRole('button', { name: 'Disable filtered', exact: true }).click(); assert.equal(await page.getByRole('checkbox', { name: 'Enable channel Demo HD', exact: true }).isChecked(), false)
  await page.getByRole('button', { name: 'Enable filtered', exact: true }).click(); await search('')
  await expand('Programme guide (XMLTV)'); await page.getByRole('textbox', { name: 'XMLTV URL', exact: true }).fill('https://frequency-fixture.test/guide.xml'); await page.getByRole('button', { name: 'Load guide URL', exact: true }).click(); await page.getByText(/Guide loaded: 1 channels, 1 programmes/).waitFor()
  await search('Mystery'); await page.getByRole('button', { name: 'Channel settings Mystery channel' }).click(); await page.getByRole('combobox', { name: 'Guide mapping Mystery channel' }).selectOption('Demo.uk'); await shot('06-manual-epg-mapping'); await page.getByRole('combobox', { name: 'Channel group Mystery channel' }).selectOption('channel:demo.uk'); await close(); await page.getByRole('button', { name: '☷ Guide', exact: true }).click(); assert.equal(await page.locator('.timeline-row').count(), 1); await page.getByRole('button', { name: '▦ Channels', exact: true }).click(); await open(); await page.getByRole('combobox', { name: 'Channel group Mystery channel' }).selectOption(''); await page.getByRole('button', { name: 'Close channel settings' }).click(); await search(''); await expand('Programme guide (XMLTV)'); await page.getByRole('textbox', { name: 'XMLTV URL', exact: true }).fill('https://frequency-fixture.test/bad.xml'); await page.getByRole('button', { name: 'Load guide URL', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'keeping saved listings' }).waitFor(); await shot('18-guide-error-retains-listings')
  newChannel = true; await page.getByRole('button', { name: 'Refresh feed', exact: true }).click(); await expectText('6 enabled · 7 entries'); assert.equal(await page.getByRole('checkbox', { name: 'Enable channel New discovery' }).isChecked(), false); await shot('07-refresh-new-disabled')
  invalidRefresh = true; await page.getByRole('button', { name: 'Refresh feed', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'previous channels are retained' }).waitFor(); assert.equal(await page.getByRole('checkbox', { name: /^Enable channel / }).count(), 7); await shot('08-refresh-error-retains-channels'); invalidRefresh = false
  await importUrl('Bad import', 'https://frequency-fixture.test/invalid.m3u'); await page.getByText('Use an extended M3U playlist (up to 10 MB).', { exact: true }).waitFor(); assert.equal(await page.getByRole('checkbox', { name: /^Enable feed / }).count(), 3)
  await close(); assert.equal(await page.locator('article.card').filter({ has: page.getByRole('heading', { name: 'Demo HD', exact: true }) }).count(), 1)
  await page.getByRole('button', { name: '☷ Guide', exact: true }).click(); await page.locator('.programme').first().waitFor(); assert.equal(await page.locator('.timeline-row').count(), 2); await shot('09-grouped-guide')
  await page.getByRole('button', { name: '▦ Channels', exact: true }).click()
  failPrimary = true
  await page.getByRole('button', { name: 'Play Demo HD', exact: true }).click()
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.5 && !v.paused }, { timeout: 25000 })
  const selector = page.getByRole('combobox', { name: 'Stream for Demo HD', exact: true }); assert.match(await selector.locator('option:checked').innerText(), /Demo SD/)
  await selector.selectOption(await selector.locator('option').filter({ hasText: 'Demo SD' }).getAttribute('value')); await shot('10-fallback-playing'); observations.push('Grouped preferred stream failure fell back to real HLS backup playback; EPG had one row per group.')
  failPrimary = false
  await open(); await search('Mystery'); const before = await page.locator('video').evaluate(v => v.currentTime)
  await page.getByRole('button', { name: 'Verify filtered channels', exact: true }).click(); await page.getByText(/^Complete · 1\/1 checked/).waitFor({ timeout: 25000 }); assert.ok(await page.locator('video').evaluate(v => v.currentTime) > before)
  await search(''); await page.getByText('Import feed', { exact: true }).first().click().catch(() => {})
  // Import a file with an unmatched regional channel and a slow probe.
  const upload = '#EXTM3U\n' + row('Demo.uk@FHD', 'Demo alternate', 'alternate.m3u8') + row('Demo.uk@ScotlandHD', 'Demo Scotland HD', 'scotland.m3u8') + row('Slow.uk', 'Slow channel', 'slow.m3u8')
  const importDetails = page.locator('details.tv-import').first(); if (await importDetails.getAttribute('open') === null) await importDetails.locator('summary').click()
  await page.getByRole('textbox', { name: 'Feed name', exact: true }).fill('Uploaded feed'); await page.getByLabel('Playlist file', { exact: true }).setInputFiles({ name: 'uploaded.m3u', mimeType: 'audio/x-mpegurl', buffer: Buffer.from(upload) }); await page.getByRole('button', { name: 'Import feed', exact: true }).click(); await expectText('3 enabled · 3 entries')
  await expand('Programme guide (XMLTV)'); await page.getByLabel('XMLTV file', { exact: true }).setInputFiles({ name: 'guide.xml.gz', mimeType: 'application/gzip', buffer: gzipSync(xml()) }); await page.getByText(/guide.xml.gz · 1 guide channels/).waitFor(); await shot('11-uploaded-gzip-guide')
  await search('Slow'); await page.getByRole('button', { name: 'Verify filtered channels' }).click(); await page.getByRole('button', { name: 'Cancel verification' }).click(); await page.getByText(/^Cancelled ·/).waitFor(); assert.equal(await page.getByRole('checkbox', { name: 'Enable channel Slow channel' }).isChecked(), true); await shot('12-cancel-verification')
  const transfer = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Transfer settings' }) }); await transfer.locator('summary').click()
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export TV settings' }).click(); const download = await downloadEvent; const settingsPath = `/tmp/${prefix}-settings.json`; await download.saveAs(settingsPath)
  await page.getByRole('checkbox', { name: 'Enable feed Uploaded feed' }).uncheck(); await page.getByLabel('Import TV settings', { exact: true }).setInputFiles(settingsPath); await page.waitForFunction(() => document.querySelector('input[aria-label="Enable feed Uploaded feed"]')?.checked); assert.equal(await page.getByRole('checkbox', { name: 'Enable feed Uploaded feed' }).isChecked(), true)
  await close(); await page.reload(); await page.getByRole('button', { name: 'Play Demo HD', exact: true }).waitFor(); assert.match(await page.getByRole('combobox', { name: 'Stream for Demo HD', exact: true }).locator('option:checked').innerText(), /Demo SD/); await open(); assert.equal(await page.getByRole('checkbox', { name: 'Enable feed Uploaded feed' }).isChecked(), true); await close()
  // Explicit external opening; no popup occurred during verification or fallback.
  assert.equal(context.pages().length, 1)
  const popupEvent = context.waitForEvent('page'); await page.getByRole('button', { name: 'Open External channel', exact: true }).click(); const popup = await popupEvent; await popup.close()
  await page.getByRole('radio', { name: 'Listen', exact: true }).click(); await page.getByRole('heading', { name: 'BBC Radio 6 Music', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: '＋ Add channels', exact: true }).count(), 0)
  await page.keyboard.press('/'); await page.getByRole('dialog', { name: 'Search', exact: true }).waitFor(); await page.keyboard.press('Escape'); await page.getByRole('radio', { name: 'All', exact: true }).click(); assert.ok(await page.locator('article.card').count() > 25); await shot('13-all-scope')
  await page.getByRole('radio', { name: 'Watch', exact: true }).click(); await page.evaluate(async () => { await navigator.serviceWorker.ready }); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: 'Play Demo HD', exact: true }).waitFor({ timeout: 20000 }); await shot('14-offline-reload'); await context.setOffline(false)
  observations.push('Imports, filtered bulk switches, manual mapping, refresh preservation, XML/GZ upload, cancellation, settings transfer, reload, external opening, Listen/All and offline reload passed.')
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await setup(mobileContext); const mobile = await mobileContext.newPage()
  await mobile.goto(`${base}/?scope=watch&view=channels`); await mobile.getByRole('button', { name: '＋ Add channels', exact: true }).click()
  await mobile.getByText('Transfer settings', { exact: true }).click(); await mobile.getByLabel('Import TV settings', { exact: true }).setInputFiles(settingsPath); await mobile.getByRole('checkbox', { name: 'Enable feed Uploaded feed' }).waitFor()
  await mobile.getByRole('button', { name: /^Test UK/ }).click(); await mobile.getByRole('searchbox', { name: 'Find feed channels' }).scrollIntoViewIfNeeded(); await mobile.screenshot({ path: `${screenshots}/${prefix}-15-mobile-channels.png` })
  assert.equal(await mobile.locator('.tv-manager').evaluate(e => e.scrollWidth <= e.clientWidth), true)
  await mobile.keyboard.press('Escape'); await mobile.getByRole('button', { name: 'Play Demo HD', exact: true }).click(); await mobile.waitForFunction(() => { const v = document.querySelector('video'); return v && v.currentTime > .5 && !v.paused }); for (const control of await mobile.locator('.stage-actions select, .stage-actions a, .stage-actions button').all()) { const box = await control.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 391, 'Mobile stage controls must remain visible') }
  await mobile.screenshot({ path: `${screenshots}/${prefix}-16-mobile-player.png` })
  assert.equal(await mobile.locator('body').evaluate(e => e.scrollWidth <= window.innerWidth), true)
  await mobileContext.close()
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ base, screenshots: prefix, observations, pageErrors: errors }, null, 2))
} catch (error) {
  await page.screenshot({ path: `/tmp/${prefix}-failure.png` }); console.log('FAILURE URL', page.url()); console.log((await page.locator('body').innerText()).slice(-7000)); throw error
} finally { await browser.close() }
