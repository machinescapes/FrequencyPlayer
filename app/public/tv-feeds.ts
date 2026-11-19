import { safeLogoUrl } from './catalogue.js'
import type { Programme } from './epg.ts'

export const DEFAULT_TV_URL = 'https://iptv-org.github.io/iptv/countries/uk.m3u'
export type Check = { status: 'working' | 'failed' | 'inconclusive' | 'external'; reason: string; at: number }
export type Entry = {
  id: string; title: string; url: string; tvgId: string; logoUrl?: string; category: string
  countryCode: string; playback: 'hls' | 'external'; enabled: boolean; excluded?: boolean; isNew?: boolean
  check?: Check; group?: string; mapping?: string; legacyId?: string
}
export type Guide = { id: string; name: string; url?: string; uploaded?: boolean; channels: { id: string; name: string }[]; programmes: Programme[]; fetchedAt: number }
export type Feed = { id: string; name: string; url?: string; countryCode: string; enabled: boolean; kind: 'm3u' | 'freetv'; entries: Entry[]; loaded?: boolean; updatedAt?: number; guideUrl?: string; guide?: Guide; error?: string }
export type Library = { version: 1; feeds: Feed[]; preferred: Record<string, string>; builtin?: Guide }
export type Stream = Entry & { feedId: string; feedName: string }
export type Channel = { id: string; title: string; streams: Stream[]; guide?: { source: Guide; channelId: string }; legacyIds: string[] }
export function initialLibrary(): Library {
  return { version: 1, preferred: {}, feeds: [{ id: 'iptv-org-uk', name: 'IPTV-org UK', url: DEFAULT_TV_URL, countryCode: 'GB', enabled: true, kind: 'm3u', entries: [] }, { id: 'freetv:GB', name: 'Free-TV UK', countryCode: 'GB', enabled: false, kind: 'freetv', entries: [] }] }
}
export function webUrl(value: string, httpsOnly = false) {
  try { const url = new URL(value); return (httpsOnly ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol)) && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}
