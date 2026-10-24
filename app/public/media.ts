// One normalised shape for radio stations and TV channels, so scope, search,
// favourites and the guide all operate on the same list.

export type Source = 'watch' | 'listen'

export type MediaItem = {
  id: string
  source: Source
  kind: 'live' | 'show' | 'feed' | 'audio'
  title: string
  subtitle?: string
  url: string
  streamUrl?: string
  streamType?: 'mp3' | 'aac' | 'hls'
  logoUrl?: string
  color: string
  mark?: string
  brand?: string
  broadcaster?: string
  category: string
  categories: string[]
  countryCode?: string
  quality?: string
  labels: string[]
  // The unprefixed catalogue id, needed to join against guide station ids.
  rawId: string
  hasGuide: boolean
  /**
   * Stream state at the last sync. `geo`: geo-blocked and unreachable from the
   * sync runner (expected to work over a VPN). `external`: opens in a new tab.
   */
  health?: 'ok' | 'cors' | 'offline' | 'geo' | 'external' | 'unknown'
  /** Position in scripts/tv-config.json `pin`, if the channel is pinned. */
  pin?: number
  /** Position in the Free-TV list, which is the default display order. */
  order?: number
}

const PALETTE = ['#c5e762', '#cfa3e9', '#f2c14e', '#7ad0c5', '#e88f6b', '#8fa9e8', '#e07b9a', '#9fd8a0']

