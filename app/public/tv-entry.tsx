import { createRoot, on, ref, type Handle } from 'remix/component'
import { loadSaved, save } from './catalogue.js'
import { broadcasterFacets, categoryColor, loadTvCatalogue, readTvCache, searchChannels } from './tv-catalogue.js'
import { setupNavigation } from './navigation.js'
import { createPlayback, type PlaybackState } from './playback.ts'

declare const __APP_BASE_PATH__: string
const APP_BASE_PATH = typeof __APP_BASE_PATH__ === 'undefined' ? '/' : __APP_BASE_PATH__

type Channel = {
  id: string
  title: string
  category: string
  tags: string[]
  broadcaster: string | null
  essential: boolean
  countryCode: string | null
  logoUrl: string | null
  streamUrl: string
  quality: string | null
  labels: string[]
}

type View = 'Essentials' | 'Everything' | 'Broadcasters' | 'Favourites'

const VIEWS: View[] = ['Essentials', 'Everything', 'Broadcasters', 'Favourites']
const VIEW_ICONS = ['◈', '▦', '◫', '♡']

function App(handle: Handle) {
  let items: Channel[] = []
  let favourites = loadSaved('frequency.tv.favourites', []) as string[]
  let view: View = 'Essentials'
  let query = '', category = 'All', country = 'All', broadcaster = 'All'
  let selected: Channel | null = null
  let notice = '', online = navigator.onLine, muted = false, loading = true
  let theme = loadSaved('frequency.theme', 'moss') as string
  let playbackState: PlaybackState = { status: 'idle', message: '' }
  let stageNode: HTMLElement | undefined
  let videoNode: HTMLVideoElement | undefined
  const failedLogos = new Set<string>()
  document.documentElement.dataset.theme = theme

  const update = () => handle.update()

  const playback = createPlayback({
    createMedia: () => {
      const element = document.createElement('video')
      element.playsInline = true
      element.setAttribute('playsinline', '')
      element.muted = muted
      videoNode = element
      return element
    },
    onChange: state => {
      playbackState = state
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state.status === 'playing' ? 'playing' : 'none'
      syncVideo()
      update()
    },
  })

  function syncVideo() {
    if (stageNode && videoNode && videoNode.parentNode !== stageNode) stageNode.replaceChildren(videoNode)
  }

  function message(text: string) { notice = text; update() }
  function toggleFavourite(id: string) {
    favourites = favourites.includes(id) ? favourites.filter(value => value !== id) : [...favourites, id]
    save('frequency.tv.favourites', favourites)
    update()
  }

  function play(channel: Channel) {
    selected = channel
    notice = ''
    if (!navigator.onLine) { playback.stop(); message('You’re offline. Connect to play this channel.'); return }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: channel.title,
        artist: channel.broadcaster ?? channel.category,
        artwork: channel.logoUrl ? [{ src: new URL(channel.logoUrl, document.baseURI).href }] : [],
      })
    }
    void playback.play({ streamUrl: channel.streamUrl, streamType: 'hls' }).then(syncVideo)
    update().then(syncVideo)
  }

  function toggle() {
    if (!selected) return
    const status = playbackState.status
    if (status === 'playing' || status === 'connecting') playback.pause()
    else if (status === 'paused' || status === 'blocked') playback.resume()
    else play(selected)
  }

  function filtered(): Channel[] {
    return searchChannels(items, {
      query, category, country,
      broadcaster,
      essentials: view === 'Essentials',
      onlyFavourites: view === 'Favourites',
      favourites,
    })
  }

  function nextChannel() {
    const list = filtered()
    if (!list.length) return
    const index = selected ? list.findIndex(channel => channel.id === selected!.id) : -1
    play(list[(index + 1) % list.length])
  }

  function toggleMute() {
    muted = !muted
    if (videoNode) videoNode.muted = muted
    update()
  }

  async function fullscreen() {
    if (!stageNode) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stageNode.requestFullscreen()
    } catch { message('Fullscreen is not available in this browser.') }
  }

  async function pictureInPicture() {
    if (!videoNode) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await videoNode.requestPictureInPicture()
    } catch { message('Picture in picture is not available for this stream.') }
  }

  function artwork(channel: Channel, className = 'station-logo') {
    return channel.logoUrl && !failedLogos.has(channel.logoUrl)
      ? <img class={className} src={channel.logoUrl} alt="" loading="lazy" decoding="async" mix={on('error', () => { failedLogos.add(channel.logoUrl!); update() })}/>
      : <span class="station-mark">{(channel.title.replace(/^[^\p{L}\p{N}]+/u, '')[0] ?? '▣').toUpperCase()}</span>
  }

  handle.signal.addEventListener('abort', () => playback.dispose())
  handle.queueTask(() => {
    setupNavigation(handle.signal, () => {})
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search input')?.focus()
      }
    }, { signal: handle.signal })
    for (const event of ['online', 'offline']) window.addEventListener(event, () => { online = navigator.onLine; update() }, { signal: handle.signal })
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => { if (selected) toggle() })
      navigator.mediaSession.setActionHandler('pause', () => playback.pause())
    }
    void loadTvCatalogue({
      fetchJson: () => fetch(`${APP_BASE_PATH}iptv.json`, { signal: handle.signal }).then(response => {
        if (!response.ok) throw Error()
        return response.json()
      }),
      cached: readTvCache(),
    }).then(({ items: loaded, saved }) => {
      items = loaded
      loading = false
      if (!saved) notice = 'Using your saved channel list.'
      if (selected) selected = items.find(item => item.id === selected!.id) ?? selected
      update()
    }).catch(() => {
      loading = false
      message('Channel list unavailable. Check iptv.json.')
      update()
    })
  })

  function selectView(name: View) {
    view = name
    category = 'All'
    country = 'All'
    broadcaster = 'All'
    query = ''
    update()
  }

  function card(channel: Channel) {
    const playingThis = selected?.id === channel.id
    return <article class={'card channel-card' + (playingThis ? ' playing' : '')} key={channel.id}>
      <button class="art" style={{ '--station': categoryColor(channel.broadcaster ?? channel.category) }} aria-label={'Play ' + channel.title} aria-pressed={playingThis} mix={on('click', () => play(channel))}>
        <span class="art-top">{channel.broadcaster ?? channel.category}<span>{channel.countryCode ?? '▣'}</span></span>
        {artwork(channel)}
        <span class="art-bottom">{channel.quality ?? 'LIVE'}<span class="art-play">{playingThis && playbackState.status === 'playing' ? 'Ⅱ' : '▶'}</span></span>
      </button>
      <div class="card-info">
        <div>
          <h3 title={channel.title}>{channel.title}</h3>
          <p class="sub">{channel.broadcaster ?? channel.category}{channel.countryCode ? ` · ${channel.countryCode}` : ''}</p>
        </div>
        <button class="favourite" aria-label={(favourites.includes(channel.id) ? 'Remove favourite ' : 'Favourite ') + channel.title} aria-pressed={favourites.includes(channel.id)} mix={on('click', () => toggleFavourite(channel.id))}>{favourites.includes(channel.id) ? '♥' : '♡'}</button>
      </div>
      {channel.labels.length || channel.essential ? <div class="meta">
        {channel.essential ? <span class="tag good">Major</span> : null}
        {channel.labels.map(label => <span class="tag warn" key={label}>{label}</span>)}
      </div> : null}
    </article>
  }

  return () => {
    const status = playbackState.status
    const playing = status === 'playing'
    const connecting = status === 'connecting'
    const list = filtered()
    const categories = [...new Set(items.map(item => item.category))].sort()
    const countries = [...new Set(items.filter(item => item.countryCode).map(item => item.countryCode as string))].sort()
    const facets = broadcasterFacets(items)
    const essentials = items.filter(item => item.essential)
    const stageText = !selected ? ''
      : connecting ? 'Tuning in…'
      : playing ? (selected.quality ? `Live · ${selected.quality}` : 'Live')
      : status === 'failed' ? playbackState.message
      : status === 'blocked' ? 'Press play to allow video in this browser.'
      : status === 'paused' ? 'Paused'
      : 'Ready when you are'

    // The broadcaster view groups by family, so scan in bands rather than one grid.
    const groups = view === 'Broadcasters'
      ? facets.map(([name]) => ({ name, channels: items.filter(item => item.broadcaster === name) }))
          .filter(group => group.channels.length >= 8)
          .slice(0, 24)
      : []
    const moreBroadcasters = view === 'Broadcasters'
      ? facets.filter(([, count]) => count < 8)
      : []

    return <div class="app tv-body">
      <aside class="sidebar">
        <a class="wordmark" href={APP_BASE_PATH} aria-label="Frequency home"><span class="wave">▂▆█▆▂</span> frequency<span class="brand-dot">.</span><span class="tv-badge">TV</span></a>
        <span class="nav-caption">CHANNELS FROM EVERYWHERE</span>
        <nav aria-label="Main navigation">
          {VIEWS.map((name, index) =>
            <button key={name} aria-label={name} class={view === name ? 'nav-item active' : 'nav-item'} aria-current={view === name ? 'page' : undefined} mix={on('click', () => selectView(name))}>
              <span>{VIEW_ICONS[index]}</span>{name}
              {name === 'Essentials' ? <small>{essentials.length}</small> : name === 'Everything' ? <small>{items.length}</small> : name === 'Broadcasters' ? <small>{facets.length}</small> : favourites.length ? <small>{favourites.length}</small> : null}
            </button>)}
        </nav>
        <div class="sidebar-bottom">
          <div class="room-note"><span class="little-wave">▂▆█▆▂</span><p>World television.<br/>One quiet place.</p></div>
          <a class="nav-item" href={APP_BASE_PATH} aria-label="Open the radio player"><span>◁</span>Radio player</a>
          <div class="connection"><i class={online ? 'dot' : 'dot offline'}></i>{online ? 'Connected' : 'Offline · saved list'}</div>
        </div>
      </aside>

      <main>
        <header class="topbar">
          <div class="breadcrumb">Your space <span>/</span> {view}</div>
          <label class="search"><span>⌕</span><input type="search" placeholder={view === 'Broadcasters' ? 'Find a broadcaster' : 'Find a channel'} aria-label="Search channels" value={query} mix={on('input', event => { query = event.currentTarget.value; update() })}/><kbd>/</kbd></label>
          <button class="avatar" aria-label="Change colour theme" title="Change colour theme" mix={on('click', () => { theme = theme === 'moss' ? 'lilac' : 'moss'; document.documentElement.dataset.theme = theme; save('frequency.theme', theme); update() })}>D</button>
        </header>

        <div class="page-content">
          <div class="tv-intro">
            <div>
              <p class="eyebrow">PUBLIC STREAMS, ONE PLAYER</p>
              <h1>{view === 'Favourites' ? 'Saved channels.' : view === 'Broadcasters' ? 'Browse by broadcaster.' : view === 'Essentials' ? 'The channels everyone knows.' : 'Every channel, one place.'}</h1>
              <p>{view === 'Essentials'
                ? 'A short list of the household-name channels — BBC, ITV, Channel 4, Channel 5, Sky and the big international newsrooms. Everything else lives under All channels.'
                : 'Public streams from the iptv-org catalogue. Availability varies: some channels are offline, region-locked or refuse browser playback — use Retry, or open the stream in another player.'}</p>
            </div>
            <div class="tv-stats">
              <div><strong>{essentials.length}</strong><span>MAJOR</span></div>
              <div><strong>{items.length}</strong><span>CHANNELS</span></div>
              <div><strong>{facets.length}</strong><span>BROADCASTERS</span></div>
            </div>
          </div>

          {view !== 'Broadcasters' ? <>
            <div class="collection-filters" role="group" aria-label="Filter by category">
              {['All', ...categories].map(name =>
                <button key={name} aria-pressed={category === name} mix={on('click', () => { category = name; update() })}>{name === 'All' ? 'All categories' : name}</button>)}
            </div>
            <div class="collection-filters" role="group" aria-label="Filter by country">
              <label class="tv-country">Country
                <select value={country} mix={on('change', event => { country = event.currentTarget.value; update() })}>
                  <option value="All">Any country</option>
                  {countries.map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              {broadcaster !== 'All' ? <button aria-pressed="true" mix={on('click', () => { broadcaster = 'All'; update() })}>{broadcaster} ×</button> : null}
            </div>
          </> : null}

          {notice ? <div class="notice" role="status">{notice}<button aria-label="Dismiss notification" mix={on('click', () => { notice = ''; update() })}>×</button></div> : null}

          {selected ? <section class="stage" data-status={status} aria-label="Player">
            <div class="stage-view">
              <div class="stage-media" mix={ref(node => { stageNode = node; syncVideo() })}></div>
              {status !== 'playing' ? <div class="stage-status">
                <strong>{connecting ? 'Tuning in…' : status === 'failed' ? 'Channel unavailable' : status === 'blocked' ? 'Press play to start' : 'Ready'}</strong>
                <p>{status === 'failed' ? 'This stream may be offline, geo-blocked, or blocked by its host. Try again, or open the stream in VLC.' : selected.title}</p>
              </div> : null}
            </div>
            <div class="stage-bar">
              <div class="stage-info">
                <strong>{selected.title}</strong>
                <p>{[selected.broadcaster, selected.category, selected.countryCode, selected.quality, ...selected.labels].filter(Boolean).join(' · ')}</p>
              </div>
              <div class="stage-actions">
                <button class="primary" aria-label={playing ? 'Pause' : 'Play'} mix={on('click', toggle)}>{playing ? 'Ⅱ Pause' : connecting ? 'Ⅱ Connecting' : status === 'paused' ? '▶ Resume' : '▶ Play'}</button>
                {status === 'failed' ? <button mix={on('click', () => { if (selected) play(selected) })}>Retry</button> : null}
                <button mix={on('click', nextChannel)}>Next channel</button>
                <button aria-label="Toggle sound" aria-pressed={muted} mix={on('click', toggleMute)}>{muted ? '🔇 Muted' : '🔊 Sound'}</button>
                <button mix={on('click', () => void fullscreen())}>Fullscreen</button>
                <button mix={on('click', () => void pictureInPicture())}>PiP</button>
                <a href={selected.streamUrl} target="_blank" rel="noopener">Stream ↗</a>
              </div>
            </div>
          </section> : null}

          {loading ? <div class="tv-loading"><p>Loading {view === 'Essentials' ? 'channels' : 'the channel guide'}…</p></div> : null}

          {view === 'Broadcasters' ? <section>
            <div class="section-heading">
              <div><h2>Families <span class="live-chip">BROADCASTERS</span></h2><p>Grouped by the network behind the channel.</p></div>
              <span class="section-count">{facets.length} broadcasters</span>
            </div>
            {groups.map(group => <div class="broadcaster-band" key={group.name}>
              <div class="band-head">
                <h3>{group.name}</h3>
                <span>{group.channels.length} channels</span>
                <button class="text-link" mix={on('click', () => { broadcaster = group.name; view = 'Everything'; update() })}>See all ↗</button>
              </div>
              <div class="card-grid channel-grid band-grid">{group.channels.slice(0, 8).map(card)}</div>
            </div>)}
            {moreBroadcasters.length ? <div class="section-heading"><div><h2>Smaller networks</h2><p>Under eight channels each — use the search to jump straight to one.</p></div></div> : null}
            {moreBroadcasters.length ? <div class="broadcaster-list">{moreBroadcasters.slice(0, 120).map(([name, count]) =>
              <button key={name} mix={on('click', () => { broadcaster = name; view = 'Everything'; update() })}><span>{name}</span><small>{count}</small></button>)}{moreBroadcasters.length > 120
                ? <p class="broadcaster-more">{moreBroadcasters.length - 120} more networks · search by name to find one</p>
                : null}</div> : null}
          </section> : <section>
            <div class="section-heading">
              <div><h2>{view === 'Favourites' ? 'Your saved channels' : view === 'Essentials' ? 'The essentials' : 'All channels'} <span class="live-chip">{view === 'Essentials' ? 'MAJOR CHANNELS' : 'PUBLIC STREAMS'}</span></h2><p>{list.length === items.length ? `${categories.length} categories · ${countries.length} countries` : 'Filtered selection'}</p></div>
              <span class="section-count">{list.length} {list.length === 1 ? 'channel' : 'channels'}</span>
            </div>
            {list.length ? <div class="card-grid channel-grid">{list.slice(0, view === 'Essentials' ? 200 : 400).map(card)}</div> : null}
            {list.length > (view === 'Essentials' ? 200 : 400) ? <p class="tv-truncated">Showing the first {view === 'Essentials' ? 200 : 400} of {list.length}. Use search or a category to narrow it down.</p> : null}
            {!list.length && !loading ? <div class="tv-empty">
              <h2>{query ? 'Nothing on that frequency.' : view === 'Favourites' ? 'No saved channels yet.' : 'No channels here.'}</h2>
              <p>{view === 'Favourites' ? 'Tap a heart on any channel to save it here.' : 'Try another search, category or country.'}</p>
            </div> : null}
          </section>}

          <div class="page-footer"><span>PUBLIC STREAMS · IPTV-ORG</span><span>Streams are links to broadcasters' own servers.</span></div>
        </div>
      </main>

      <section class="tv-dock" aria-label="Now playing">
        <div class="dock-art" style={{ background: selected ? categoryColor(selected.broadcaster ?? selected.category) : undefined }}>
          {selected ? artwork(selected, 'dock-logo') : 'TV'}
        </div>
        <div class="dock-now">
          <strong>{selected?.title ?? 'Pick a channel.'}</strong>
          <p>{selected ? stageText : `${items.length} channels · ${essentials.length} major`}</p>
        </div>
        <div class="dock-actions">
          <button class="play-button" disabled={!selected} aria-label={playing || connecting ? 'Pause' : 'Play'} mix={on('click', toggle)}>{playing || connecting ? 'Ⅱ' : '▶'}</button>
          <button disabled={!selected} mix={on('click', nextChannel)}>Next</button>
          {selected ? <a href={selected.streamUrl} target="_blank" rel="noopener">Open stream ↗</a> : null}
          <label class="volume">♪<input aria-label="Volume" type="range" min="0" max="1" step="0.05" defaultValue="1" mix={on('input', event => playback.setVolume(Number(event.currentTarget.value)))}/></label>
        </div>
      </section>
    </div>
  }
}

const container = document.getElementById('app')
if (!container) throw new Error('Missing app root')
const root = createRoot(container)
root.render(<App />)
window.addEventListener('pagehide', () => root.dispose(), { once: true })
