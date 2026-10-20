import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateTvCatalogue,searchChannels,categoryColor,MAX_ITEMS} from '../app/public/tv-catalogue.js'

const channel={id:'BBCOne.uk@HD',title:'BBC One',category:'General',tags:['General'],countryCode:'GB',logoUrl:'https://example.com/bbc.png',streamUrl:'https://example.com/bbc.m3u8',quality:'1080p',labels:[]}

test('the generated snapshot validates and contains only playable streams',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/iptv.json',import.meta.url)))
  const items=validateTvCatalogue(data)
  assert.ok(items.length>50&&items.length<=MAX_ITEMS)
  for(const item of items){
    assert.ok(item.streamUrl.startsWith('https://'),`${item.id} is not HTTPS`)
    assert.ok(/\.m3u8(?:[?#]|$)/i.test(item.streamUrl),`${item.id} is not HLS`)
    assert.ok(item.category)
  }
  assert.ok(items.some(item=>item.countryCode==='GB'))
  assert.ok(new Set(items.map(item=>item.id)).size===items.length)
})

test('rejects non-HTTPS, non-HLS, duplicate and untitled channels',()=>{
  assert.throws(()=>validateTvCatalogue({version:1,items:[{...channel,streamUrl:'http://example.com/a.m3u8'}]}))
  assert.throws(()=>validateTvCatalogue({version:1,items:[{...channel,streamUrl:'https://example.com/a.ts'}]}))
  assert.throws(()=>validateTvCatalogue({version:1,items:[{...channel,title:'  '}]}))
  assert.throws(()=>validateTvCatalogue({version:1,items:[channel,channel]}))
  assert.throws(()=>validateTvCatalogue({version:1,items:[channel],version:2}))
})

test('normalises optional fields without losing valid ones',()=>{
  const [item]=validateTvCatalogue({version:1,items:[{id:'x',title:' X ',streamUrl:'https://example.com/x.m3u8',labels:['Geo-blocked',3],tags:null}]})
  assert.equal(item.title,'X')
  assert.equal(item.category,'General')
  assert.deepEqual(item.tags,[])
  assert.deepEqual(item.labels,['Geo-blocked'])
  assert.equal(item.countryCode,null)
  assert.equal(item.logoUrl,null)
  assert.equal(item.quality,null)
})

test('search filters by query, category, country and favourites',()=>{
  const items=[channel,{...channel,id:'France2.fr@HD',title:'France 2',category:'News',tags:['News'],countryCode:'FR'}]
  assert.equal(searchChannels(items,{query:'bbc'}).length,1)
  assert.equal(searchChannels(items,{category:'News'}).length,1)
  assert.equal(searchChannels(items,{country:'GB'}).length,1)
  assert.equal(searchChannels(items,{onlyFavourites:true,favourites:['France2.fr@HD']})[0].title,'France 2')
  assert.equal(searchChannels(items,{}).length,2)
})

test('category colours are stable and drawn from the palette',()=>{
  assert.equal(categoryColor('Music'),categoryColor('Music'))
  assert.match(categoryColor('News'),/^#[0-9a-f]{6}$/)
})
