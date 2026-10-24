// Parsing for Free-TV/IPTV channel lists (https://github.com/Free-TV/IPTV).
// Each lists/<country>.md file is a set of markdown tables in channel-number
// order. Kept free of I/O so it can be exercised by node --test.

/**
 * List file stem → ISO 3166-1 code and the name shown in menus. Codes match
 * Free-TV's own make_playlist.py. The UK is "UK" in menus but stays `GB` in
 * data so it lines up with the radio catalogue.
 */
export const COUNTRY_FILES = {
  albania: ['AL', 'Albania'], andorra: ['AD', 'Andorra'], argentina: ['AR', 'Argentina'], armenia: ['AM', 'Armenia'],
  australia: ['AU', 'Australia'], austria: ['AT', 'Austria'], azerbaijan: ['AZ', 'Azerbaijan'], belarus: ['BY', 'Belarus'],
  belgium: ['BE', 'Belgium'], bosnia_and_herzegovina: ['BA', 'Bosnia and Herzegovina'], brazil: ['BR', 'Brazil'],
  bulgaria: ['BG', 'Bulgaria'], canada: ['CA', 'Canada'], chad: ['TD', 'Chad'], chile: ['CL', 'Chile'], china: ['CN', 'China'],
  costa_rica: ['CR', 'Costa Rica'], croatia: ['HR', 'Croatia'], cyprus: ['CY', 'Cyprus'], czech_republic: ['CZ', 'Czechia'],
  denmark: ['DK', 'Denmark'], dominican_republic: ['DO', 'Dominican Republic'], egypt: ['EG', 'Egypt'], estonia: ['EE', 'Estonia'],
  faroe_islands: ['FO', 'Faroe Islands'], finland: ['FI', 'Finland'], france: ['FR', 'France'], georgia: ['GE', 'Georgia'],
  germany: ['DE', 'Germany'], greece: ['GR', 'Greece'], greenland: ['GL', 'Greenland'], hong_kong: ['HK', 'Hong Kong'],
  hungary: ['HU', 'Hungary'], iceland: ['IS', 'Iceland'], india: ['IN', 'India'], indonesia: ['ID', 'Indonesia'], iran: ['IR', 'Iran'],
  iraq: ['IQ', 'Iraq'], ireland: ['IE', 'Ireland'], israel: ['IL', 'Israel'], italy: ['IT', 'Italy'], japan: ['JP', 'Japan'],
  kazakhstan: ['KZ', 'Kazakhstan'], kenya: ['KE', 'Kenya'], korea: ['KR', 'South Korea'], kosovo: ['XK', 'Kosovo'],
  latvia: ['LV', 'Latvia'], lebanon: ['LB', 'Lebanon'], lithuania: ['LT', 'Lithuania'], luxembourg: ['LU', 'Luxembourg'],
  macau: ['MO', 'Macau'], malta: ['MT', 'Malta'], mexico: ['MX', 'Mexico'], moldova: ['MD', 'Moldova'], monaco: ['MC', 'Monaco'],
  mongolia: ['MN', 'Mongolia'], montenegro: ['ME', 'Montenegro'], netherlands: ['NL', 'Netherlands'], nigeria: ['NG', 'Nigeria'],
  north_korea: ['KP', 'North Korea'], north_macedonia: ['MK', 'North Macedonia'], norway: ['NO', 'Norway'], paraguay: ['PY', 'Paraguay'],
  peru: ['PE', 'Peru'], poland: ['PL', 'Poland'], portugal: ['PT', 'Portugal'], qatar: ['QA', 'Qatar'], romania: ['RO', 'Romania'],
  russia: ['RU', 'Russia'], san_marino: ['SM', 'San Marino'], saudi_arabia: ['SA', 'Saudi Arabia'], serbia: ['RS', 'Serbia'],
  slovakia: ['SK', 'Slovakia'], slovenia: ['SI', 'Slovenia'], somalia: ['SO', 'Somalia'], spain: ['ES', 'Spain'],
  spain_vod: ['ES', 'Spain'], sweden: ['SE', 'Sweden'], switzerland: ['CH', 'Switzerland'], taiwan: ['TW', 'Taiwan'],
  trinidad: ['TT', 'Trinidad and Tobago'], turkey: ['TR', 'Turkey'], turkmenistan: ['TM', 'Turkmenistan'], uk: ['GB', 'UK'],
  ukraine: ['UA', 'Ukraine'], united_arab_emirates: ['AE', 'United Arab Emirates'], usa: ['US', 'USA'], usa_vod: ['US', 'USA'],
  venezuela: ['VE', 'Venezuela'],
}

