export type Programme = {
  stationId: string
  title: string
  start: number
  end: number
  description?: string
  artwork?: string
  presenters?: string[]
}
export type Schedule = {
  version: 1
  source: string
  sourceUrl: string
  revision: string
  fetchedAt: number
  coverageStart: number
  coverageEnd: number
  programmes: Programme[]
}

export function validateSchedule(value: unknown): Schedule {
  const data = value as Schedule
  if (!data || data.version !== 1 || !['freeview', 'nts'].includes(data.source) ||
      typeof data.revision !== 'string' || !data.revision || !https(data.sourceUrl) ||
      !Number.isFinite(data.fetchedAt) || !Number.isFinite(data.coverageStart) ||
      !Number.isFinite(data.coverageEnd) || data.coverageEnd <= data.coverageStart ||
      !Array.isArray(data.programmes) || data.programmes.length > 50000) throw Error('Invalid schedule')
  const keys = new Set<string>()
  for (const p of data.programmes) {
    if (!p || typeof p.stationId !== 'string' || !p.stationId || typeof p.title !== 'string' || !p.title.trim() ||
        !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.end <= p.start ||
        p.start < data.coverageStart || p.end > data.coverageEnd ||
        (p.description !== undefined && typeof p.description !== 'string') ||
        (p.artwork !== undefined && !https(p.artwork)) ||
        (p.presenters !== undefined && (!Array.isArray(p.presenters) || p.presenters.some(x => typeof x !== 'string')))) throw Error('Invalid programme')
    const key = `${p.stationId}:${p.start}`
    if (keys.has(key)) throw Error('Duplicate programme')
    keys.add(key)
  }
  return data
}
function https(value: unknown) {
  try { return typeof value === 'string' && new URL(value).protocol === 'https:' } catch { return false }
}
export function nowAndNext(programmes: Programme[], stationId: string, now = Date.now()) {
  const station = programmes.filter(p => p.stationId === stationId).sort((a, b) => a.start - b.start)
  return { current: station.find(p => p.start <= now && p.end > now), next: station.find(p => p.start > now) }
}
export function localDay(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const start = new Date(year, month - 1, day).getTime()
  const end = new Date(year, month - 1, day + 1).getTime()
  return { start, end }
}
export function dateInput(now = Date.now()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function normalizeFavourites(saved: unknown, ids: string[]) {
  return Array.isArray(saved) ? [...new Set(saved.filter((id): id is string => typeof id === 'string' && ids.includes(id)))] : []
}

export function openScheduleDB(factory: IDBFactory = globalThis.indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(Error('Storage unavailable')); return }
    const request = factory.open('frequency-epg', 1)
    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.createObjectStore('programmes', { keyPath: ['source', 'stationId', 'start'] })
      store.createIndex('stationStart', ['stationId', 'start'])
      store.createIndex('source', 'source')
      db.createObjectStore('sources', { keyPath: 'source' })
    }
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(Error('Storage upgrade blocked'))
  })
}
export async function readSchedule(db: IDBDatabase, source: string): Promise<Schedule | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sources', 'programmes'], 'readonly')
    const metadata = tx.objectStore('sources').get(source)
    const programmes = tx.objectStore('programmes').index('source').getAll(source)
    tx.oncomplete = () => {
      try { resolve(metadata.result ? validateSchedule({ ...metadata.result, programmes: programmes.result.map(record => { const programme = { ...record }; delete programme.source; return programme }) }) : null) }
      catch (error) { reject(error) }
    }
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? Error('Read aborted'))
  })
}
export async function writeSchedule(db: IDBDatabase, input: Schedule): Promise<boolean> {
  const data = validateSchedule(input)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sources', 'programmes'], 'readwrite')
    let changed = false
    const sources = tx.objectStore('sources'), store = tx.objectStore('programmes')
    const request = sources.get(data.source)
    request.onsuccess = () => {
      const { programmes, ...metadata } = data
      sources.put(metadata)
      if (request.result?.revision === data.revision) return
      changed = true
      const cursor = store.index('source').openCursor(data.source)
      cursor.onsuccess = () => {
        if (cursor.result) { cursor.result.delete(); cursor.result.continue() }
        else for (const p of programmes) store.put({ ...p, source: data.source })
      }
    }
    tx.oncomplete = () => resolve(changed)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? Error('Write aborted'))
  })
}

