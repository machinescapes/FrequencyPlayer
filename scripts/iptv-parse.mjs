// Parsing and normalisation for iptv-org playlists. Kept free of I/O so it can
// be exercised by node --test without network access.

const QUALITY = /\s*\((?:[^()]*\b\d{3,4}[pi]\b[^()]*)\)\s*$/i
const KNOWN_LABELS = new Set(['Not 24/7', 'Geo-blocked'])

/**
 * Split an EXTINF line at the first comma that is not inside a quoted
 * attribute — user-agent strings contain commas ("KHTML, like Gecko").
 */
function splitName(line) {
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) return { attributes: line.slice(0, index), name: line.slice(index + 1).trim() }
  }
  return null
}

/** Parse one M3U body into raw entries, keeping only HLS on HTTPS. */
export function parseM3u(text, { group } = {}) {
  const lines = text.split(/\r?\n/)
  const entries = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim()
    if (!line.startsWith('#EXTINF')) continue
    const split = splitName(line)
    if (!split) continue
    const attributes = {}
    for (const match of split.attributes.matchAll(/([\w-]+)="([^"]*)"/g)) attributes[match[1]] = match[2]
    const url = nextUrl(lines, index)
    if (!split.name || !url) continue
    entries.push({
      id: attributes['tvg-id'] || '',
      title: split.name,
      category: attributes['group-title'] || group || 'General',
      logoUrl: attributes['tvg-logo'] || '',
      streamUrl: url,
      // A browser cannot set these headers, so the stream will not play here.
      needsHeaders: Boolean(attributes['http-user-agent'] || attributes['http-referrer'] || attributes['referrer']),
      labels: parseLabels(split.name),
      quality: parseQuality(split.name),
      cleanTitle: cleanName(split.name),
    })
  }
  return entries
}

function nextUrl(lines, index) {
  for (let offset = 1; offset <= 2 && index + offset < lines.length; offset++) {
    const candidate = lines[index + offset].trim()
    if (!candidate) continue
    if (candidate.startsWith('#')) return ''
    return candidate
  }
  return ''
}

function parseLabels(name) {
  const labels = []
  for (const match of name.matchAll(/\[([^\]]+)\]/g)) {
    const label = match[1].trim()
    if (KNOWN_LABELS.has(label)) labels.push(label)
  }
  return labels
}

function parseQuality(name) {
  const match = name.match(QUALITY)
  return match ? match[0].trim().replace(/^\(|\)$/g, '') : null
}

