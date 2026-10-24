import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EPG_ALIASES, epgIdFor } from '../scripts/freetv-parse.mjs'
import {
  mergeMedia, filterMedia, orderChannels, guideSections,
  guideStationId, categoryOptions, healthWarning, migrateFavourites, inScope,
  namespacedId,
} from '../app/public/media.ts'

const radio = { id: 'bbc6', title: 'BBC Radio 6 Music', kind: 'live', url: 'https://x/6', color: '#c5e762', provider: 'BBC', scheduleId: 'BBC6Music.uk', tags: ['Music'] }
const tv = { id: 'Channel4.uk@SD', title: 'Channel 4', category: 'Entertainment', tags: ['Entertainment'], streamUrl: 'https://x/c4.m3u8', countryCode: 'GB', broadcaster: 'Channel 4', quality: '1080p', labels: [], epgId: 'Channel4London.uk' }

test('radio and TV rows normalise to one shape without id collisions', () => {
  const ids = new Set(['bbc6', 'watch:Channel4.uk@SD'])
  const merged = mergeMedia([radio], [tv], ids)
  assert.equal(merged.length, 2)
  const [listen, watch] = merged
  assert.equal(listen.id, 'listen:bbc6')
  assert.equal(watch.id, 'watch:Channel4.uk@SD')
  assert.equal(new Set(merged.map(item => item.id)).size, 2)
  assert.equal(listen.source, 'listen')
  assert.equal(watch.source, 'watch')
  assert.equal(watch.streamType, 'hls')
  // TV rows have no separate page, so the stream doubles as the destination.
  assert.equal(watch.url, watch.streamUrl)
})

test('guide coverage depends on listings that actually exist', () => {
  const withListings = mergeMedia([radio], [tv], new Set(['bbc6', 'watch:Channel4.uk@SD']))
  assert.ok(withListings.every(item => item.hasGuide))
  const without = mergeMedia([radio], [tv], new Set())
  assert.ok(without.every(item => !item.hasGuide))
  // A TV row with no epgId never claims a schedule, even with an empty set.
  const noEpg = mergeMedia([], [{ ...tv, epgId: null }], new Set(['watch:Channel4.uk@SD']))
  assert.equal(noEpg[0].hasGuide, false)
})

test('guide station ids are namespaced for TV only', () => {
  const [listen, watch] = mergeMedia([radio], [tv], new Set(['bbc6', 'watch:Channel4.uk@SD']))
  assert.equal(guideStationId(listen), 'bbc6')
  assert.equal(guideStationId(watch), 'watch:Channel4.uk@SD')
  assert.equal(guideStationId(watch), namespacedId('watch', watch.rawId))
})

test('scope includes everything or exactly one source', () => {
  const [listen, watch] = mergeMedia([radio], [tv], new Set())
  assert.equal(inScope(listen, 'all') && inScope(watch, 'all'), true)
  assert.equal(inScope(listen, 'listen'), true)
  assert.equal(inScope(listen, 'watch'), false)
  assert.equal(inScope(watch, 'watch'), true)
})

test('filters combine scope, query, country, category and broadcaster', () => {
  const merged = mergeMedia([radio], [tv], new Set())
  const count = filter => filterMedia(merged, filter).length
  assert.equal(count({}), 2)
  assert.equal(count({ scope: 'watch' }), 1)
  assert.equal(count({ query: 'channel 4' }), 1)
  // Punctuation in titles must not defeat a plain search.
  assert.equal(count({ query: 'channel4' }), 1)
  assert.equal(count({ query: 'GREAT!' }), 0)
  assert.equal(count({ query: 'bbc radio' }), 1)
  assert.equal(count({ country: 'GB' }), 1)
  assert.equal(count({ category: 'Music' }), 1)
  assert.equal(count({ broadcaster: 'Channel 4' }), 1)
  assert.equal(count({ listingsOnly: true }), 0)
  assert.equal(count({ favouritesOnly: true, favourites: ['listen:bbc6'] }), 1)
})

test('channels with listings lead, then alphabetical', () => {
  const items = [
    { id: 'c', title: 'Zed', hasGuide: false },
    { id: 'b', title: 'Bravo', hasGuide: false },
    { id: 'a', title: 'Alpha', hasGuide: true },
    { id: 'd', title: 'Delta', hasGuide: false },
  ]
  assert.deepEqual(orderChannels(items).map(item => item.id), ['a', 'b', 'd', 'c'])
})

