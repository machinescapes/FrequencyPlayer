import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateTvCatalogue,validateTvIndex,displayCode,parseCountryParam,countryInSentence,flagEmoji,MAX_ITEMS} from '../app/public/tv-catalogue.js'

const channel={id:'GB:bbc-one',title:'BBC One',category:'Freeview',tags:['Freeview'],countryCode:'GB',logoUrl:'https://example.com/bbc.png',url:'https://example.com/bbc.m3u8',streamUrl:'https://example.com/bbc.m3u8',playback:'hls',quality:null,labels:['Geo-blocked'],order:0,epgId:'BBCOneLondonHD.uk'}
const external={...channel,id:'GB:itv-1',title:'ITV 1',url:'http://45.14.84.37/itv1/index.m3u8',streamUrl:undefined,playback:'external',labels:[],order:2}

test('the committed UK catalogue validates and keeps Free-TV order',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/tv/GB.json',import.meta.url)))
  const items=validateTvCatalogue(data)
  assert.ok(items.length>30&&items.length<=MAX_ITEMS)
  assert.equal(data.source.name,'Free-TV/IPTV')
  assert.equal(items[0].title,'BBC One','uk.md starts with BBC One')
  assert.deepEqual(items.map(item=>item.order),[...items.map(item=>item.order)].sort((a,b)=>a-b))
  for(const item of items){
    assert.equal(item.countryCode,'GB')
    if(item.playback==='hls'){
      assert.ok(item.streamUrl.startsWith('https://')&&/\.m3u8(?:[?#]|$)/i.test(item.streamUrl),`${item.id} inline stream is not HTTPS HLS`)
    } else assert.equal(item.streamUrl,undefined,`${item.id} is external but has a stream`)
  }
  assert.ok(items.some(item=>item.playback==='external'),'http/YouTube rows are kept')
  assert.ok(items.some(item=>item.labels.includes('Geo-blocked')),'geo-blocked rows are kept')
  assert.ok(!items.some(item=>/radio/i.test(item.category)),'radio sections are skipped')
  assert.equal(new Set(items.map(item=>item.id)).size,items.length)
  assert.ok(items.filter(item=>item.logoUrl).length>items.length*.9,'logos come from the list')
})

test('the committed country index lists the UK first and every file exists',async()=>{
  const countries=validateTvIndex(JSON.parse(await readFile(new URL('../public/tv/index.json',import.meta.url))))
  assert.equal(countries[0].code,'GB')
  assert.equal(countries[0].name,'UK')
  for(const country of countries) await readFile(new URL(`../public/tv/${country.code}.json`,import.meta.url))
})

test('inline streams must be HTTPS HLS; external rows open http(s) links',()=>{
  assert.throws(()=>validateTvCatalogue({version:1,items:[{...channel,streamUrl:'http://example.com/a.m3u8'}]}))
  assert.throws(()=>validateTvCatalogue({version:1,items:[{...channel,streamUrl:'https://example.com/a.ts'}]}))
  assert.throws(()=>validateTvCatalogue({version:1,items:[{...external,url:'javascript:alert(1)'}]}))
  const [item]=validateTvCatalogue({version:1,items:[{...external,streamUrl:'http://smuggled.example/x.m3u8'}]})
  assert.equal(item.streamUrl,undefined,'an external row never keeps a streamUrl')
  assert.equal(item.url,'http://45.14.84.37/itv1/index.m3u8')
})

test('rejects duplicate and untitled channels and wrong versions',()=>{
  assert.throws(()=>validateTvCatalogue({version:1,items:[{...channel,title:'  '}]}))
  assert.throws(()=>validateTvCatalogue({version:1,items:[channel,channel]}))
  assert.throws(()=>validateTvCatalogue({version:2,items:[channel]}))
  assert.throws(()=>validateTvIndex({version:1,countries:[{code:'GB',name:'UK'},{code:'GB',name:'UK'}]}))
  assert.throws(()=>validateTvIndex({version:1,countries:[{code:'gbr',name:'UK'}]}))
})

test('normalises optional fields without losing valid ones',()=>{
  const [item]=validateTvCatalogue({version:1,items:[{id:'x',title:' X ',streamUrl:'https://example.com/x.m3u8',labels:['Geo-blocked',3],tags:null}]})
  assert.equal(item.title,'X')
  assert.equal(item.category,'General')
  assert.equal(item.playback,'hls')
  assert.equal(item.url,'https://example.com/x.m3u8')
  assert.deepEqual(item.labels,['Geo-blocked'])
  assert.equal(item.order,0)
  assert.equal(item.pin,null)
})

test('the UK is "UK" in menus and URLs, GB in data',()=>{
  assert.equal(displayCode('GB'),'UK')
  assert.equal(displayCode('FR'),'FR')
  assert.equal(parseCountryParam('UK'),'GB')
  assert.equal(parseCountryParam('uk'),'GB')
  assert.equal(parseCountryParam('GB'),'GB')
  assert.equal(parseCountryParam('fr'),'FR')
  assert.equal(parseCountryParam('nope'),null)
  assert.equal(parseCountryParam(null),null)
  assert.equal(countryInSentence({code:'GB',name:'UK'}),'the UK')
  assert.equal(countryInSentence({code:'FR',name:'France'}),'France')
  assert.equal(flagEmoji('GB'),'🇬🇧')
  assert.equal(flagEmoji('XK'),'')
})
