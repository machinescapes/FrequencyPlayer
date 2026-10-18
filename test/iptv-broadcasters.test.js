import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {broadcasterFor,essentialBrand,toItems,parseM3u} from '../scripts/iptv-parse.mjs'
import {broadcasterFacets,searchChannels,validateTvCatalogue} from '../app/public/tv-catalogue.js'

test('broadcaster families match UK ids only where the family is British',()=>{
  assert.equal(broadcasterFor('BBCOne.uk@Scotland'),'BBC')
  assert.equal(broadcasterFor('BBCDrama.uk@Spain'),'BBC')
  assert.equal(broadcasterFor('ITV3.uk@SD'),'ITV')
  assert.equal(broadcasterFor('Channel4.uk@UK'),'Channel 4')
  assert.equal(broadcasterFor('E4.uk@SD'),'Channel 4')
  assert.equal(broadcasterFor('5USA.uk@SD'),'Channel 5')
  // Same names, wrong broadcasters: none of these are the UK family.
  assert.equal(broadcasterFor('Channel44.au@SD'),null)
  assert.equal(broadcasterFor('KissTV.ro@SD'),null)
  assert.equal(broadcasterFor('ITV.ir@SD'),null)
})

test('global families match the id stem, ignoring the ccTLD',()=>{
  assert.equal(broadcasterFor('AlJazeera.qa@SD'),'Al Jazeera')
  assert.equal(broadcasterFor('CNNInternational.us@SD'),'CNN')
  assert.equal(broadcasterFor('France24.fr@SD'),'France 24')
  assert.equal(broadcasterFor('CNBCUK.uk@SD'),'NBCUniversal')
  assert.equal(broadcasterFor('SomeChannel.tv@SD'),null)
})

test('network metadata fills in families the id does not reveal',()=>{
  // A channel whose id says nothing, but whose network is a known family.
  assert.equal(broadcasterFor('RandomChannel.de@SD','CNBC'),'NBCUniversal')
  assert.equal(broadcasterFor('RandomChannel.de@SD',null),null)
})

test('essentials are one brand per household name',()=>{
  assert.equal(essentialBrand('BBCOne.uk@Scotland'),'BBC One')
  assert.equal(essentialBrand('BBCDrama.uk@Spain'),null)
  assert.equal(essentialBrand('BloombergTVEurope.us@SD'),'Bloomberg')
  assert.equal(essentialBrand('BloombergTVAsia.us@SD'),'Bloomberg')
  assert.equal(essentialBrand('RandomChannel.us@SD'),null)
})

test('toItems keeps only one essential card per brand',()=>{
  const playlist=`#EXTM3U
#EXTINF:-1 tvg-id="BloombergTVEurope.us@SD" group-title="News",Bloomberg TV Europe (720p)
https://example.com/bloomberg-eu.m3u8
#EXTINF:-1 tvg-id="BloombergTVAsia.us@HD" group-title="News",Bloomberg TV Asia (1080p)
https://example.com/bloomberg-asia.m3u8
#EXTINF:-1 tvg-id="Random.us@SD" group-title="News",Random News (720p)
https://example.com/random.m3u8
`
  const items=toItems(parseM3u(playlist))
  const essentials=items.filter(item=>item.essential)
  assert.equal(essentials.length,1)
  assert.equal(essentials[0].id,'BloombergTVAsia.us@HD','the higher-quality feed wins')
  assert.ok(items.some(item=>item.title==='Random News'&&!item.essential))
})

test('the committed snapshot is coherent',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/iptv.json',import.meta.url)))
  const items=validateTvCatalogue(data)
  assert.ok(items.length>5000)
  assert.ok(items.filter(item=>item.essential).length>20)
  assert.ok(items.filter(item=>item.broadcaster).length>2000)
  assert.ok(items.some(item=>item.countryCode==='GB'))
  assert.equal(new Set(items.map(item=>item.id)).size,items.length)
  // Essentials must be unique per brand as well.
  const brands=items.filter(item=>item.essential).map(item=>`${item.broadcaster}:${item.title}`)
  assert.equal(new Set(brands).size,brands.length)
})

test('facets and filters cover broadcaster and essentials',()=>{
  const items=[
    {id:'a',title:'BBC One',category:'General',tags:[],broadcaster:'BBC',essential:true,countryCode:'GB',logoUrl:null,streamUrl:'https://x/a.m3u8',quality:null,labels:[]},
    {id:'b',title:'BBC Two',category:'General',tags:[],broadcaster:'BBC',essential:false,countryCode:'GB',logoUrl:null,streamUrl:'https://x/b.m3u8',quality:null,labels:[]},
    {id:'c',title:'CNN',category:'News',tags:[],broadcaster:'CNN',essential:true,countryCode:'US',logoUrl:null,streamUrl:'https://x/c.m3u8',quality:null,labels:[]},
  ]
  assert.deepEqual(broadcasterFacets(items),[['BBC',2],['CNN',1]])
  assert.equal(searchChannels(items,{broadcaster:'BBC'}).length,2)
  assert.equal(searchChannels(items,{essentials:true}).length,2)
  assert.equal(searchChannels(items,{query:'cnn'}).length,1)
})
