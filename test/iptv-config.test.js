import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {applyConfig,validateConfig,buildSnapshot} from '../scripts/iptv-parse.mjs'
import {validateTvCatalogue} from '../app/public/tv-catalogue.js'

const row=(id,title,extra={})=>({id,title,category:'General',tags:['General'],broadcaster:null,essential:false,countryCode:'GB',logoUrl:null,streamUrl:`https://example.com/${id}.m3u8`,quality:null,labels:[],epgId:null,...extra})
const items=()=>[
  row('BBCOne.uk@Scotland','BBC One Scotland',{essential:true}),
  row('BBCOne.uk@Wales','BBC One Wales'),
  row('Channel4.uk@UK','Channel 4',{essential:true}),
  row('Alpha.uk@SD','Alpha'),
  row('Zulu.uk@SD','Zulu'),
]

test('a base id hides every feed; an @ id hides just that feed',()=>{
  assert.deepEqual(applyConfig(items(),{hide:['BBCOne.uk']}).items.map(item=>item.id).filter(id=>id.startsWith('BBCOne')),[])
  const ids=applyConfig(items(),{hide:['BBCOne.uk@Wales']}).items.map(item=>item.id)
  assert.ok(ids.includes('BBCOne.uk@Scotland'))
  assert.ok(!ids.includes('BBCOne.uk@Wales'))
})

test('pinned channels lead in config order, then essentials, then title',()=>{
  const result=applyConfig(items(),{pin:['Zulu.uk','BBCOne.uk']}).items
  assert.deepEqual(result.map(item=>item.title),['Zulu','BBC One Scotland','BBC One Wales','Channel 4','Alpha'])
  assert.deepEqual(result.map(item=>item.pin),[0,1,1,null,null])
})

test('hide wins over pin and add',()=>{
  const result=applyConfig(items(),{pin:['Alpha.uk'],hide:['Alpha.uk','New.uk'],add:[{id:'New.uk@HD',title:'New',streamUrl:'https://example.com/new.m3u8'}]})
  assert.ok(!result.items.some(item=>item.id==='Alpha.uk@SD'||item.id==='New.uk@HD'))
  assert.equal(result.added,0)
})

test('add appends new channels and replaces a same-id stream',()=>{
  const result=applyConfig(items(),{add:[
    {id:'New.uk@HD',title:'New Channel',streamUrl:'https://example.com/new.m3u8',category:'News'},
    {id:'Alpha.uk@SD',title:'Alpha',streamUrl:'https://better.example.com/alpha.m3u8'},
  ]})
  const added=result.items.find(item=>item.id==='New.uk@HD')
  assert.equal(added.source,'config')
  assert.equal(added.category,'News')
  assert.equal(added.countryCode,'GB')
  assert.equal(result.items.find(item=>item.id==='Alpha.uk@SD').streamUrl,'https://better.example.com/alpha.m3u8')
  assert.equal(result.items.filter(item=>item.id==='Alpha.uk@SD').length,1)
  assert.equal(result.added,2)
  // A config row must satisfy the same validator the app runs.
  assert.doesNotThrow(()=>validateTvCatalogue({version:1,items:result.items}))
})

test('ids that match nothing are reported so typos are visible',()=>{
  assert.deepEqual(applyConfig(items(),{pin:['Nope.uk'],hide:['Gone.uk@SD']}).unmatched,['pin:Nope.uk','hide:Gone.uk@SD'])
})

test('bad config is rejected loudly, naming the entry',()=>{
  assert.throws(()=>validateConfig({pinned:[]}),/unknown key "pinned"/)
  assert.throws(()=>validateConfig({hide:'BBCOne.uk'}),/"hide" must be a list/)
  assert.throws(()=>validateConfig({add:[{id:'X.uk',title:'X',streamUrl:'http://example.com/x.m3u8'}]}),/X\.uk needs an https \.m3u8/)
  assert.throws(()=>validateConfig({add:[{id:'X.uk',title:'X',streamUrl:'https://example.com/x.mpd'}]}),/X\.uk needs an https \.m3u8/)
  assert.throws(()=>validateConfig({add:[{id:'X.uk',streamUrl:'https://example.com/x.m3u8'}]}),/X\.uk needs a title/)
  assert.throws(()=>validateConfig({add:[{id:'X.uk',title:'X',streamUrl:'https://example.com/x.m3u8',colour:'red'}]}),/unknown key "colour"/)
  const dup={id:'X.uk',title:'X',streamUrl:'https://example.com/x.m3u8'}
  assert.throws(()=>validateConfig({add:[dup,dup]}),/listed twice/)
})

test('buildSnapshot records config counts and stays unchanged without config',()=>{
  const playlist=`#EXTM3U
#EXTINF:-1 tvg-id="Alpha.uk@SD" group-title="General",Alpha
https://example.com/alpha.m3u8
#EXTINF:-1 tvg-id="Beta.uk@SD" group-title="General",Beta
https://example.com/beta.m3u8
`
  const sources=[{url:'https://example.com/uk.m3u',group:'uk',text:playlist}]
  const plain=buildSnapshot(sources,{generatedAt:'2026-01-01T00:00:00.000Z'})
  assert.equal(plain.counts.pinned,undefined)
  assert.equal(plain.unmatched,undefined)
  const configured=buildSnapshot(sources,{generatedAt:'2026-01-01T00:00:00.000Z',config:{pin:['Beta.uk'],hide:['Alpha.uk']}})
  assert.deepEqual(configured.items.map(item=>item.id),['Beta.uk@SD'])
  assert.deepEqual([configured.counts.channels,configured.counts.pinned,configured.counts.hidden,configured.counts.added],[1,1,1,0])
})

test('the committed config is valid',async()=>{
  const config=JSON.parse(await readFile(new URL('../scripts/iptv-config.json',import.meta.url)))
  assert.doesNotThrow(()=>validateConfig(config))
})