test('pinned channels lead, then Free-TV list order; health never reorders', () => {
  const items = [
    { id: 'third', title: 'Alpha', hasGuide: false, order: 2, health: 'ok' },
    { id: 'first', title: 'Zulu', hasGuide: false, order: 0, health: 'offline' },
    { id: 'second', title: 'Bravo', hasGuide: false, order: 1, health: 'external' },
    { id: 'pin1', title: 'Yankee', hasGuide: false, order: 9, pin: 1 },
    { id: 'pin0', title: 'X-ray', hasGuide: false, order: 8, pin: 0 },
  ]
  assert.deepEqual(orderChannels(items).map(item => item.id), ['pin0', 'pin1', 'first', 'second', 'third'])
})

test('listings still lead pinned channels when rows are not split', () => {
  const items = [
    { id: 'pinned', title: 'Pinned', hasGuide: false, pin: 0 },
    { id: 'guide', title: 'Guide', hasGuide: true },
  ]
  assert.deepEqual(orderChannels(items).map(item => item.id), ['guide', 'pinned'])
})

test('radio order is unchanged: listings, then title', () => {
  const merged = mergeMedia([radio, { ...radio, id: 'abc', title: 'Absolute Radio', scheduleId: undefined }, { ...radio, id: 'aaa', title: 'Aardvark FM', scheduleId: undefined }], [], new Set(['bbc6']))
  assert.deepEqual(orderChannels(merged).map(item => item.title), ['BBC Radio 6 Music', 'Aardvark FM', 'Absolute Radio'])
  assert.ok(merged.every(item => item.pin === undefined && item.order === undefined))
})

test('TV rows carry pin and list order; external rows have no stream', () => {
  const [pinned] = mergeMedia([], [{ ...tv, pin: 2, order: 5 }], new Set())
  assert.equal(pinned.pin, 2)
  assert.equal(pinned.order, 5)
  assert.equal(pinned.streamType, 'hls')
  const [bad] = mergeMedia([], [{ ...tv, pin: 1.5 }], new Set())
  assert.equal(bad.pin, undefined)
  const [external] = mergeMedia([], [{ ...tv, playback: 'external', streamUrl: undefined, url: 'http://45.14.84.37/itv1/index.m3u8', health: 'external' }], new Set())
  assert.equal(external.streamUrl, undefined, 'the player is never handed an http stream')
  assert.equal(external.url, 'http://45.14.84.37/itv1/index.m3u8')
  assert.equal(healthWarning(external), 'Opens in a new tab')
})

test('guides are grouped by source and skip empty groups', () => {
  const merged = mergeMedia([radio], [tv], new Set(['bbc6', 'watch:Channel4.uk@SD']))
  const sections = guideSections(merged)
  assert.deepEqual(sections.map(section => section.source), ['watch', 'listen'])
  assert.deepEqual(guideSections(mergeMedia([radio], [], new Set(['bbc6']))).map(section => section.source), ['listen'])
  assert.deepEqual(guideSections(mergeMedia([], [], new Set())), [])
})

test('category options are deduped and ordered', () => {
  const merged = mergeMedia([radio], [tv, { ...tv, id: 'ITV2.uk@SD', category: 'Entertainment', epgId: null }], new Set())
  assert.deepEqual(categoryOptions(merged), ['Entertainment', 'Music'])
})

test('old favourites migrate once into the namespaced list', () => {
  const store = { 'frequency.favourites': ['bbc6', 'bbc1'], 'frequency.tv.favourites': ['Channel4.uk@SD'] }
  const load = (key, fallback) => key in store ? store[key] : fallback
  const save = (key, value) => { store[key] = value; return true }
  assert.deepEqual(migrateFavourites(load, save), ['listen:bbc6', 'listen:bbc1', 'watch:Channel4.uk@SD'])
  assert.deepEqual(store['frequency.favourites.v2'], ['listen:bbc6', 'listen:bbc1', 'watch:Channel4.uk@SD'])
  // A second call is idempotent and does not re-merge stale keys.
  store['frequency.favourites'] = ['new']
  assert.deepEqual(migrateFavourites(load, save), ['listen:bbc6', 'listen:bbc1', 'watch:Channel4.uk@SD'])
})

test('guide ids resolve direct hits and known aliases', () => {
  const channels = new Set(['BBCNews.uk', ...Object.values(EPG_ALIASES)])
  assert.equal(epgIdFor('BBCNews.uk', channels), 'BBCNews.uk')
  assert.equal(epgIdFor('BBCTwo.uk', channels), 'BBCTwoHD.uk')
  assert.equal(epgIdFor('Channel4.uk', channels), 'Channel4London.uk')
  assert.equal(epgIdFor('Channel5.uk', channels), '5.uk')
  assert.equal(epgIdFor('Now80s.uk', channels), null)
  assert.equal(epgIdFor('Channel4.uk', new Set()), null)
  assert.equal(epgIdFor(null, channels), null)
})
