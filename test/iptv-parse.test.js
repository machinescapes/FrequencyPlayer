import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseM3u,toItems,buildSnapshot,countryFromId,isPlayable} from '../scripts/iptv-parse.mjs'

const playlist=`#EXTM3U
#EXTINF:-1 tvg-id="5USA.uk@SD" tvg-logo="https://example.com/5usa.png" group-title="Entertainment",5USA (360p)
https://example.com/5usa/index.m3u8
#EXTINF:-1 tvg-id="AajTak.in@SD" tvg-logo="https://example.com/aaj.png" group-title="News",Aaj Tak (1080p)
http://103.213.31.109:90/AajtakHD/playlist.m3u8
#EXTINF:-1 tvg-id="AathavanTV.uk@SD" group-title="Entertainment",Aathavan TV (720p) [Not 24/7]
https://example.com/aathavan/index.m3u8
#EXTINF:-1 tvg-id="Music.uk@HD" group-title="Music",Some Music [Geo-blocked] [Not 24/7]
https://example.com/music/index.m3u8
#EXTINF:-1 tvg-id="NoHls.uk@SD" group-title="General",No HLS
https://example.com/plain.mp4
#EXTINF:-1 group-title="General",No Id
https://example.com/noid/index.m3u8
#EXTINF:-1 tvg-id="Dup.uk@SD" group-title="General",Dup 360p (360p)
https://example.com/dup/low.m3u8
#EXTINF:-1 tvg-id="Dup.uk@SD" group-title="General",Dup 1080p (1080p)
https://example.com/dup/high.m3u8
`

test('parses EXTINF attributes, names, quality and labels',()=>{
  const entries=parseM3u(playlist)
  assert.equal(entries.length,8)
  const [first]=entries
  assert.equal(first.id,'5USA.uk@SD')
  assert.equal(first.category,'Entertainment')
  assert.equal(first.logoUrl,'https://example.com/5usa.png')
  assert.equal(first.quality,'360p')
  assert.equal(first.cleanTitle,'5USA')
  assert.deepEqual(entries[2].labels,['Not 24/7'])
  assert.equal(entries[2].cleanTitle,'Aathavan TV')
  assert.deepEqual(entries[3].labels,['Geo-blocked','Not 24/7'])
  assert.equal(entries[3].cleanTitle,'Some Music')
})

test('only https HLS streams are playable',()=>{
  const entries=parseM3u(playlist)
  assert.equal(isPlayable(entries[1]),false,'http is mixed content')
  assert.equal(isPlayable(entries[4]),false,'mp4 is not HLS')
  assert.equal(isPlayable(entries[0]),true)
})

test('country comes from the tvg-id ccTLD, mapped to ISO 3166-1',()=>{
  assert.equal(countryFromId('BBCOne.uk@SD'),'GB')
  assert.equal(countryFromId('5Cops.us@UK'),'US')
  assert.equal(countryFromId('nope'),null)
})

test('dedupes by id, prefers higher quality, drops blocklisted and unplayable',()=>{
  const items=toItems(parseM3u(playlist),{blocked:new Set(['Music.uk'])})
  const ids=items.map(item=>item.id)
  assert.equal(new Set(ids).size,ids.length)
  assert.ok(!ids.includes('AajTak.in@SD'),'http dropped')
  assert.ok(!ids.includes('NoHls.uk@SD'),'mp4 dropped')
  assert.ok(!ids.includes('Music.uk@HD'),'blocklisted dropped')
  assert.equal(items.find(item=>item.id==='Dup.uk@SD').streamUrl,'https://example.com/dup/high.m3u8')
  const noId=items.find(item=>item.id.startsWith('stream-'))
  assert.ok(noId,'rows without a tvg-id get a stable fallback id')
  assert.equal(noId.countryCode,null)
  assert.deepEqual(items.map(item=>item.title),[...items.map(item=>item.title)].sort((a,b)=>a.localeCompare(b,'en')))
})

test('snapshot honours the item limit and records its sources',()=>{
  const snapshot=buildSnapshot([{url:'https://example.com/uk.m3u',group:'uk',text:playlist}],{limit:3,generatedAt:'2026-01-01T00:00:00.000Z'})
  assert.equal(snapshot.version,1)
  assert.equal(snapshot.items.length,3)
  assert.equal(snapshot.generatedAt,'2026-01-01T00:00:00.000Z')
  assert.deepEqual(snapshot.source.playlists,['https://example.com/uk.m3u'])
  assert.equal(snapshot.source.name,'iptv-org')
})
