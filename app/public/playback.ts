import type Hls from 'hls.js'

export type PlaybackState = {status:'idle'|'connecting'|'playing'|'paused'|'failed'|'blocked', message:string}
type Source = {streamUrl?:string, streamType?:'mp3'|'aac'|'hls'}

// Each selection owns its media element and listeners. Events from released
// elements and delayed HLS imports cannot affect a newer selection.
export function createPlayback({
  onChange,
  createAudio=()=>new Audio(),
  loadHls=()=>import('hls.js').then(module=>module.default),
  timeoutMs=15_000,
}: {
  onChange:(state:PlaybackState)=>void
  createAudio?:()=>HTMLAudioElement
  loadHls?:()=>Promise<typeof Hls>
  timeoutMs?:number
}) {
  let audio:HTMLAudioElement|undefined, hls:Hls|undefined, listeners:AbortController|undefined
  let generation=0, attempt=0, wantPlaying=false, ready=false, volume=1, timer:ReturnType<typeof setTimeout>|undefined
  let state:PlaybackState={status:'idle',message:''}
  const emit=(status:PlaybackState['status'],message='')=>{state={status,message};onChange(state)}
  const clearTimer=()=>{clearTimeout(timer);timer=undefined}
  function release(){
    generation++
    attempt++;wantPlaying=false;ready=false
    clearTimer()
    listeners?.abort();listeners=undefined
    hls?.destroy();hls=undefined
    if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=undefined}
  }
  function fail(message:string){release();emit('failed',message)}
  function startTimer(){
    clearTimer()
    timer=setTimeout(()=>fail('This stream did not connect. Retry or open the official player.'),timeoutMs)
  }
  async function start(current:HTMLAudioElement,token:number){
    if(!wantPlaying)return
    const currentAttempt=++attempt
    try{await current.play()}catch(error){
      if(token!==generation||currentAttempt!==attempt)return
      if(error instanceof Error&&error.name==='NotAllowedError'){
        clearTimer();emit('blocked','Press Play to allow audio in this browser.')
      }else fail('Couldn’t play this stream. Retry or open the official player.')
    }
  }
  async function play(source:Source){
    release()
    if(!source.streamUrl){emit('idle');return}
    const token=generation, current=createAudio()
    audio=current;wantPlaying=true;current.preload='none';current.volume=volume
    listeners=new AbortController()
    const listen=(event:string,callback:()=>void)=>current.addEventListener(event,()=>{if(token===generation)callback()},{signal:listeners!.signal})
    listen('playing',()=>{if(!wantPlaying){current.pause();return}clearTimer();emit('playing')})
    listen('pause',()=>{clearTimer();emit('paused')})
    listen('ended',()=>{clearTimer();emit('paused')})
    listen('waiting',()=>{if(wantPlaying&&state.status!=='connecting'){emit('connecting');startTimer()}})
    listen('error',()=>fail('Stream unavailable. Retry or open the official player.'))
    emit('connecting');startTimer()
    const isHls=source.streamType==='hls'||(!source.streamType&&/\.m3u8(?:[?#]|$)/i.test(source.streamUrl))
    if(!isHls||current.canPlayType('application/vnd.apple.mpegurl')){
      ready=true
      current.src=source.streamUrl
      await start(current,token)
      return
    }
    try{
      const HlsPlayer=await loadHls()
      if(token!==generation)return
      if(!HlsPlayer.isSupported()){fail('This browser cannot play HLS. Open the official player.');return}
      const engine=new HlsPlayer()
      hls=engine
      engine.on(HlsPlayer.Events.MANIFEST_PARSED,()=>{if(token===generation){ready=true;void start(current,token)}})
      engine.on(HlsPlayer.Events.ERROR,(_event,data)=>{if(token===generation&&data.fatal)fail('Live stream interrupted. Retry or open the official player.')})
      engine.loadSource(source.streamUrl)
      engine.attachMedia(current)
    }catch{if(token===generation)fail('Couldn’t load the stream player. Retry or open the official player.')}
  }
  function pause(){
    if(!audio)return
    // Ignore rejection of a play() promise interrupted by this pause.
    wantPlaying=false;attempt++;audio.pause();clearTimer();emit('paused')
  }
  function resume(){if(audio){wantPlaying=true;emit('connecting');startTimer();if(ready)void start(audio,generation)}}
  return {
    play,pause,resume,
    setVolume(value:number){volume=Math.max(0,Math.min(1,value));if(audio)audio.volume=volume},
    stop(){release();emit('idle')},
    dispose:release,
  }
}
