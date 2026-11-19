import test from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { parseM3u, reconcileEntries, initialLibrary, groupChannels, orderedStreams, applyCheck, entryEnabled, validateLibrary, exportLibrary, openTvDatabase, writeLibrary, readLibrary, guideMatch, channelProgrammes, migrateTvFavourites } from '../app/public/tv-feeds.ts'
import { xmltvTime, readXmltvFile } from '../app/public/xmltv.ts'
import { probeChannel, verifyChannels } from '../app/public/tv-verify.ts'

import { parseTvGuide } from '../scripts/sync-epg.mjs'
const parseXmltv = (xml, id, name) => ({ ...parseTvGuide(xml), id, name })

const playlist = (rows = [['BBCOne.uk@LondonHD', 'BBC London', 'https://example.org/london.m3u8']]) => '#EXTM3U\n' + rows.map(([id, title, url]) => `#EXTINF:-1 tvg-id="${id}" tvg-logo="https://example.org/logo.png" group-title="News;General",${title}\n${url}`).join('\n')
const entry = () => parseM3u(playlist()).entries[0]
const fixture = rows => { const data = initialLibrary(); data.feeds[0].entries = parseM3u(playlist(rows)).entries; return data }
const xml = (now = Date.now()) => {
  const format = time => new Date(time).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000'
  return `<tv><channel id="BBCOneLondonHD.uk"><display-name>BBC London</display-name></channel><programme channel="BBCOneLondonHD.uk" start="${format(now - 60000)}" stop="${format(now + 3600000)}"><title>News &amp; weather</title><desc>Live</desc></programme></tv>`
}