/** Theme lists (zz_news_en, zz_movies, …) are not countries and are skipped. */
export function isCountryFile(stem) {
  return !stem.startsWith('zz_') && stem !== 'README'
}

/** Sections that are not live TV for this app. */
const SKIPPED_SECTION = /^(invalid|.*radio.*)$/i

/** Only HTTPS HLS plays in a browser on an HTTPS origin. */
export function isPlayable(url) {
  return typeof url === 'string' && url.startsWith('https://') && /\.m3u8(?:[?#]|$)/i.test(url)
}

/** A URL a person can open in a new tab: the http stream, YouTube page, etc. */
export function isOpenable(url) {
  return typeof url === 'string' && /^https?:\/\/[^\s"<>]+$/i.test(url)
}

function slug(value) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'channel'
}

/**
 * Parse one Free-TV list. Rows marked `[>]` are kept and `[x]` rows dropped,
 * exactly as Free-TV's own playlist generator does. File order is preserved.
 * @returns {{ items: object[], skipped: number }}
 */
export function parseList(markdown, { code }) {
  const items = []
  const ids = new Set()
  let section = 'Channels'
  let skipped = 0
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim()
    const heading = line.match(/^<h2>(.*?)<\/h2>$/i) ?? line.match(/^##\s+(.*)$/)
    if (heading) { section = heading[1].replace(/<[^>]+>/g, '').trim() || section; continue }
    if (!line.startsWith('|') || !line.includes('[>]')) continue
    if (SKIPPED_SECTION.test(section)) continue
    // Free-TV's generator splits on `|` the same way; logos and URLs never
    // contain a pipe.
    const cells = line.split('|')
    if (cells.length < 5) { skipped++; continue }
    const name = cells[2].trim()
    const link = cells[3].trim()
    const url = link.slice(link.indexOf('(') + 1, link.lastIndexOf(')')).trim()
    const logo = cells[4].match(/src="([^"]+)"/)?.[1] ?? null
    const epgId = cells.length > 6 ? cells[5].trim() || null : null
    const title = name.replace(/[Ⓐ-ⓩ]/g, '').replace(/\s+/g, ' ').trim()
    if (!title || !isOpenable(url)) { skipped++; continue }
    const labels = name.includes('Ⓖ') ? ['Geo-blocked'] : []
    if (name.includes('Ⓨ') || /youtube\.com|youtu\.be/i.test(url)) labels.push('YouTube')
    const playable = isPlayable(url)
    let id = `${code}:${slug(title)}`
    for (let n = 2; ids.has(id); n++) id = `${code}:${slug(title)}-${n}`
    ids.add(id)
    items.push({
      id,
      title,
      category: section,
      tags: [section],
      countryCode: code,
      logoUrl: logo && logo.startsWith('https://') ? logo : null,
      // `url` is what opens in a new tab; `streamUrl` only exists when the
      // browser can play it inline.
      url,
      ...(playable ? { streamUrl: url } : {}),
      playback: playable ? 'hls' : 'external',
      quality: name.includes('Ⓢ') ? 'SD' : null,
      labels,
      epgId,
      order: items.length,
    })
  }
  return { items, skipped }
}

/**
 * Free-TV and the Freeview EPG disagree on a few ids for the same channel.
 * Keyed on the Free-TV EPG column; values are dp247/Freeview-EPG channel ids.
 * Regional channels map to one representative region.
 */
export const EPG_ALIASES = {
  'BBCOne.uk': 'BBCOneLondonHD.uk',
  'BBCTwo.uk': 'BBCTwoHD.uk',
  'BBCThree.uk': 'BBCThreeHD.uk',
  'BBCFour.uk': 'BBCFourHD.uk',
  'ITV1.uk': 'ITV1London.uk',
  'STV.uk': 'STVCentral.uk',
  'Channel4.uk': 'Channel4London.uk',
  'Channel5.uk': '5.uk',
}

/** The Freeview EPG channel id for a Free-TV EPG id, accounting for aliases. */
export function epgIdFor(epgId, epgChannels) {
  if (!epgId) return null
  if (epgChannels.has(epgId)) return epgId
  const alias = EPG_ALIASES[epgId]
  return alias && epgChannels.has(alias) ? alias : null
}

const CONFIG_KEYS = new Set(['pin', 'hide', 'add'])
const ADD_KEYS = new Set(['id', 'title', 'url', 'category', 'logoUrl', 'quality', 'labels', 'epgId'])

/**
 * Check one country's entry in scripts/tv-config.json. A bad entry stops the
 * sync rather than being skipped: a typo should be loud.
 * @returns {{ pin: string[], hide: string[], add: object[] }}
 */
export function validateConfig(config = {}, code = '') {
  const where = `tv config${code ? ` ${code}` : ''}`
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${where} must be an object.`)
  for (const key of Object.keys(config)) if (!CONFIG_KEYS.has(key)) throw new Error(`${where}: unknown key "${key}".`)
  const ids = name => {
    const value = config[name] ?? []
    if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id.trim())) throw new Error(`${where}: "${name}" must be a list of channel ids.`)
    return value.map(id => id.trim())
  }
  const add = config.add ?? []
  if (!Array.isArray(add)) throw new Error(`${where}: "add" must be a list.`)
  const seen = new Set()
  for (const entry of add) {
    const label = entry?.id ?? JSON.stringify(entry)
    if (!entry || typeof entry !== 'object') throw new Error(`${where}: add entry ${label} must be an object.`)
    for (const key of Object.keys(entry)) if (!ADD_KEYS.has(key)) throw new Error(`${where}: add entry ${label} has unknown key "${key}".`)
    if (typeof entry.id !== 'string' || !entry.id) throw new Error(`${where}: add entry ${label} needs an id.`)
    if (typeof entry.title !== 'string' || !entry.title.trim()) throw new Error(`${where}: add entry ${label} needs a title.`)
    if (!isOpenable(entry.url)) throw new Error(`${where}: add entry ${label} needs an http(s) url.`)
    if (seen.has(entry.id)) throw new Error(`${where}: add entry ${label} is listed twice.`)
    seen.add(entry.id)
  }
  return { pin: ids('pin'), hide: ids('hide'), add }
}

/**
 * Apply one country's hand-edited config: hide, then add (same id replaces),
 * then pin. Hide always wins. Pinned channels lead; everything else keeps
 * Free-TV's file order, with added channels after it.
 */
export function applyConfig(items, config, code) {
  const { pin, hide, add } = validateConfig(config, code)
  const hidden = item => hide.includes(item.id)
  const byId = new Map(items.filter(item => !hidden(item)).map(item => [item.id, item]))
  let next = items.length
  for (const entry of add) {
    const playable = isPlayable(entry.url)
    const row = {
      id: entry.id,
      title: entry.title.trim(),
      category: entry.category ?? 'Added',
      tags: [entry.category ?? 'Added'],
      countryCode: code,
      logoUrl: entry.logoUrl ?? null,
      url: entry.url,
      ...(playable ? { streamUrl: entry.url } : {}),
      playback: playable ? 'hls' : 'external',
      quality: entry.quality ?? null,
      labels: entry.labels ?? [],
      epgId: entry.epgId ?? null,
      order: byId.get(entry.id)?.order ?? next++,
      source: 'config',
    }
    if (!hidden(row)) byId.set(row.id, row)
  }
  const result = [...byId.values()]
  for (const item of result) {
    const position = pin.indexOf(item.id)
    item.pin = position < 0 ? null : position
  }
  result.sort((a, b) => (a.pin ?? Infinity) - (b.pin ?? Infinity) || a.order - b.order)
  const unmatched = [
    ...pin.filter(id => !result.some(item => item.id === id)).map(id => `pin:${id}`),
    ...hide.filter(id => !items.some(item => item.id === id) && !add.some(entry => entry.id === id)).map(id => `hide:${id}`),
  ]
  return { items: result, hidden: items.filter(hidden).length, added: add.filter(entry => byId.get(entry.id)?.source === 'config').length, unmatched }
}
