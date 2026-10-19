import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexedDB } from 'fake-indexeddb'
import { extractSchedule, xmltvTime } from '../scripts/sync-epg.mjs'
import { createScheduleClient, openScheduleDB, readSchedule, writeSchedule } from '../app/public/epg.ts'

const xml = `<tv>
  <channel id="BBCR1.uk"><display-name>BBC Radio 1</display-name></channel>
  <programme start="20261018090000 +0100" stop="20261018093000 +0100" channel="BBCR1.uk">
    <title lang="en">Morning show</title><desc lang="en">A useful description.</desc>
    <icon src="https://example.com/show.jpg" />
  </programme>
</tv>`

test('XMLTV timestamps honour positive and negative UTC offsets', () => {
  assert.equal(xmltvTime('20261018090000 +0100'), Date.UTC(2026, 9, 18, 8, 0, 0))
  assert.equal(xmltvTime('20261018090000 -0500'), Date.UTC(2026, 9, 18, 14, 0, 0))
  assert.throws(() => xmltvTime('20261340000000 +0000'))
})

test('extracts mapped radio programmes with descriptions and safe artwork', () => {
  const data = extractSchedule(xml, [{ id: 'bbc1', scheduleSource: 'freeview', scheduleId: 'BBCR1.uk' }], Date.UTC(2026, 9, 18, 8, 15))
  assert.equal(data.source, 'freeview')
  assert.equal(data.programmes.length, 1)
  assert.equal(data.programmes[0].stationId, 'bbc1')
  assert.equal(data.programmes[0].start, Date.UTC(2026, 9, 18, 8, 0))
  assert.equal(data.programmes[0].end, Date.UTC(2026, 9, 18, 8, 30))
  assert.equal(data.programmes[0].description, 'A useful description.')
  assert.equal(data.programmes[0].artwork, 'https://example.com/show.jpg')
})

test('rejects malformed XML and partial feeds without upcoming mapped listings', () => {
  const station = [{ id: 'bbc1', scheduleSource: 'freeview', scheduleId: 'BBCR1.uk' }]
  assert.throws(() => extractSchedule('<!DOCTYPE tv><tv/>', station))
  assert.throws(() => extractSchedule('<tv><programme></tv>', station))
  assert.throws(() => extractSchedule('<tv><programme start="20261018090000 +0100" stop="20261018093000 +0100" channel="OTHER"><title>Other</title></programme></tv>', station, Date.UTC(2026, 9, 18, 8, 15)))
})

test('IndexedDB schedule replacement is atomic and skips unchanged revisions', async () => {
  await new Promise(resolve => indexedDB.deleteDatabase('frequency-epg').onsuccess = resolve)
  const db = await openScheduleDB(indexedDB)
  const first = {
    version: 1, source: 'freeview', sourceUrl: 'https://github.com/dp247/Freeview-EPG',
    revision: 'one', fetchedAt: 100, coverageStart: 0, coverageEnd: 1000,
    programmes: [{ stationId: 'bbc1', title: 'First', start: 100, end: 200 }],
  }
  assert.equal(await writeSchedule(db, first), true)
  assert.equal(await writeSchedule(db, { ...first, fetchedAt: 200 }), false)
  assert.equal((await readSchedule(db, 'freeview')).programmes[0].title, 'First')
  await assert.rejects(writeSchedule(db, { ...first, revision: 'broken', programmes: [{ ...first.programmes[0], end: 50 }] }))
  assert.equal((await readSchedule(db, 'freeview')).programmes[0].title, 'First')
  const replacement = { ...first, revision: 'two', programmes: [{ stationId: 'bbc1', title: 'Second', start: 300, end: 400 }] }
  assert.equal(await writeSchedule(db, replacement), true)
  assert.deepEqual((await readSchedule(db, 'freeview')).programmes.map(programme => programme.title), ['Second'])
  db.close()
  await new Promise(resolve => indexedDB.deleteDatabase('frequency-epg').onsuccess = resolve)
})

test('schedule downloads remain available in memory when IndexedDB is unavailable', async () => {
  const controller = new AbortController()
  const data = {
    version: 1, source: 'freeview', sourceUrl: 'https://github.com/dp247/Freeview-EPG',
    revision: 'session-only', fetchedAt: 100, coverageStart: 0, coverageEnd: 1000,
    programmes: [{ stationId: 'bbc1', title: 'In memory', start: 100, end: 200 }],
  }
  let latest
  const client = createScheduleClient({
    url: '/epg/freeview.json', signal: controller.signal,
    database: () => Promise.reject(Error('Storage unavailable')),
    fetcher: async url => String(url).includes('nts.live') ? new Response('{}') : new Response(JSON.stringify(data)),
    onChange: (schedules, loading, failed) => { latest = { schedules, loading, failed } },
  })
  await client.start()
  assert.equal(latest.loading, false)
  assert.equal(latest.failed, false)
  assert.equal(latest.schedules.find(schedule => schedule.source === 'freeview').programmes[0].title, 'In memory')
  controller.abort()
})

test('an unpublished optional schedule is reported as unavailable without parsing a body', async () => {
  let latest
  const client = createScheduleClient({
    url: '/epg/freeview.json', signal: new AbortController().signal,
    database: async () => { throw Error('IndexedDB unavailable') },
    fetcher: async url => String(url).includes('nts.live') ? new Response('{}') : new Response(null, {status:204}),
    onChange: (schedules, loading, failed) => { latest = { schedules, loading, failed } },
  })
  await client.start()
  assert.deepEqual(latest, { schedules: [], loading: false, failed: true })
})
