import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {validateCatalogue,safeUrl} from '../app/public/catalogue.js'
test('built-in catalogue is valid and ids are unique',async()=>{const data=JSON.parse(await readFile(new URL('../public/catalogue.json',import.meta.url)));assert.equal(validateCatalogue(data).length,10)})
test('rejects unsafe URLs and duplicate IDs on import',()=>{const item={id:'x',title:'Test',kind:'live',url:'https://example.com'};assert.throws(()=>validateCatalogue({version:1,items:[item,item]}));assert.throws(()=>validateCatalogue({version:1,items:[{...item,streamUrl:'javascript:alert(1)'}]}));assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('http://example.com'),null)})
test('normalises styling and filters invalid tags',()=>{const [item]=validateCatalogue({version:1,items:[{id:'x',title:'Test',kind:'show',url:'https://example.com',color:'url(evil)',tags:[1,'Rock']}]});assert.equal(item.color,'#c5e762');assert.deepEqual(item.tags,['Rock'])})
