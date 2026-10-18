export function safeUrl(value) {
  try { const url=new URL(value); return url.protocol==='https:' ? url.href : null } catch { return null }
}
export function safeLogoUrl(value) {
  if(typeof value!=='string'||!value)return null
  if(safeUrl(value))return safeUrl(value)
  // Relative assets stay under the app base path, including on GitHub Pages.
  if(!/^[a-z0-9_-]+(?:\/[a-z0-9_.-]+)*\.(?:png|jpe?g|webp|gif|svg|avif)$/i.test(value))return null
  return value.split('/').some(part=>part==='.'||part==='..')?null:value
}
export function validateCatalogue(data) {
  if(data?.version!==1 || !Array.isArray(data.items) || data.items.length>500) throw new Error('Use a version 1 catalogue with up to 500 items.')
  const ids=new Set()
  return data.items.map(item=>{
    if(!item || typeof item.id!=='string' || ids.has(item.id) || typeof item.title!=='string' || !['live','show','feed','audio'].includes(item.kind) || !safeUrl(item.url)) throw new Error('Each item needs a unique id, title, kind and HTTPS url.')
    ids.add(item.id)
    if(item.streamUrl && !safeUrl(item.streamUrl)) throw new Error('Stream URLs must use HTTPS.')
    for(const field of ['scheduleUrl','showsUrl'])if(item[field]!==undefined&&!safeUrl(item[field]))throw new Error('Schedule and show URLs must use HTTPS.')
    if(item.logoUrl!==undefined&&!safeLogoUrl(item.logoUrl))throw new Error('Logo URLs must use HTTPS or an app-relative image path.')
    if(item.streamType!==undefined&&!['mp3','aac','hls'].includes(item.streamType))throw new Error('Stream type must be mp3, aac or hls.')
    if(item.provider!==undefined&&(typeof item.provider!=='string'||!item.provider.trim()||item.provider.length>80))throw new Error('Provider must be a name of up to 80 characters.')
    if(item.countryCode!==undefined&&!/^[A-Z]{2}$/.test(item.countryCode))throw new Error('Country code must be two uppercase letters.')
    return {...item,tags:Array.isArray(item.tags)?item.tags.filter(t=>typeof t==='string'):[],color:/^#[0-9a-f]{6}$/i.test(item.color)?item.color:'#c5e762'}
  })
}
export function loadSaved(key,fallback) {try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
export function save(key,value) {try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
export function parseFeed(xml) {
  const doc=new DOMParser().parseFromString(xml,'application/xml')
  if(doc.querySelector('parsererror')) throw new Error('This address did not return a valid RSS feed.')
  return [...doc.querySelectorAll('item')].flatMap((node,index)=>{
    const url=safeUrl(node.querySelector('enclosure')?.getAttribute('url'))
    return url?[{id:`episode-${index}-${url}`,title:node.querySelector('title')?.textContent??'Episode',subtitle:node.querySelector('pubDate')?.textContent??'Podcast episode',kind:'audio',url,streamUrl:url,mark:'♫',brand:'PODCAST',color:'#cfa3e9',tags:['Episode']}]:[]
  })
}
