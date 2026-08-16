// ==UserScript==
// @name         AliExpress objednávky -> CSV/JSON + obrázky
// @namespace    SlavcoSK
// @version      0.9.2
// @description  Export objednávok AliExpress po produktových riadkoch vrátane URL produktu a obrázka. Nejasné údaje necháva prázdne.
// @match        *://*.aliexpress.com/*
// @match        *://aliexpress.com/*
// @match        *://*.aliexpress.us/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';

const KEY='AE_EXPORT_SK_2026';
const PANEL='ae-export-sk-panel';
const SEP=';';
const HEAD=['orderId','orderDate','status','seller','productTitle','productVariant','productQuantity','itemPrice','currency','orderTotal','productUrl','imageUrl','detailUrl','sourceUrl','rawProductText','rawOrderText','parserNote'];

console.log('[AE Export SK] userscript spustený', location.href);

const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const txt=e=>clean(e?.innerText||e?.textContent||'');
const abs=u=>{try{return !u?'':u.startsWith('//')?'https:'+u:new URL(u,location.href).href}catch{return u||''}};
const itemUrl=u=>{u=abs(u);const m=u.match(/\/item\/(?:[^/]+\/)?(\d+)\.html/i);return m?`https://www.aliexpress.com/item/${m[1]}.html`:u};
const oid=u=>{const m=abs(u).match(/[?&]orderId=(\d+)/i);return m?m[1]:''};
const rows=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
const save=a=>{localStorage.setItem(KEY,JSON.stringify(a));count()};
const lines=s=>String(s??'').split(/\r?\n/).map(clean).filter(Boolean);

