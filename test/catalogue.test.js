import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateCatalogue,safeUrl,safeLogoUrl} from '../app/public/catalogue.js'
test('built-in catalogue contains 23 live stations and retains original entries',async()=>{const data=JSON.parse(await readFile(new URL('../public/catalogue.json',import.meta.url)));const items=validateCatalogue(data);assert.equal(items.filter(item=>item.kind==='live').length,23);for(const id of ['bbc6','bbc1','bbc2','radiox','6shows','xshows','bbcpodcasts','craig-charles','chris-moyles','xposure'])assert.ok(items.some(item=>item.id===id));for(const item of items.filter(item=>item.kind==='live'))assert.ok(item.logoUrl&&item.scheduleUrl)})
test('rejects unsafe URLs and duplicate IDs on import',()=>{const item={id:'x',title:'Test',kind:'live',url:'https://example.com'};assert.throws(()=>validateCatalogue({version:1,items:[item,item]}));assert.throws(()=>validateCatalogue({version:1,items:[{...item,streamUrl:'javascript:alert(1)'}]}));assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('http://example.com'),null)})
test('normalises styling and filters invalid tags',()=>{const [item]=validateCatalogue({version:1,items:[{id:'x',title:'Test',kind:'show',url:'https://example.com',color:'url(evil)',tags:[1,'Rock']}]});assert.equal(item.color,'#c5e762');assert.deepEqual(item.tags,['Rock'])})
test('old imports remain valid and new optional fields round-trip',()=>{
  const old={id:'old',title:'Old station',kind:'live',url:'https://example.com',streamUrl:'https://example.com/live.mp3'}
  assert.equal(validateCatalogue({version:1,items:[old]})[0].streamUrl,old.streamUrl)
  const item={...old,logoUrl:'images/station.svg',scheduleUrl:'https://example.com/schedule',showsUrl:'https://example.com/shows',provider:'Independent',countryCode:'CA',streamType:'hls'}
  const validated=validateCatalogue(JSON.parse(JSON.stringify({version:1,items:[item]})))[0]
  for(const key of Object.keys(item))assert.equal(validated[key],item[key])
})
test('schedule feed mappings are optional but must be complete and recognized',()=>{
  const item={id:'x',title:'Station',kind:'live',url:'https://example.com'}
  assert.equal(validateCatalogue({version:1,items:[item]})[0].scheduleSource,undefined)
  assert.deepEqual(validateCatalogue({version:1,items:[{...item,scheduleSource:'freeview',scheduleId:'BBC1.uk'}]})[0].scheduleId,'BBC1.uk')
  assert.throws(()=>validateCatalogue({version:1,items:[{...item,scheduleSource:'freeview'}]}))
  assert.throws(()=>validateCatalogue({version:1,items:[{...item,scheduleSource:'unsupported',scheduleId:'x'}]}))
})
test('rejects unsafe optional fields and logo paths escaping the app base',()=>{
  const item={id:'x',title:'Station',kind:'live',url:'https://example.com'}
  for(const value of ['../logo.png','/logo.svg','//evil.com/logo.png','data:image/svg+xml,evil','javascript:alert(1)','images/../logo.png','https-not-a-url','images/%2e%2e/logo.png'])assert.equal(safeLogoUrl(value),null)
  assert.equal(safeLogoUrl('images/logo.png'),'images/logo.png')
  assert.equal(safeLogoUrl('https://example.com/logo.svg'),'https://example.com/logo.svg')
  for(const fields of [{logoUrl:'javascript:alert(1)'},{scheduleUrl:'http://example.com'},{showsUrl:'data:text/html,evil'},{streamType:'dash'},{provider:23},{countryCode:'Canada'}])assert.throws(()=>validateCatalogue({version:1,items:[{...item,...fields}]}))
})
