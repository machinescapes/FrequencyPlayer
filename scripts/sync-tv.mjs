import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { COUNTRY_FILES, isCountryFile, parseList, applyConfig, epgIdFor } from './freetv-parse.mjs'

const REPO = 'Free-TV/IPTV'
const API = `https://api.github.com/repos/${REPO}`
const FEED_URL = 'https://raw.githubusercontent.com/dp247/Freeview-EPG/master/epg.xml'
const OUTPUT = path.join(process.cwd(), 'public/tv')
const CONFIG_PATH = path.join(process.cwd(), 'scripts/tv-config.json')
// Limit a run to some countries while developing: TV_COUNTRIES=GB,IE
const ONLY = new Set((process.env.TV_COUNTRIES ?? '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean))
const CHECK = process.argv.includes('--check')

const headers = { 'user-agent': 'frequency-tv-sync', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }

async function get(url, as = 'json') {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return as === 'json' ? response.json() : response.text()
}

/** Guide ids the Freeview feed publishes. A failure only loses guide coverage. */
async function epgChannels() {
  try {
    const xml = await get(FEED_URL, 'text')
    return new Set([...xml.matchAll(/<channel id="([^"]+)"/g)].map(match => match[1]))
  } catch (error) {
    console.warn(`Could not read the guide feed (${error.message}); writing the catalogue without guide coverage.`)
    return null
  }
}

/** Probe each HLS stream once: 200 + #EXTM3U is reachable; ACAO * is playable. */
async function verifyStreams(urls, { concurrency = 16, timeout = 8000 } = {}) {
  const results = new Map()
  let next = 0
  async function worker() {
    while (next < urls.length) {
      const url = urls[next++]
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 frequency-tv-sync' } })
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

async function readConfig() {
  const text = await readFile(CONFIG_PATH, 'utf8').catch(() => '{}')
  const config = JSON.parse(text)
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('scripts/tv-config.json must be an object keyed by country code.')
  return config
}

// Pin the run to one commit so every list comes from the same revision.
const [{ sha: commit }] = await get(`${API}/commits?per_page=1`)
const raw = file => `https://raw.githubusercontent.com/${REPO}/${commit}/${file}`
const listing = await get(`${API}/contents/lists?ref=${commit}`)
const flagOrder = (await get(raw('flag_order.txt'), 'text').catch(() => '')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
const [config, epg] = await Promise.all([readConfig(), epgChannels()])

const unknown = []
/** @type {Map<string, { code: string, name: string, stems: string[], items: object[], skipped: number }>} */
const countries = new Map()
const files = listing.filter(entry => entry.type === 'file' && entry.name.endsWith('.md')).map(entry => entry.name.slice(0, -3)).filter(isCountryFile)
const texts = await Promise.all(files.map(stem => get(raw(`lists/${stem}.md`), 'text').then(text => [stem, text])))
for (const [stem, text] of texts) {
  const known = COUNTRY_FILES[stem]
  if (!known) { unknown.push(stem); continue }
  const [code, name] = known
  if (ONLY.size && !ONLY.has(code)) continue
  const { items, skipped } = parseList(text, { code })
  const country = countries.get(code) ?? { code, name, stems: [], items: [], skipped: 0 }
  // spain_vod / usa_vod follow the main list, keeping one order per country.
  const offset = country.items.length
  for (const item of items) {
    if (country.items.some(existing => existing.id === item.id)) item.id = `${item.id}-${stem}`
    country.items.push({ ...item, order: offset + item.order })
  }
  country.stems.push(stem)
  country.skipped += skipped
  countries.set(code, country)
}

const generatedAt = new Date().toISOString()
const source = { name: 'Free-TV/IPTV', url: `https://github.com/${REPO}`, commit }
const outputs = new Map()
const summary = []
for (const country of countries.values()) {
  const applied = applyConfig(country.items, config[country.code] ?? {}, country.code)
  for (const id of applied.unmatched) console.warn(`tv config ${country.code}: ${id} matched no channel`)
  const items = applied.items
  if (!items.length) continue
  for (const item of items) item.epgId = epg ? epgIdFor(item.epgId, epg) : item.epgId
  outputs.set(country.code, { country, items, applied })
}

// Probe only what can play inline. Geo-blocked streams usually fail from a
// CI runner abroad; record that as `geo` rather than `offline`, since viewers
// are expected to use a VPN for that country.
const hls = [...outputs.values()].flatMap(output => output.items.filter(item => item.playback === 'hls').map(item => item.streamUrl))
const health = await verifyStreams([...new Set(hls)])
for (const { items } of outputs.values()) {
  for (const item of items) {
    if (item.playback !== 'hls') { item.health = 'external'; continue }
    const result = health.get(item.streamUrl) ?? 'unknown'
    item.health = result === 'offline' && item.labels.includes('Geo-blocked') ? 'geo' : result
  }
}

const documents = new Map()
for (const { country, items, applied } of outputs.values()) {
  const counts = {
    channels: items.length,
    playable: items.filter(item => item.health === 'ok').length,
    noCors: items.filter(item => item.health === 'cors').length,
    geo: items.filter(item => item.health === 'geo').length,
    unreachable: items.filter(item => item.health === 'offline').length,
    external: items.filter(item => item.playback === 'external').length,
    withGuide: items.filter(item => item.epgId).length,
    pinned: items.filter(item => item.pin !== null).length,
    hidden: applied.hidden,
    added: applied.added,
  }
  documents.set(`${country.code}.json`, { version: 1, generatedAt, source, country: country.code, name: country.name, lists: country.stems, counts, items })
  summary.push({ code: country.code, name: country.name, channels: counts.channels, playable: counts.playable + counts.noCors + counts.geo, stems: country.stems })
}

// Free-TV's flag_order.txt groups countries by region; the UK leads here.
const rank = code => {
  if (code === 'GB') return -1
  const index = flagOrder.findIndex(stem => COUNTRY_FILES[stem]?.[0] === code)
  return index < 0 ? Infinity : index
}
summary.sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, 'en'))
documents.set('index.json', { version: 1, generatedAt, source, countries: summary.map(({ code, name, channels, playable }) => ({ code, name, channels, playable })) })

const strip = value => value.replace(/"generatedAt":"[^"]*"/g, '')
if (CHECK) {
  let stale = 0
  for (const [file, document] of documents) {
    const current = await readFile(path.join(OUTPUT, file), 'utf8').catch(() => '')
    if (strip(current) !== strip(JSON.stringify(document) + '\n')) { console.error(`public/tv/${file} is out of date.`); stale++ }
  }
  if (stale) { console.error('Run pnpm sync:tv.'); process.exit(1) }
  console.log(`public/tv is current (${documents.size - 1} countries).`)
} else {
  await mkdir(OUTPUT, { recursive: true })
  // A full run owns the directory; a TV_COUNTRIES run only rewrites its own
  // files and leaves the index alone so other countries stay listed.
  if (!ONLY.size) for (const file of await readdir(OUTPUT)) if (file.endsWith('.json') && !documents.has(file)) await rm(path.join(OUTPUT, file))
  let bytes = 0
  for (const [file, document] of documents) {
    if (ONLY.size && file === 'index.json') continue
    const serialised = JSON.stringify(document) + '\n'
    bytes += serialised.length
    await writeFile(path.join(OUTPUT, file), serialised)
  }
  console.log(`Wrote ${documents.size - 1} countries (${(bytes / 1024).toFixed(0)} KB) from ${REPO}@${commit.slice(0, 7)}`)
  for (const entry of summary) {
    const { counts } = documents.get(`${entry.code}.json`)
    console.log(`  ${entry.code} ${entry.name}: ${counts.channels} channels · ok ${counts.playable} · no CORS ${counts.noCors} · geo ${counts.geo} · offline ${counts.unreachable} · external ${counts.external} · guide ${counts.withGuide}`)
  }
}
if (unknown.length) console.warn(`Unknown list files (add them to COUNTRY_FILES): ${unknown.join(', ')}`)
const skipped = [...countries.values()].filter(country => country.skipped)
if (skipped.length) console.warn(`Skipped malformed rows: ${skipped.map(country => `${country.code} ${country.skipped}`).join(', ')}`)