function money(s){
  s=clean(s);
  let currency=/€|EUR/i.test(s)?'EUR':/US\s*\$|USD|\$/i.test(s)?'USD':/£|GBP/i.test(s)?'GBP':'';
  const a=[...s.matchAll(/(?:US\s*\$|\$|€|EUR|USD|£|GBP)?\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi)];
  return {value:a.length?a.at(-1)[1].replace(',','.'):'',currency};
}
function quantity(s){for(const r of [/(?:^|\s)(\d+)\s*[x×]\b/i,/\b[x×]\s*(\d+)\b/i,/\b(?:quantity|množstvo|počet)\s*[:：]?\s*(\d+)/i]){const m=s.match(r);if(m)return m[1]}return''}
function imgUrl(img){if(!img)return'';let u=img.currentSrc||img.src||img.dataset?.src||img.getAttribute('data-original')||img.getAttribute('data-lazy-src')||'';return abs(u)}
function detail(root){const a=[...root.querySelectorAll('a[href*="orderId="],a[href*="/p/order/detail"]')].find(x=>oid(x.href));return a?abs(a.href):''}
function orderId(root){return oid(location.href)||oid(detail(root))||((txt(root).match(/(?:referenčné číslo|reference number|order id|číslo objednávky)\s*[:：]?\s*(\d{12,20})/i)||[])[1]||'')}
function status(s){for(const x of ['Dokončené','Zrušené','Platnosť vypršala','Čaká sa na doručenie','Completed','Finished','Cancelled','Canceled','Shipped','Processing','Closed'])if(s.toLowerCase().includes(x.toLowerCase()))return x;return''}
function seller(root){for(const e of root.querySelectorAll('a[href*="/store/"],[class*="seller"],[class*="store"]')){const s=txt(e);if(s.length>1&&s.length<120&&!/detail|contact|message/i.test(s))return s}return''}
function orderDate(raw){const ls=lines(raw);for(let i=0;i<ls.length;i++){if(/objednávka bola zadaná|order placed|order date|dátum:/i.test(ls[i])){const m=ls[i].match(/(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.\s*[A-Za-zÀ-ž]+\s+\d{4})/);return m?m[1]:(ls[i+1]||'')}}return''}
function total(raw){for(const l of lines(raw))if(/celkom|order total|grand total|total/i.test(l)){const m=money(l);if(m.value)return m}return{value:'',currency:''}}
function container(a){let e=a;for(let i=0;i<8&&e?.parentElement;i++,e=e.parentElement){const t=txt(e),n=e.querySelectorAll?.('a[href*="/item/"]').length||0;if(t.length>15&&t.length<3000&&n>=1&&n<=4)return e}return a.parentElement||a}
function title(a,c){const t=clean(a.title||a.innerText||a.textContent);if(t.length>5)return t;const im=c.querySelector('img'),alt=clean(im?.alt||im?.title);if(alt.length>5)return alt;return [...c.querySelectorAll('a[href*="/item/"]')].map(x=>clean(x.title||x.innerText)).find(x=>x.length>5)||''}
function variant(c,title){const low=clean(title).toLowerCase();const cand=lines(c.innerText).filter(x=>x&&x.toLowerCase()!=low&&!/US\s*\$|\$|€|EUR|USD|bezplatné vrátenie|free return|delivery|doručen|dph|vat/i.test(x)&&x.length<220);return cand.find(x=>/,|mm|cm|\bv\b|\bw\b|°|hz|mhz|gb|mah|black|white|čier|biel|model|type|typ|pin|pcs|\bks\b/i.test(x))||''}
function price(c){for(const l of lines(c.innerText))if(/US\s*\$|\$|€|EUR|USD|£|GBP/i.test(l)){const m=money(l);if(m.value)return m}return{value:'',currency:''}}
function meta(root){const raw=root.innerText||'',t=total(raw);return{orderId:orderId(root),orderDate:orderDate(raw),status:status(raw),seller:seller(root),orderTotal:t.value,currency:t.currency,detailUrl:detail(root),sourceUrl:location.href,rawOrderText:clean(raw)}}
function scanRoot(root){const m=meta(root),out=[],seen=new Set();for(const a of root.querySelectorAll('a[href*="/item/"]')){const u=itemUrl(a.href);if(!u||seen.has(u))continue;seen.add(u);const c=container(a),pt=title(a,c),pv=variant(c,pt),pr=price(c),im=imgUrl(c.querySelector('img')),note=[];if(!pt)note.push('Názov neistý/prázdny.');if(!pv)note.push('Variant nebol jednoznačný.');if(!im)note.push('URL obrázka nenájdená.');if(!m.orderId)note.push('Číslo objednávky nenájdené.');out.push({...m,productTitle:pt,productVariant:pv,productQuantity:quantity(c.innerText||''),itemPrice:pr.value,currency:pr.currency||m.currency,productUrl:u,imageUrl:im,rawProductText:clean(c.innerText||''),parserNote:note.join(' ')})}if(!out.length&&m.orderId)out.push({...m,productTitle:'',productVariant:'',productQuantity:'',itemPrice:'',productUrl:'',imageUrl:'',rawProductText:'',parserNote:'Nebol nájdený jednoznačný produktový odkaz; ručná kontrola.'});return out}
function roots(){const as=[...document.querySelectorAll('a[href*="orderId="],a[href*="/p/order/detail"]')],out=[],done=new Set();for(const a of as){const id=oid(a.href);if(!id||done.has(id))continue;let e=a,best=null;for(let i=0;i<10&&e?.parentElement;i++,e=e.parentElement){const ids=new Set([...e.querySelectorAll('a[href*="orderId="]')].map(x=>oid(x.href)).filter(Boolean));const t=txt(e);if(t.length>30&&t.length<8000&&ids.size===1)best=e;if(ids.size>1)break}out.push(best||a.parentElement);done.add(id)}return out}
function key(r){return [r.orderId,itemUrl(r.productUrl),r.productVariant,r.productTitle].join('||')}
function merge(newRows){const map=new Map(rows().map(r=>[key(r),r]));for(const n of newRows){const old=map.get(key(n))||{};for(const [k,v] of Object.entries(n))if(v!==''&&v!=null)old[k]=v;map.set(key(n),old)}const a=[...map.values()];save(a);return a}
function scan(show=true){let a=[];if(/\/p\/order\/detail\.html/i.test(location.pathname))a=scanRoot(document.body);else{const rr=roots();for(const r of rr)a.push(...scanRoot(r));if(!rr.length)a=scanRoot(document.body).map(x=>({...x,parserNote:clean(x.parserNote+' Celostránkový fallback; skontrolovať.')}))}const all=merge(a);if(show)setStatus(`Naskenované ${a.length}; uložených spolu ${all.length}.`);return a}
function esc(v){let s=String(v??'').replace(/\r?\n/g,' ');return '"'+s.replace(/"/g,'""')+'"'}
function csv(){const a=rows(),o=[HEAD.map(esc).join(SEP)];for(const r of a)o.push(HEAD.map(h=>esc(r[h]??'')).join(SEP));return '\uFEFF'+o.join('\r\n')}
function dl(name,data,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
function exportCSV(){scan(false);dl(`aliexpress_orders_${stamp()}.csv`,csv(),'text/csv;charset=utf-8');setStatus(`CSV: ${rows().length} riadkov.`)}
function exportJSON(){scan(false);dl(`aliexpress_orders_${stamp()}.json`,JSON.stringify({exportedAt:new Date().toISOString(),rows:rows()},null,2),'application/json;charset=utf-8');setStatus(`JSON: ${rows().length} riadkov.`)}
function copy(){scan(false);const s=csv();try{if(typeof GM_setClipboard==='function')GM_setClipboard(s,'text');else navigator.clipboard.writeText(s);setStatus(`CSV skopírované: ${rows().length} riadkov.`)}catch(e){setStatus('Kopírovanie zlyhalo: '+e.message)}}
function clearData(){if(confirm('Vymazať nazbierané exportné údaje?')){localStorage.removeItem(KEY);count();setStatus('Údaje vymazané.')}}
function count(){const e=document.getElementById('ae-count');if(e)e.textContent=rows().length}
function setStatus(s){const e=document.getElementById('ae-status');if(e)e.textContent=s}
function btn(p,s,f,c){const b=document.createElement('button');b.textContent=s;b.style.cssText=`width:100%;margin:4px 0;padding:7px;border:0;border-radius:6px;color:white;background:${c};cursor:pointer;font-size:12px`;b.onclick=f;p.append(b)}
function panel(){
  if(document.getElementById(PANEL))return;
  if(!document.body)return;
  const p=document.createElement('div');
  p.id=PANEL;
  p.style.cssText='position:fixed!important;top:80px!important;right:12px!important;width:260px!important;z-index:2147483647!important;background:#18181c!important;color:white!important;border:3px solid #00d26a!important;border-radius:10px!important;padding:10px!important;font:12px Arial!important;box-shadow:0 4px 20px #0008!important;display:block!important;visibility:visible!important;opacity:1!important;';
  p.innerHTML='<div style="font-size:14px;font-weight:bold;color:#7CFF9A">✓ AliExpress export SK 2026</div><div>Produktové riadky: <span id="ae-count">0</span></div><div style="font-size:10px;color:#bbb;margin-top:3px">v0.9.2 – skript je spustený</div><div style="height:6px"></div>';
  btn(p,'1. Naskenovať túto stránku',()=>scan(true),'#238636');
  btn(p,'2. Export CSV (Excel)',exportCSV,'#1f6feb');
  btn(p,'Export JSON (odporúčané)',exportJSON,'#8250df');
  btn(p,'Kopírovať CSV',copy,'#0969da');
  btn(p,'Vymazať uložené dáta',clearData,'#b62324');
  const s=document.createElement('div');s.id='ae-status';s.style.cssText='margin-top:8px;color:#d7ffd7;line-height:1.35';s.textContent='Ak vidíš tento panel, Tampermonkey skript beží.';p.append(s);
  document.body.append(p);count();
}

function init(){
  if(document.body) panel();
  else document.addEventListener('DOMContentLoaded',panel,{once:true});
  setTimeout(panel,500);
  setTimeout(panel,1500);
  setTimeout(panel,4000);
}
init();
new MutationObserver(()=>{if(!document.getElementById(PANEL))panel()}).observe(document.documentElement,{childList:true,subtree:true});

})();
