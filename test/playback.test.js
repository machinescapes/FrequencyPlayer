import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPlayback} from '../app/public/playback.ts'

class AudioStub extends EventTarget {
  src='';volume=1;plays=0;pauses=0;loads=0;nativeHls='';playError=null
  canPlayType(){return this.nativeHls}
  play(){this.plays++;return this.playError?Promise.reject(this.playError):Promise.resolve()}
  pause(){this.pauses++}
  load(){this.loads++}
  removeAttribute(){this.src=''}
  fire(name){this.dispatchEvent(new Event(name))}
}
class HlsStub {
  static Events={MANIFEST_PARSED:'manifest',ERROR:'error'}
  static isSupported(){return true}
  static instances=[]
  callbacks={};destroyed=false
  constructor(){HlsStub.instances.push(this)}
  on(name,callback){this.callbacks[name]=callback}
  loadSource(url){this.url=url}
  attachMedia(audio){this.audio=audio}
  destroy(){this.destroyed=true}
  fire(name,data){this.callbacks[name]?.(name,data)}
}
function fixture(options={}){
  const states=[],audios=[]
  const {onChange,...rest}=options
  const player=createPlayback({onChange:state=>{states.push(state);onChange?.(state)},createAudio:()=>{const audio=new AudioStub();audios.push(audio);return audio},loadHls:async()=>HlsStub,...rest})
  return {player,states,audios,status:()=>states.at(-1)?.status}
}
const mp3={streamUrl:'https://example.com/live.mp3',streamType:'mp3'}
const hls={streamUrl:'https://example.com/live',streamType:'hls'}

test('native MP3 plays, pauses, resumes and keeps volume across stations',async()=>{
  const {player,audios,status}=fixture({loadHls:()=>{throw Error('must not import')}})
  player.setVolume(.4);await player.play(mp3)
  assert.equal(audios[0].volume,.4);assert.equal(status(),'connecting')
  audios[0].fire('playing');assert.equal(status(),'playing')
  player.pause();assert.equal(status(),'paused');player.resume();audios[0].fire('playing');assert.equal(status(),'playing')
  await player.play(mp3);assert.equal(audios[1].volume,.4)
  player.dispose();assert.equal(audios[1].src,'');assert.equal(audios[1].loads,1)
})
test('native HLS avoids loading HLS.js',async()=>{
  const audio=new AudioStub();audio.nativeHls='maybe'
  const {player}=fixture({createAudio:()=>audio,loadHls:()=>{throw Error('must not import')}})
  await player.play(hls);assert.equal(audio.src,hls.streamUrl);assert.equal(audio.plays,1);player.dispose()
})
test('HLS.js waits for a manifest and is destroyed on switching; stale events are ignored',async()=>{
  const {player,audios,status}=fixture()
  await player.play(hls);const engine=HlsStub.instances.at(-1)
  assert.equal(audios[0].plays,0);engine.fire('manifest');assert.equal(audios[0].plays,1)
  await player.play(mp3);assert.ok(engine.destroyed)
  audios[0].fire('error');engine.fire('error',{fatal:true});engine.fire('manifest')
  assert.equal(status(),'connecting');assert.equal(audios[0].plays,1)
  audios[1].fire('playing');assert.equal(status(),'playing');player.dispose()
})
test('a delayed HLS import cannot attach to a new station',async()=>{
  let resolveImport;const pending=new Promise(resolve=>{resolveImport=resolve})
  const {player,audios,status}=fixture({loadHls:()=>pending})
  const first=player.play(hls);await player.play(mp3)
  const before=HlsStub.instances.length;resolveImport(HlsStub);await first
  assert.equal(HlsStub.instances.length,before);assert.equal(audios[0].src,'')
  audios[1].fire('playing');assert.equal(status(),'playing');player.dispose()
})
test('pausing and resuming during an HLS import waits for the manifest',async()=>{
  let resolveImport;const pending=new Promise(resolve=>{resolveImport=resolve})
  const {player,audios,status}=fixture({loadHls:()=>pending})
  const first=player.play(hls);player.pause();player.resume()
  assert.equal(audios[0].plays,0);resolveImport(HlsStub);await first
  const engine=HlsStub.instances.at(-1);player.pause();engine.fire('manifest')
  assert.equal(audios[0].plays,0);assert.equal(status(),'paused')
  player.resume();assert.equal(audios[0].plays,1);player.dispose()
})
test('timeout releases a hanging source and a retry can play',async()=>{
  let timedOut;const finished=new Promise(resolve=>{timedOut=resolve})
  const {player,audios,status}=fixture({timeoutMs:10,onChange:state=>{if(state.status==='failed')timedOut()}})
  await player.play(mp3);await finished
  assert.equal(status(),'failed')
  assert.equal(audios[0].src,'');assert.equal(audios[0].loads,1)
  await player.play(mp3);audios[1].fire('playing');assert.equal(audios[1].plays,1)
  assert.equal(status(),'playing');player.dispose()
})
test('autoplay rejection stays resumable, while interrupted play rejection is ignored',async()=>{
  const audio=new AudioStub();audio.playError=new DOMException('Gesture required','NotAllowedError')
  const {player,status}=fixture({createAudio:()=>audio})
  await player.play(mp3);assert.equal(status(),'blocked');assert.equal(audio.src,mp3.streamUrl)
  audio.playError=null;player.resume();audio.fire('playing');assert.equal(status(),'playing');player.dispose()
  let rejectPlay;const delayed=new AudioStub();delayed.play=()=>new Promise((_resolve,reject)=>{rejectPlay=reject})
  const f=fixture({createAudio:()=>delayed});const starting=f.player.play(mp3)
  f.player.pause();rejectPlay(new DOMException('Interrupted','AbortError'));await starting
  assert.equal(f.status(),'paused');f.player.dispose()
})
test('fatal HLS errors, unsupported browsers, and media errors fail with cleanup',async()=>{
  const f=fixture();await f.player.play(hls);const engine=HlsStub.instances.at(-1)
  engine.fire('error',{fatal:true});assert.equal(f.status(),'failed');assert.ok(engine.destroyed)
  await f.player.play(mp3);f.audios[1].fire('error');assert.equal(f.status(),'failed');f.player.dispose()
  const unsupported=fixture({loadHls:async()=>class extends HlsStub {static isSupported(){return false}}})
  await unsupported.player.play(hls);assert.equal(unsupported.status(),'failed');unsupported.player.dispose()
})