test('M3U keeps quoted commas, logos, categories, relative URLs and external formats', () => {
  const data = parseM3u('\uFEFF#EXTM3U x-tvg-url="https://example.org/guide.xml"\n#EXTINF:-1 tvg-id="a" tvg-name="A, B" group-title="News;General",A, B\nstream.m3u8\n#EXTINF:-1 tvg-id="b",DASH\nhttps://example.org/live.mpd\n#EXTINF:-1 tvg-id="c",HTTP\nhttp://example.org/live.m3u8', 'GB', 'https://example.org/list.m3u')
  assert.equal(data.entries[0].title, 'A, B'); assert.equal(data.entries[0].category, 'News'); assert.equal(data.entries[0].url, 'https://example.org/stream.m3u8')
  assert.deepEqual(data.entries.map(e => e.playback), ['hls', 'external', 'external']); assert.equal(data.guideUrl, 'https://example.org/guide.xml')
})
test('bad and unsafe playlists cannot replace a valid collection', () => {
  for (const value of ['hello', '#EXTM3U\n#EXTINF:-1,Bad\njavascript:alert(1)', '#EXTM3U\n#EXTINF:-1,Bad\nfile:///etc/passwd']) assert.throws(() => parseM3u(value))
  const data = fixture(); data.feeds[0].entries[0].url = 'javascript:alert(1)'; assert.throws(() => validateLibrary(data))
})
test('refresh identities survive names and order; additions require review and removed rows disappear', () => {
  const first = parseM3u(playlist()).entries; first[0].enabled = false; first[0].mapping = 'custom'
  const incoming = parseM3u(playlist([['BBCOne.uk@LondonHD', 'Renamed', first[0].url], ['new', 'New', 'https://example.org/new.m3u8']])).entries
  const updated = reconcileEntries(first, incoming)
  assert.equal(updated[0].enabled, false); assert.equal(updated[0].mapping, 'custom'); assert.equal(updated[1].enabled, false); assert.equal(updated[1].isNew, true)
  assert.equal(reconcileEntries(updated, [incoming[1]]).length, 1)
  assert.equal(reconcileEntries([], incoming, true)[1].enabled, true)
})
test('quality variants group while regions and time-shift channels stay separate', () => {
  const data = fixture([['BBCOne.uk@LondonHD', 'London HD', 'https://example.org/a.m3u8'], ['BBCOne.uk@London', 'London', 'https://example.org/b.m3u8'], ['BBCOne.uk@ScotlandHD', 'Scotland', 'https://example.org/c.m3u8'], ['BBCOnePlus1.uk@London', 'London +1', 'https://example.org/d.m3u8']])
  const groups = groupChannels(data); assert.equal(groups.length, 3); assert.equal(groups[0].streams.length, 2)
  data.feeds[0].enabled = false; assert.equal(groupChannels(data).length, 0)
})
test('multiple feeds group canonical ids, preserve explicit groups and obey entry/feed/country filters', () => {
  const data = fixture(); data.feeds.push({ ...structuredClone(data.feeds[0]), id: 'another', name: 'Another', countryCode: 'FR', entries: [{ ...entry(), countryCode: 'FR', url: 'https://example.org/other.m3u8', id: 'other' }] })
  assert.equal(groupChannels(data)[0].streams.length, 2); assert.equal(groupChannels(data, 'another')[0].streams.length, 1); assert.equal(groupChannels(data, 'all', 'GB')[0].streams.length, 1)
  data.feeds.find(f => f.id === 'another').entries[0].group = 'manual'; assert.equal(groupChannels(data).length, 2)
  data.feeds.find(f => f.id === 'another').entries[0].enabled = false; assert.equal(groupChannels(data).length, 1)
})
test('verification exclusions never erase manual choices; inconclusive results leave exclusions unchanged', () => {
  const e = entry(); e.enabled = false
  applyCheck(e, { status: 'failed', reason: '404', at: 1 }); assert.equal(e.excluded, true)
  applyCheck(e, { status: 'inconclusive', reason: 'CORS', at: 2 }); assert.equal(e.excluded, true)
  applyCheck(e, { status: 'working', reason: 'advanced', at: 3 }); assert.equal(e.excluded, false); assert.equal(entryEnabled(e), false)
})
test('preferred streams lead, then inline verified alternatives; excluded entries cannot be selected', () => {
  const data = fixture([['same', 'One', 'https://example.org/a.m3u8'], ['same', 'Two', 'https://example.org/b.m3u8'], ['same', 'External', 'http://example.org/c.m3u8']])
  data.feeds[0].entries[1].check = { status: 'working', reason: '', at: 1 }
  let group = groupChannels(data)[0]; assert.equal(orderedStreams(group)[0].title, 'Two'); assert.equal(orderedStreams(group, group.streams[0].id)[0].title, 'One')
  data.feeds[0].entries[1].excluded = true; group = groupChannels(data)[0]; assert.equal(group.streams.length, 2)
})
test('XMLTV decodes text, matches regional aliases and emits one guide row for grouped streams', () => {
  const guide = parseXmltv(xml(), 'test', 'Test guide'), data = fixture(); data.builtin = guide
  assert.equal(guide.programmes[0].title, 'News & weather'); assert.equal(guideMatch(entry(), [guide]).channelId, 'BBCOneLondonHD.uk')
  assert.equal(channelProgrammes(groupChannels(data)).length, 1)
  assert.equal(channelProgrammes(groupChannels(data))[0].stationId, `watch:${groupChannels(data)[0].id}`)
})
test('manual mappings win and custom listings take priority over built-in guide', () => {
  const data = fixture(), custom = parseXmltv(xml(), 'custom', 'Custom'); custom.programmes[0].title = 'Custom news'; data.builtin = parseXmltv(xml(), 'builtin', 'Built in'); data.feeds[0].guide = custom
  data.feeds[0].entries[0].tvgId = 'unmatched'; data.feeds[0].entries[0].mapping = 'BBCOneLondonHD.uk'
  assert.equal(channelProgrammes(groupChannels(data))[0].title, 'Custom news')
})
test('XMLTV rejects entities, malformed documents, impossible dates and broken programmes', () => {
  assert.throws(() => parseXmltv('<!DOCTYPE tv [<!ENTITY x "hello">]>' + xml(), 'test', 'Test'))
  assert.throws(() => parseXmltv('<tv><channel></tv>', 'test', 'Test'))
  assert.throws(() => xmltvTime('20260231000000 +0000'))
  assert.equal(xmltvTime('20261118120000 +0100'), Date.UTC(2026, 10, 18, 11))
})
test('XML and gzip uploads yield the same guide', async () => {
  const { gzipSync } = await import('node:zlib'); const source = xml()
  assert.equal(await readXmltvFile(new Blob([source])), source)
  assert.equal(await readXmltvFile(new Blob([gzipSync(source)])), source)
})
test('settings transfer retains uploads and choices, excludes remote guide cache and validates payloads', () => {
  const data = fixture(); data.feeds[0].guide = { ...parseXmltv(xml(), 'a', 'Remote'), url: 'https://example.org/g.xml' }; data.builtin = data.feeds[0].guide
  let output = exportLibrary(data); assert.equal(output.feeds[0].guide, undefined); assert.equal(output.builtin, undefined)
  data.feeds[0].guide.uploaded = true; output = exportLibrary(data); assert.equal(validateLibrary(output).feeds[0].guide.name, 'Remote')
  output.feeds.push(output.feeds[0]); assert.throws(() => validateLibrary(output))
})
test('IndexedDB round-trip persists feed choices, uploads and preferences atomically', async () => {
  const db = await openTvDatabase(new IDBFactory()), data = fixture(); data.feeds[0].entries[0].enabled = false; data.preferred['channel:test'] = 'chosen'
  await writeLibrary(db, data); assert.deepEqual(await readLibrary(db), data); db.close()
})

