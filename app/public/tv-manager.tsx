import { on, ref } from 'remix/component'
import { applyCheck, channelKey, entryEnabled, exportLibrary, groupChannels, guideMatch, type Entry, type Feed } from './tv-feeds.ts'
import { verifyChannels } from './tv-verify.ts'
import type { TvLibrary } from './tv-library.ts'

export function createTvManager(library: TvLibrary, update: () => void, signal: AbortSignal, countries: () => { code: string; name: string }[]) {
  let dialog: HTMLDialogElement, selectedFeed = 'iptv-org-uk', search = '', limit = 100, editing = ''
  let name = '', url = '', country = 'UK', guideUrl = '', importing = false, feedback = ''
  let verification: AbortController | undefined, progress = '', verifyBusy = false
  let playlistFile: HTMLInputElement, guideFile: HTMLInputElement, settingsFile: HTMLInputElement, replacementFile: HTMLInputElement
  const current = () => library.data.feeds.find(f => f.id === selectedFeed) ?? library.data.feeds[0]
  const filtered = (feed: Feed) => feed.entries.filter(e => `${e.title} ${e.category} ${e.tvgId} ${e.check?.status ?? ''} ${e.isNew ? 'new' : ''}`.toLowerCase().includes(search.toLowerCase()))
  signal.addEventListener('abort', () => verification?.abort(), { once: true })
  const run = async (task: () => Promise<unknown>) => { try { feedback = ''; await task() } catch (error) { feedback = error instanceof Error ? error.message : 'Could not complete this action.' } finally { update() } }
  function choose(feed: Feed) { selectedFeed = feed.id; search = ''; editing = ''; limit = 100; guideUrl = feed.guideUrl ?? ''; feedback = ''; update() }
  function toggleEntry(entry: Entry, enabled: boolean) { entry.enabled = enabled; if (enabled) entry.excluded = false; entry.isNew = false; library.changed() }
  async function verify(feed: Feed) {
    if (verifyBusy) return
    verification = new AbortController(); verifyBusy = true
    const entries = filtered(feed), controller = verification
    let completed = 0
    const counts: Record<string, number> = { working: 0, failed: 0, inconclusive: 0, external: 0 }
    progress = `Checking 0 of ${entries.length}…`; update()
    try {
      completed = await verifyChannels(entries, controller.signal, (entry, check, count) => {
        applyCheck(entry, check); completed = count; counts[check.status]++
        progress = `Checked ${count} of ${entries.length} · ${counts.working} working · ${counts.failed} failed · ${counts.inconclusive} inconclusive · ${counts.external} external`
        library.changed()
      })
    } finally {
      progress = `${controller.signal.aborted ? 'Cancelled' : 'Complete'} · ${completed}/${entries.length} checked · ${counts.working} working · ${counts.failed} failed · ${counts.inconclusive} inconclusive · ${counts.external} external`
      verifyBusy = false; verification = undefined; library.changed()
    }
  }
  function exportSettings() {
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(exportLibrary(library.data), null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = objectUrl; link.download = 'frequency-tv-settings.json'; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
  return {
    open() { feedback = ''; update(); dialog.showModal() },
    render() {
      const feed = current(), entries = feed ? filtered(feed) : [], detail = feed?.entries.find(e => e.id === editing)
      const guides = [feed?.guide, library.data.builtin].filter(g => Boolean(g))
      const guideChannels = [...new Map(guides.flatMap(g => g!.channels).map(ch => [ch.id, ch])).values()]
      const groups = groupChannels(library.data)
      return <dialog class="tv-manager" aria-labelledby="tv-manager-title" mix={ref(node => { dialog = node })}>
        <header class="tv-manager-head"><div><span class="eyebrow">YOUR TV COLLECTION</span><h2 id="tv-manager-title">Add channels</h2><p>Choose your feeds. Keep the channels you want.</p></div><button aria-label="Close channel management" mix={on('click', () => dialog.close())}>×</button></header>
        <div class="tv-manager-body">
          <aside class="tv-feed-sidebar"><h3>TV feeds</h3>
            {library.data.feeds.map(f => <div key={f.id} class={'tv-feed-row' + (f.id === feed?.id ? ' active' : '')}>
              <input type="checkbox" aria-label={'Enable feed ' + f.name} checked={f.enabled} disabled={library.busy.has(f.id)} mix={on('change', event => { f.enabled = event.currentTarget.checked; library.changed() })}/>
              <button aria-pressed={f.id === feed?.id} mix={on('click', () => choose(f))}><strong>{f.name}</strong><small>{f.entries.filter(entryEnabled).length} / {f.entries.length} enabled</small></button>
            </div>)}
            <details class="tv-import" open={window.matchMedia('(min-width: 701px)').matches}><summary>Import feed</summary>
              <form mix={on('submit', event => { event.preventDefault(); if (importing) return; importing = true; void run(async () => { try { const file = playlistFile.files?.[0]; const f = await library.importFeed(name || file?.name || 'Imported feed', country.toUpperCase() === 'UK' ? 'GB' : country.toUpperCase(), file ? undefined : url, file ? await file.text() : undefined); choose(f); name = ''; url = ''; playlistFile.value = '' } finally { importing = false } }) })}>
                <label>Feed name<input aria-label="Feed name" value={name} mix={on('input', event => { name = event.currentTarget.value })}/></label>
                <label>Playlist URL<input type="url" aria-label="Playlist URL" placeholder="https://…/channels.m3u" value={url} mix={on('input', event => { url = event.currentTarget.value })}/></label>
                <label>Or M3U file<input type="file" accept=".m3u,.m3u8,text/plain,audio/x-mpegurl" aria-label="Playlist file" mix={ref(node => { playlistFile = node })}/></label>
                <label>Country code<input aria-label="Feed country code" maxLength={2} defaultValue="UK" mix={on('input', event => { country = event.currentTarget.value })}/></label>
                <button class="primary" disabled={importing} type="submit">{importing ? 'Importing…' : 'Import feed'}</button>
              </form>
            </details>
            <details class="tv-import"><summary>Optional Free-TV feeds</summary><label>Country<select aria-label="Optional Free-TV country" mix={on('change', event => { const code = event.currentTarget.value; const found = countries().find(c => c.code === code); if (found) void run(async () => choose(await library.addFreeTv(code, found.name))) })}><option value="">Choose a country…</option>{countries().map(c => <option value={c.code} key={c.code}>{c.name}</option>)}</select></label><p>Added feeds start switched off.</p></details>
            <details class="tv-import"><summary>Transfer settings</summary><button mix={on('click', exportSettings)}>Export TV settings</button><label>Import TV settings<input type="file" accept=".json,application/json" aria-label="Import TV settings" mix={[ref(node => { settingsFile = node }), on('change', () => { const file = settingsFile.files?.[0]; if (file) void run(async () => { if (verifyBusy || library.busy.size) throw Error('Wait for current operations or cancel verification before importing settings.'); await library.replaceSettings(JSON.parse(await file.text())); choose(library.data.feeds[0]); settingsFile.value = '' }) })]}/></label><p>Import replaces TV settings on this device. Radio is unchanged.</p></details>
          </aside>
          <section class="tv-channel-panel" aria-label="Feed channels">
            {feed ? <>
              <div class="tv-panel-heading"><div><h3>{feed.name}</h3><p>{feed.entries.filter(entryEnabled).length} enabled · {feed.entries.length} entries{!feed.enabled ? ' · Feed switched off' : ''}</p></div><button disabled={library.busy.has(feed.id) || verifyBusy} mix={on('click', () => feed.kind === 'm3u' && !feed.url ? replacementFile.click() : void run(() => library.refresh(feed)))}>{library.busy.has(feed.id) ? 'Refreshing…' : 'Refresh feed'}</button></div>
              <input type="file" hidden aria-label="Replace playlist file" accept=".m3u,.m3u8" mix={[ref(node => { replacementFile = node }), on('change', () => { const file = replacementFile.files?.[0]; if (file) void run(async () => { await library.refresh(feed, await file.text()); replacementFile.value = '' }) })]}/>
              {feed.updatedAt ? <small class="tv-muted">Updated {new Date(feed.updatedAt).toLocaleString()}</small> : null}
              <label class="tv-search">Find channels<input type="search" aria-label="Find feed channels" placeholder="Search name, category, status…" value={search} mix={on('input', event => { search = event.currentTarget.value; limit = 100; update() })}/></label>
              <div class="tv-bulk"><span>{entries.length} {search ? 'matching' : 'channels'}</span><button mix={on('click', () => { for (const e of entries) { e.enabled = true; e.excluded = false; e.isNew = false } library.changed() })}>{search ? 'Enable filtered' : 'Enable all'}</button><button mix={on('click', () => { for (const e of entries) { e.enabled = false; e.isNew = false } library.changed() })}>{search ? 'Disable filtered' : 'Disable all'}</button><button class="primary" disabled={verifyBusy || !entries.length} mix={on('click', () => void run(() => verify(feed)))}>{search ? 'Verify filtered channels' : 'Verify channels'}</button>{verifyBusy ? <button mix={on('click', () => verification?.abort())}>Cancel verification</button> : null}</div>
              {progress ? <p class="tv-feedback" role="status">{progress}</p> : null}
              {feed.error ? <p class="tv-error" role="alert">{feed.error}</p> : null}
              <div class="tv-entry-list">{entries.slice(0, limit).map(entry => {
                const match = guideMatch(entry, guides.filter((g): g is NonNullable<typeof g> => Boolean(g)))
                const listing = match ? match.source.programmes.some(p => p.stationId === match.channelId) : false
                return <div class="tv-entry" key={entry.id}>
                  <label><input type="checkbox" aria-label={'Enable channel ' + entry.title} checked={entryEnabled(entry)} mix={on('change', event => toggleEntry(entry, event.currentTarget.checked))}/><span><strong>{entry.title}</strong><small>{entry.category} · {entry.playback === 'external' ? 'External link ↗' : 'HLS'} · {match ? listing ? 'Matched' : 'No listings' : 'Unmatched'}</small></span></label>
                  <span class={'tv-check ' + (entry.check?.status ?? '')}>{entry.isNew ? 'New · ' : ''}{entry.check?.status ?? 'Not verified'}{entry.excluded ? ' · Disabled' : ''}</span>
                  <button aria-label={'Channel settings ' + entry.title} mix={on('click', () => { editing = editing === entry.id ? '' : entry.id; update(); requestAnimationFrame(() => document.querySelector('.tv-entry-settings')?.scrollIntoView({ block: 'nearest' })) })}>Settings</button>
                </div>
              })}</div>
              {!entries.length ? <p class="empty-message">No channels match. Try another search or import a feed.</p> : null}
              {entries.length > limit ? <button mix={on('click', () => { limit += 100; update() })}>Show more channels</button> : null}
              {detail ? <section class="tv-entry-settings"><h4>{detail.title}</h4><p>{detail.tvgId || 'No channel ID'}</p><p>{detail.check ? `${detail.check.reason} Checked ${new Date(detail.check.at).toLocaleString()}` : 'Not verified yet.'}</p><a href={detail.url} target="_blank" rel="noopener">Open stream manually ↗</a>
                <label>Programme guide channel<select aria-label={'Guide mapping ' + detail.title} value={detail.mapping ?? ''} mix={on('change', event => { detail.mapping = event.currentTarget.value || undefined; library.changed() })}><option value="" selected={!detail.mapping}>Automatic matching</option>{guideChannels.map(ch => <option key={ch.id} value={ch.id} selected={detail.mapping === ch.id}>{ch.name} · {ch.id}</option>)}</select></label>
                <label>Group with channel<select aria-label={'Channel group ' + detail.title} value={detail.group ?? ''} mix={on('change', event => { detail.group = event.currentTarget.value || undefined; library.changed() })}><option value="" selected={!detail.group}>Automatic ({channelKey({ ...detail, group: undefined })})</option>{detail.group && !detail.group.startsWith('separate:') ? <option value={detail.group} selected>{groups.find(g => g.id === detail.group)?.title ?? detail.group}</option> : null}<option value={'separate:' + feed.id + ':' + detail.id} selected={detail.group === 'separate:' + feed.id + ':' + detail.id}>Keep separate</option>{groups.filter(g => g.id !== channelKey(detail)).map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
                <button mix={on('click', () => { editing = ''; update() })}>Close channel settings</button>
              </section> : null}
              <details class="tv-guide-settings"><summary>Programme guide (XMLTV)</summary><p>Matches the built-in UK guide automatically. Add a guide for other channels or regions.</p>
                <label>XMLTV URL<input type="url" aria-label="XMLTV URL" value={guideUrl} placeholder="https://…/guide.xml" mix={on('input', event => { guideUrl = event.currentTarget.value })}/></label>
                <button disabled={library.busy.has('guide:' + feed.id)} mix={on('click', () => void run(() => library.refreshGuide(feed, undefined, guideUrl)))}>Load guide URL</button>
                <label>Or XML / XML.GZ file<input type="file" accept=".xml,.gz,.xmltv" aria-label="XMLTV file" mix={[ref(node => { guideFile = node }), on('change', () => { const file = guideFile.files?.[0]; if (file) void run(async () => { await library.refreshGuide(feed, file); guideFile.value = '' }) })]}/></label>
                {feed.guide ? <p>{feed.guide.name} · {feed.guide.channels.length} guide channels · Updated {new Date(feed.guide.fetchedAt).toLocaleString()}</p> : null}
                {feed.guide ? <button mix={on('click', () => { feed.guide = undefined; feed.guideUrl = undefined; guideUrl = ''; library.changed() })}>Use built-in guide</button> : null}
              </details>
            </> : <p>Import a feed to see its channels.</p>}
            {feedback || library.message ? <p class="tv-feedback" role="status">{feedback || library.message}</p> : null}
          </section>
        </div>
      </dialog>
    },
  }
}