/** Stable accent per label, so the grid reads as grouped without extra chrome. */
export function categoryColor(label: string) {
  let hash = 0
  for (const character of label) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

export function namespacedId(source: Source, id: string) {
  return `${source}:${id}`
}

/**
 * The station id used by the guide: radio programmes keep the catalogue id,
 * TV programmes are namespaced so the two sources cannot collide.
 */
export function guideStationId(item: MediaItem) {
  return item.source === 'watch' ? `watch:${item.rawId}` : item.rawId
}

/** Radio catalogue rows already carry everything the UI needs. */
export function fromRadio(item: any, programmeIds: Set<string>): MediaItem {
  const categories = Array.isArray(item.tags) && item.tags.length ? item.tags : [item.provider ?? 'Station']
  return {
    ...item,
    id: namespacedId('listen', item.id),
    source: 'listen',
    kind: item.kind,
    title: item.title,
    url: item.url,
    color: item.color,
    brand: item.brand,
    mark: item.mark,
    broadcaster: item.provider ?? undefined,
    category: categories[0],
    categories,
    countryCode: item.countryCode,
    labels: [],
    rawId: item.id,
    hasGuide: Boolean(item.scheduleId && programmeIds.has(item.id)),
  }
}

/** TV snapshot rows become live catalogue items with the same shape. */
export function fromWatch(item: any, programmeIds: Set<string>): MediaItem {
  const categories = Array.isArray(item.tags) && item.tags.length ? item.tags : [item.category ?? 'General']
  const label = item.broadcaster ?? item.category ?? 'General'
  return {
    id: namespacedId('watch', item.id),
    source: 'watch',
    kind: 'live',
    title: item.title,
    // Inline channels open their own stream; external ones (http://, YouTube)
    // have no streamUrl, so the card opens `url` in a new tab instead.
    url: item.url ?? item.streamUrl,
    ...(item.playback === 'external' ? {} : { streamUrl: item.streamUrl, streamType: 'hls' as const }),
    logoUrl: item.logoUrl ?? undefined,
    color: categoryColor(label),
    mark: firstLetter(item.title),
    brand: label,
    broadcaster: item.broadcaster ?? undefined,
    category: item.category ?? 'General',
    categories,
    countryCode: item.countryCode ?? undefined,
    quality: item.quality ?? undefined,
    labels: Array.isArray(item.labels) ? item.labels : [],
    rawId: item.id,
    hasGuide: Boolean(item.epgId) && programmeIds.has(`watch:${item.id}`),
    health: item.health ?? 'unknown',
    pin: Number.isInteger(item.pin) && item.pin >= 0 ? item.pin : undefined,
    order: Number.isInteger(item.order) ? item.order : undefined,
  }
}

function firstLetter(title: string) {
  const cleaned = title.replace(/^[^\p{L}\p{N}]+/u, '')
  return (cleaned[0] ?? '▣').toUpperCase()
}

export function mergeMedia(radio: any[], watch: any[], programmeIds: Set<string>): MediaItem[] {
  return [
    ...radio.filter(item => item && item.kind).map(item => fromRadio(item, programmeIds)),
    ...watch.filter(Boolean).map(item => fromWatch(item, programmeIds)),
  ]
}

export type Scope = 'all' | 'watch' | 'listen'

/**
 * Search is punctuation-insensitive so "great movies" finds "GREAT! movies"
 * and "channel4" finds "Channel 4".
 */
function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

/** Both the spaced and unspaced forms are compared, so either spelling works. */
function matches(text: string, word: string) {
  return text.includes(word) || text.replaceAll(' ', '').includes(word.replaceAll(' ', ''))
}

function haystack(item: MediaItem) {
  return normalizeText(`${item.title} ${item.broadcaster ?? ''} ${item.category} ${item.categories.join(' ')}`)
}

export function inScope(item: MediaItem, scope: Scope) {
  return scope === 'all' || item.source === scope
}

export type Filter = {
  scope?: Scope
  query?: string
  country?: string
  category?: string
  broadcaster?: string
  favouritesOnly?: boolean
  favourites?: string[]
  listingsOnly?: boolean
}

export function filterMedia(items: MediaItem[], filter: Filter = {}) {
  const {
    scope = 'all', query = '', country = 'All', category = 'All',
    broadcaster = 'All', favouritesOnly = false, favourites = [], listingsOnly = false,
  } = filter
  const words = normalizeText(query).split(' ').filter(Boolean)
  return items
    .filter(item => inScope(item, scope))
    .filter(item => !words.length || words.every(word => matches(haystack(item), word)))
    .filter(item => country === 'All' || item.countryCode === country)
    .filter(item => category === 'All' || item.category === category)
    .filter(item => broadcaster === 'All' || item.broadcaster === broadcaster)
    .filter(item => !favouritesOnly || favourites.includes(item.id))
    .filter(item => !listingsOnly || item.hasGuide)
}

/** Plain-language label for a stream the last sync could not verify. */
export function healthWarning(item: MediaItem): string | null {
  if (item.source !== 'watch') return null
  if (item.health === 'offline') return 'Offline at last check'
  if (item.health === 'cors') return 'May be blocked by its host'
  if (item.health === 'external') return 'Opens in a new tab'
  return null
}

/**
 * Channel order, first key wins:
 * 1. channels with listings (callers that split rows by guide see no effect)
 * 2. pinned, in scripts/tv-config.json `pin` order
 * 3. Free-TV list order, which follows each country's channel numbering
 * 4. title
 * Health never reorders: the list order is deliberate, and a dead or
 * geo-blocked card says so itself. Radio rows have no pin or order, so they
 * sort by 1 and 4. Favourites are not a key: the UI gives them their own row.
 */
export function orderChannels(items: MediaItem[]) {
  // Missing positions sort last; compare explicitly because ∞ − ∞ is NaN.
  const byPosition = (a?: number, b?: number) => a === b ? 0 : a === undefined ? 1 : b === undefined ? -1 : a - b
  return [...items].sort((a, b) =>
    Number(b.hasGuide) - Number(a.hasGuide) ||
    byPosition(a.pin, b.pin) ||
    byPosition(a.order, b.order) ||
    a.title.localeCompare(b.title, 'en'))
}

/** Guides are grouped by source so a mixed timeline stays legible. */
export function guideSections(items: MediaItem[]) {
  const withGuide = items.filter(item => item.hasGuide)
  return (['watch', 'listen'] as Source[])
    .map(source => ({ source, items: withGuide.filter(item => item.source === source) }))
    .filter(section => section.items.length > 0)
}

export function categoryOptions(items: MediaItem[]) {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en')).map(([name]) => name)
}

/**
 * Favourites used to live in two keys with unprefixed ids. Merge them once
 * into a single namespaced list.
 */
export function migrateFavourites(loadSaved: (key: string, fallback: any) => any, save: (key: string, value: any) => boolean) {
  const existing = loadSaved('frequency.favourites.v2', null)
  if (Array.isArray(existing)) return existing as string[]
  const radio = loadSaved('frequency.favourites', []) as string[]
  const tv = loadSaved('frequency.tv.favourites', []) as string[]
  const merged = [
    ...(Array.isArray(radio) ? radio : []).filter(id => typeof id === 'string').map(id => namespacedId('listen', id)),
    ...(Array.isArray(tv) ? tv : []).filter(id => typeof id === 'string').map(id => namespacedId('watch', id)),
  ]
  const unique = [...new Set(merged)]
  save('frequency.favourites.v2', unique)
  return unique
}

/** A single scope label pair keeps copy consistent across the app. */
export const SCOPE_LABELS: Record<Scope, { noun: string; action: string }> = {
  all: { noun: 'everything', action: 'Play' },
  watch: { noun: 'channels', action: 'Watch' },
  listen: { noun: 'stations', action: 'Listen' },
}