class Video extends EventTarget {
  currentTime = 0; readyState = 4; error = null; released = false
  canPlayType() { return 'probably' }
  play() { queueMicrotask(() => { this.currentTime = 1; this.dispatchEvent(new Event('timeupdate')); this.currentTime = 2; this.dispatchEvent(new Event('timeupdate')) }); return Promise.resolve() }
  pause() { this.released = true }
  removeAttribute() {} load() {} remove() {}
}
const manifest = async () => new Response('#EXTM3U\n#EXT-X-TARGETDURATION:2\n')
test('browser probe requires advancing playback and releases its isolated media', async () => {
  const video = new Video(), result = await probeChannel(entry(), new AbortController().signal, { createVideo: () => video, fetcher: manifest })
  assert.equal(result.status, 'working'); assert.equal(video.released, true)
})
test('probe distinguishes definitive HTTP failure, ambiguous access denial and external links', async () => {
  assert.equal((await probeChannel(entry(), new AbortController().signal, { fetcher: async () => new Response('', { status: 404 }) })).status, 'failed')
  assert.equal((await probeChannel(entry(), new AbortController().signal, { fetcher: async () => new Response('', { status: 403 }) })).status, 'inconclusive')
  assert.equal((await probeChannel({ ...entry(), playback: 'external' }, new AbortController().signal)).status, 'external')
})
test('probe timeout and cancellation are inconclusive or unapplied, with resource cleanup', async () => {
  const video = new Video(); video.play = () => Promise.resolve()
  const timed = await probeChannel(entry(), new AbortController().signal, { createVideo: () => video, fetcher: manifest, timeoutMs: 5 })
  assert.equal(timed.status, 'inconclusive'); assert.equal(video.released, true)
  const controller = new AbortController(), pending = probeChannel(entry(), controller.signal, { fetcher: () => new Promise(() => {}), timeoutMs: 1000 }); controller.abort(); assert.equal(await pending, undefined)
})
test('verification queue never exceeds two probes and cancellation does not apply unfinished results', async () => {
  let active = 0, peak = 0, results = 0
  const controller = new AbortController(), entries = Array.from({ length: 8 }, entry)
  await verifyChannels(entries, controller.signal, () => { results++; if (results === 1) controller.abort() }, async () => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return { status: 'working', reason: 'sample', at: 1 } })
  assert.equal(peak, 2); assert.equal(results, 1)
})


