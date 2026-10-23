import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildSnapshot, validateConfig } from './iptv-parse.mjs'

const INDEX = 'https://iptv-org.github.io/iptv/index.m3u'
const CHANNELS = 'https://iptv-org.github.io/api/channels.json'
const BLOCKLIST = 'https://iptv-org.github.io/api/blocklist.json'
const FEED_URL = 'https://raw.githubusercontent.com/dp247/Freeview-EPG/master/epg.xml'
const LIMIT = Number(process.env.IPTV_LIMIT ?? 20000)
// UK only for now; extend with a comma-separated list when adding countries.
const COUNTRIES = new Set((process.env.IPTV_COUNTRIES ?? 'GB').split(',').map(code => code.trim().toUpperCase()).filter(Boolean))

async function getJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'frequency-iptv-sync' } })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.json()
}

async function getText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'frequency-iptv-sync' } })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response.text()
}

/**
 * The set of channel ids the Freeview guide publishes, so the snapshot can
 * record which channels have listings. A failure here is not fatal: the
 * catalogue is still useful without a guide, so fall back to no coverage.
 */
async function epgChannels() {
  try {
    const xml = await getText(FEED_URL)
    return new Set([...xml.matchAll(/<channel id="([^"]+)"/g)].map(match => match[1]))
  } catch (error) {
    console.warn(`Could not read the guide feed (${error.message}); writing the catalogue without guide coverage.`)
    return null
  }
}

/** A browser can only play a stream that is 200, HLS, and CORS-open. */
async function verifyStreams(urls, { concurrency = 16, timeout = 8000 } = {}) {
  const results = new Map()
  let next = 0
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++]
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 frequency-iptv-sync' } })
        if (!response.ok) { results.set(url, 'offline'); continue }
        const playlist = (await response.text()).slice(0, 8)
        if (!playlist.startsWith('#EXTM3U')) { results.set(url, 'offline'); continue }
        results.set(url, response.headers.get('access-control-allow-origin') === '*' ? 'ok' : 'cors')
      } catch { results.set(url, 'offline') }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

const CONFIG_PATH = path.join(process.cwd(), 'scripts/iptv-config.json')

/** Hand-edited pin/hide/add lists. Missing is fine; malformed stops the sync. */
async function readConfig() {
  let text
  try { text = await readFile(CONFIG_PATH, 'utf8') } catch { return validateConfig({}) }
  return validateConfig(JSON.parse(text))
}

const config = await readConfig()

const [index, channels, blocklist, epg] = await Promise.all([
  getText(INDEX),
  getJson(CHANNELS),
  getJson(BLOCKLIST),
  epgChannels(),
])

// Channel metadata supplies the network name and country for rows whose ids
// do not carry an obvious ccTLD.
const networks = new Map()
for (const channel of channels) {
  networks.set(channel.id, {
    network: channel.network ?? channel.owners?.[0] ?? null,
    country: channel.country ?? null,
  })
}

const { unmatched = [], ...snapshot } = buildSnapshot([{ url: INDEX, group: 'General', text: index }], {
  blocked: new Set(blocklist.map(entry => entry.channel)),
  limit: LIMIT,
  networks,
  countries: COUNTRIES,
  epgChannels: epg,
  config,
})

// Config is applied before the probe so added streams are checked like the rest.
// Stream links rot. Probe each one now so the app can lead with channels that
// actually play instead of surfacing 40% dead links as equals.
const health = await verifyStreams(snapshot.items.map(item => item.streamUrl))
for (const item of snapshot.items) item.health = health.get(item.streamUrl) ?? 'unknown'
snapshot.counts.playable = snapshot.items.filter(item => item.health === 'ok').length
snapshot.counts.noCors = snapshot.items.filter(item => item.health === 'cors').length
snapshot.counts.unreachable = snapshot.items.filter(item => item.health === 'offline').length
const output = path.join(process.cwd(), 'public/iptv.json')
const serialised = JSON.stringify(snapshot) + '\n'

for (const id of unmatched) console.warn(`iptv config: ${id} matched no channel (typo, or dropped upstream?)`)

if (process.argv.includes('--check')) {
  const current = await readFile(output, 'utf8').catch(() => '')
  const strip = value => value.replace(/"generatedAt":"[^"]*"/, '')
  if (strip(current) !== strip(serialised)) {
    console.error('public/iptv.json is out of date. Run pnpm run sync:iptv.')
    process.exit(1)
  }
  console.log(`public/iptv.json is current (${snapshot.counts.channels} channels).`)
} else {
  await writeFile(output, serialised)
  const { counts, items } = snapshot
  console.log(`Wrote ${counts.channels} channels (${(serialised.length / 1024).toFixed(0)} KB) to ${output}`)
  console.log(`  countries: ${[...COUNTRIES].join(', ')} · with guide: ${counts.withGuide} · broadcasters: ${counts.broadcasters}`)
  console.log(`  playable: ${counts.playable} · no CORS: ${counts.noCors} · unreachable: ${counts.unreachable}`)
  console.log(`  config: ${counts.pinned} pinned · ${counts.hidden} hidden · ${counts.added} added`)
  if (!epg) console.log('  guide coverage not recorded (feed unavailable)')
  const withGuide = items.filter(item => item.epgId)
  if (withGuide.length) console.log(`  channels with listings: ${withGuide.map(item => item.title).join(', ')}`)
}
