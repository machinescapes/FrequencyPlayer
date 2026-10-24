import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {parseList,isCountryFile,COUNTRY_FILES,applyConfig,validateConfig} from '../scripts/freetv-parse.mjs'

const uk=await readFile(new URL('./fixtures/freetv-uk.md',import.meta.url),'utf8')
const parsed=()=>parseList(uk,{code:'GB'})

test('keeps [>] rows in file order and drops [x], Radio and Invalid sections',()=>{
  const {items}=parsed()
  assert.deepEqual(items.map(item=>item.title),['BBC One','BBC Two','ITV 1','STV','BBC Three','BBC Two','France 24','No Logo TV','No Logo Column'])
  assert.deepEqual(items.map(item=>item.order),[0,1,2,3,4,5,6,7,8])
  assert.ok(!items.some(item=>item.title==='Channel 4'),'[x] row dropped')
  assert.ok(!items.some(item=>/Radio|Dead/.test(item.title)),'Radio and Invalid sections skipped')
  assert.ok(items.every(item=>item.category==='Freeview'))
})

test('markers become labels and quality, and are stripped from the title',()=>{
  const [bbcOne,,itv,,,,france24]=parsed().items
  assert.deepEqual(bbcOne.labels,['Geo-blocked'])
  assert.equal(bbcOne.title,'BBC One')
  assert.deepEqual(france24.labels,['YouTube'])
  assert.equal(itv.labels.length,0)
})

test('https HLS plays inline; http and YouTube open externally',()=>{
  const {items}=parsed()
  const bbcOne=items[0], itv=items[2], france24=items[6]
  assert.equal(bbcOne.playback,'hls')
  assert.equal(bbcOne.streamUrl,bbcOne.url)
  assert.equal(itv.playback,'external')
  assert.equal(itv.streamUrl,undefined)
  assert.equal(itv.url,'http://45.14.84.37/itv1/index.m3u8')
  assert.equal(france24.playback,'external')
})

test('logos and EPG ids come from the row; missing ones are null',()=>{
  const {items}=parsed()
  assert.match(items[0].logoUrl,/^https:\/\/upload\.wikimedia\.org\/.*BBC_One/)
  assert.equal(items[0].epgId,'BBCOne.uk')
  const noLogo=items.find(item=>item.title==='No Logo TV')
  assert.equal(noLogo.logoUrl,null)
  assert.equal(noLogo.epgId,null)
  // Some real rows stop after the link (e.g. Hungary's parliament feeds).
  const noColumns=items.find(item=>item.title==='No Logo Column')
  assert.equal(noColumns.logoUrl,null)
  assert.equal(noColumns.playback,'hls')
})

test('ids are stable, unique and namespaced by country; malformed rows are counted',()=>{
  const {items,skipped}=parsed()
  assert.equal(items[0].id,'GB:bbc-one')
  assert.equal(items[1].id,'GB:bbc-two')
  assert.equal(items[5].id,'GB:bbc-two-2')
  assert.equal(new Set(items.map(item=>item.id)).size,items.length)
  assert.equal(skipped,1)
})

test('a list without an <h1> or <h2> still parses',()=>{
  const {items}=parseList(`# Monaco\n\n| # | Channel | Link | Logo | EPG id |\n|:-:|:-:|:-:|:-:|:-:|\n| 1 | Monaco Info | [>](https://example.com/mc.m3u8) | | MonacoInfo.mc |\n`,{code:'MC'})
  assert.equal(items.length,1)
  assert.equal(items[0].category,'Channels')
})

test('country files map to ISO codes; theme lists are skipped; the UK is named "UK"',()=>{
  assert.deepEqual(COUNTRY_FILES.uk,['GB','UK'])
  assert.equal(COUNTRY_FILES.usa_vod[0],'US')
  assert.equal(isCountryFile('zz_news_en'),false)
  assert.equal(isCountryFile('uk'),true)
})

test('config: hide wins, add accepts external links, pin leads then file order',()=>{
  const {items}=parsed()
  const result=applyConfig(items,{
    pin:['GB:stv'],
    hide:['GB:bbc-three','GB:nope'],
    add:[{id:'GB:my-channel',title:'My Channel',url:'https://example.com/mine.m3u8'},{id:'GB:itv-1',title:'ITV 1',url:'https://better.example.com/itv1.m3u8'}],
  },'GB')
  assert.equal(result.items[0].id,'GB:stv')
  assert.ok(!result.items.some(item=>item.id==='GB:bbc-three'))
  const itv=result.items.find(item=>item.id==='GB:itv-1')
  assert.equal(itv.playback,'hls','a config stream can upgrade an external row')
  assert.equal(itv.order,2,'a replaced row keeps its list position')
  assert.equal(result.items.at(-1).id,'GB:my-channel')
  assert.equal(result.items.at(-1).countryCode,'GB')
  assert.deepEqual(result.unmatched,['hide:GB:nope'])
  assert.equal(result.hidden,1)
  assert.equal(result.added,2)
})

test('bad config is rejected loudly, naming the entry',()=>{
  assert.throws(()=>validateConfig({pinned:[]},'GB'),/GB: unknown key "pinned"/)
  assert.throws(()=>validateConfig({hide:'x'}),/"hide" must be a list/)
  assert.throws(()=>validateConfig({add:[{id:'x',title:'X',url:'javascript:alert(1)'}]}),/x needs an http\(s\) url/)
  assert.throws(()=>validateConfig({add:[{id:'x',url:'https://e.com/x.m3u8'}]}),/x needs a title/)
  const entry={id:'x',title:'X',url:'https://e.com/x.m3u8'}
  assert.throws(()=>validateConfig({add:[entry,entry]}),/listed twice/)
})

test('the committed config is valid for every country it names',async()=>{
  const config=JSON.parse(await readFile(new URL('../scripts/tv-config.json',import.meta.url)))
  for(const [code,entry] of Object.entries(config)){
    assert.match(code,/^[A-Z]{2}$/)
    assert.doesNotThrow(()=>validateConfig(entry,code))
  }
})
