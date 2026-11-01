import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { validateSchedule } from '../app/public/epg.ts'

export const FEED_URL = 'https://raw.githubusercontent.com/dp247/Freeview-EPG/master/epg.xml'
export function xmltvTime(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?$/.exec(String(value))
  if (!match) throw Error('Invalid XMLTV timestamp')
  const [, year, month, day, hour, minute, second, sign, oh = '0', om = '0'] = match
  const utc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)
  const date = new Date(utc)
  if (date.getUTCFullYear() !== +year || date.getUTCMonth() !== +month - 1 || date.getUTCDate() !== +day || +hour > 23 || +minute > 59 || +second > 59 || +oh > 23 || +om > 59) throw Error('Invalid XMLTV date')
  return utc - (sign === '-' ? -1 : 1) * (+oh * 60 + +om) * 60000
}
export function extractSchedule(xml, items, now = Date.now(), tvItems = []) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw Error('Malformed XMLTV')
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true,
    isArray: name => ['channel', 'programme', 'title', 'desc', 'icon', 'presenter'].includes(name) })
  const tv = parser.parse(xml).tv
  if (!tv || !Array.isArray(tv.programme)) throw Error('Missing XMLTV listings')
  const mapping = new Map(items.filter(i => i.scheduleSource === 'freeview' && i.scheduleId).map(i => [i.scheduleId, i.id]))
  // TV channels share this guide. Their station id is namespaced so the two
  // catalogues can never collide in the merged timeline.
  for (const channel of tvItems) {
    if (!channel.epgId || mapping.has(channel.epgId)) continue
    mapping.set(channel.epgId, `watch:${channel.id}`)
  }
  const required = new Set(items.filter(i => i.scheduleSource === 'freeview' && i.scheduleId).map(i => i.id))
  const programmes = [], seen = new Set()
  const text = node => typeof node === 'string' ? node : node?.['#text']
  for (const p of tv.programme) {
    const stationId = mapping.get(p['@_channel'])
    if (!stationId) continue
    const start = xmltvTime(p['@_start']), end = xmltvTime(p['@_stop'])
    if (end <= start) throw Error('Invalid programme duration')
    if (end < now - 86400000 || start > now + 8 * 86400000) continue
    const title = text(p.title?.[0])
    if (typeof title !== 'string' || !title.trim()) throw Error('Missing title')
    const key = `${stationId}:${start}`
    if (seen.has(key)) continue
    seen.add(key)
    const description = text(p.desc?.[0]), artwork = p.icon?.[0]?.['@_src']
    const presenters = p.credits?.presenter?.map(text).filter(x => typeof x === 'string')
    programmes.push({ stationId, title, start, end,
      ...(description ? { description } : {}),
      ...(typeof artwork === 'string' && artwork.startsWith('https://') ? { artwork } : {}),
      ...(presenters?.length ? { presenters } : {}) })
  }
  if (!programmes.length) throw Error('No relevant listings')
  programmes.sort((a, b) => a.stationId.localeCompare(b.stationId) || a.start - b.start)
  // A partial upstream response must not replace a complete, working published feed.
  for (const id of required) if (!programmes.some(p => p.stationId === id && p.end > now)) throw Error(`No upcoming listings for ${id}`)
  return validateSchedule({ version: 1, source: 'freeview', sourceUrl: 'https://github.com/dp247/Freeview-EPG',
    fetchedAt: now, revision: createHash('sha256').update(JSON.stringify(programmes)).digest('hex'),
    coverageStart: Math.min(...programmes.map(p => p.start)), coverageEnd: Math.max(...programmes.map(p => p.end)), programmes })
}
export async function syncSchedule({ output = 'public/epg/freeview.json', fallbackUrl = process.env.EPG_FALLBACK_URL } = {}) {
  let result
  try {
    const response = await fetch(FEED_URL, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw Error(`Feed HTTP ${response.status}`)
    const xml = await response.text()
    if (xml.length > 80000000) throw Error('Feed exceeds size limit')
    const { items } = JSON.parse(await readFile('public/catalogue.json', 'utf8'))
    // The TV snapshot is optional: a radio-only checkout still builds.
    // Only UK TV channels share the Freeview guide.
    const tvItems = JSON.parse(await readFile('public/tv/GB.json', 'utf8').catch(() => '{"items":[]}')).items ?? []
    result = extractSchedule(xml, items, Date.now(), tvItems)
    const tvCount = new Set(result.programmes.filter(p => p.stationId.startsWith('watch:')).map(p => p.stationId)).size
    console.log(`Extracted ${result.programmes.length} programmes (${tvCount} TV channels)`)
  } catch (error) {
    console.warn('EPG refresh failed:', error.message)
    try { result = validateSchedule(JSON.parse(await readFile(output, 'utf8'))) } catch { /* Try last deployment. */ }
    if (!result && fallbackUrl) {
      try {
        const response = await fetch(fallbackUrl, { signal: AbortSignal.timeout(20000) })
        if (response.ok) result = validateSchedule(await response.json())
      } catch { /* App remains usable with cached data or official schedule links. */ }
    }
    if (!result) { console.warn('No previous EPG available; publishing app without listings.'); return }
    console.warn('Retaining last valid EPG from', new Date(result.fetchedAt).toISOString())
  }
  await mkdir(output.slice(0, output.lastIndexOf('/')), { recursive: true })
  await writeFile(output, JSON.stringify(result))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await syncSchedule()