test('guide cache survives settings-only saves and is replaced when the guide refreshes', async () => {
  const db = await openTvDatabase(new IDBFactory()), data = fixture()
  data.builtin = parseXmltv(xml(), 'builtin', 'Built in')
  await writeLibrary(db, data)
  data.feeds[0].entries[0].enabled = false
  await writeLibrary(db, data)
  assert.equal((await readLibrary(db)).builtin.programmes[0].title, 'News & weather')
  data.builtin = structuredClone(data.builtin); data.builtin.programmes[0].title = 'Refreshed news'
  await writeLibrary(db, data)
  assert.equal((await readLibrary(db)).builtin.programmes[0].title, 'Refreshed news'); db.close()
})
test('cancelled lazy HLS import cannot attach an engine to a released probe', async () => {
  const controller = new AbortController(), video = new Video(); video.canPlayType = () => ''
  let resolvePlayer, constructed = false
  const delayed = new Promise(resolve => { resolvePlayer = resolve })
  const pending = probeChannel(entry(), controller.signal, { createVideo: () => video, fetcher: manifest, loadHls: () => delayed })
  await new Promise(resolve => setTimeout(resolve, 5)); controller.abort(); assert.equal(await pending, undefined)
  class Player { static isSupported() { return true } constructor() { constructed = true } }
  resolvePlayer(Player); await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(constructed, false); assert.equal(video.released, true)
})
test('muted autoplay rejection leaves verification inconclusive rather than disabling a channel', async () => {
  const video = new Video(); video.play = () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError'))
  const result = await probeChannel(entry(), new AbortController().signal, { createVideo: () => video, fetcher: manifest })
  assert.equal(result.status, 'inconclusive'); assert.equal(video.released, true)
})


test('migrated TV favourites consume legacy ids so removals survive rebuilds and reloads', () => {
  const data = fixture(), original = 'watch:GB:bbc-one-london'
  data.feeds[0].entries[0].legacyId = 'GB:bbc-one-london'
  const channels = groupChannels(data), grouped = `watch:${channels[0].id}`
  const migrated = migrateTvFavourites(['listen:bbc6', original, 'watch:GB:unmatched'], data, channels)
  assert.deepEqual(migrated, ['listen:bbc6', grouped, 'watch:GB:unmatched'])
  const removed = JSON.parse(JSON.stringify(migrated.filter(id => id !== grouped)))
  assert.deepEqual(migrateTvFavourites(removed, data, groupChannels(data)), ['listen:bbc6', 'watch:GB:unmatched'])
})
test('disabled-source legacy favourites migrate only when an unambiguous enabled target exists', () => {
  const data = fixture(), source = data.feeds[1], legacy = 'watch:GB:old'
  source.entries = [{ ...entry(), legacyId: 'GB:old' }]
  assert.equal(source.enabled, false)
  const grouped = `watch:${groupChannels(data)[0].id}`
  assert.deepEqual(migrateTvFavourites([legacy, grouped], data, groupChannels(data)), [grouped])
  data.feeds[0].enabled = false
  assert.deepEqual(migrateTvFavourites([legacy], data, groupChannels(data)), [legacy])
  data.feeds[0].enabled = true; source.enabled = true; source.entries[0].group = 'different'
  data.feeds[0].entries[0].legacyId = 'GB:old'
  assert.deepEqual(migrateTvFavourites([legacy], data, groupChannels(data)), [legacy])
})

test('explicit removals win when legacy mappings become available after the user removes a grouped favourite', () => {
  const data = fixture(), legacy = 'watch:GB:old', target = `watch:${groupChannels(data)[0].id}`
  const removed = [target]
  assert.deepEqual(migrateTvFavourites([legacy], data, groupChannels(data), removed), [legacy])
  data.feeds[1].entries = [{ ...entry(), legacyId: 'GB:old' }]
  assert.deepEqual(migrateTvFavourites([legacy], data, groupChannels(data), removed), [])
  assert.deepEqual(migrateTvFavourites([target], data, groupChannels(data), []), [target])
})
