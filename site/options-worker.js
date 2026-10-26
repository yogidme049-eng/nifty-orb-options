/* Background loading keeps parsing and contract calculations off the UI thread. */
'use strict';
importScripts('./options-engine.js');
const rawCacheName='nifty-option-days-v1',windowCacheName='nifty-option-windows-v1';
async function cacheOpen(name){try{return await caches.open(name);}catch{return null;}}
async function cached(cache,key){try{return cache?await cache.match(key):null;}catch{return null;}}
async function remember(cache,key,response){try{if(cache)await cache.put(key,response);}catch{/* Storage denied/full: this run still works. */}}
async function loadQuotes(signal,maxDelay,hash){
 const date=signal.date,url=new URL(`./options-data/${date}.json.gz?v=${hash}`,self.location.href).href;
 const windowKey=url+`&window=v1-${signal.entry_bar}-${signal.exit_bar}-${maxDelay}`;
 const windows=await cacheOpen(windowCacheName),hit=await cached(windows,windowKey);
 if(hit){try{return {quotes:await hit.json(),source:'window cache'};}catch{}}
 const raw=await cacheOpen(rawCacheName);let response=await cached(raw,url),source='day cache';
 if(!response){response=await fetch(url);source='download';if(!response.ok)throw Error('Could not load options for '+date);await remember(raw,url,response.clone());}
 const bytes=await response.arrayBuffer();
 const text=new Uint8Array(bytes)[0]===31?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);
 const rows=JSON.parse(text),quotes=[];
 for(const [minute,e,strike,ce,pe,spot] of rows){
  if(!((minute>=signal.entry_bar+1&&minute<=signal.entry_bar+1+maxDelay)||(minute>=signal.exit_bar+1&&minute<=signal.exit_bar+1+maxDelay)))continue;
  const es=String(e),expiry=es.slice(0,4)+'-'+es.slice(4,6)+'-'+es.slice(6,8);
  for(const [type,price] of [['CE',ce],['PE',pe]])if(price>0)quotes.push({date,minute,expiry,strike,type,price,spot:spot>0?spot:null,lot:null});
 }
 await remember(windows,windowKey,new Response(JSON.stringify(quotes),{headers:{'Content-Type':'application/json'}}));
 return {quotes,source};
}
self.onmessage=async({data:{signal,p,hash}})=>{
 try{const {quotes,source}=await loadQuotes(signal,p.maxDelay,hash);self.postMessage({part:OptionEngine.simulate([signal],quotes,p),source});}
 catch(e){self.postMessage({error:e.message});}
};