export function stableId(value: string) {
  // Two independent hashes keep identities deterministic without relying on titles or order.
  let a = 2166136261, b = 5381
  for (const ch of value) { a = Math.imul(a ^ ch.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ ch.charCodeAt(0) }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`
}
export function parseM3u(text: string, countryCode = 'GB', base?: string) {
  if (text.length > 10_000_000 || !text.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U')) throw Error('Use an extended M3U playlist (up to 10 MB).')
  text = text.replace(/^\uFEFF/, '').trimStart()
  const entries: Entry[] = [], seen = new Set<string>()
  let attributes: Record<string, string> = {}, title = '', skipped = 0
  const header = text.split(/\r?\n/).find(line => line.startsWith('#EXTM3U')) ?? ''
  const guideUrl = /(?:url-tvg|x-tvg-url)="([^"]+)"/i.exec(header)?.[1]?.split(',')[0]
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('#EXTINF:')) {
      attributes = Object.fromEntries([...line.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1].toLowerCase(), m[2]]))
      // Find the title comma outside quoted attributes.
      let quoted = false, comma = -1
      for (let i = 0; i < line.length; i++) { if (line[i] === '"') quoted = !quoted; if (line[i] === ',' && !quoted) { comma = i; break } }
      title = comma < 0 ? '' : line.slice(comma + 1).trim()
    } else if (line && !line.startsWith('#')) {
      let resolved = line
      try { resolved = new URL(line, base).href } catch { /* Skip malformed rows below. */ }
      const url = webUrl(resolved)
      if (!title || !url) { skipped++; title = ''; continue }
      const id = stableId(`${attributes['tvg-id'] ?? ''}\n${url}`)
      if (!seen.has(id)) {
        seen.add(id)
        entries.push({ id, title, url, tvgId: attributes['tvg-id'] ?? '', logoUrl: webUrl(attributes['tvg-logo'] ?? '', true), category: attributes['group-title']?.split(';')[0] || 'General', countryCode,
          playback: url.startsWith('https:') && /\.m3u8(?:[?#]|$)/i.test(url) ? 'hls' : 'external', enabled: true })
      }
      title = ''
    }
  }
  if (!entries.length || entries.length > 20000) throw Error('No valid channels found, or the playlist exceeds 20,000 entries.')
  return { entries, skipped, guideUrl: guideUrl ? webUrl(guideUrl, true) : undefined }
}
export function reconcileEntries(previous: Entry[], incoming: Entry[], firstImport = false) {
  const old = new Map(previous.map(entry => [entry.id, entry]))
  return incoming.map(entry => {
    const saved = old.get(entry.id)
    return saved ? { ...entry, enabled: saved.enabled, excluded: saved.excluded, check: saved.check, group: saved.group, mapping: saved.mapping, isNew: saved.isNew }
      : { ...entry, enabled: firstImport, isNew: !firstImport }
  })
}
export function applyCheck(entry: Entry, check: Check) {
  entry.check = check
  if (check.status === 'failed') entry.excluded = true
  if (check.status === 'working') entry.excluded = false
}
export function entryEnabled(entry: Entry) { return entry.enabled && !entry.excluded }

const ALIASES: Record<string, string> = {
  'BBCOne.uk': 'BBCOneYorkshire.uk', 'BBCTwo.uk': 'BBCTwoHD.uk', 'BBCThree.uk': 'BBCThreeHD.uk', 'BBCFour.uk': 'BBCFourHD.uk',
  'ITV1.uk': 'ITV1London.uk', 'Channel4.uk': 'Channel4London.uk', 'Channel5.uk': '5.uk', 'STV.uk': 'STVCentral.uk',
  'BBCOneScotland.uk': 'BBCOneScot.uk', 'BBCOneNorthernIreland.uk': 'BBCOneNorthernIreland.uk',
}
function removeQuality(value: string) { return value.replace(/(?:UHD|FHD|HD|SD|4K)$/i, '') }
export function canonicalId(value: string): string {
  const [base, variant = ''] = value.split('@')
  let id = base.replace(/(UHD|FHD|HD|SD|4K)(\.[a-z]{2})$/i, '$2')
  const region = removeQuality(variant)
  // UK here is a national variant, not a separate regional service.
  if (region && region !== 'UK') id = id.replace(/(\.[a-z]{2})$/i, `${region}$1`)
  const alias = ALIASES[id]
  if (alias && alias !== id) id = alias.replace(/(UHD|FHD|HD|SD)(\.[a-z]{2})$/i, '$2')
  return id.toLowerCase()
}
export function channelKey(entry: Entry) {
  return entry.group || (entry.tvgId ? `channel:${canonicalId(entry.tvgId)}` : `stream:${stableId(entry.url)}`)
}
export function guideMatch(entry: Entry, guides: Guide[]) {
  for (const guide of guides) {
    const exact = entry.mapping || entry.tvgId
    const found = guide.channels.find(ch => ch.id === exact) ?? (!entry.mapping ? guide.channels.find(ch => canonicalId(ch.id) === canonicalId(entry.tvgId)) : undefined)
    if (found) return { source: guide, channelId: found.id }
  }
}
export function groupChannels(library: Library, feedFilter = 'all', country = 'all'): Channel[] {
  const groups = new Map<string, Channel>(), guideRanks = new Map<string, number>()
  for (const feed of library.feeds) {
    if (!feed.enabled || (feedFilter !== 'all' && feed.id !== feedFilter)) continue
    for (const entry of feed.entries) {
      if (!entryEnabled(entry) || (country !== 'all' && entry.countryCode !== country)) continue
      const id = channelKey(entry)
      let channel = groups.get(id)
      if (!channel) { channel = { id, title: entry.title.replace(/\s*\(\d+p\)/g, '').replace(/\s*\[(?:Geo-blocked|Not 24\/7)\]/g, ''), streams: [], legacyIds: [] }; groups.set(id, channel) }
      channel.streams.push({ ...entry, feedId: feed.id, feedName: feed.name })
      if (entry.legacyId) channel.legacyIds.push(`watch:${entry.legacyId}`)
      const match = guideMatch(entry, [feed.guide, library.builtin].filter((g): g is Guide => Boolean(g)))
      const rank = entry.mapping ? 3 : match?.source === feed.guide ? 2 : 1
      if (match && rank > (guideRanks.get(id) ?? 0)) { channel.guide = match; guideRanks.set(id, rank) }
    }
  }
  return [...groups.values()]
}
export function streamKey(stream: Pick<Stream, 'feedId' | 'id'>) { return `${stream.feedId}:${stream.id}` }
export function orderedStreams(channel: Channel, preferred?: string) {
  return [...channel.streams].sort((a, b) => Number(streamKey(b) === preferred || b.id === preferred) - Number(streamKey(a) === preferred || a.id === preferred) || Number(b.playback === 'hls') - Number(a.playback === 'hls') || Number(b.check?.status === 'working') - Number(a.check?.status === 'working'))
}
export function channelProgrammes(channels: Channel[]): Programme[] {
  const byGuide = new Map<Guide, Map<string, Programme[]>>()
  return channels.flatMap(channel => {
    if (!channel.guide) return []
    const { source, channelId } = channel.guide
    let index = byGuide.get(source)
    if (!index) { index = new Map(); for (const p of source.programmes) { const row = index.get(p.stationId) ?? []; row.push(p); index.set(p.stationId, row) } byGuide.set(source, index) }
    return (index.get(channelId) ?? []).map(p => ({ ...p, stationId: `watch:${channel.id}` }))
  })
}
export function validateGuide(value: unknown): Guide {
  const guide = value as Guide
  if (!guide || typeof guide.id !== 'string' || typeof guide.name !== 'string' || !Array.isArray(guide.channels) || guide.channels.length > 20000 || !Array.isArray(guide.programmes) || guide.programmes.length > 200000 || !Number.isFinite(guide.fetchedAt)) throw Error('Invalid TV guide.')
  const ids = new Set<string>()
  for (const ch of guide.channels) { if (!ch || typeof ch.id !== 'string' || !ch.id || ids.has(ch.id) || typeof ch.name !== 'string') throw Error('Invalid guide channel.'); ids.add(ch.id) }
  const keys = new Set<string>()
  for (const p of guide.programmes) {
    const key = `${p?.stationId}:${p?.start}`
    if (!p || !ids.has(p.stationId) || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.end <= p.start || typeof p.title !== 'string' || !p.title.trim() || keys.has(key)) throw Error('Invalid or duplicate guide programme.')
    keys.add(key)
  }
  return guide
}
export function validateLibrary(value: unknown): Library {
  const data = value as Library
  if (!data || data.version !== 1 || !Array.isArray(data.feeds) || data.feeds.length > 150 || !data.preferred || typeof data.preferred !== 'object' || Array.isArray(data.preferred) || Object.values(data.preferred).some(v => typeof v !== 'string')) throw Error('Invalid TV settings.')
  const ids = new Set<string>(), guideIds = new Set<string>()
  let total = 0
  for (const feed of data.feeds) {
    if (!feed || typeof feed.id !== 'string' || !feed.id || ids.has(feed.id) || typeof feed.name !== 'string' || !feed.name.trim() || typeof feed.enabled !== 'boolean' || !['m3u', 'freetv'].includes(feed.kind) || !/^[A-Z]{2}$/.test(feed.countryCode) || (!Array.isArray(feed.entries) || feed.entries.length > 20000)) throw Error('Invalid TV feed.')
    if (feed.url && !webUrl(feed.url, true) || feed.guideUrl && !webUrl(feed.guideUrl, true)) throw Error('Feed and guide URLs must use HTTPS.')
    ids.add(feed.id); const entries = new Set<string>()
    total += feed.entries.length
    if (total > 100000) throw Error('TV settings exceed 100,000 entries.')
    for (const e of feed.entries) {
      if (!e || typeof e.id !== 'string' || !e.id || entries.has(e.id) || typeof e.title !== 'string' || !e.title.trim() || !webUrl(e.url) || typeof e.tvgId !== 'string' || typeof e.category !== 'string' || !/^[A-Z]{2}$/.test(e.countryCode) || typeof e.enabled !== 'boolean' || !['hls', 'external'].includes(e.playback) || e.playback === 'hls' && (!webUrl(e.url, true) || !/\.m3u8(?:[?#]|$)/i.test(e.url))) throw Error('Invalid feed channel.')
      if (e.logoUrl && !safeLogoUrl(e.logoUrl) || e.group !== undefined && typeof e.group !== 'string' || e.mapping !== undefined && typeof e.mapping !== 'string' || e.excluded !== undefined && typeof e.excluded !== 'boolean') throw Error('Invalid channel settings.')
      if (e.check && (!['working', 'failed', 'inconclusive', 'external'].includes(e.check.status) || typeof e.check.reason !== 'string' || !Number.isFinite(e.check.at))) throw Error('Invalid verification result.')
      entries.add(e.id)
    }
    if (feed.guide) { validateGuide(feed.guide); if (guideIds.has(feed.guide.id)) throw Error('Each guide source needs a unique id.'); guideIds.add(feed.guide.id) }
  }
  if (data.builtin) { validateGuide(data.builtin); if (guideIds.has(data.builtin.id)) throw Error('Each guide source needs a unique id.') }
  return structuredClone(data)
}
export function exportLibrary(library: Library) {
  return { version: 1, preferred: library.preferred, feeds: library.feeds.map(feed => ({ ...feed, error: undefined, guide: feed.guide?.uploaded ? feed.guide : undefined })) }
}

export function openTvDatabase(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(Error('Browser storage is unavailable.')); return }
    const request = factory.open('frequency-tv-feeds', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('settings')
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(Error('Close other Frequency tabs to update storage.'))
  })
}
const savedGuideReferences = new WeakMap<IDBDatabase, Map<string, Guide>>()
export function readLibrary(db: IDBDatabase): Promise<Library | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings'), store = tx.objectStore('settings'), request = store.get('library')
    const guides = new Map<string, Guide>()
    request.onsuccess = () => {
      const stored = request.result
      if (!stored || !Array.isArray(stored.feeds) || stored.feeds.length > 150) return
      const ids: string[] = [stored.builtinId, ...stored.feeds.map((feed: any) => feed?.guideId)].filter(id => typeof id === 'string')
      for (const id of new Set(ids)) { const guide = store.get(`guide:${id}`); guide.onsuccess = () => { if (guide.result) guides.set(id, guide.result) } }
    }
    tx.oncomplete = () => {
      try {
        const stored = request.result
        if (!stored) { resolve(undefined); return }
        const { builtinId, ...rest } = stored
        const data = { ...rest, ...((guides.get(builtinId) ?? stored.builtin) ? { builtin: guides.get(builtinId) ?? stored.builtin } : {}), feeds: stored.feeds.map((feed: any) => { const { guideId, ...metadata } = feed; return { ...metadata, ...((guides.get(guideId) ?? feed.guide) ? { guide: guides.get(guideId) ?? feed.guide } : {}) } }) }
        resolve(validateLibrary(data))
      } catch (error) { reject(error) }
    }
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  })
}
export function writeLibrary(db: IDBDatabase, library: Library): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite'), store = tx.objectStore('settings')
    const guides = [library.builtin, ...library.feeds.map(feed => feed.guide)].filter((guide): guide is Guide => Boolean(guide))
    const previous = savedGuideReferences.get(db) ?? new Map<string, Guide>()
    for (const guide of guides) if (previous.get(guide.id) !== guide) store.put(guide, `guide:${guide.id}`)
    // Channel toggles/probe results must not repeatedly rewrite a 50k-programme guide.
    const { builtin, ...metadata } = library
    store.put({ ...metadata, builtinId: builtin?.id, feeds: library.feeds.map(feed => { const { guide, ...rest } = feed; return { ...rest, guideId: guide?.id } }) }, 'library')
    tx.oncomplete = () => { for (const guide of guides) previous.set(guide.id, guide); savedGuideReferences.set(db, previous); resolve() }
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error)
  })
}
