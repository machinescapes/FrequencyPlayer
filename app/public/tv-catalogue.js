import { safeLogoUrl, safeUrl, loadSaved, save } from './catalogue.js'

export const MAX_ITEMS = 20000

/**
 * @typedef {object} Channel
 * @property {string} id
 * @property {string} title
 * @property {string} category
 * @property {string[]} tags
 * @property {string|null} countryCode
 * @property {string|null} logoUrl
 * @property {string} streamUrl
 * @property {string|null} quality
 * @property {string[]} labels
 * @property {string|null} broadcaster
 * @property {boolean} essential
 */

/**
 * Validate an iptv-org snapshot. Deliberately separate from validateCatalogue:
 * TV rows must be playable (HTTPS HLS) and carry a category, and the radio
 * app's 500-item cap stays where it is.
 * @param {any} data
 * @returns {Channel[]}
 */
export function validateTvCatalogue(data) {
  if (data?.version !== 1 || !Array.isArray(data.items) || data.items.length > MAX_ITEMS) throw new Error('Use a version 1 TV catalogue with up to 20000 channels.')
  const ids = new Set()
  return data.items.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error('Each channel needs a unique id.')
    if (typeof item.title !== 'string' || !item.title.trim()) throw new Error('Each channel needs a title.')
    if (!safeUrl(item.streamUrl) || !/\.m3u8(?:[?#]|$)/i.test(item.streamUrl)) throw new Error('Channel streams must be HTTPS HLS playlists.')
    if (item.logoUrl !== undefined && item.logoUrl !== null && !safeLogoUrl(item.logoUrl)) throw new Error('Channel logos must be HTTPS or an app-relative image path.')
    if (item.countryCode !== undefined && item.countryCode !== null && !/^[A-Z]{2}$/.test(item.countryCode)) throw new Error('Country code must be two uppercase letters.')
    ids.add(item.id)
    const labels = Array.isArray(item.labels) ? item.labels.filter(label => typeof label === 'string') : []
    return {
      ...item,
      title: item.title.trim(),
      category: typeof item.category === 'string' && item.category.trim() ? item.category : 'General',
      tags: Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string') : [],
      labels,
      broadcaster: typeof item.broadcaster === 'string' && item.broadcaster ? item.broadcaster : null,
      essential: item.essential === true,
      countryCode: item.countryCode ?? null,
      logoUrl: item.logoUrl ?? null,
      quality: typeof item.quality === 'string' ? item.quality : null,
    }
  })
}

/**
 * @param {{ fetchJson: () => Promise<any>, cached: any }} options
 * @returns {Promise<{ items: Channel[], saved: boolean }>}
 */
export function loadTvCatalogue({ fetchJson, cached }) {
  return fetchJson().then(data => {
    const items = validateTvCatalogue(data)
    save('frequency.tv.catalogue', data)
    return { items, saved: true }
  }).catch(() => {
    try {
      return { items: validateTvCatalogue(cached), saved: false }
    } catch {
      throw new Error('Channel list unavailable.')
    }
  })
}

/** @returns {any} */
export function readTvCache() {
  return loadSaved('frequency.tv.catalogue', { version: 1, items: [] })
}

const PALETTE = ['#c5e762', '#cfa3e9', '#f2c14e', '#7ad0c5', '#e88f6b', '#8fa9e8', '#e07b9a', '#9fd8a0']

/**
 * Stable accent per category, so the grid reads as grouped without extra chrome.
 * @param {string} category
 * @returns {string}
 */
export function categoryColor(category) {
  let hash = 0
  for (const character of category) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

/**
 * @param {Channel[]} items
 * @param {{ query?: string, category?: string, country?: string, broadcaster?: string, essentials?: boolean, onlyFavourites?: boolean, favourites?: string[] }} [filters]
 * @returns {Channel[]}
 */
export function searchChannels(items, { query = '', category = 'All', country = 'All', broadcaster = 'All', essentials = false, onlyFavourites = false, favourites = [] } = {}) {
  const needle = query.trim().toLowerCase()
  return items
    .filter(item => !needle || `${item.title} ${item.category} ${item.broadcaster ?? ''} ${item.tags.join(' ')}`.toLowerCase().includes(needle))
    .filter(item => category === 'All' || item.category === category)
    .filter(item => country === 'All' || item.countryCode === country)
    .filter(item => broadcaster === 'All' || item.broadcaster === broadcaster)
    .filter(item => !essentials || item.essential)
    .filter(item => !onlyFavourites || favourites.includes(item.id))
}

/** Broadcaster families present in the catalogue, most channels first. */
export function broadcasterFacets(items) {
  const counts = new Map()
  for (const item of items) if (item.broadcaster) counts.set(item.broadcaster, (counts.get(item.broadcaster) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])
}
