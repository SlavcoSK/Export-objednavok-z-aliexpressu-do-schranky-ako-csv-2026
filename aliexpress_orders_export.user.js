// ==UserScript==
// @name         AliExpress objednávky -> CSV/JSON + obrázky
// @namespace    SlavcoSK
// @version      0.9.3
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
const GENERIC_TITLE=/^(obrázok názvu|image title|image|picture|photo|product image)$/i;
const BAD_IMAGE=/Se39935ad4d904c8b9abf60a4b71fa315F\.png|6000000002182-2-tps-48-48\.png/i;

console.log('[AE Export SK] v0.9.3 spustený', location.href);

const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/[\u200b\u200c\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
const txt=e=>clean(e?.innerText||e?.textContent||'');
const abs=u=>{try{return !u?'':u.startsWith('//')?'https:'+u:new URL(u,location.href).href}catch{return u||''}};
const itemUrl=u=>{u=abs(u);const m=u.match(/\/item\/(?:[^/]+\/)?(\d+)\.html/i);return m?`https://www.aliexpress.com/item/${m[1]}.html`:u};
const oid=u=>{const m=abs(u).match(/[?&]orderId=(\d+)/i);return m?m[1]:''};
const rows=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
const save=a=>{localStorage.setItem(KEY,JSON.stringify(a));count()};
const lines=s=>String(s??'').split(/\r?\n/).map(clean).filter(Boolean);

function currencyOf(s){return /€|EUR/i.test(s)?'EUR':/US\s*\$|USD|\$/i.test(s)?'USD':/£|GBP/i.test(s)?'GBP':/CZK|Kč/i.test(s)?'CZK':''}
function money(s){
  s=clean(s);
  const rx=/(US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi;
  const found=[...s.matchAll(rx)];
  if(!found.length)return {value:'',currency:currencyOf(s)};
  const m=found[0];
  return {value:m[2].replace(',','.'),currency:currencyOf(m[1])};
}
function quantity(s){
  s=clean(s);
  for(const r of [/(?:^|\s)(\d+)\s*[x×](?:\s|$)/i,/\b[x×]\s*(\d+)\b/i,/\b(?:quantity|množstvo|počet)\s*[:：]?\s*(\d+)/i]){
    const m=s.match(r); if(m)return m[1];
  }
  return'';
}
function detail(root){const a=[...root.querySelectorAll('a[href*="orderId="],a[href*="/p/order/detail"]')].find(x=>oid(x.href));return a?abs(a.href):''}
function orderId(root){return oid(location.href)||oid(detail(root))||((txt(root).match(/(?:referenčné číslo|reference number|order id|číslo objednávky)\s*[:：]?\s*(\d{12,20})/i)||[])[1]||'')}
function status(s){
  const h=clean(s).slice(0,180).toLowerCase();
  const map=[
    ['platnosť vypršala','Platnosť vypršala'],['expired','Platnosť vypršala'],
    ['čaká sa na doručenie','Čaká sa na doručenie'],['awaiting delivery','Čaká sa na doručenie'],
    ['zrušené','Zrušené'],['cancelled','Zrušené'],['canceled','Zrušené'],
    ['dokončené','Dokončené'],['completed','Dokončené'],['finished','Dokončené'],
    ['shipped','Odoslané'],['processing','Spracovanie'],['closed','Uzavreté']
  ];
  for(const [needle,label] of map) if(h.startsWith(needle)||h.indexOf(needle)<45&&h.includes(needle)) return label;
  return'';
}
function seller(root){for(const e of root.querySelectorAll('a[href*="/store/"],[class*="seller"],[class*="store"]')){const s=txt(e);if(s.length>1&&s.length<120&&!/detail|contact|message/i.test(s))return s}return''}
function orderDate(raw){const ls=lines(raw);for(let i=0;i<ls.length;i++){if(/objednávka bola zadaná|order placed|order date|dátum:/i.test(ls[i])){const m=ls[i].match(/(\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.\s*[A-Za-zÀ-ž]+\s+\d{4})/);return m?m[1]:(ls[i+1]||'')}}return''}
function total(raw){
  for(const l of lines(raw)) if(/celkom|order total|grand total|total/i.test(l)){
    const segment=(l.match(/(?:celkom|order total|grand total|total)\s*[:：]?\s*([^\n]+)/i)||[])[1]||l;
    const m=money(segment); if(m.value)return m;
  }
  const m=clean(raw).match(/(?:Celkom|Total|Order total|Grand total)\s*[:：]?\s*((?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*[0-9]+(?:[.,][0-9]{1,2})?)/i);
  return m?money(m[1]):{value:'',currency:''};
}

function anchorsForUrl(root,u){return [...root.querySelectorAll('a[href*="/item/"]')].filter(a=>itemUrl(a.href)===u)}
function bestContainer(group){
  let best=null,bestScore=-1;
  for(const a of group){
    let e=a;
    for(let i=0;i<9&&e;i++,e=e.parentElement){
      const raw=e?.innerText||'';
      const t=clean(raw);
      if(t.length<8||t.length>2200)continue;
      const itemLinks=[...e.querySelectorAll?.('a[href*="/item/"]')||[]];
      const uniq=new Set(itemLinks.map(x=>itemUrl(x.href)).filter(Boolean));
      if(uniq.size>1)continue;
      let score=0;
      if(/US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč/i.test(t))score+=5;
      if(/\d+\s*[x×]/i.test(t))score+=2;
      if(lines(raw).length>=2)score+=2;
      score+=Math.min(t.length,600)/100;
      if(score>bestScore){best=e;bestScore=score;}
    }
  }
  return best||group[0]?.parentElement||null;
}
function titleFrom(group,c){
  const candidates=[];
  for(const a of group){
    for(const s of [a.getAttribute('title'),a.innerText,a.textContent,a.querySelector?.('img')?.getAttribute('alt')]){
      const v=clean(s); if(v.length>=6&&!GENERIC_TITLE.test(v))candidates.push(v);
    }
  }
  if(c){
    for(const a of c.querySelectorAll('a[href*="/item/"]')){
      const v=clean(a.getAttribute('title')||a.innerText||a.textContent||'');
      if(v.length>=6&&!GENERIC_TITLE.test(v))candidates.push(v);
    }
  }
  candidates.sort((a,b)=>b.length-a.length);
  return candidates[0]||'';
}
function imageCandidates(img){
  if(!img)return[];
  const out=[];
  const attrs=['data-src','data-lazy-src','data-original','data-image','src'];
  for(const k of attrs){const v=img.getAttribute?.(k);if(v)out.push(abs(v));}
  if(img.currentSrc)out.push(abs(img.currentSrc));
  const ss=img.getAttribute?.('srcset');
  if(ss)for(const p of ss.split(',')){const u=p.trim().split(/\s+/)[0];if(u)out.push(abs(u));}
  return [...new Set(out)].filter(u=>u&&!BAD_IMAGE.test(u)&&!/^data:image/i.test(u));
}
function productImage(group,c){
  const scored=[];
  const add=(img,bonus=0)=>{
    for(const u of imageCandidates(img)){
      let score=bonus;
      if(/aliexpress-media\.com|alicdn\.com/i.test(u))score+=3;
      if(/\/kf\//i.test(u))score+=3;
      const w=img.naturalWidth||img.width||0,h=img.naturalHeight||img.height||0;
      if(w>=70&&h>=70)score+=3;
      if(w&&w<50||h&&h<50)score-=5;
      const alt=clean(img.alt||''); if(alt&&!GENERIC_TITLE.test(alt))score+=1;
      scored.push({u,score});
    }
  };
  for(const a of group) for(const img of a.querySelectorAll('img')) add(img,6);
  if(c) for(const img of c.querySelectorAll('img')) add(img,1);
  scored.sort((a,b)=>b.score-a.score);
  return scored[0]?.score>=2?scored[0].u:'';
}
function variant(c,title){
  if(!c)return'';
  const low=clean(title).toLowerCase();
  const cand=lines(c.innerText).filter(x=>{
    const l=clean(x); if(!l)return false;
    if(low&&(l.toLowerCase()===low||low.includes(l.toLowerCase())))return false;
    if(/US\s*\$|\$|€|EUR|USD|bezplatné vrátenie|free return|delivery|doručen|dph|vat|pridať do košíka|odstrániť/i.test(l))return false;
    return l.length<220;
  });
  return cand.find(l=>/,|mm|cm|\bv\b|\bw\b|°|hz|mhz|gb|mah|black|white|red|blue|čier|biel|model|type|typ|pin|pcs|\bks\b|rolka|china|čína|pevninská/i.test(l))||'';
}
function price(c){
  if(!c)return{value:'',currency:''};
  const raw=c.innerText||'';
  const m=clean(raw).match(/(US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*([0-9]+(?:[.,][0-9]{1,2})?)(?=\s*(?:\d+\s*[x×]|$))/i);
  if(m)return{value:m[2].replace(',','.'),currency:currencyOf(m[1])};
  for(const l of lines(raw)){
    if(/US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč/i.test(l)&&!/celkom|total/i.test(l)){
      const mm=money(l); if(mm.value)return mm;
    }
  }
  return{value:'',currency:''};
}
function meta(root){const raw=root.innerText||'',t=total(raw);return{orderId:orderId(root),orderDate:orderDate(raw),status:status(raw),seller:seller(root),orderTotal:t.value,currency:t.currency,detailUrl:detail(root),sourceUrl:location.href,rawOrderText:clean(raw)}}
function scanRoot(root){
  const m=meta(root),out=[];
  const urls=[...new Set([...root.querySelectorAll('a[href*="/item/"]')].map(a=>itemUrl(a.href)).filter(Boolean))];
  for(const u of urls){
    const group=anchorsForUrl(root,u),c=bestContainer(group),pt=titleFrom(group,c),pv=variant(c,pt),pr=price(c),im=productImage(group,c),raw=clean(c?.innerText||''),note=[];
    if(!pt)note.push('Názov neistý/prázdny.');
    if(!pv)note.push('Variant nebol jednoznačný.');
    if(!im)note.push('URL obrázka nenájdená alebo bola iba zástupná/generická.');
    if(!m.orderId)note.push('Číslo objednávky nenájdené.');
    out.push({...m,productTitle:pt,productVariant:pv,productQuantity:quantity(raw),itemPrice:pr.value,currency:pr.currency||m.currency,productUrl:u,imageUrl:im,rawProductText:raw,parserNote:note.join(' ')});
  }
  if(!out.length&&m.orderId)out.push({...m,productTitle:'',productVariant:'',productQuantity:'',itemPrice:'',productUrl:'',imageUrl:'',rawProductText:'',parserNote:'Nebol nájdený jednoznačný produktový odkaz; ručná kontrola.'});
  return out;
}
function roots(){const as=[...document.querySelectorAll('a[href*="orderId="],a[href*="/p/order/detail"]')],out=[],done=new Set();for(const a of as){const id=oid(a.href);if(!id||done.has(id))continue;let e=a,best=null;for(let i=0;i<10&&e?.parentElement;i++,e=e.parentElement){const ids=new Set([...e.querySelectorAll('a[href*="orderId="]')].map(x=>oid(x.href)).filter(Boolean));const t=txt(e);if(t.length>30&&t.length<8000&&ids.size===1)best=e;if(ids.size>1)break}out.push(best||a.parentElement);done.add(id)}return out}
function key(r){return [r.orderId,itemUrl(r.productUrl),r.productVariant,r.productTitle].join('||')}
function sanitize(r){r={...r};if(GENERIC_TITLE.test(clean(r.productTitle)))r.productTitle='';if(BAD_IMAGE.test(r.imageUrl||''))r.imageUrl='';return r}
function merge(newRows){
  const map=new Map(rows().map(r=>sanitize(r)).map(r=>[key(r),r]));
  for(const n0 of newRows){const n=sanitize(n0),old=map.get(key(n))||{};for(const [k,v] of Object.entries(n))if(v!==''&&v!=null)old[k]=v;map.set(key(n),old)}
  const a=[...map.values()];save(a);return a;
}
function scan(show=true){let a=[];if(/\/p\/order\/detail\.html/i.test(location.pathname))a=scanRoot(document.body);else{const rr=roots();for(const r of rr)a.push(...scanRoot(r));if(!rr.length)a=scanRoot(document.body).map(x=>({...x,parserNote:clean(x.parserNote+' Celostránkový fallback; skontrolovať.')}))}const all=merge(a);if(show)setStatus(`Naskenované ${a.length}; uložených spolu ${all.length}.`);return a}
function esc(v){let s=String(v??'').replace(/\r?\n/g,' ');return '"'+s.replace(/"/g,'""')+'"'}
function csv(){const a=rows(),o=[HEAD.map(esc).join(SEP)];for(const r of a)o.push(HEAD.map(h=>esc(r[h]??'')).join(SEP));return '\uFEFF'+o.join('\r\n')}
function dl(name,data,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
function exportCSV(){scan(false);dl(`aliexpress_orders_${stamp()}.csv`,csv(),'text/csv;charset=utf-8');setStatus(`CSV: ${rows().length} riadkov.`)}
function exportJSON(){scan(false);dl(`aliexpress_orders_${stamp()}.json`,JSON.stringify({exportedAt:new Date().toISOString(),scriptVersion:'0.9.3',rows:rows()},null,2),'application/json;charset=utf-8');setStatus(`JSON: ${rows().length} riadkov.`)}
function copy(){scan(false);const s=csv();try{if(typeof GM_setClipboard==='function')GM_setClipboard(s,'text');else navigator.clipboard.writeText(s);setStatus(`CSV skopírované: ${rows().length} riadkov.`)}catch(e){setStatus('Kopírovanie zlyhalo: '+e.message)}}
function clearData(){if(confirm('Vymazať nazbierané exportné údaje?')){localStorage.removeItem(KEY);count();setStatus('Údaje vymazané.')}}
function count(){const e=document.getElementById('ae-count');if(e)e.textContent=rows().length}
function setStatus(s){const e=document.getElementById('ae-status');if(e)e.textContent=s}
function btn(p,s,f,c){const b=document.createElement('button');b.textContent=s;b.style.cssText=`width:100%;margin:4px 0;padding:7px;border:0;border-radius:6px;color:white;background:${c};cursor:pointer;font-size:12px`;b.onclick=f;p.append(b)}
function panel(){
  if(document.getElementById(PANEL))return;if(!document.body)return;
  const p=document.createElement('div');p.id=PANEL;
  p.style.cssText='position:fixed!important;top:80px!important;right:12px!important;width:260px!important;z-index:2147483647!important;background:#18181c!important;color:white!important;border:3px solid #00d26a!important;border-radius:10px!important;padding:10px!important;font:12px Arial!important;box-shadow:0 4px 20px #0008!important;display:block!important;visibility:visible!important;opacity:1!important;';
  p.innerHTML='<div style="font-size:14px;font-weight:bold;color:#7CFF9A">✓ AliExpress export SK 2026</div><div>Produktové riadky: <span id="ae-count">0</span></div><div style="font-size:10px;color:#bbb;margin-top:3px">v0.9.3 – opravená cena/stav/obrázky</div><div style="height:6px"></div>';
  btn(p,'1. Naskenovať túto stránku',()=>scan(true),'#238636');btn(p,'2. Export CSV (Excel)',exportCSV,'#1f6feb');btn(p,'Export JSON (odporúčané)',exportJSON,'#8250df');btn(p,'Kopírovať CSV',copy,'#0969da');btn(p,'Vymazať uložené dáta',clearData,'#b62324');
  const s=document.createElement('div');s.id='ae-status';s.style.cssText='margin-top:8px;color:#d7ffd7;line-height:1.35';s.textContent='Nejasné údaje sa nedohadujú. Pred prvým testom v0.9.3 odporúčam vymazať staré uložené dáta.';p.append(s);document.body.append(p);count();
}
function init(){if(document.body)panel();else document.addEventListener('DOMContentLoaded',panel,{once:true});setTimeout(panel,500);setTimeout(panel,1500);setTimeout(panel,4000)}
init();new MutationObserver(()=>{if(!document.getElementById(PANEL))panel()}).observe(document.documentElement,{childList:true,subtree:true});
})();
