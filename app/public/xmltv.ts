import { validateGuide, type Guide } from './tv-feeds.ts'

export function xmltvTime(value: string) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?$/.exec(String(value))
  if (!match) throw Error('Invalid XMLTV timestamp.')
  const [, y, m, d, h, min, sec, sign, oh = '0', om = '0'] = match
  const utc = Date.UTC(+y, +m - 1, +d, +h, +min, +sec), date = new Date(utc)
  if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d || +h > 23 || +min > 59 || +sec > 59 || +oh > 23 || +om > 59) throw Error('Invalid XMLTV date.')
  return utc - (sign === '-' ? -1 : 1) * (+oh * 60 + +om) * 60000
}
export function validateXmltvText(xml: string) {
  if (xml.length > 80_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Malformed XMLTV or guide exceeds 80 MB.')
}
export function parseXmltv(xml: string, id: string, name: string, now = Date.now()): Guide {
  validateXmltvText(xml)
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror') || document.documentElement.tagName !== 'tv') throw Error('Malformed XMLTV.')
  const children = (node: Element, tag: string) => [...node.children].filter(child => child.tagName === tag)
  const data = {
    channel: children(document.documentElement, 'channel').map(ch => ({ '@_id': ch.getAttribute('id'), 'display-name': children(ch, 'display-name').map(n => n.textContent) })),
    programme: children(document.documentElement, 'programme').map(p => ({ '@_channel': p.getAttribute('channel'), '@_start': p.getAttribute('start'), '@_stop': p.getAttribute('stop'), title: children(p, 'title').map(n => n.textContent), desc: children(p, 'desc').map(n => n.textContent) })),
  }
  return xmltvFromData(data, id, name, now)
}
export function xmltvFromData(data: any, id: string, name: string, now = Date.now()): Guide {
  if (!data?.channel?.length || !data?.programme?.length) throw Error('XMLTV needs channels and programmes.')
  const text = (node: any): string => typeof node === 'string' ? node : node?.['#text'] ?? ''
  const channels = data.channel.map((ch: any) => ({ id: ch['@_id'], name: text(ch['display-name']?.[0]) || ch['@_id'] }))
  const ids = new Set(channels.map((ch: any) => ch.id)), seen = new Set<string>()
  const programmes = data.programme.flatMap((p: any) => {
    if (!ids.has(p['@_channel'])) return []
    const start = xmltvTime(p['@_start']), end = xmltvTime(p['@_stop'])
    if (end <= start) throw Error('Invalid programme duration.')
    if (end < now - 86400000 || start > now + 8 * 86400000) return []
    const key = `${p['@_channel']}:${start}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ stationId: p['@_channel'], title: text(p.title?.[0]), start, end, ...(text(p.desc?.[0]) ? { description: text(p.desc[0]) } : {}) }]
  })
  if (!programmes.length) throw Error('No recent or upcoming programmes found in XMLTV.')
  return validateGuide({ id, name, fetchedAt: now, channels, programmes })
}
export async function readXmltvFile(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > 80_000_000) throw Error('Guide exceeds 80 MB.')
  const stream = bytes[0] === 0x1f && bytes[1] === 0x8b ? file.stream().pipeThrough(new DecompressionStream('gzip')) : file.stream()
  const reader = stream.getReader(), parts: Uint8Array[] = []
  let total = 0
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > 80_000_000) throw Error('Expanded guide exceeds 80 MB.'); parts.push(value) }
  } finally { await reader.cancel() }
  return new Blob(parts as BlobPart[]).text()
}
