export function moveFocus(direction,root=document) {
  const nodes=[...root.querySelectorAll('button:not(:disabled),a[href],input,select,textarea,summary')].filter(el=>el.getClientRects().length && !el.closest('[hidden]'))
  const current=document.activeElement
  if(!nodes.includes(current)){nodes[0]?.focus();return}
  const a=current.getBoundingClientRect(), ax=a.x+a.width/2, ay=a.y+a.height/2
  let best,score=Infinity
  for(const el of nodes){if(el===current)continue;const b=el.getBoundingClientRect(),dx=b.x+b.width/2-ax,dy=b.y+b.height/2-ay
    const primary=direction==='ArrowRight'?dx:direction==='ArrowLeft'?-dx:direction==='ArrowDown'?dy:-dy
    const secondary=direction==='ArrowRight'||direction==='ArrowLeft'?Math.abs(dy):Math.abs(dx)
    if(primary>8){const s=primary+secondary*3;if(s<score){score=s;best=el}}
  }
  best?.focus();best?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})
}
export function setupNavigation(signal,onController) {
  const scope=()=>document.querySelector('dialog[open]')??document
  document.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)return
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();moveFocus(e.key,scope())}
  },{signal})
  let frame,last=0,held=''
  function poll(now){if(signal.aborted)return
    const pad=navigator.getGamepads?.()?.find(p=>p?.connected)
    if(pad){const b=pad.buttons;const key=b[12]?.pressed||pad.axes[1]<-.6?'ArrowUp':b[13]?.pressed||pad.axes[1]>.6?'ArrowDown':b[14]?.pressed||pad.axes[0]<-.6?'ArrowLeft':b[15]?.pressed||pad.axes[0]>.6?'ArrowRight':b[0]?.pressed?'activate':b[1]?.pressed?'back':''
      if(key && (key!==held || (key.startsWith('Arrow') && now-last>240))){if(key==='activate')document.activeElement?.click();else if(key==='back')document.querySelector('dialog[open]')?.close();else moveFocus(key,scope());last=now}held=key
    }else held=''
    frame=requestAnimationFrame(poll)
  }
  window.addEventListener('gamepadconnected',()=>onController(true),{signal})
  window.addEventListener('gamepaddisconnected',()=>onController(false),{signal})
  frame=requestAnimationFrame(poll);signal.addEventListener('abort',()=>cancelAnimationFrame(frame),{once:true})
}
