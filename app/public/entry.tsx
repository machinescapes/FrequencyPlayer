import { createRoot, on, ref, type Handle } from 'remix/component'
import { validateCatalogue, loadSaved, save, safeUrl, parseFeed } from './catalogue.js'
import { validateTvCatalogue } from './tv-catalogue.js'
import {
  filterMedia, mergeMedia, orderChannels, guideSections, countryOptions,
  categoryOptions, migrateFavourites, guideStationId, healthWarning, inScope,
  type MediaItem, type Scope,
} from './media.ts'
import { createScheduleClient, nowAndNext, dateInput, localDay, normalizeFavourites, type Schedule, type Programme } from './epg.ts'
import { setupNavigation } from './navigation.js'
import { createPlayback, type PlaybackState } from './playback.ts'

declare const __APP_BASE_PATH__: string
const APP_BASE_PATH = typeof __APP_BASE_PATH__ === 'undefined' ? '/' : __APP_BASE_PATH__

type CatalogueItem = {
  id: string
  title: string
  subtitle?: string
  kind: 'live' | 'show' | 'feed' | 'audio'
  url: string
  streamUrl?: string
  streamType?: 'mp3' | 'aac' | 'hls'
  logoUrl?: string
  scheduleSource?: string
  scheduleId?: string
  scheduleUrl?: string
  showsUrl?: string
  provider?: string
  countryCode?: string
  brand?: string
  mark?: string
  color: string
  tags: string[]
}

type View = 'Channels' | 'Guide'
type TvRow = Parameters<typeof mergeMedia>[1][number]

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'watch', label: 'Watch' },
  { id: 'listen', label: 'Listen' },
  { id: 'all', label: 'All' },
]

function readHash(): { scope: Scope | null; view: View | null } {
  const params = new URLSearchParams(location.search)
  const scope = params.get('scope')
  const view = params.get('view')
  return {
    scope: scope === 'watch' || scope === 'listen' || scope === 'all' ? scope : null,
    view: view === 'guide' ? 'Guide' : view === 'channels' ? 'Channels' : null,
  }
}

