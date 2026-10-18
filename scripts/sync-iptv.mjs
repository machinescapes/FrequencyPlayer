import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildSnapshot } from './iptv-parse.mjs'

const INDEX = 'https://iptv-org.github.io/iptv/index.m3u'
const CHANNELS = 'https://iptv-org.github.io/api/channels.json'
const BLOCKLIST = 'https://iptv-org.github.io/api/blocklist.json'
const LIMIT = Number(process.env.IPTV_LIMIT ?? 20000)

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

const [index, channels] = await Promise.all([getText(INDEX), getJson(CHANNELS)])
const blocked = new Set((await getJson(BLOCKLIST)).map(entry => entry.channel))

// Channel metadata supplies the network name and country for rows whose ids
// do not carry an obvious ccTLD.
const networks = new Map()
for (const channel of channels) {
  networks.set(channel.id, {
    network: channel.network ?? channel.owners?.[0] ?? null,
    country: channel.country ?? null,
  })
}

const snapshot = buildSnapshot([{ url: INDEX, group: 'General', text: index }], { blocked, limit: LIMIT, networks })
const output = path.join(process.cwd(), 'public/iptv.json')
const serialised = JSON.stringify(snapshot) + '\n'

if (process.argv.includes('--check')) {
  const current = await readFile(output, 'utf8').catch(() => '')
  const strip = value => value.replace(/"generatedAt":"[^"]*"/, '')
  if (strip(current) !== strip(serialised)) {
    console.error('public/iptv.json is out of date. Run npm run sync:iptv.')
    process.exit(1)
  }
  console.log(`public/iptv.json is current (${snapshot.counts.channels} channels).`)
} else {
  await writeFile(output, serialised)
  const { counts, items } = snapshot
  const top = [...items.reduce((map, item) => map.set(item.broadcaster ?? '—', (map.get(item.broadcaster ?? '—') ?? 0) + 1), new Map())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
  console.log(`Wrote ${counts.channels} channels (${(serialised.length / 1e6).toFixed(2)} MB) to ${output}`)
  console.log(`  essentials: ${counts.essentials} · broadcasters: ${counts.broadcasters} · countries: ${counts.countries}`)
  console.log(`  top broadcasters: ${top.map(([name, count]) => `${name} ${count}`).join(', ')}`)
}
