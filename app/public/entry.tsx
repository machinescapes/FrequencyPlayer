import { createRoot, on, ref, type Handle } from 'remix/component'
import { validateCatalogue, loadSaved, save, safeUrl, parseFeed } from './catalogue.js'
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

function App(handle: Handle) {
  let items:CatalogueItem[]=[],custom=loadSaved('frequency.custom',[]) as CatalogueItem[],favourites=loadSaved('frequency.favourites',[]) as string[]
  let provider='All',view='Channels',query='',online=navigator.onLine,notice='',updateAvailable=false,selected:CatalogueItem|null=null,feedLoading=false,episodes:CatalogueItem[]=[],feedTitle='',theme=loadSaved('frequency.theme','moss')
  let dialog:HTMLDialogElement,updateDialog:HTMLDialogElement,updateCloseListenerAttached=false,registration:ServiceWorkerRegistration|undefined,editor:HTMLTextAreaElement
  let playbackState:PlaybackState={status:'idle',message:''}
  let favouritesDialog:HTMLDialogElement, programmeDialog:HTMLDialogElement
  let schedules:Schedule[]=[], scheduleLoading=true, scheduleFailed=false, clock=Date.now(), guideDate=dateInput(), programme:Programme|null=null
  let timeline:HTMLDivElement|undefined, positionTimeline=false, metadataKey=''
  const firstUse=loadSaved('frequency.favourites',null)===null && !loadSaved('frequency.favouritesSetup',false)
  let initialized=false
  const time=(value:number)=>new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone
  const programmes=()=>schedules.flatMap(source=>source.programmes)
  const info=(id:string)=>nowAndNext(programmes(),id,clock)
  function initializeStations(){
    if(initialized)return
    initialized=true
    favourites=firstUse?['bbc6']:normalizeFavourites(favourites,allItems().filter(i=>i.kind==='live').map(i=>i.id))
    save('frequency.favourites',favourites)
    selected=allItems().find(i=>i.id===loadSaved('frequency.selected',''))??allItems().find(i=>i.id===favourites[0])??items.find(i=>i.id==='bbc6')??null
    void update().then(()=>{if(firstUse)favouritesDialog.showModal()})
  }
  function syncMetadata(){
    if(!selected||!('mediaSession' in navigator))return
    const current=info(selected.id).current
    const key=`${selected.id}:${current?.start??''}`
    if(key===metadataKey)return
    metadataKey=key
    const artwork=current?.artwork??selected.logoUrl
    navigator.mediaSession.metadata=new MediaMetadata({title:current?.title??selected.title,artist:selected.title,artwork:artwork?[{src:new URL(artwork,document.baseURI).href}]:[]})
  }
  function changeView(next:string){view=next;if(next==='Guide')positionTimeline=true;update()}
  function jumpNow(){guideDate=dateInput();positionTimeline=true;update()}
  function positionAtNow(){
    if(!timeline)return
    const stationColumn=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--station-column'))||220
    const inset=Math.min(300,Math.max(60,(timeline.clientWidth-stationColumn)*0.7))
    timeline.scrollLeft=Math.max(0,(Date.now()-localDay(guideDate).start)*180/3600000-inset)
  }
  function showProgramme(value:Programme){programme=value;void update().then(()=>programmeDialog.showModal())}
  function playProgramme(){const activeProgramme=programme;if(!activeProgramme)return;const station=allItems().find(i=>i.id===activeProgramme.stationId);if(station)void play(station)}
  function scheduleText(id:string){return info(id).current?.title??(scheduleLoading?'Loading schedule…':'Schedule unavailable')}
  const failedLogos=new Set<string>()
  document.documentElement.dataset.theme=theme
  const update=()=>handle.update()
  const playback=createPlayback({onChange:state=>{playbackState=state;if('mediaSession' in navigator)navigator.mediaSession.playbackState=state.status==='playing'?'playing':state.status==='paused'||state.status==='blocked'?'paused':'none';update()}})
  function showUpdatePrompt(){
    if(updateAvailable)return
    updateAvailable=true
    void update().then(()=>{if(!updateDialog.open)updateDialog.showModal()})
  }
  function closeUpdatePrompt(){
    updateAvailable=false
    if(updateDialog.open)updateDialog.close()
    update()
  }
  function applyUpdate(){
    const waiting=registration?.waiting
    if(waiting)waiting.postMessage({type:'SKIP_WAITING'})
    closeUpdatePrompt()
  }
  function message(text:string){notice=text;update()}
  function toggleFavourite(id:string){favourites=favourites.includes(id)?favourites.filter((x:string)=>x!==id):[...favourites,id];save('frequency.favourites',favourites);update()}
  function removeCustom(id:string){custom=custom.filter(item=>item.id!==id);favourites=favourites.filter(favourite=>favourite!==id);if(selected?.id===id){playback.stop();selected=allItems().find(item=>favourites.includes(item.id))??items.find(item=>item.id==='bbc6')??null;metadataKey='';if(selected)syncMetadata();else if('mediaSession' in navigator)navigator.mediaSession.metadata=null}save('frequency.custom',custom);save('frequency.favourites',favourites);update()}
  function allItems(){return [...items,...custom]}
  function openOfficial(item:CatalogueItem,url=item.url){
    playback.stop();selected=item;save('frequency.selected',item.id)
    if('mediaSession' in navigator){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none'}
    window.open(url,'_blank','noopener')
    update()
  }
  async function play(item:CatalogueItem){
    if(item.kind==='feed'){await openFeed(item);return}
    if(!item.streamUrl){openOfficial(item);return}
    selected=item;notice='';save('frequency.selected',item.id);metadataKey=''
    if(!navigator.onLine){playback.stop();message('You’re offline. Connect to play this stream.');return}
    if('mediaSession' in navigator){
      navigator.mediaSession.metadata=new MediaMetadata({title:item.title,artist:item.brand??'Frequency',artwork:item.logoUrl?[{src:new URL(item.logoUrl,document.baseURI).href}]:[]})
    }
    syncMetadata()
    await playback.play(item)
  }
  function toggle(){
    if(!selected)return
    if(playbackState.status==='playing'||playbackState.status==='connecting')playback.pause()
    else if(playbackState.status==='paused'||playbackState.status==='blocked')playback.resume()
    else void play(selected)
  }
  async function openFeed(item:CatalogueItem){
    feedTitle=item.title;episodes=[];feedLoading=true;update()
    try{const response=await fetch(item.url,{signal:handle.signal});if(!response.ok)throw Error();episodes=parseFeed(await response.text()) as CatalogueItem[];notice=episodes.length?'':'No playable RSS enclosures found.'}catch{notice='Feed unavailable. The publisher must allow browser access (CORS). You can still open its website.'}finally{feedLoading=false;update()}
  }
  handle.signal.addEventListener('abort',()=>playback.dispose())
  handle.queueTask(()=>{
    const epg=createScheduleClient({url:`${APP_BASE_PATH}epg/freeview.json`,signal:handle.signal,onChange:(data,loading,failed)=>{schedules=data;scheduleLoading=loading;scheduleFailed=failed;syncMetadata();update()}})
    void epg.start()
    const tick=window.setInterval(()=>{clock=Date.now();syncMetadata();update();if(!document.hidden)void epg.refreshNts()},60000)
    const refresh=window.setInterval(()=>{if(!document.hidden)void epg.refresh()},6*60*60*1000)
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){clock=Date.now();void epg.refresh()}},{signal:handle.signal})
    window.addEventListener('online',()=>void epg.refresh(),{signal:handle.signal})
    handle.signal.addEventListener('abort',()=>{window.clearInterval(tick);window.clearInterval(refresh)},{once:true})
    setupNavigation(handle.signal,()=>{})
    document.addEventListener('keydown',event=>{if(event.key==='/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)){event.preventDefault();document.querySelector<HTMLInputElement>('.search input')?.focus()}},{signal:handle.signal})
    for(const event of ['online','offline'])window.addEventListener(event,()=>{online=navigator.onLine;update()},{signal:handle.signal})
    if('mediaSession' in navigator){navigator.mediaSession.setActionHandler('play',()=>{if(selected?.streamUrl){if(playbackState.status==='paused'||playbackState.status==='blocked')playback.resume();else if(playbackState.status!=='playing'&&playbackState.status!=='connecting')void play(selected)}});navigator.mediaSession.setActionHandler('pause',()=>playback.pause())}
    fetch(`${APP_BASE_PATH}catalogue.json`,{signal:handle.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{items=validateCatalogue(data);save('frequency.catalogue',data);initializeStations();update()}).catch(()=>{try{items=validateCatalogue(loadSaved('frequency.catalogue',{version:1,items:[]}));initializeStations();message('Using your saved catalogue.')}catch{message('Catalogue unavailable. Check catalogue.json.')}})
    if('serviceWorker' in navigator)navigator.serviceWorker.register(`${APP_BASE_PATH}sw.js`,{scope:APP_BASE_PATH,updateViaCache:'none'}).then(serviceWorkerRegistration=>{
      registration=serviceWorkerRegistration
      let startupCheckInProgress=true
      const startupWorkers=new WeakSet<ServiceWorker>()
      const watchedWorkers=new WeakSet<ServiceWorker>()
      const activateWaitingWorker=()=>registration?.waiting?.postMessage({type:'SKIP_WAITING'})
      const offerWaitingWorker=()=>{if(!registration?.waiting||!navigator.serviceWorker.controller)return;if(startupCheckInProgress)activateWaitingWorker();else showUpdatePrompt()}
      const checkForUpdate=()=>{void registration?.update().then(offerWaitingWorker).catch(()=>{})}
      const watchWorker=(worker:ServiceWorker,autoApply:boolean)=>{if(watchedWorkers.has(worker))return;watchedWorkers.add(worker);if(autoApply)startupWorkers.add(worker);worker.addEventListener('statechange',()=>{if(worker.state!=='installed'||!navigator.serviceWorker.controller)return;if(startupWorkers.has(worker))worker.postMessage({type:'SKIP_WAITING'});else showUpdatePrompt()})}
      registration.addEventListener('updatefound',()=>{const worker=registration?.installing;if(worker)watchWorker(worker,startupCheckInProgress)})
      if(registration.installing)watchWorker(registration.installing,true)
      offerWaitingWorker()
      void registration.update().then(offerWaitingWorker).catch(()=>{}).finally(()=>{startupCheckInProgress=false})
      const interval=window.setInterval(checkForUpdate,5*60*1000)
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate()},{signal:handle.signal})
      handle.signal.addEventListener('abort',()=>window.clearInterval(interval),{once:true})
      let hadController=Boolean(navigator.serviceWorker.controller)
      navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)window.location.reload();else hadController=true})
    }).catch(()=>message('Offline setup failed. The app is still available online.'))
  })
  function artwork(item:CatalogueItem){
    return item.logoUrl&&!failedLogos.has(item.logoUrl)?<img class="station-logo" src={item.logoUrl} alt="" loading="lazy" decoding="async" mix={on('error',()=>{failedLogos.add(item.logoUrl!);update()})}/>:<span class="station-mark">{item.mark??'♫'}</span>
  }
  function destination(item:CatalogueItem,url:string,label:string){return <a href={url} target="_blank" rel="noopener" mix={on('click',e=>{e.preventDefault();openOfficial(item,url)})}>{label} ↗</a>}
  function card(item:CatalogueItem){return <article class={selected?.id===item.id?'card selected':'card'} key={item.id}>
    <button class="art" style={{'--station':item.color}} aria-label={(item.streamUrl?'Play ':'Open ')+item.title} mix={on('click',()=>play(item))}>{artwork(item)}<span class="art-play">{item.streamUrl?'▶':'↗'}</span></button>
    <div class="card-info"><div><h3>{item.title}</h3><p>{item.streamUrl?(info(item.id).current?.title??item.provider):'Official player ↗'}</p></div><button class="favourite" aria-label={(favourites.includes(item.id)?'Remove favourite ':'Favourite ')+item.title} aria-pressed={favourites.includes(item.id)} mix={on('click',()=>toggleFavourite(item.id))}>{favourites.includes(item.id)?'♥':'♡'}</button></div>
  </article>}
  function filters(){return <div class="collection-filters" role="group" aria-label="Filter by broadcaster">{['All',...new Set(allItems().filter(i=>i.kind==='live').map(i=>i.provider??'Other'))].map(name=><button key={name} aria-pressed={provider===name} mix={on('click',()=>{provider=name;update()})}>{name==='All'?'All broadcasters':name}</button>)}</div>}
  return ()=>{
    const playing=playbackState.status==='playing',loading=playbackState.status==='connecting'
    const stations=allItems().filter(i=>i.kind==='live')
    const live=stations.filter(i=>`${i.title} ${i.provider??''} ${i.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).filter(i=>provider==='All'||(i.provider??'Other')===provider)
    const favouritesList=stations.filter(i=>favourites.includes(i.id))
    const rows=[...live].sort((a,b)=>Number(favourites.includes(b.id))-Number(favourites.includes(a.id)))
    const current=selected?info(selected.id).current:undefined,next=selected?info(selected.id).next:undefined
    const day=localDay(guideDate), scale=180/3600000, width=(day.end-day.start)*scale
    const hours=Array.from({length:Math.ceil((day.end-day.start)/3600000)},(_,index)=>day.start+index*3600000)
    const freeview=schedules.find(s=>s.source==='freeview')
    const stale=Boolean(freeview&&clock-freeview.fetchedAt>24*3600000)
    return <div class="app">
      <main><header class="topbar"><a class="wordmark" href={APP_BASE_PATH} aria-label="Frequency home"><span class="wave">▂▆█▆▂</span> frequency<span class="brand-dot">.</span></a><h1 class="visually-hidden">{view}</h1><div class="view-toggle" role="group" aria-label="Main view"><button aria-pressed={view==='Channels'} mix={on('click',()=>changeView('Channels'))}>▦ Channels</button><button aria-pressed={view==='Guide'} mix={on('click',()=>changeView('Guide'))}>☷ Guide</button></div><div class="topbar-tools"><label class="search"><span>⌕</span><input type="search" placeholder="Search stations" aria-label="Search stations" value={query} mix={on('input',e=>{query=e.currentTarget.value;update()})}/><kbd>/</kbd></label><button class="collection-tool" aria-label="Manage collection" mix={on('click',()=>dialog.showModal())}><span>＋</span><span>Collection</span></button><button class="avatar" aria-label="Change colour theme" mix={on('click',()=>{theme=theme==='moss'?'lilac':'moss';document.documentElement.dataset.theme=theme;save('frequency.theme',theme);update()})}>◐</button></div></header>
      <div class="page-content"><div class="view-toolbar"><span>{view==='Channels'?'Live radio':'Programme guide'}</span></div>
      {notice&&!updateAvailable?<div class="notice" role="status">{notice}<button aria-label="Dismiss notification" mix={on('click',()=>{notice='';update()})}>×</button></div>:null}
      {selected&&playbackState.message?<div class="playback-feedback" role="status"><p>{playbackState.message}</p><div><button mix={on('click',()=>{if(selected)void play(selected)})}>{playbackState.status==='failed'?'Retry':'Play'}</button>{destination(selected,selected.url,'Official player')}</div></div>:null}
      <div class="schedule-status" role="status">{scheduleLoading?'Loading schedules…':!online?(programmes().length?'Offline · saved schedules':'Offline · no saved schedules'):scheduleFailed?(programmes().length?'Could not refresh · showing saved schedules':'Schedule unavailable'):stale?'Schedules may be out of date':''}{freeview&&(stale||scheduleFailed||view==='Guide')?<span> Updated {new Date(freeview.fetchedAt).toLocaleString()} · <a href={freeview.sourceUrl} target="_blank" rel="noopener">Freeview-EPG</a></span>:null}</div>
      {view==='Channels'?<div>
        <section class="favourites-section"><div class="section-heading"><h2>Favourites <span class="section-count">{favouritesList.length}</span></h2><button class="quiet-action" mix={on('click',()=>favouritesDialog.showModal())}>Edit favourites</button></div>{favouritesList.length?<div class="favourites-grid">{favouritesList.map(card)}</div>:<button class="favourites-empty" mix={on('click',()=>favouritesDialog.showModal())}>♡ <span>Add favourites <small>Choose stations for quick access.</small></span><span>＋</span></button>}</section>
        <section><div class="section-heading"><h2>Stations</h2><span class="section-count">{live.filter(i=>!favourites.includes(i.id)).length}</span></div>{filters()}<div class="card-grid">{live.filter(i=>!favourites.includes(i.id)).map(card)}</div>{!live.length?<p class="empty-message">No stations match your search.</p>:null}</section>
      </div>:<section class="guide"><div class="guide-controls"><label>Date <input aria-label="Guide date" type="date" value={guideDate} mix={on('change',e=>{if(e.currentTarget.value){guideDate=e.currentTarget.value;positionTimeline=true;update()}})}/></label><button class="primary" mix={on('click',jumpNow)}>Now</button><span>{timezone}</span></div>{filters()}
        <div class="timeline" aria-label="Station schedule timeline" tabIndex={0} mix={[ref(node=>{timeline=node;if(positionTimeline){positionTimeline=false;requestAnimationFrame(()=>{if(timeline){if(guideDate===dateInput())positionAtNow();else timeline.scrollLeft=0}})}}),on('keydown',event=>{if(event.target===event.currentTarget&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();event.currentTarget.scrollLeft+=event.key==='ArrowRight'?180:-180}})]}>
          <div class="timeline-content" style={{width:`calc(var(--station-column) + ${width}px)`}}><div class="timeline-header"><div class="station-heading">Stations</div><div class="time-ruler" style={{width:`${width}px`}}>{hours.map(hour=><span key={hour} style={{left:`${(hour-day.start)*scale}px`}}>{time(hour)}</span>)}</div></div>
          {rows.map(item=>{const listings=programmes().filter(p=>p.stationId===item.id&&p.end>day.start&&p.start<day.end);const stationInfo=info(item.id);return <div class={selected?.id===item.id?'timeline-row active':'timeline-row'} key={item.id}><button class="station-cell" aria-label={(item.streamUrl?'Play ':'Open ')+item.title} mix={on('click',()=>play(item))}><span class="station-thumb" style={{background:item.color}}>{artwork(item)}</span><span>{item.title}<small>{selected?.id===item.id?stationInfo.current?.title??(playing?'Playing':'Selected'):favourites.includes(item.id)?'♥ Favourite':item.streamUrl?'▶ Play':'↗ Official'}</small></span></button><div class="programme-track" style={{width:`${width}px`}}>{listings.map(p=><button key={`${p.stationId}:${p.start}`} class={p.start<=clock&&p.end>clock?'programme current':'programme'} style={{left:`${(Math.max(p.start,day.start)-day.start)*scale}px`,width:`${(Math.min(p.end,day.end)-Math.max(p.start,day.start))*scale}px`}} aria-label={`${p.title}, ${time(p.start)} to ${time(p.end)}`} mix={on('click',()=>showProgramme(p))}><small>{time(p.start)} – {time(p.end)}</small><strong>{p.title}</strong></button>)}{!listings.length?<div class="schedule-empty">{scheduleLoading?'Loading schedule…':'No listings for this date'}{item.scheduleUrl?destination(item,item.scheduleUrl,'Official schedule'):null}</div>:null}</div></div>})}
          {clock>=day.start&&clock<day.end?<div class="now-line" style={{left:`calc(var(--station-column) + ${(clock-day.start)*scale}px)`}} aria-hidden="true"/>:null}</div></div>{!rows.length?<p class="empty-message">No stations match your search.</p>:null}
      </section>}
      </div></main>
      <section class="player" aria-label="Audio player"><div class="now-playing"><div class="mini-art" style={{background:selected?.color??'var(--accent)'}}>{current?.artwork&&!failedLogos.has(current.artwork)?<img class="programme-art" src={current.artwork} alt="" mix={on('error',()=>{failedLogos.add(current.artwork!);update()})}/>:selected?artwork(selected):'ƒ'}</div><div class="now-copy"><span class="now-label">WHAT’S ON NOW</span><strong>{current?.title??(selected?scheduleText(selected.id):'Select a station')}</strong><p>{selected?.title??'Live radio'}{current?` · ${time(current.start)}–${time(current.end)}`:''}</p>{current?.description?<small class="player-description">{current.description}</small>:null}{next?<small class="player-next">Next · {time(next.start)} · {next.title}</small>:null}</div></div><div class="transport"><button class="play-button" disabled={!selected} aria-label={playing||loading?'Pause':playbackState.status==='failed'?'Retry':selected&&!selected.streamUrl?'Open official player':'Play'} mix={on('click',toggle)}>{playing||loading?'Ⅱ':'▶'}</button><span class="player-label">{playing?'● LIVE':selected?.kind==='live'?'● LIVE RADIO':selected?'COLLECTION':'LIVE RADIO'}</span></div><div class="player-extra"><label class="volume">♪<input aria-label="Volume" type="range" min="0" max="1" step="0.05" defaultValue="1" mix={on('input',e=>{playback.setVolume(Number(e.currentTarget.value))})}/></label></div></section>
      <dialog class="favourites-dialog" aria-labelledby="favourites-title" mix={[ref(node=>{favouritesDialog=node}),on('close',()=>{save('frequency.favouritesSetup',true)})]}><div class="dialog-heading"><h2 id="favourites-title">Choose favourites</h2><button aria-label="Close favourites" mix={on('click',()=>favouritesDialog.close())}>×</button></div><p>Choose stations for quick access. You can change these any time.</p><div class="favourite-options">{stations.map(item=><button key={item.id} aria-pressed={favourites.includes(item.id)} mix={on('click',()=>toggleFavourite(item.id))}><span class="station-thumb" style={{background:item.color}}>{artwork(item)}</span><span>{item.title}</span><span>{favourites.includes(item.id)?'♥':'♡'}</span></button>)}</div><button class="primary" mix={on('click',()=>favouritesDialog.close())}>Done</button></dialog>
      <dialog aria-labelledby="programme-title" mix={ref(node=>{programmeDialog=node})}><div class="dialog-heading"><h2 id="programme-title">{programme?.title??'Programme'}</h2><button aria-label="Close programme" mix={on('click',()=>programmeDialog.close())}>×</button></div>{programme?<div class="programme-details"><p>{allItems().find(i=>i.id===programme?.stationId)?.title} · {time(programme.start)} – {time(programme.end)} · {timezone}</p>{programme.artwork?<img src={programme.artwork} alt=""/>:null}<p>{programme.description}</p>{programme.presenters?.length?<p>{programme.presenters.join(', ')}</p>:null}<button class="primary" mix={on('click',playProgramme)}>Play live station</button></div>:null}</dialog>
      <dialog class="update-dialog" aria-labelledby="update-title" aria-describedby="update-description" mix={ref(node=>{updateDialog=node;if(!updateCloseListenerAttached){updateCloseListenerAttached=true;node.addEventListener('close',()=>{if(updateAvailable)closeUpdatePrompt()},{signal:handle.signal})}})}><p class="eyebrow">FREQUENCY UPDATE</p><h2 id="update-title">A new version is ready</h2><p id="update-description">Apply it now to reload Frequency with the latest files, or keep listening and update later.</p><div class="update-actions"><button mix={on('click',closeUpdatePrompt)}>Later</button><button class="primary" mix={on('click',applyUpdate)}>Update now</button></div></dialog>
      <dialog mix={ref(node=>{dialog=node})}><div class="dialog-heading"><div><h2>Your collection</h2></div><button class="close" aria-label="Close collection" mix={on('click',()=>dialog.close())}>×</button></div><p>Add an HTTPS stream, show page or podcast RSS feed. Your additions stay on this device.</p><div class="utility-content"><h3>Shows &amp; podcasts</h3>{allItems().filter(i=>i.kind!=='live').map(item=><button class="episode" key={item.id} mix={on('click',()=>play(item))}><span>▶</span><span>{item.title}</span></button>)}{feedTitle?<section><h3>{feedTitle}</h3>{feedLoading?<p>Loading episodes…</p>:episodes.map(item=><button class="episode" key={item.id} mix={on('click',()=>play(item))}>{item.title}</button>)}</section>:null}</div><form mix={on('submit',e=>{
        e.preventDefault();const form=e.currentTarget,data=new FormData(form)
        const optional=(name:string)=>String(data.get(name)??'').trim()||undefined
        const kind=String(data.get('kind')),url=safeUrl(data.get('url'))
        if(!url){message('Please enter a valid HTTPS address.');return}
        const item={id:crypto.randomUUID(),title:String(data.get('title')).trim(),subtitle:'Added by you',url,kind,streamUrl:optional('streamUrl')??(kind==='audio'?url:undefined),streamType:optional('streamType'),logoUrl:optional('logoUrl'),scheduleUrl:optional('scheduleUrl'),showsUrl:optional('showsUrl'),provider:optional('provider'),mark:'♫',brand:'COLLECTION',color:String(data.get('color')),tags:['Added by you']}
        try{
          const next=validateCatalogue({version:1,items:[...custom,item]}) as CatalogueItem[]
          custom=next;const saved=save('frequency.custom',custom);form.reset();dialog.close();message(saved?'Added to your collection.':'Added for this session; browser storage is unavailable.')
        }catch(error){message(error instanceof Error?error.message:'Invalid station configuration.')}
      })}><label>Name<input required name="title" placeholder="Station or show name" maxLength={120}/></label><label>Official page / episode / RSS address<input required type="url" name="url" placeholder="https://…"/></label><label>Content type<select name="kind"><option value="show">Official show / player link</option><option value="live">Live station</option><option value="audio">Audio episode (MP3 / M4A)</option><option value="feed">Podcast RSS feed</option></select></label><label>Direct stream address (optional)<input type="url" name="streamUrl" placeholder="https://…"/></label><label>Stream format<select name="streamType"><option value="">Detect automatically</option><option value="mp3">MP3</option><option value="aac">AAC</option><option value="hls">HLS</option></select></label><label>Logo address (optional)<input name="logoUrl" placeholder="https://… or images/station.png"/></label><label>Station colour<input name="color" type="color" defaultValue="#cfa3e9"/></label><label>Broadcaster (optional)<input name="provider" maxLength={80}/></label><label>Schedule address (optional)<input type="url" name="scheduleUrl"/></label><label>Shows address (optional)<input type="url" name="showsUrl"/></label><button class="primary" aria-label="Add to collection" type="submit">＋ Add to collection</button></form>
      {custom.length?<div class="custom-list"><h3>Your additions</h3>{custom.map(item=><div key={item.id}><span>{item.title}</span><button aria-label={'Remove '+item.title} mix={on('click',()=>removeCustom(item.id))}>Remove</button></div>)}</div>:null}
      <details mix={on('toggle',e=>{if(e.currentTarget.open)editor.value=JSON.stringify({version:1,items:custom},null,2)})}><summary>Edit / import / export JSON</summary><p>Import replaces your device additions. The built-in collection lives in catalogue.json.</p><textarea aria-label="Catalogue JSON" rows={8} mix={ref(node=>{editor=node;editor.value=JSON.stringify({version:1,items:custom},null,2)})}/><div class="editor-buttons"><button mix={on('click',()=>{try{custom=validateCatalogue(JSON.parse(editor.value));if(!save('frequency.custom',custom))throw Error('Browser storage is unavailable.');dialog.close();message('Collection imported.')}catch(error){message(error instanceof Error?error.message:'Invalid JSON.')}})}>Import JSON</button><button mix={on('click',()=>{const blob=new Blob([JSON.stringify({version:1,items:custom},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='frequency-collection.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})}>Export additions</button></div></details>{notice?<p class="dialog-feedback">{notice}</p>:null}<p class="dialog-note">Feed access depends on publisher CORS. Music shows may require the official player, a UK connection or sign-in. Offline mode saves your collection, not streamed audio.</p></dialog>
    </div>
  }
}
const container=document.getElementById('app')
if(!container)throw new Error('Missing app root')
const root=createRoot(container)
root.render(<App />)
window.addEventListener('pagehide',()=>root.dispose(),{once:true})
