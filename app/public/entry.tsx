import { createRoot, on, ref, type Handle } from 'remix/component'
import { validateCatalogue, loadSaved, save, safeUrl, parseFeed } from './catalogue.js'
import { setupNavigation } from './navigation.js'

declare const __APP_BASE_PATH__: string
declare const __STATIC_BUILD__: boolean
const APP_BASE_PATH = typeof __APP_BASE_PATH__ === 'undefined' ? '/' : __APP_BASE_PATH__

type CatalogueItem = {
  id: string
  title: string
  subtitle?: string
  kind: 'live' | 'show' | 'feed' | 'audio'
  url: string
  streamUrl?: string
  brand?: string
  mark?: string
  color: string
  tags: string[]
}

function App(handle: Handle) {
  let items:CatalogueItem[]=[],custom=loadSaved('frequency.custom',[]) as CatalogueItem[],favourites=loadSaved('frequency.favourites',[]) as string[]
  let view='Discover',query='',online=navigator.onLine,controller=false,notice='',updateAvailable=false,selected:CatalogueItem|null=null,external:CatalogueItem|null=null,playing=false,loading=false,episodes:CatalogueItem[]=[],feedTitle='',theme=loadSaved('frequency.theme','moss')
  let dialog:HTMLDialogElement,externalDialog:HTMLDialogElement,updateDialog:HTMLDialogElement,updateCloseListenerAttached=false,registration:ServiceWorkerRegistration|undefined,editor:HTMLTextAreaElement
  const audio=new Audio();audio.preload='none'
  document.documentElement.dataset.theme=theme
  const update=()=>handle.update()
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
  function allItems(){return [...items,...custom]}
  function openOfficial(item:CatalogueItem){
    selected=item
    if(item.url.includes('bbc.co.uk/sounds/play/')){
      external=item
      externalDialog.showModal()
      update()
      return
    }
    window.location.assign(item.url)
  }
  async function play(item:CatalogueItem){
    if(item.kind==='feed'){await openFeed(item);return}
    if(!item.streamUrl){openOfficial(item);return}
    if(!navigator.onLine){message('You’re offline. Connect to play this stream.');return}
    if(item.streamUrl.includes('.m3u8')&&!audio.canPlayType('application/vnd.apple.mpegurl')){openOfficial(item);return}
    selected=item;audio.src=item.streamUrl;loading=true;notice='';update()
    if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:item.title,artist:item.brand??'Frequency'})}
    try{await audio.play()}catch{message('Couldn’t start this stream. Try the official player or check your connection.')}finally{loading=false;update()}
  }
  async function toggle(){if(!selected)return;if(playing)audio.pause();else if(audio.src){try{await audio.play()}catch{message('Playback unavailable. Try the official player.')}}else await play(selected)}
  async function openFeed(item:CatalogueItem){
    feedTitle=item.title;episodes=[];loading=true;update()
    try{const response=await fetch(item.url,{signal:handle.signal});if(!response.ok)throw Error();episodes=parseFeed(await response.text()) as CatalogueItem[];notice=episodes.length?'':'No playable RSS enclosures found.'}catch{notice='Feed unavailable. The publisher must allow browser access (CORS). You can still open its website.'}finally{loading=false;update()}
  }
  for(const event of ['playing','pause','ended','waiting','error'])audio.addEventListener(event,()=>{playing=!audio.paused&&!audio.ended;loading=event==='waiting';if(event==='error')notice='Stream unavailable. Open the official player below, or try another source.';update()},{signal:handle.signal})
  handle.signal.addEventListener('abort',()=>{audio.pause();audio.src=''})
  handle.queueTask(()=>{
    setupNavigation(handle.signal,(value:boolean)=>{controller=value;update()})
    document.addEventListener('keydown',event=>{if(event.key==='/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)){event.preventDefault();document.querySelector<HTMLInputElement>('.search input')?.focus()}},{signal:handle.signal})
    for(const event of ['online','offline'])window.addEventListener(event,()=>{online=navigator.onLine;update()},{signal:handle.signal})
    if('mediaSession' in navigator){navigator.mediaSession.setActionHandler('play',()=>{void toggle()});navigator.mediaSession.setActionHandler('pause',()=>audio.pause())}
    fetch(`${APP_BASE_PATH}catalogue.json`,{signal:handle.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{items=validateCatalogue(data);save('frequency.catalogue',data);update()}).catch(()=>{try{items=validateCatalogue(loadSaved('frequency.catalogue',{version:1,items:[]}));message('Using your saved catalogue.')}catch{message('Catalogue unavailable. Check catalogue.json.')}})
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
  function card(item:CatalogueItem){return <article class="card" key={item.id}>
    <button class="art" style={{'--station':item.color}} aria-label={(item.streamUrl?'Play ':'Open ')+item.title} mix={on('click',()=>play(item))}><span class="art-top">{item.brand??'YOUR COLLECTION'}<span>↗</span></span><span class="station-mark">{item.mark??'♫'}</span><span class="art-bottom">{item.kind==='live'?'ON AIR':item.kind==='feed'?'PODCAST FEED':'ON YOUR TIME'}<span class="art-play">▶</span></span></button>
    <div class="card-info"><div><h3>{item.title}</h3><p>{item.tags.join(' · ')}</p></div><button class="favourite" aria-label={(favourites.includes(item.id)?'Remove favourite ':'Favourite ')+item.title} aria-pressed={favourites.includes(item.id)} mix={on('click',()=>toggleFavourite(item.id))}>{favourites.includes(item.id)?'♥':'♡'}</button></div>
  </article>}
  return ()=>{
    const matching=allItems().filter(i=>`${i.title} ${i.subtitle} ${i.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).filter(i=>view!=='Favourites'||favourites.includes(i.id)).filter(i=>view!=='Live radio'||i.kind==='live').filter(i=>view!=='Shows & podcasts'||i.kind!=='live')
    const live=matching.filter(i=>i.kind==='live'),shows=matching.filter(i=>i.kind!=='live')
    return <div class="app">
      <aside class="sidebar"><a class="wordmark" href="/" aria-label="Frequency home"><span class="wave">▂▆█▆▂</span> frequency<span class="brand-dot">.</span></a><span class="nav-caption">YOUR LISTENING ROOM</span><nav aria-label="Main navigation">{['Discover','Live radio','Shows & podcasts','Favourites'].map((name,index)=><button key={name} aria-label={name} class={view===name?'nav-item active':'nav-item'} aria-current={view===name?'page':undefined} mix={on('click',()=>{view=name;feedTitle='';episodes=[];update()})}><span>{['◈','◉','▤','♡'][index]}</span>{name}{name==='Live radio'?<small>{allItems().filter(i=>i.kind==='live').length}</small>:null}</button>)}</nav><div class="sidebar-bottom"><div class="room-note"><span class="little-wave">▂▆█▆▂</span><p>Good music.<br/>Your own frequency.</p></div><button class="nav-item" aria-label="Manage collection" mix={on('click',()=>dialog.showModal())}><span>＋</span>Manage collection</button><div class="connection"><i class={online?'dot':'dot offline'}></i>{online?'Connected':'Offline · saved collection'}</div>{controller?<div class="connection">Game controller connected</div>:null}</div></aside>
      <main><header class="topbar"><div class="breadcrumb">Your space <span>/</span> {view}</div><label class="search"><span>⌕</span><input type="search" placeholder="Find your next listen" aria-label="Search your collection" value={query} mix={on('input',e=>{query=e.currentTarget.value;update()})}/><kbd>/</kbd></label><button class="avatar" aria-label="Change colour theme" title="Change colour theme" mix={on('click',()=>{theme=theme==='moss'?'lilac':'moss';document.documentElement.dataset.theme=theme;save('frequency.theme',theme);update()})}>D</button></header>
      <div class="page-content"><div class="page-heading"><div><p class="eyebrow">LESS SCROLLING. MORE LISTENING.</p><h1>{view==='Discover'?'Find your frequency.':view}</h1></div><span class="date-note">A home for everything you tune into.</span></div>
      {view==='Discover'&&!query?<section class="hero"><div class="hero-copy"><span class="live-label"><i class="dot"></i> THE LIVE EDIT</span><h2>A different<br/>kind of radio.</h2><p>Leftfield discoveries. Lifelong favourites.<br/>Welcome to the world of 6 Music.</p><div class="hero-buttons"><button class="primary" mix={on('click',()=>{const item=items.find(i=>i.id==='bbc6');if(item)play(item);else message('The station catalogue is still loading. Please try again.')})}>▶ <span>Listen to 6 Music</span></button><a class="text-link" href="https://www.bbc.co.uk/sounds/schedules/bbc_6music">Explore shows ↗</a></div><span class="hero-foot">BBC RADIO 6 MUSIC <span>·</span> ALTERNATIVE / ECLECTIC</span></div><div class="hero-graphic" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><div class="orbit orbit-four"></div><div class="record"><span class="record-label">BBC<br/><strong>6</strong><small>MUSIC</small></span></div><span class="graphic-caption">ALWAYS<br/>A LITTLE<br/><b>DIFFERENT.</b></span></div></section>:null}
      {notice&&!updateAvailable?<div class="notice" role="status">{notice}<button aria-label="Dismiss notification" mix={on('click',()=>{notice='';update()})}>×</button></div>:null}
      {live.length?<section><div class="section-heading"><div><h2>On air, right now <span class="live-chip">LIVE</span></h2><p>Your stations. One tap away.</p></div><span class="section-count">{live.length} stations</span></div><div class="card-grid">{live.map(card)}</div></section>:null}
      {shows.length?<section><div class="section-heading"><div><h2>{view==='Favourites'?'Saved for you':'Listen on your own time'} <span class="muted-arrow">↗</span></h2><p>Great shows don’t have to happen on schedule.</p></div><span class="section-count">Shows & podcasts</span></div><div class="card-grid show-grid">{shows.map(card)}</div></section>:null}
      {!matching.length?<div class="empty"><h2>{query?'No matches on this frequency.':'Make this space yours.'}</h2><p>{view==='Favourites'?'Tap a heart to save something you love.':'Try another search, or add something to your collection.'}</p><button class="primary" mix={on('click',()=>dialog.showModal())}>＋ Add content</button></div>:null}
      {feedTitle?<section><div class="section-heading"><h2>{feedTitle}</h2><button class="text-link" mix={on('click',()=>{feedTitle='';episodes=[];update()})}>Close episodes ×</button></div>{loading?<p>Loading episodes…</p>:episodes.map(item=><button class="episode" key={item.id} mix={on('click',()=>play(item))}><span>▶</span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span></button>)}</section>:null}
      <footer class="page-footer"><span>CURATED BY YOU. PLAYED YOUR WAY.</span><span>↑ ↓ ← → to explore <span>·</span> Enter to select</span></footer></div></main>
      <section class="player" aria-label="Audio player"><div class="now-playing"><div class="mini-art" style={{background:selected?.color??'var(--accent)'}}>{selected?.mark??'ƒ'}</div><div><strong>{selected?.title??'Your next favourite is out there.'}</strong><p>{selected?(loading?'Connecting…':playing?'Playing now':'Ready when you are'):'Pick a station and settle in.'}</p></div></div><div class="transport"><button class="play-button" disabled={!selected} aria-label={playing?'Pause':'Play'} mix={on('click',toggle)}>{playing?'Ⅱ':'▶'}</button><span class="player-label">{selected?.kind==='live'?'● LIVE RADIO':selected?'YOUR COLLECTION':'THE WORLD IS LISTENING'}</span></div><div class="player-extra">{selected?<a href={selected.url} class="official" mix={on('click',e=>{e.preventDefault();if(selected)openOfficial(selected)})}>Official player ↗</a>:null}<label class="volume">♪<input aria-label="Volume" type="range" min="0" max="1" step="0.05" defaultValue="1" mix={on('input',e=>{audio.volume=Number(e.currentTarget.value)})}/></label></div></section>
      <dialog class="external-dialog" aria-label={external?.title??'Official player'} mix={ref(node=>{externalDialog=node})}><div class="external-toolbar"><strong>{external?.title??'Official player'}</strong><div><a class="text-link" href={external?.url??'#'} mix={on('click',e=>{e.preventDefault();if(external)window.location.assign(external.url)})}>Open full page ↗</a><button class="close" aria-label="Return to Frequency" title="Return to Frequency" mix={on('click',()=>{externalDialog.close();external=null;update()})}>×</button></div></div>{external?<iframe title={external.title} src={external.url} allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"/>:null}<p>BBC Sounds may ask you to sign in or confirm your location.</p></dialog>
      <dialog class="update-dialog" aria-labelledby="update-title" aria-describedby="update-description" mix={ref(node=>{updateDialog=node;if(!updateCloseListenerAttached){updateCloseListenerAttached=true;node.addEventListener('close',()=>{if(updateAvailable)closeUpdatePrompt()},{signal:handle.signal})}})}><p class="eyebrow">FREQUENCY UPDATE</p><h2 id="update-title">A new version is ready</h2><p id="update-description">Apply it now to reload Frequency with the latest files, or keep listening and update later.</p><div class="update-actions"><button mix={on('click',closeUpdatePrompt)}>Later</button><button class="primary" mix={on('click',applyUpdate)}>Update now</button></div></dialog>
      <dialog mix={ref(node=>{dialog=node})}><div class="dialog-heading"><div><p class="eyebrow">MAKE IT YOURS</p><h2>Your collection</h2></div><button class="close" aria-label="Close collection" mix={on('click',()=>dialog.close())}>×</button></div><p>Add an HTTPS stream, show page or podcast RSS feed. Your additions stay on this device.</p><form mix={on('submit',e=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);const url=safeUrl(data.get('url'));if(!url){message('Please enter a valid HTTPS address.');return}const kind=String(data.get('kind'));const item={id:crypto.randomUUID(),title:String(data.get('title')),subtitle:'Added by you',url,kind,streamUrl:kind==='audio'||kind==='live'?url:undefined,mark:'♫',brand:'YOUR COLLECTION',color:'#cfa3e9',tags:['Added by you']};custom=validateCatalogue({version:1,items:[...custom,item]});const saved=save('frequency.custom',custom);form.reset();dialog.close();message(saved?'Added to your collection.':'Added for this session; browser storage is unavailable.')})}><label>Name<input required name="title" placeholder="A station, a show, a new discovery" maxLength={120}/></label><label>HTTPS address<input required type="url" name="url" placeholder="https://…"/></label><label>Content type<select name="kind"><option value="show">Official show / player link</option><option value="live">Live audio stream</option><option value="audio">Audio episode (MP3 / M4A)</option><option value="feed">Podcast RSS feed</option></select></label><button class="primary" aria-label="Add to collection" type="submit">＋ Add to collection</button></form>
      {custom.length?<div class="custom-list"><h3>Your additions</h3>{custom.map(item=><div key={item.id}><span>{item.title}</span><button aria-label={'Remove '+item.title} mix={on('click',()=>{custom=custom.filter(x=>x.id!==item.id);save('frequency.custom',custom);update()})}>Remove</button></div>)}</div>:null}
      <details mix={on('toggle',e=>{if(e.currentTarget.open)editor.value=JSON.stringify({version:1,items:custom},null,2)})}><summary>Edit / import / export JSON</summary><p>Import replaces your device additions. The built-in collection lives in catalogue.json.</p><textarea aria-label="Catalogue JSON" rows={8} mix={ref(node=>{editor=node;editor.value=JSON.stringify({version:1,items:custom},null,2)})}/><div class="editor-buttons"><button mix={on('click',()=>{try{custom=validateCatalogue(JSON.parse(editor.value));if(!save('frequency.custom',custom))throw Error('Browser storage is unavailable.');dialog.close();message('Collection imported.')}catch(error){message(error instanceof Error?error.message:'Invalid JSON.')}})}>Import JSON</button><button mix={on('click',()=>{const blob=new Blob([JSON.stringify({version:1,items:custom},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='frequency-collection.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})}>Export additions</button></div></details>{notice?<p class="dialog-feedback">{notice}</p>:null}<p class="dialog-note">Feed access depends on publisher CORS. Music shows may require the official player, a UK connection or sign-in. Offline mode saves your collection, not streamed audio.</p></dialog>
    </div>
  }
}
if(__STATIC_BUILD__){
  const container=document.getElementById('app')
  if(!container)throw new Error('Missing app root')
  const root=createRoot(container)
  root.render(<App />)
  window.addEventListener('pagehide',()=>root.dispose(),{once:true})
}else{
  const {createRouter}=await import('remix/router')
  const {render,run}=await import('remix/spa')
  const {routes}=await import('../routes.ts')
  const router=createRouter({middleware:[render()]})
  router.map(routes,{actions:{home:({render})=>render(<App/>)}})
  const app=run(router,{fallback:<p class="boot">Opening your listening room…</p>})
  await app.ready()
}