function App(handle: Handle) {
  const initial = readHash()
  let radioItems: CatalogueItem[] = [], custom = loadSaved('frequency.custom', []) as CatalogueItem[], tvItems: TvRow[] = []
  let tvUnavailable = false
  let favourites = migrateFavourites(loadSaved, save)
  let scope: Scope = initial.scope ?? (loadSaved('frequency.scope', 'all') as Scope)
  let view: View = initial.view ?? (loadSaved('frequency.view', 'Channels') as View)
  let query = '', country = 'All', category = 'All', broadcaster = 'All'
  let paletteOpen = false
  let online = navigator.onLine, notice = '', updateAvailable = false
  let selected: MediaItem | null = null
  let episodes: MediaItem[] = [], feedLoading = false, feedTitle = ''
  let theme = loadSaved('frequency.theme', 'moss') as string
  let dialog: HTMLDialogElement, updateDialog: HTMLDialogElement, favouritesDialog: HTMLDialogElement, programmeDialog: HTMLDialogElement
  let updateCloseListenerAttached = false, registration: ServiceWorkerRegistration | undefined, editor: HTMLTextAreaElement
  let paletteInput: HTMLInputElement | undefined
  let playbackState: PlaybackState = { status: 'idle', message: '' }
  // One element for the lifetime of the app: playback releases the previous
  // source itself, and a stable node means the stage never holds a detached
  // element after the second selection.
  let video: HTMLVideoElement | undefined
  const playback = createPlayback({
    createMedia: () => {
      if (video) return video
      video = document.createElement('video')
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.controls = false
      return video
    },
    onChange: state => {
    playbackState = state
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state.status === 'playing' ? 'playing' : state.status === 'paused' || state.status === 'blocked' ? 'paused' : 'none'
    update()
  } })
  let schedules: Schedule[] = [], scheduleLoading = true, scheduleFailed = false
  let clock = Date.now(), guideDate = dateInput(), programme: Programme | null = null
  let timeline: HTMLDivElement | undefined, stage: HTMLDivElement | undefined, metadataKey = ''
  const firstUse = loadSaved('frequency.favourites.v2', null) === null && loadSaved('frequency.favouritesSetup', false) === false
  let initialized = false
  const failedLogos = new Set<string>()
  document.documentElement.dataset.theme = theme

  const update = () => handle.update()
  const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const programmes = () => schedules.flatMap(source => source.programmes)
  const programmeIds = () => new Set(programmes().map(p => p.stationId))
  const info = (item: MediaItem) => nowAndNext(programmes(), guideStationId(item), clock)
  const allMedia = (): MediaItem[] => mergeMedia([...radioItems, ...custom].filter(i => i?.kind), tvItems, programmeIds())

  function currentMedia(): MediaItem[] {
    return allMedia().filter(item => inScope(item, scope))
  }

  function persistContext() {
    save('frequency.scope', scope)
    save('frequency.view', view)
    const params = new URLSearchParams(location.search)
    params.set('scope', scope)
    params.set('view', view === 'Guide' ? 'guide' : 'channels')
    history.replaceState(null, '', `${location.pathname}?${params}`)
  }

  function setScope(next: Scope) {
    scope = next
    country = 'All'; category = 'All'; broadcaster = 'All'
    // A scope with no listings must not leave Guide selected.
    if (view === 'Guide' && !currentMedia().some(item => item.hasGuide)) view = 'Channels'
    persistContext()
    update()
  }

  function setView(next: View) {
    view = next
    persistContext()
    const refreshed = update()
    if (next === 'Guide') void refreshed.then(positionGuideDate)
  }

  function selectGuideDate(value: string) { if (!value) return; guideDate = value; void update().then(positionGuideDate) }
  function jumpNow() { guideDate = dateInput(); void update().then(positionGuideDate) }
  function positionAtNow() {
    if (!timeline) return
    const stationColumn = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--station-column')) || 220
    const inset = Math.min(300, Math.max(60, (timeline.clientWidth - stationColumn) * 0.7))
    timeline.scrollLeft = Math.max(0, (Date.now() - localDay(guideDate).start) * 180 / 3600000 - inset)
  }
  function positionGuideDate() {
    requestAnimationFrame(() => {
      if (!timeline) return
      if (guideDate === dateInput()) positionAtNow()
      else timeline.scrollLeft = 0
    })
  }

  function syncMetadata() {
    if (!selected || !('mediaSession' in navigator)) return
    const current = info(selected).current
    const key = `${selected.id}:${current?.start ?? ''}`
    if (key === metadataKey) return
    metadataKey = key
    const artwork = current?.artwork ?? selected.logoUrl
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current?.title ?? selected.title,
      artist: selected.broadcaster ?? selected.title,
      artwork: artwork ? [{ src: new URL(artwork, document.baseURI).href }] : [],
    })
  }

  function initializeSelection() {
    if (initialized) return
    initialized = true
    const media = allMedia()
    if (firstUse) {
      const fallback = media.find(item => item.source === 'listen' && item.rawId === 'bbc6')
      if (fallback) favourites = [fallback.id]
    }
    favourites = normalizeFavourites(favourites, media.map(item => item.id))
    save('frequency.favourites.v2', favourites)
    const saved = loadSaved('frequency.selected', '') as string
    selected = media.find(item => item.id === saved) ?? media.find(item => favourites.includes(item.id)) ?? null
    void update().then(() => { if (firstUse) favouritesDialog.showModal() })
  }

  function notify(text: string) { notice = text; update() }

  function toggleFavourite(id: string) {
    favourites = favourites.includes(id) ? favourites.filter(value => value !== id) : [...favourites, id]
    save('frequency.favourites.v2', favourites)
    update()
  }

  function removeCustom(id: string) {
    custom = custom.filter(item => item.id !== id)
    favourites = favourites.filter(favourite => favourite !== `listen:${id}`)
    if (selected?.source === 'listen' && selected.rawId === id) {
      playback.stop(); selected = null; metadataKey = ''
      if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
    }
    save('frequency.custom', custom)
    save('frequency.favourites.v2', favourites)
    update()
  }

  function openOfficial(item: MediaItem, url = item.url) {
    playback.stop(); selected = item; save('frequency.selected', item.id)
    if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none' }
    window.open(url, '_blank', 'noopener')
    update()
  }

  async function play(item: MediaItem) {
    if (item.kind === 'feed') { await openFeed(item); return }
    if (!item.streamUrl) { openOfficial(item); return }
    selected = item; notice = ''; save('frequency.selected', item.id); metadataKey = ''
    if (!navigator.onLine) { playback.stop(); notify('You’re offline. Connect to play this stream.'); return }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title,
        artist: item.broadcaster ?? 'Frequency',
        artwork: item.logoUrl ? [{ src: new URL(item.logoUrl, document.baseURI).href }] : [],
      })
    }
    syncMetadata()
    await playback.play({ streamUrl: item.streamUrl, streamType: item.streamType ?? 'hls' })
  }

  function toggle() {
    if (!selected) return
    if (playbackState.status === 'playing' || playbackState.status === 'connecting') playback.pause()
    else if (playbackState.status === 'paused' || playbackState.status === 'blocked') playback.resume()
    else void play(selected)
  }

  async function openFeed(item: MediaItem) {
    feedTitle = item.title; episodes = []; feedLoading = true; update()
    try {
      const response = await fetch(item.url, { signal: handle.signal })
      if (!response.ok) throw Error()
      episodes = (parseFeed(await response.text()) as CatalogueItem[]).map(episode => ({
        ...episode, id: `listen:${episode.id}`, source: 'listen', rawId: episode.id,
        broadcaster: item.broadcaster, category: 'Episode', categories: ['Episode'], labels: [], hasGuide: false,
      })) as MediaItem[]
      notice = episodes.length ? '' : 'No playable RSS enclosures found.'
    } catch {
      notice = 'Feed unavailable. The publisher must allow browser access (CORS). You can still open its website.'
    } finally { feedLoading = false; update() }
  }

  function showProgramme(value: Programme) { programme = value; void update().then(() => programmeDialog.showModal()) }
  function playProgramme() {
    const active = programme
    if (!active) return
    const item = allMedia().find(entry => guideStationId(entry) === active.stationId)
    if (item) void play(item)
  }

  function openPalette() { paletteOpen = true; query = ''; update().then(() => paletteInput?.focus()) }
  // Closing clears the query so the next open starts fresh.
  function closePalette() { paletteOpen = false; query = ''; update() }

  handle.signal.addEventListener('abort', () => { playback.dispose(); video?.remove() })
  handle.queueTask(() => {
    const epg = createScheduleClient({
      url: `${APP_BASE_PATH}epg/freeview.json`, signal: handle.signal,
      onChange: (data, loading, failed) => { schedules = data; scheduleLoading = loading; scheduleFailed = failed; syncMetadata(); update() },
    })
    void epg.start()
    const tick = window.setInterval(() => { clock = Date.now(); syncMetadata(); update(); if (!document.hidden) void epg.refreshNts() }, 60000)
    const refresh = window.setInterval(() => { if (!document.hidden) void epg.refresh() }, 6 * 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { clock = Date.now(); void epg.refresh() } }, { signal: handle.signal })
    window.addEventListener('online', () => void epg.refresh(), { signal: handle.signal })
    handle.signal.addEventListener('abort', () => { window.clearInterval(tick); window.clearInterval(refresh) }, { once: true })
    setupNavigation(handle.signal, () => {})
    document.addEventListener('keydown', event => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
      if (event.key === '/' && !typing) { event.preventDefault(); openPalette() }
      if (event.key === 'Escape' && paletteOpen) closePalette()
    }, { signal: handle.signal })
    for (const event of ['online', 'offline']) window.addEventListener(event, () => { online = navigator.onLine; update() }, { signal: handle.signal })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { if (selected?.streamUrl) { if (playbackState.status === 'paused' || playbackState.status === 'blocked') playback.resume(); else if (playbackState.status !== 'playing' && playbackState.status !== 'connecting') void play(selected) } })
      navigator.mediaSession.setActionHandler('pause', () => playback.pause())
    }
    fetch(`${APP_BASE_PATH}catalogue.json`, { signal: handle.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json() })
      .then(data => { radioItems = validateCatalogue(data); save('frequency.catalogue', data); initializeSelection(); update() })
      .catch(() => {
        try { radioItems = validateCatalogue(loadSaved('frequency.catalogue', { version: 1, items: [] })); initializeSelection(); notify('Using your saved catalogue.') }
        catch { notify('Catalogue unavailable. Check catalogue.json.') }
      })
    // The TV catalogue is small enough (UK-only) to load eagerly alongside radio.
    fetch(`${APP_BASE_PATH}iptv.json`, { signal: handle.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json() })
      .then(data => { tvItems = validateTvCatalogue(data); save('frequency.tv.catalogue', data) })
      .catch(() => {
        try { tvItems = validateTvCatalogue(loadSaved('frequency.tv.catalogue', { version: 1, items: [] })) }
        catch { tvUnavailable = true }
      })
      .finally(() => { initializeSelection(); update() })
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${APP_BASE_PATH}sw.js`, { scope: APP_BASE_PATH, updateViaCache: 'none' }).then(serviceWorkerRegistration => {
      registration = serviceWorkerRegistration
      let startupCheckInProgress = true
      const startupWorkers = new WeakSet<ServiceWorker>()
      const watchedWorkers = new WeakSet<ServiceWorker>()
      const activateWaitingWorker = () => registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
      const offerWaitingWorker = () => { if (!registration?.waiting || !navigator.serviceWorker.controller) return; if (startupCheckInProgress) activateWaitingWorker(); else showUpdatePrompt() }
      const checkForUpdate = () => { void registration?.update().then(offerWaitingWorker).catch(() => {}) }
      const watchWorker = (worker: ServiceWorker, autoApply: boolean) => {
        if (watchedWorkers.has(worker)) return
        watchedWorkers.add(worker)
        if (autoApply) startupWorkers.add(worker)
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return
          if (startupWorkers.has(worker)) worker.postMessage({ type: 'SKIP_WAITING' })
          else showUpdatePrompt()
        })
      }
      registration.addEventListener('updatefound', () => { const worker = registration?.installing; if (worker) watchWorker(worker, startupCheckInProgress) })
      if (registration.installing) watchWorker(registration.installing, true)
      offerWaitingWorker()
      void registration.update().then(offerWaitingWorker).catch(() => {}).finally(() => { startupCheckInProgress = false })
      const interval = window.setInterval(checkForUpdate, 5 * 60 * 1000)
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate() }, { signal: handle.signal })
      handle.signal.addEventListener('abort', () => window.clearInterval(interval), { once: true })
      let hadController = Boolean(navigator.serviceWorker.controller)
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) window.location.reload(); else hadController = true })
    }).catch(() => notify('Offline setup failed. The app is still available online.'))
  })

  function showUpdatePrompt() { if (updateAvailable) return; updateAvailable = true; void update().then(() => { if (!updateDialog.open) updateDialog.showModal() }) }
  function closeUpdatePrompt() { updateAvailable = false; if (updateDialog.open) updateDialog.close(); update() }
  function applyUpdate() { const waiting = registration?.waiting; if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' }); closeUpdatePrompt() }

  // The video element lives outside the component tree (playback creates it),
  // so re-attach it after each render when the stage is on screen.
  function mountVideo(node: HTMLDivElement | null) {
    stage = node ?? undefined
    if (!node) return
    if (video && video.parentElement !== node) node.append(video)
  }

  let mountedVideo = false
  function attachVideoSoon() {
    if (mountedVideo || !stage) return
    mountedVideo = true
    requestAnimationFrame(() => {
      mountedVideo = false
      if (stage && video && video.parentElement !== stage) stage.append(video)
    })
  }

  function artwork(item: MediaItem) {
    return item.logoUrl && !failedLogos.has(item.logoUrl)
      ? <img class="station-logo" src={item.logoUrl} alt="" loading="lazy" decoding="async" mix={on('error', () => { failedLogos.add(item.logoUrl!); update() })}/>
      : <span class="station-mark">{item.mark ?? '♫'}</span>
  }

  function destination(item: MediaItem, url: string, label: string) {
    return <a href={url} target="_blank" rel="noopener" mix={on('click', event => { event.preventDefault(); openOfficial(item, url) })}>{label} ↗</a>
  }

  function card(item: MediaItem) {
    const now = info(item).current
    const playLabel = now?.title ?? (item.source === 'watch' ? item.category : item.broadcaster ?? item.category)
    return <article class={'card' + (selected?.id === item.id ? ' selected' : '')} key={item.id}>
      <button class="art" style={{ '--station': item.color }} aria-label={(item.streamUrl ? 'Play ' : 'Open ') + item.title} mix={on('click', () => play(item))}>
        {artwork(item)}
        <span class="art-play">{item.streamUrl ? '▶' : '↗'}</span>
      </button>
      <div class="card-info">
        <div>
          <h3>{item.title}</h3>
          <p>{item.streamUrl ? playLabel : 'Official player ↗'}</p>
          {healthWarning(item) ? <small class="health-note">{healthWarning(item)}</small> : null}
        </div>
        <button class="favourite" aria-label={(favourites.includes(item.id) ? 'Remove favourite ' : 'Favourite ') + item.title} aria-pressed={favourites.includes(item.id)} mix={on('click', () => toggleFavourite(item.id))}>{favourites.includes(item.id) ? '♥' : '♡'}</button>
      </div>
    </article>
  }

  function scopeChips() {
    return <div class="scope-switch" role="radiogroup" aria-label="What to browse">
      {SCOPES.map(option =>
        <button key={option.id} role="radio" aria-checked={scope === option.id} aria-pressed={scope === option.id} class={scope === option.id ? 'active' : ''} mix={on('click', () => setScope(option.id))}>{option.label}</button>)}
    </div>
  }

  function facetRow() {
    const media = allMedia()
    const countries = countryOptions(media)
    const categories = categoryOptions(media).slice(0, 12)
    const broadcasters = [...new Set(media.filter(item => item.broadcaster).map(item => item.broadcaster!))].sort()
    const showBroadcasters = scope === 'listen'
    return <div class="facet-row">
      <label class="facet-select">Country
        <select aria-label="Filter by country" value={country} mix={on('change', event => { country = event.currentTarget.value; update() })}>
          <option value="All">All countries</option>
          {countries.map(code => <option key={code} value={code}>{code === 'GB' ? 'United Kingdom' : code}</option>)}
        </select>
      </label>
      {showBroadcasters
        ? <div class="collection-filters" role="group" aria-label="Filter by broadcaster">
            {['All', ...broadcasters].map(name => <button key={name} aria-pressed={broadcaster === name} mix={on('click', () => { broadcaster = name; update() })}>{name === 'All' ? 'All broadcasters' : name}</button>)}
          </div>
        : <div class="collection-filters" role="group" aria-label="Filter by category">
            {['All', ...categories].map(name => <button key={name} aria-pressed={category === name} mix={on('click', () => { category = name; update() })}>{name === 'All' ? 'All categories' : name}</button>)}
          </div>}
    </div>
  }

  return () => {
    const playing = playbackState.status === 'playing', loading = playbackState.status === 'connecting'
    const media = allMedia()
    const scoped = filterMedia(media, { scope, country, category, broadcaster })
    const favouritesList = media.filter(item => favourites.includes(item.id) && inScope(item, scope))
    // Listings first (the useful subset), then favourites, then alphabetical.
    // Each card appears exactly once: favourites, then the listings-first
    // On now row, then everything else in the grid, then on demand.
    const live = scoped.filter(item => item.kind === 'live' && !favourites.includes(item.id))
    const onNow = orderChannels(live.filter(item => item.hasGuide))
    const listingsFirst = orderChannels(live.filter(item => !item.hasGuide))
    // Favourites already have their own row above, so On now shows the rest.
    const withoutGuide = scoped.filter(item => !item.hasGuide).length
    const current = selected ? info(selected).current : undefined
    const next = selected ? info(selected).next : undefined
    const day = localDay(guideDate), scale = 180 / 3600000, width = (day.end - day.start) * scale
    const hours = Array.from({ length: Math.ceil((day.end - day.start) / 3600000) }, (_, index) => day.start + index * 3600000)
    const freeview = schedules.find(source => source.source === 'freeview')
    const stale = Boolean(freeview && clock - freeview.fetchedAt > 24 * 3600000)
    const guideAvailable = scoped.some(item => item.hasGuide)
    const sections = guideSections(scoped)
    const paletteResults = query.trim() ? filterMedia(media, { scope, query }).slice(0, 12) : []
    const onDemand = scoped.filter(item => item.kind !== 'live')
    const watching = selected?.source === 'watch'

    return <div class="app">
      <main>
        <header class="topbar">
          <a class="wordmark" href={APP_BASE_PATH} aria-label="Frequency home"><span class="wave">▂▆█▆▂</span> frequency<span class="brand-dot">.</span></a>
          <h1 class="visually-hidden">{scope} · {view}</h1>
          {scopeChips()}
          <div class="topbar-tools">
            <button class="search-toggle" aria-label="Search channels and stations" aria-expanded={paletteOpen} mix={on('click', () => paletteOpen ? closePalette() : openPalette())}>⌕</button>
            <button class="collection-tool" aria-label="Manage collection" mix={on('click', () => dialog.showModal())}><span>＋</span><span>Collection</span></button>
            <button class="avatar" aria-label="Change colour theme" mix={on('click', () => { theme = theme === 'moss' ? 'lilac' : 'moss'; document.documentElement.dataset.theme = theme; save('frequency.theme', theme); update() })}>◐</button>
          </div>
        </header>

        <div class="page-content">
          <div class="view-toolbar">
            <div class="view-toggle" role="group" aria-label="Main view">
              <button aria-pressed={view === 'Channels'} mix={on('click', () => setView('Channels'))}>▦ Channels</button>
              <button aria-pressed={view === 'Guide'} aria-disabled={!guideAvailable} disabled={!guideAvailable} mix={on('click', () => setView('Guide'))}>☷ Guide</button>
            </div>
          </div>

          {notice && !updateAvailable ? <div class="notice" role="status">{notice}<button aria-label="Dismiss notification" mix={on('click', () => { notice = ''; update() })}>×</button></div> : null}
          {selected && playbackState.message ? <div class="playback-feedback" role="status"><p>{playbackState.message}</p><div><button mix={on('click', () => { if (selected) void play(selected) })}>{playbackState.status === 'failed' ? 'Retry' : 'Play'}</button>{destination(selected, selected.url, 'Open stream')}</div></div> : null}
          <div class="schedule-status" role="status">
            {scheduleLoading ? 'Loading schedules…'
              : !online ? (programmes().length ? 'Offline · saved schedules' : 'Offline · no saved schedules')
              : scheduleFailed ? (programmes().length ? 'Could not refresh · showing saved schedules' : 'Schedule unavailable')
              : stale ? 'Schedules may be out of date' : ''}
            {freeview && (stale || scheduleFailed || view === 'Guide')
              ? <span> Updated {new Date(freeview.fetchedAt).toLocaleString()} · <a href={freeview.sourceUrl} target="_blank" rel="noopener">Freeview-EPG</a></span>
              : null}
          </div>

          {watching && selected ? <section class={"stage" + (view === 'Guide' ? ' compact' : '')} data-status={playbackState.status} aria-label="Video player">
            <div class="stage-view">
              <div class="stage-media" mix={ref(node => { mountVideo(node as HTMLDivElement); attachVideoSoon() })}/>
              {playbackState.status !== 'playing' ? <div class="stage-status">
                {playbackState.status === 'failed' ? <><strong>Stream unavailable</strong><p>{playbackState.message}</p></>
                  : playbackState.status === 'connecting' ? <><strong>Connecting…</strong><p>{selected.title}</p></>
                  : <><strong>{selected.title}</strong><p>{selected.category}{selected.quality ? ` · ${selected.quality}` : ''} · {playing ? 'Live' : 'Paused'}</p></>}
              </div> : null}
            </div>
            <div class="stage-bar">
              <div class="stage-info">
                <strong>{current?.title ?? selected.title}</strong>
                <p>{selected.title}{current ? ` · ${time(current.start)}–${time(current.end)}` : ''}{next ? ` · Next ${time(next.start)} ${next.title}` : ''}</p>
              </div>
              <div class="stage-actions">
                <button class="primary" mix={on('click', toggle)}>{playing || loading ? 'Pause' : 'Play'}</button>
                <button aria-label="Picture in picture" mix={on('click', () => { const element = video; if (!element) return; if (document.pictureInPictureElement) void document.exitPictureInPicture(); else void element.requestPictureInPicture?.().catch(() => notify('Picture in picture is unavailable here.')) })}>PiP</button>
                <button aria-label="Full screen" mix={on('click', () => { const element = video; if (!element) return; if (document.fullscreenElement) void document.exitFullscreen(); else void element.requestFullscreen?.().catch(() => notify('Full screen is unavailable here.')) })}>⛶</button>
                {destination(selected, selected.streamUrl ?? selected.url, 'Open stream')}
              </div>
            </div>
          </section> : null}
          {view === 'Channels' ? <div>
            {favouritesList.length ? <section class="favourites-section">
              <div class="section-heading"><h2>Favourites <span class="section-count">{favouritesList.length}</span></h2><button class="quiet-action" mix={on('click', () => favouritesDialog.showModal())}>Edit favourites</button></div>
              <div class="favourites-grid">{favouritesList.map(card)}</div>
            </section> : null}

            {onNow.length ? <section class="on-now-section">
              <div class="section-heading">
                <h2>On now <span class="live-chip">LISTINGS</span></h2>
                <span class="section-count">{onNow.length} with listings</span>
              </div>
              <div class="card-grid">{onNow.map(card)}</div>
            </section> : null}

            <section>
              <div class="section-heading">
                <h2>{onNow.length ? 'All channels' : 'Channels'}</h2>
                <span class="section-count">{listingsFirst.length}</span>
              </div>
              {facetRow()}
              <div class="card-grid">{listingsFirst.map(card)}</div>
              {!listingsFirst.length && !onNow.length ? <p class="empty-message">No channels match this filter.</p> : null}
            </section>

            {onDemand.length ? <section class="on-demand-section">
              <div class="section-heading"><h2>On demand</h2><span class="section-count">{onDemand.length}</span></div>
              <div class="card-grid">{onDemand.map(card)}</div>
            </section> : null}

            {tvUnavailable && scope !== 'listen' ? <p class="empty-message">TV channels unavailable. Check iptv.json.</p> : null}
          </div> : <section class="guide">
            <div class="guide-controls">
              <label>Date <input aria-label="Guide date" type="date" value={guideDate} mix={on('change', event => selectGuideDate(event.currentTarget.value))}/></label>
              <button class="primary" mix={on('click', jumpNow)}>Now</button>
              <span class="date-summary">{new Date(day.start).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} · {timezone}</span>
            </div>
            {facetRow()}
            <div class="timeline" aria-label="Station schedule timeline" tabIndex={0} mix={[ref(node => { timeline = node }), on('keydown', event => { if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); (event.currentTarget as HTMLDivElement).scrollLeft += event.key === 'ArrowRight' ? 180 : -180 } })]}>
              <div class="timeline-content" style={{ width: `calc(var(--station-column) + ${width}px)` }}>
                <div class="timeline-header"><div class="station-heading">Stations</div><div class="time-ruler" style={{ width: `${width}px` }}>{hours.map(hour => <span key={hour} style={{ left: `${(hour - day.start) * scale}px` }}>{time(hour)}</span>)}</div></div>
                {sections.map(section => <div class="guide-section" key={section.source}>
                  <div class="guide-section-head">{section.source === 'watch' ? 'Watch' : 'Listen'} <span>{section.items.length}</span></div>
                  {section.items.map(item => {
                    const listings = programmes().filter(p => p.stationId === guideStationId(item) && p.end > day.start && p.start < day.end)
                    return <div class={selected?.id === item.id ? 'timeline-row active' : 'timeline-row'} key={item.id}>
                      <button class="station-cell" aria-label={(item.streamUrl ? 'Play ' : 'Open ') + item.title} mix={on('click', () => play(item))}>
                        <span class="station-thumb" style={{ background: item.color }}>{artwork(item)}</span>
                        <span>{item.title}<small>{selected?.id === item.id ? info(item).current?.title ?? (playing ? 'Playing' : 'Selected') : favourites.includes(item.id) ? '♥ Favourite' : item.source === 'watch' ? '▶ Watch' : '▶ Listen'}</small></span>
                      </button>
                      <div class="programme-track" style={{ width: `${width}px` }}>
                        {listings.map(p => <button key={`${p.stationId}:${p.start}`} class={p.start <= clock && p.end > clock ? 'programme current' : 'programme'} style={{ left: `${(Math.max(p.start, day.start) - day.start) * scale}px`, width: `${(Math.min(p.end, day.end) - Math.max(p.start, day.start)) * scale}px` }} aria-label={`${p.title}, ${time(p.start)} to ${time(p.end)}`} mix={on('click', () => showProgramme(p))}><small>{time(p.start)} – {time(p.end)}</small><strong>{p.title}</strong></button>)}
                        {!listings.length ? <div class="schedule-empty">{scheduleLoading ? 'Loading schedule…' : 'No listings for this date'}</div> : null}
                      </div>
                    </div>
                  })}
                </div>)}
                {clock >= day.start && clock < day.end ? <div class="now-line" style={{ left: `calc(var(--station-column) + ${(clock - day.start) * scale}px)` }} aria-hidden="true"/> : null}
              </div>
            </div>
            <p class="guide-coverage">{withoutGuide} {withoutGuide === 1 ? 'channel' : 'channels'} in this view don't publish a schedule.</p>
          </section>}
        </div>
      </main>

      <section class="player" aria-label="Media player">
        <div class="now-playing">
          <div class="mini-art" style={{ background: selected?.color ?? 'var(--accent)' }}>{current?.artwork && !failedLogos.has(current.artwork) ? <img class="programme-art" src={current.artwork} alt="" mix={on('error', () => { failedLogos.add(current.artwork!); update() })}/> : selected ? artwork(selected) : 'ƒ'}</div>
          <div class="now-copy">
            <span class="now-label">{selected?.source === 'watch' ? 'WATCHING' : 'LISTENING'}</span>
            <strong>{current?.title ?? (selected ? info(selected).current?.title ?? selected.title : 'Select something to play')}</strong>
            <p>{selected ? `${selected.title}${current ? ` · ${time(current.start)}–${time(current.end)}` : ''}` : 'Watch or listen'}</p>
            {next ? <small class="player-next">Next · {time(next.start)} · {next.title}</small> : null}
          </div>
        </div>
        <div class="transport">
          <button class="play-button" disabled={!selected} aria-label={playing || loading ? 'Pause' : playbackState.status === 'failed' ? 'Retry' : selected && !selected.streamUrl ? 'Open official player' : 'Play'} mix={on('click', toggle)}>{playing || loading ? 'Ⅱ' : '▶'}</button>
          <span class="player-label">{playing ? '● LIVE' : selected?.source === 'watch' ? '● WATCH' : '● LISTEN'}</span>
        </div>
        <div class="player-extra">
          {selected?.streamUrl ? <a href={selected.streamUrl} target="_blank" rel="noopener" class="official">Open stream ↗</a> : null}
          <label class="volume">♪<input aria-label="Volume" type="range" min="0" max="1" step="0.05" defaultValue="1" mix={on('input', event => playback.setVolume(Number(event.currentTarget.value)))}/></label>
        </div>
      </section>

      {paletteOpen ? <div class="palette-backdrop" mix={on('click', event => { if (event.target === event.currentTarget) closePalette() })}>
        <div class="palette" role="dialog" aria-modal="true" aria-label="Search">
          <label class="palette-search"><span>⌕</span><input type="search" placeholder="Search channels and stations" aria-label="Search channels and stations" value={query} mix={[ref(node => { paletteInput = node as HTMLInputElement }), on('input', event => { query = event.currentTarget.value; update() })]}/><kbd>Esc</kbd></label>
          <div class="palette-results">
            {query.trim() && !paletteResults.length ? <p class="palette-empty">Nothing matches “{query}”.</p> : null}
            {!query.trim() ? <p class="palette-hint">Type to search {scope === 'all' ? 'channels and stations' : scope === 'watch' ? 'TV channels' : 'radio stations'}.</p> : null}
            {paletteResults.map(item => <button class="palette-row" key={item.id} mix={on('click', () => { closePalette(); void play(item) })}>
              <span class="palette-thumb" style={{ background: item.color }}>{artwork(item)}</span>
              <span class="palette-copy"><strong>{item.title}</strong><small>{[item.broadcaster, item.category, item.countryCode, item.quality].filter(Boolean).join(' · ')}</small></span>
              <span class="palette-tag">{item.source === 'watch' ? 'WATCH' : 'LISTEN'}</span>
              {favourites.includes(item.id) ? <span class="palette-fav">♥</span> : null}
            </button>)}
          </div>
          <p class="palette-foot">↑↓ move · ↵ play · Esc close</p>
        </div>
      </div> : null}

      <dialog class="favourites-dialog" aria-labelledby="favourites-title" mix={[ref(node => { favouritesDialog = node }), on('close', () => { save('frequency.favouritesSetup', true) })]}>
        <div class="dialog-heading"><h2 id="favourites-title">Choose favourites</h2><button aria-label="Close favourites" mix={on('click', () => favouritesDialog.close())}>×</button></div>
        <p>Choose channels and stations for quick access. You can change these any time.</p>
        <div class="favourite-options">{media.filter(item => item.streamUrl).map(item => <button key={item.id} aria-pressed={favourites.includes(item.id)} mix={on('click', () => toggleFavourite(item.id))}><span class="station-thumb" style={{ background: item.color }}>{artwork(item)}</span><span>{item.title}<small>{item.source === 'watch' ? 'TV' : 'Radio'}</small></span><span>{favourites.includes(item.id) ? '♥' : '♡'}</span></button>)}</div>
        <button class="primary" mix={on('click', () => favouritesDialog.close())}>Done</button>
      </dialog>

      <dialog aria-labelledby="programme-title" mix={ref(node => { programmeDialog = node })}>
        <div class="dialog-heading"><h2 id="programme-title">{programme?.title ?? 'Programme'}</h2><button aria-label="Close programme" mix={on('click', () => programmeDialog.close())}>×</button></div>
        {programme ? <div class="programme-details">
          <p>{media.find(item => guideStationId(item) === programme?.stationId)?.title} · {time(programme.start)} – {time(programme.end)} · {timezone}</p>
          {programme.artwork ? <img src={programme.artwork} alt=""/> : null}
          <p>{programme.description}</p>
          {programme.presenters?.length ? <p>{programme.presenters.join(', ')}</p> : null}
          <button class="primary" mix={on('click', playProgramme)}>Play channel</button>
        </div> : null}
      </dialog>

      <dialog class="update-dialog" aria-labelledby="update-title" aria-describedby="update-description" mix={ref(node => { updateDialog = node; if (!updateCloseListenerAttached) { updateCloseListenerAttached = true; node.addEventListener('close', () => { if (updateAvailable) closeUpdatePrompt() }, { signal: handle.signal }) } })}>
        <p class="eyebrow">FREQUENCY UPDATE</p>
        <h2 id="update-title">A new version is ready</h2>
        <p id="update-description">Apply it now to reload Frequency with the latest files, or keep listening and update later.</p>
        <div class="update-actions"><button mix={on('click', closeUpdatePrompt)}>Later</button><button class="primary" mix={on('click', applyUpdate)}>Update now</button></div>
      </dialog>

      <dialog mix={ref(node => { dialog = node })}>
        <div class="dialog-heading"><div><h2>Your collection</h2></div><button class="close" aria-label="Close collection" mix={on('click', () => dialog.close())}>×</button></div>
        <p>Add an HTTPS stream, show page or podcast RSS feed. Your additions stay on this device.</p>
        <div class="utility-content">{episodes.length ? <h3>{feedTitle}</h3> : null}{feedLoading ? <p>Loading episodes…</p> : episodes.map(item => <button class="episode" key={item.id} mix={on('click', () => play(item))}><span>▶</span><span>{item.title}</span></button>)}</div>
        <form mix={on('submit', event => {
          event.preventDefault()
          const form = event.currentTarget, data = new FormData(form)
          const optional = (name: string) => String(data.get(name) ?? '').trim() || undefined
          const kind = String(data.get('kind')), url = safeUrl(data.get('url'))
          if (!url) { notify('Please enter a valid HTTPS address.'); return }
          const item = { id: crypto.randomUUID(), title: String(data.get('title')).trim(), subtitle: 'Added by you', url, kind, streamUrl: optional('streamUrl') ?? (kind === 'audio' ? url : undefined), streamType: optional('streamType'), logoUrl: optional('logoUrl'), scheduleUrl: optional('scheduleUrl'), showsUrl: optional('showsUrl'), provider: optional('provider'), mark: '♫', brand: 'COLLECTION', color: String(data.get('color')), tags: ['Added by you'] }
          try {
            const next = validateCatalogue({ version: 1, items: [...custom, item] }) as CatalogueItem[]
            custom = next
            const saved = save('frequency.custom', custom)
            form.reset(); dialog.close(); notify(saved ? 'Added to your collection.' : 'Added for this session; browser storage is unavailable.')
          } catch (error) { notify(error instanceof Error ? error.message : 'Invalid station configuration.') }
        })}>
          <label>Name<input required name="title" placeholder="Station or show name" maxLength={120}/></label>
          <label>Official page / episode / RSS address<input required type="url" name="url" placeholder="https://…"/></label>
          <label>Content type<select name="kind"><option value="show">Official show / player link</option><option value="live">Live station</option><option value="audio">Audio episode (MP3 / M4A)</option><option value="feed">Podcast RSS feed</option></select></label>
          <label>Direct stream address (optional)<input type="url" name="streamUrl" placeholder="https://…"/></label>
          <label>Stream format<select name="streamType"><option value="">Detect automatically</option><option value="mp3">MP3</option><option value="aac">AAC</option><option value="hls">HLS</option></select></label>
          <label>Logo address (optional)<input name="logoUrl" placeholder="https://… or images/station.png"/></label>
          <label>Station colour<input name="color" type="color" defaultValue="#cfa3e9"/></label>
          <label>Broadcaster (optional)<input name="provider" maxLength={80}/></label>
          <label>Schedule address (optional)<input type="url" name="scheduleUrl"/></label>
          <label>Shows address (optional)<input type="url" name="showsUrl"/></label>
          <button class="primary" aria-label="Add to collection" type="submit">＋ Add to collection</button>
        </form>
        {custom.length ? <div class="custom-list"><h3>Your additions</h3>{custom.map(item => <div key={item.id}><span>{item.title}</span><button aria-label={'Remove ' + item.title} mix={on('click', () => removeCustom(item.id))}>Remove</button></div>)}</div> : null}
        <details mix={on('toggle', event => { if (event.currentTarget.open) editor.value = JSON.stringify({ version: 1, items: custom }, null, 2) })}>
          <summary>Edit / import / export JSON</summary>
          <p>Import replaces your device additions. The built-in collection lives in catalogue.json.</p>
          <textarea aria-label="Catalogue JSON" rows={8} mix={ref(node => { editor = node; editor.value = JSON.stringify({ version: 1, items: custom }, null, 2) })}/>
          <div class="editor-buttons">
            <button mix={on('click', () => { try { custom = validateCatalogue(JSON.parse(editor.value)); if (!save('frequency.custom', custom)) throw Error('Browser storage is unavailable.'); dialog.close(); notify('Collection imported.') } catch (error) { notify(error instanceof Error ? error.message : 'Invalid JSON.') } })}>Import JSON</button>
            <button mix={on('click', () => { const blob = new Blob([JSON.stringify({ version: 1, items: custom }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'frequency-collection.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) })}>Export additions</button>
          </div>
        </details>
        {notice ? <p class="dialog-feedback">{notice}</p> : null}
        <p class="dialog-note">Feed access depends on publisher CORS. Some channels require the official player, a UK connection or sign-in. Offline mode saves your collection, not streamed media.</p>
      </dialog>
    </div>
  }
}

const container = document.getElementById('app')
if (!container) throw new Error('Missing app root')
const root = createRoot(container)
root.render(<App />)
window.addEventListener('pagehide', () => root.dispose(), { once: true })