function cleanName(name) {
  return name
    .replace(/\s*\((?:[^()]*\b\d{3,4}[pi]\b[^()]*)\)/gi, '')
    .replace(/\s*\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Only HTTPS HLS streams play in a browser; http:// is blocked as mixed content. */
export function isPlayable(entry) {
  return entry.streamUrl.startsWith('https://') && /\.m3u8(?:[?#]|$)/i.test(entry.streamUrl) && !entry.needsHeaders
}

/** iptv-org ids use broadcaster ccTLDs; map the odd ones to ISO 3166-1. */
const ISO_OVERRIDES = { UK: 'GB' }

/** Channel ids look like `BBCOne.uk@SD`; the ccTLD is the origin country. */
export function countryFromId(id) {
  const match = id.match(/\.([a-z]{2})(?:@|$)/i)
  if (!match) return null
  const code = match[1].toUpperCase()
  return ISO_OVERRIDES[code] ?? code
}

/**
 * Broadcaster families. Matched against the channel id first and the display
 * name second, so `BBCNews.uk` and "Sky News Arabia" both land correctly.
 * Order matters: the first match wins.
 */
export const BROADCASTERS = [
  // UK terrestrial families only count when the id is actually a .uk channel:
  // "Channel 44" (AU), "Kiss TV" (RO) and "Magic TV" (BG) are not Channel 4.
  ['BBC', /^bbc.*\.uk$|^bbc[^.]*$/i],
  ['ITV', /^itv[0-9a-z]*\.uk$/i],
  ['Channel 4', /^(channel4|e4|more4|film4|4seven|4music|thebox|kerrang|kiss|magic|boxplus|box)[a-z0-9]*\.uk$/i],
  ['Channel 5', /^(channel5|5usa|5star|5action|5select|milkshake)[a-z0-9]*\.uk$/i],
  ['Sky', /^sky[a-z0-9]*\.uk$|^skynews/i],
  ['UKTV', /^(dave|gold|drama|yesterday|alibi|eden|really)\.uk$/i],
  ['Paramount', /(^mtv|nickelodeon|nickjr|comedycentral|paramount|pluto|^bet|showtime)/i],
  ['Warner Bros. Discovery', /(discovery|foodnetwork|hgtv|^tlc|animalplanet|eurosport|cartoonnetwork|adultswim|boomerang)/i],
  ['NBCUniversal', /(^nbc|msnbc|^cnbc|telemundo|syfy|universalkids|skynews)/i],
  ['Disney', /(disney|^abcnews|freeform|nationalgeographic|^espn)/i],
  ['A+E Networks', /(^a&e|^aetv|^history|crime\+investigation|^lifetime|^blaze)/i],
  ['AMC Networks', /(^amc|sundance|^ifc|wetv|bbcamerica)/i],
  ['JioStar', /^(starplus|starbharat|starutsav|starmovies|stargold|starsports|colors|vijay|hotstar)/i],
  ['Zee', /^(zee|andtv|&tv)/i],
  ['Sony Pictures Networks', /^sony/i],
  ['Network18', /(news18|cnbctv18|cnnnews18)/i],
  ['India Today', /^(aajtak|indiatoday)/i],
  ['NDTV', /^ndtv/i],
  ['ABP', /^abp/i],
  ['Times Network', /(timesnow|etimes|mirrornow|moviemax)/i],
  ['Doordarshan', /^(dd|doordarshan)/i],
  ['Al Jazeera', /^aljazeera/i],
  ['Euronews', /^euronews/i],
  ['CNN', /^cnn/i],
  ['France 24', /^france24/i],
  ['Deutsche Welle', /^dw$/i],
  ['CGTN', /^cgtn/i],
  ['CCTV', /^cctv/i],
  ['NHK', /^nhk/i],
  ['Arirang', /^arirang/i],
  ['PBS', /^pbs/i],
  ['CBS', /^cbs/i],
  ['ABC', /^abc/i],
  ['Fox', /^fox/i],
  ['Bloomberg', /bloomberg/i],
  ['RT', /^(rt|russiatoday)/i],
  ['Rakuten TV', /rakuten/i],
  ['Samsung TV Plus', /samsung/i],
]

/**
 * Curated "essentials": one card per household-name brand. Patterns are matched
 * against the channel id, and the best stream per brand is kept — so BBC One,
 * Bloomberg and Red Bull each appear once rather than once per regional feed.
 */
export const ESSENTIAL_BRANDS = [
  ['BBC One', /^bbcone\./i],
  ['BBC News', /^bbcnews\./i],
  ['ITV', /^itv[234]\.uk$/i],
  ['Channel 4', /^channel4\.uk$/i],
  ['E4', /^e4\.uk$/i],
  ['More4', /^more4\.uk$/i],
  ['Channel 5', /^channel5\.uk$/i],
  ['5USA', /^5usa\.uk$/i],
  ['Sky News', /^skynews(weather)?\.uk$/i],
  ['Sky News Arabia', /^skynewsarabia\./i],
  ['GB News', /^gbnews\./i],
  ['Al Jazeera', /^aljazeera\./i],
  ['Al Jazeera English', /^aljazeeraenglish|^aljazeera2/i],
  ['CNN', /^cnn\./i],
  ['CNN International', /^cnninternational/i],
  ['France 24', /^france24\./i],
  ['DW', /^dw\./i],
  ['Euronews', /^euronewsenglish/i],
  ['NHK World', /^nhkworldjapan/i],
  ['Arirang', /^arirangtv/i],
  ['Bloomberg', /^bloombergtv/i],
  ['CNBC', /^cnbcuk\./i],
  ['CGTN', /^cgtn\./i],
  ['CCTV-4', /^cctv4europe/i],
  ['ABC News', /^abcnews(\.au|live)?\./i],
  ['CBS News', /^cbsnews247/i],
  ['NBC News NOW', /^nbcnewsnow/i],
  ['Fox News', /^foxnewschannel/i],
  ['Rai 1', /^rai1\./i],
  ['ZDF', /^zdf\./i],
  ['Das Erste', /^daserste\./i],
  ['TV5Monde', /^tv5mondeinfo/i],
  ['StarPlus', /^starplus\./i],
  ['Zee TV', /^zeetv/i],
  ['Colors', /^colors\./i],
  ['DD National', /^ddnational/i],
  ['Discovery', /^discoverychannel/i],
  ['National Geographic', /^nationalgeographic/i],
  ['Cartoon Network', /^cartoonnetwork/i],
  ['Nickelodeon', /^nickelodeon/i],
  ['Comedy Central', /^comedycentral/i],
  ['Eurosport', /^eurosport1/i],
  ['DAZN', /^dazn/i],
  ['Red Bull TV', /^redbulltv\./i],
]

/** @returns {string|null} the brand label for an id, if it is an essential. */
export function essentialBrand(id) {
  const base = id.split('@')[0]
  for (const [label, pattern] of ESSENTIAL_BRANDS) if (pattern.test(base)) return label
  return null
}

// Match against the channel id and the catalogue's network name only. Display
// names are too loose ("4 Music" from France is not Channel 4).
export function broadcasterFor(id, network) {
  const base = id.split('@')[0]
  const stem = base.split('.')[0]
  for (const [label, pattern] of BROADCASTERS) {
    // UK families are matched against the full id (they need `.uk`); global
    // families against the stem so the ccTLD cannot cause a false match.
    const ukFamily = /^(BBC|ITV|Channel 4|Channel 5|Sky|UKTV)$/.test(label)
    if (pattern.test(ukFamily ? base : stem) || (network && pattern.test(network))) return label
  }
  return null
}

/**
 * iptv-org and the Freeview EPG disagree on some ids for the same channel.
 * Without these, Channel 4, Channel 5 and BBC One Scotland would sort below
 * TV Warehouse because their listings look absent.
 */
export const EPG_ALIASES = {
  'Channel4.uk': 'Channel4London.uk',
  'Channel5.uk': '5.uk',
  'BBCOne.uk': 'BBCOneScotHD.uk',
  'SkyNewsWeather.uk': 'SkyNews.uk',
}

/** The EPG channel id for an iptv channel id, accounting for known aliases. */
export function epgIdFor(id, epgChannels) {
  const base = id.split('@')[0]
  if (epgChannels.has(base)) return base
  const alias = EPG_ALIASES[base]
  if (alias && epgChannels.has(alias)) return alias
  return null
}

/**
 * Turn raw entries into catalogue items: dedupe by id, drop blocklisted and
 * unplayable rows, and keep the best stream per channel.
 */
export function toItems(entries, { blocked = new Set(), limit = 20000, networks = new Map(), countries = null, epgChannels = null } = {}) {
  const byId = new Map()
  for (const entry of entries) {
    if (!isPlayable(entry)) continue
    if (entry.id && blocked.has(entry.id.split('@')[0])) continue
    const id = entry.id || `stream-${hash(entry.streamUrl)}`
    const previous = byId.get(id)
    if (previous && rank(previous) >= rank(entry)) continue
    const tags = entry.category.split(';').map(value => value.trim()).filter(Boolean)
    const title = entry.cleanTitle || entry.title
    const base = id.split('@')[0]
    const metadata = networks.get(base)
    const countryCode = metadata?.country ? ISO_OVERRIDES[metadata.country] ?? metadata.country : countryFromId(id)
    // Keep the snapshot small: filtering here rather than at read time also
    // keeps the guide join (below) over a few hundred rows instead of 8k.
    if (countries && !countries.has(countryCode)) continue
    byId.set(id, {
      id,
      title,
      // group-title values are often compound, e.g. "Animation;Kids;Music".
      category: tags[0] ?? 'General',
      tags,
      broadcaster: broadcasterFor(id, metadata?.network) ?? metadata?.network ?? null,
      essential: Boolean(essentialBrand(id)),
      countryCode,
      logoUrl: entry.logoUrl || null,
      streamUrl: entry.streamUrl,
      quality: entry.quality,
      labels: entry.labels,
      // The EPG id can differ from the iptv id; resolve it once at sync time.
      epgId: epgChannels ? epgIdFor(id, epgChannels) : null,
    })
  }
  // One card per essential brand: keep the best-ranked stream for that brand.
  const bestBrand = new Map()
  for (const item of byId.values()) {
    const brand = essentialBrand(item.id)
    if (!brand) continue
    const current = bestBrand.get(brand)
    if (!current || rank({ quality: item.quality, labels: item.labels }) > rank({ quality: current.quality, labels: current.labels })) bestBrand.set(brand, item)
  }
  for (const item of byId.values()) {
    if (!item.essential) continue
    if (bestBrand.get(essentialBrand(item.id)) !== item) item.essential = false
  }
  return [...byId.values()]
    .sort((a, b) => Number(b.essential) - Number(a.essential) || a.title.localeCompare(b.title, 'en'))
    .slice(0, limit)
}

const QUALITY_RANK = ['2160p', '1440p', '1080p', '720p', '576p', '480p', '360p', '240p']

function rank(entry) {
  const quality = entry.quality ? QUALITY_RANK.indexOf(entry.quality) : -1
  const known = quality < 0 ? 0 : QUALITY_RANK.length - quality
  return (entry.labels.includes('Not 24/7') ? 0 : 1000) + known
}

function hash(value) {
  let result = 0
  for (let index = 0; index < value.length; index++) result = (result * 31 + value.charCodeAt(index)) | 0
  return Math.abs(result).toString(36)
}

/** Build the committed snapshot document from fetched playlist bodies. */
export function buildSnapshot(sources, { blocked, limit, networks, countries = null, epgChannels = null, generatedAt = new Date().toISOString() } = {}) {
  const entries = []
  for (const source of sources) entries.push(...parseM3u(source.text, { group: source.group }))
  const items = toItems(entries, { blocked, limit, networks, countries, epgChannels })
  return {
    version: 1,
    generatedAt,
    source: {
      name: 'iptv-org',
      url: 'https://iptv-org.github.io/',
      playlists: sources.map(source => source.url),
    },
    counts: {
      channels: items.length,
      essentials: items.filter(item => item.essential).length,
      broadcasters: new Set(items.map(item => item.broadcaster).filter(Boolean)).size,
      countries: new Set(items.map(item => item.countryCode).filter(Boolean)).size,
      withGuide: items.filter(item => item.epgId).length,
    },
    items,
  }
}
