import { safeLogoUrl, safeUrl } from './catalogue.js'

export const MAX_ITEMS = 20000

/**
 * @typedef {object} Channel
 * @property {string} id
 * @property {string} title
 * @property {string} category Free-TV section, e.g. "Freeview"
 * @property {string[]} tags
 * @property {string|null} countryCode ISO 3166-1 (the UK is `GB` in data)
 * @property {string|null} logoUrl
 * @property {string} url what opens in a new tab
 * @property {string} [streamUrl] HTTPS HLS, only when it can play inline
 * @property {'hls'|'external'} playback
 * @property {string|null} quality
 * @property {string[]} labels e.g. "Geo-blocked", "YouTube"
 * @property {number} order position in the Free-TV list
 * @property {number|null} pin position from scripts/tv-config.json, or null
 * @property {string|null} epgId
 * @property {string} [health]
 */

/** Plain http or https: external rows may open an http stream in a new tab. */
function openableUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null } catch { return null }
}

/**
 * Validate one country's Free-TV catalogue (public/tv/<CC>.json). Deliberately
 * separate from validateCatalogue: inline TV must be HTTPS HLS, and anything
 * else is only ever opened in a new tab, never fed to the player.
 * @param {any} data
 * @returns {Channel[]}
 */
export function validateTvCatalogue(data) {
  if (data?.version !== 1 || !Array.isArray(data.items) || data.items.length > MAX_ITEMS) throw new Error('Use a version 1 TV catalogue with up to 20000 channels.')
  const ids = new Set()
  return data.items.map((item, index) => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Each channel needs a unique id.')
    if (typeof item.title !== 'string' || !item.title.trim()) throw new Error('Each channel needs a title.')
    const playback = item.playback === 'external' ? 'external' : 'hls'
    if (playback === 'hls' && (!safeUrl(item.streamUrl) || !/\.m3u8(?:[?#]|$)/i.test(item.streamUrl))) throw new Error('Inline channel streams must be HTTPS HLS playlists.')
    const url = playback === 'hls' ? item.streamUrl : openableUrl(item.url)
    if (!url) throw new Error('External channels need an http(s) link.')
    if (item.logoUrl !== undefined && item.logoUrl !== null && !safeLogoUrl(item.logoUrl)) throw new Error('Channel logos must be HTTPS or an app-relative image path.')
    if (item.countryCode !== undefined && item.countryCode !== null && !/^[A-Z]{2}$/.test(item.countryCode)) throw new Error('Country code must be two uppercase letters.')
    ids.add(item.id)
    const rest = { ...item }
    delete rest.streamUrl
    return {
      ...rest,
      title: item.title.trim(),
      category: typeof item.category === 'string' && item.category.trim() ? item.category : 'General',
      tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string') : [],
      labels: Array.isArray(item.labels) ? item.labels.filter(label => typeof label === 'string') : [],
      url,
      // An external row never carries a streamUrl, so the player cannot be
      // handed an http:// or YouTube URL by mistake.
      ...(playback === 'hls' ? { streamUrl: item.streamUrl } : {}),
      playback,
      order: Number.isInteger(item.order) ? item.order : index,
      pin: Number.isInteger(item.pin) && item.pin >= 0 ? item.pin : null,
      countryCode: item.countryCode ?? null,
      logoUrl: item.logoUrl ?? null,
      quality: typeof item.quality === 'string' ? item.quality : null,
      epgId: typeof item.epgId === 'string' && item.epgId ? item.epgId : null,
    }
  })
}

/**
 * @typedef {object} TvCountry
 * @property {string} code ISO 3166-1
 * @property {string} name menu name ("UK", "France")
 * @property {number} channels
 */

/**
 * Validate public/tv/index.json, the list of countries with a catalogue.
 * @param {any} data
 * @returns {TvCountry[]}
 */
export function validateTvIndex(data) {
  if (data?.version !== 1 || !Array.isArray(data.countries)) throw new Error('Use a version 1 TV country index.')
  const codes = new Set()
  return data.countries.map(country => {
    if (!country || typeof country.code !== 'string' || !/^[A-Z]{2}$/.test(country.code) || codes.has(country.code)) throw new Error('Each country needs a unique two-letter code.')
    if (typeof country.name !== 'string' || !country.name.trim()) throw new Error('Each country needs a name.')
    codes.add(country.code)
    return { code: country.code, name: country.name.trim(), channels: Number.isInteger(country.channels) ? country.channels : 0 }
  })
}

/**
 * The code shown in menus and URLs. The UK is "UK" to people, even though
 * ISO 3166-1 (and every data file) calls it GB.
 * @param {string} code
 */
export function displayCode(code) {
  return code === 'GB' ? 'UK' : code
}

/**
 * Accept what a person might type or bookmark (`UK`, `uk`, `GB`) and return
 * the data code.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function parseCountryParam(value) {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  if (code === 'UK') return 'GB'
  return /^[A-Z]{2}$/.test(code) ? code : null
}

/**
 * The country as it reads in a sentence: "the UK", "the USA", "France".
 * @param {{ code: string, name: string }} country
 */
export function countryInSentence(country) {
  return ['GB', 'US', 'AE', 'NL', 'CZ', 'DO'].includes(country.code) ? `the ${country.name}` : country.name
}

/**
 * Regional-indicator flag emoji for an ISO code (GB → 🇬🇧). XK (Kosovo) has
 * no standard flag and falls back to the letters.
 * @param {string} code
 */
export function flagEmoji(code) {
  if (!/^[A-Z]{2}$/.test(code) || code === 'XK') return ''
  return String.fromCodePoint(...[...code].map(letter => 0x1F1E6 + letter.charCodeAt(0) - 65))
}
