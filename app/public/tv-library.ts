import { initialLibrary, parseM3u, reconcileEntries, validateLibrary, validateGuide, openTvDatabase, readLibrary, writeLibrary, stableId, webUrl, type Feed, type Library, type Guide, type Entry } from './tv-feeds.ts'
import { validateTvCatalogue } from './tv-catalogue.js'

export class TvLibrary {
  data: Library = initialLibrary()
  ready = false
  message = ''
  busy = new Set<string>()
  private db?: IDBDatabase
  private writes = Promise.resolve()
  private savePending = false
  private builtinRefresh?: Promise<void>
  private operations = new Map<string, number>()
  constructor(private base: string, private signal: AbortSignal, private onChange: () => void) {}
  changed() {
    if (this.signal.aborted) return
    this.onChange()
    if (this.db && !this.savePending) {
      this.savePending = true
      this.writes = this.writes.then(() => { this.savePending = false; return writeLibrary(this.db!, this.data) }).catch(() => { this.message = 'Could not save TV settings. Export them before closing this tab.'; this.onChange() })
    }
  }
  private async get(url: string) {
    const response = await fetch(url, { signal: AbortSignal.any([this.signal, AbortSignal.timeout(30000)]) })
    if (!response.ok) throw Error(`HTTP ${response.status}`)
    return response
  }
  async start() {
    try { this.db = await openTvDatabase(); this.data = await readLibrary(this.db) ?? initialLibrary() }
    catch { this.message = 'Saved TV settings are unavailable. Changes will remain in this tab; export before leaving.' }
    if (this.signal.aborted) { this.db?.close(); return }
    this.signal.addEventListener('abort', () => { void this.writes.finally(() => this.db?.close()) }, { once: true })
    // Seed a committed snapshot so first load works without cross-origin access.
    const primary = this.data.feeds.find(feed => feed.id === 'iptv-org-uk')
    if (primary && !primary.loaded) {
      try { const parsed = parseM3u(await (await this.get(`${this.base}tv/default.m3u`)).text()); primary.entries = parsed.entries; primary.loaded = true; primary.updatedAt = Date.now() }
      catch { await this.refresh(primary) }
    }
    await Promise.allSettled(this.data.feeds.filter(feed => feed.kind === 'freetv' && !feed.loaded).map(feed => this.refresh(feed)))
    this.ready = true; this.changed()
    await this.refreshGuides()
  }
  async refreshGuides() {
    if (!this.ready || this.signal.aborted) return
    await Promise.allSettled([this.refreshBuiltin(), ...this.data.feeds.filter(feed => feed.guideUrl && !feed.guide?.uploaded).map(feed => this.refreshGuide(feed))])
  }
  refreshBuiltin() {
    if (this.signal.aborted) return Promise.resolve()
    this.builtinRefresh ??= this.fetchBuiltin().finally(() => { this.builtinRefresh = undefined })
    return this.builtinRefresh
  }
  private async fetchBuiltin() {
    try { this.data.builtin = validateGuide(await (await this.get(`${this.base}epg/tv.json`)).json()); this.changed() }
    catch { /* Existing cached guide remains usable; no guide in a fresh checkout is normal. */ }
  }
  async refresh(feed: Feed, replacement?: string) {
    if (this.busy.has(feed.id)) return
    const operation = (this.operations.get(feed.id) ?? 0) + 1
    this.operations.set(feed.id, operation); this.busy.add(feed.id); feed.error = ''; this.onChange()
    try {
      let entries: Entry[]
      if (feed.kind === 'freetv') {
        const data = validateTvCatalogue(await (await this.get(`${this.base}tv/${feed.countryCode}.json`)).json())
        entries = data.map((row: any) => ({ id: stableId(row.id + '\n' + row.url), legacyId: row.id, title: row.title, url: row.url, tvgId: row.epgId ?? '', logoUrl: row.logoUrl || undefined, category: row.category, countryCode: feed.countryCode, playback: row.playback, enabled: true }))
      } else {
        const parsed = parseM3u(replacement ?? await (await this.get(feed.url!)).text(), feed.countryCode, feed.url)
        entries = parsed.entries; feed.guideUrl ||= parsed.guideUrl
        if (parsed.skipped) this.message = `Skipped ${parsed.skipped} malformed playlist rows.`
      }
      if (this.operations.get(feed.id) !== operation || this.signal.aborted) return
      feed.entries = reconcileEntries(feed.entries, entries, !feed.loaded); feed.loaded = true; feed.updatedAt = Date.now()
    } catch (error) { feed.error = `Could not refresh. Your previous channels are retained. ${error instanceof Error ? error.message : ''} For browser access errors, upload the playlist file.` }
    finally { this.busy.delete(feed.id); this.changed() }
  }
  async importFeed(name: string, countryCode: string, url?: string, text?: string) {
    if (!url && text === undefined) throw Error('Enter a playlist URL or choose a file.')
    if (url && !webUrl(url, true)) throw Error('Use an HTTPS playlist URL, or upload a file.')
    if (!name.trim() || !/^[A-Z]{2}$/.test(countryCode)) throw Error('Enter a feed name and two-letter country code (UK or GB for the UK).')
    const parsed = parseM3u(text ?? await (await this.get(url!)).text(), countryCode, url)
    if (this.data.feeds.length >= 150) throw Error('You can save up to 150 feeds.')
    const feed: Feed = { id: `import:${crypto.randomUUID()}`, name: name.trim(), countryCode, url, kind: 'm3u', enabled: true, entries: parsed.entries, loaded: true, updatedAt: Date.now(), guideUrl: parsed.guideUrl }
    this.data.feeds.push(feed); this.message = `Imported ${feed.entries.length} entries${parsed.skipped ? `; skipped ${parsed.skipped} malformed rows` : ''}.`; this.changed()
    if (feed.guideUrl) void this.refreshGuide(feed)
    return feed
  }
  async addFreeTv(code: string, name: string) {
    let feed = this.data.feeds.find(f => f.id === `freetv:${code}`)
    if (!feed) { feed = { id: `freetv:${code}`, name: `Free-TV ${name}`, countryCode: code, enabled: false, kind: 'freetv', entries: [] }; this.data.feeds.push(feed) }
    if (!feed.loaded) await this.refresh(feed)
    this.changed(); return feed
  }
  async refreshGuide(feed: Feed, file?: File, url = feed.guideUrl) {
    if (this.busy.has(`guide:${feed.id}`)) return
    if (!file && (!url || !webUrl(url, true))) throw Error('Use an HTTPS XMLTV URL or upload XML/XML.GZ.')
    this.busy.add(`guide:${feed.id}`); this.onChange()
    try {
      const { parseXmltv, readXmltvFile } = await import('./xmltv.ts')
      const blob = file ?? await (await this.get(url!)).blob()
      const guide: Guide = parseXmltv(await readXmltvFile(blob), `xmltv:${feed.id}`, file?.name ?? feed.name)
      guide.uploaded = Boolean(file); guide.url = file ? undefined : url
      feed.guide = guide; feed.guideUrl = file ? undefined : url
      feed.error = ''; this.message = `Guide loaded: ${guide.channels.length} channels, ${guide.programmes.length} programmes.`
    } catch (error) { feed.error = `Guide unavailable; keeping saved listings. ${error instanceof Error ? error.message : ''} If browser access is blocked, upload XML/XML.GZ.` }
    finally { this.busy.delete(`guide:${feed.id}`); this.changed() }
  }
  async replaceSettings(value: unknown) {
    const next = validateLibrary(value)
    // Keep the replaceable built-in cache; uploaded guides are part of the export.
    next.builtin ??= this.data.builtin
    this.data = next; this.message = 'TV settings imported.'; this.changed()
    await Promise.allSettled(this.data.feeds.filter(feed => feed.guideUrl).map(feed => this.refreshGuide(feed)))
  }
}