export function parseNts(data: any, now = Date.now()): Schedule {
  if (!Array.isArray(data?.results) || !data.results.length) throw Error('Invalid NTS response')
  const programmes: Programme[] = []
  for (const channel of data.results) {
    if (!['1', '2'].includes(channel.channel_name)) continue
    for (const item of [channel.now, channel.next]) {
      if (!item) continue
      const details = item.embeds?.details
      const image = details?.media?.picture?.large ?? details?.media?.picture?.medium
      programmes.push({ stationId: `nts${channel.channel_name}`, title: item.broadcast_title,
        start: Date.parse(item.start_timestamp), end: Date.parse(item.end_timestamp),
        ...(typeof details?.description === 'string' ? { description: details.description } : {}),
        ...(https(image) ? { artwork: image } : {}) })
    }
  }
  if (!programmes.length) throw Error('Empty NTS response')
  return validateSchedule({ version: 1, source: 'nts', sourceUrl: 'https://www.nts.live/api/v2/live',
    revision: JSON.stringify(programmes), fetchedAt: now,
    coverageStart: Math.min(...programmes.map(p => p.start)), coverageEnd: Math.max(...programmes.map(p => p.end)), programmes })
}

export function createScheduleClient(options: {
  url: string
  signal: AbortSignal
  onChange: (data: Schedule[], loading: boolean, failed: boolean) => void
  fetcher?: typeof fetch
  database?: () => Promise<IDBDatabase>
}) {
  const snapshots = new Map<string, Schedule>()
  const request = options.fetcher ?? fetch
  let db: IDBDatabase | undefined, loading = true, failed = false
  let freeviewBusy = false, ntsBusy = false
  const emit = () => { if (!options.signal.aborted) options.onChange([...snapshots.values()], loading, failed) }
  const database = (options.database ?? openScheduleDB)().then(value => {
    if (options.signal.aborted) { value.close(); return }
    db = value
    return value
  }).catch(() => undefined)
  async function refresh(source: 'freeview' | 'nts') {
    if (options.signal.aborted || (source === 'freeview' ? freeviewBusy : ntsBusy)) return
    if (source === 'freeview') freeviewBusy = true; else ntsBusy = true
    try {
      const response = await request(source === 'freeview' ? options.url : 'https://www.nts.live/api/v2/live', {
        cache: 'no-store', signal: AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) })
      if (!response.ok) throw Error('Schedule unavailable')
      const json = await response.json()
      const data = source === 'nts' ? parseNts(json) : validateSchedule(json)
      if (data.source !== source) throw Error('Wrong schedule source')
      if (options.signal.aborted) return
      snapshots.set(source, data)
      if (source === 'freeview') { failed = false; loading = false }
      // Render first; persistence must never delay usable listings.
      emit()
      if (db) await writeSchedule(db, data).catch(() => {})
    } catch {
      if (source === 'freeview') { failed = true; loading = false }
    } finally {
      if (source === 'freeview') freeviewBusy = false; else ntsBusy = false
      emit()
    }
  }
  async function start() {
    // Reading cache and networking race safely: cache never overwrites a fresh response.
    void database.then(async value => {
      if (!value) return
      for (const source of ['freeview', 'nts']) {
        try {
          const cached = await readSchedule(value, source)
          if (cached && !snapshots.has(source)) { snapshots.set(source, cached); emit() }
        } catch { /* Corrupt or evicted cache is refetched. */ }
      }
    })
    await Promise.all([refresh('freeview'), refresh('nts')])
  }
  options.signal.addEventListener('abort', () => db?.close(), { once: true })
  return { start, refresh: () => Promise.all([refresh('freeview'), refresh('nts')]), refreshNts: () => refresh('nts') }
}
