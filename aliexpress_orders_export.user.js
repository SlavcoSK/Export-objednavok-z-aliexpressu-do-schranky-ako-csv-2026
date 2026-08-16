// ==UserScript==
// @name         AliExpress objednávky -> CSV/JSON + Details
// @namespace    SlavcoSK
// @version      0.9.9
// @description  Viacnásobný export objednávok AliExpress + samostatná fáza čítania presných údajov zo stránky Details cez existujúcu prihlásenú session.
// @match        *://*.aliexpress.com/*
// @match        *://aliexpress.com/*
// @match        *://*.aliexpress.us/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';

const VERSION='0.9.9';
const KEY='AE_EXPORT_SK_2026';
const MULTI_KEY='AE_EXPORT_SK_2026_MULTI';
const DETAIL_KEY='AE_EXPORT_SK_2026_DETAILS';
const DETAIL_STATE_KEY='AE_EXPORT_SK_2026_DETAIL_STATE';
const PANEL='ae-export-sk-panel', SEP=';';

const BATCH_SIZE=20, BATCH_DELAY=80;
const VIEW_WAIT_MS=9000, VIEW_SETTLE_MS=3000, VIEW_BETWEEN_CLICKS_MS=1600, VIEW_MAX_CLICKS=120;
const MULTI_MAX_PASSES=12, MULTI_STABLE_REQUIRED=2, PASS_START_DELAY_MS=3000, PASS_RELOAD_DELAY_MS=3000;
const DETAIL_PAGE_WAIT_MS=15000, DETAIL_PAGE_SETTLE_MS=1800, DETAIL_BETWEEN_MS=3000;

const HEAD=['orderId','orderDate','status','seller','productTitle','productVariant','productQuantity','itemPrice','currency','orderTotal','productUrl','imageUrl','detailUrl','sourceUrl','rawProductText','rawOrderText','parserNote'];
const GENERIC_TITLE=/^(obrázok názvu|image title|image|picture|photo|product image)$/i;
const BAD_IMAGE=/Se39935ad4d904c8b9abf60a4b71fa315F\.png|6000000002182-2-tps-48-48\.png|Se5bee6b872c34652909ace14ca3d6ab50|\/272x80\.png(?:\?|$)/i;
const META_LINE=/^(completed|finished|expired|cancelled|canceled|awaiting delivery|processing|shipped|closed|dokončené|platnosť vypršala|zrušené|čaká sa na doručenie|date\s*:|dátum\s*:|ref\.?\s*number\s*:|referenčné číslo\s*:|copy$|kopírovať$|details?$|detaily$)/i;

let multiRunningNow=false;
let detailRunningNow=false;

console.log(`[AE Export SK] v${VERSION} spustený`,location.href);

const clean=s=>String(s??'').replace(/\u00a0/g,' ').replace(/[\u200b\u200c\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
const txt=e=>clean(e?.innerText||e?.textContent||'');
const lines=s=>String(s??'').split(/\r?\n/).map(clean).filter(Boolean);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const abs=u=>{try{return !u?'':u.startsWith('//')?'https:'+u:new URL(u,location.href).href}catch{return u||''}};
const itemUrl=u=>{u=abs(u);const m=u.match(/\/item\/(?:[^/]+\/)?(\d+)\.html/i);return m?`https://www.aliexpress.com/item/${m[1]}.html`:u};
const oid=u=>{const m=abs(u).match(/[?&]orderId=(\d+)/i);return m?m[1]:''};
const rows=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}};
const save=a=>{localStorage.setItem(KEY,JSON.stringify(a));count()};
const multiState=()=>{try{return JSON.parse(localStorage.getItem(MULTI_KEY)||'null')}catch{return null}};
const saveMulti=s=>localStorage.setItem(MULTI_KEY,JSON.stringify(s));
const detailOrders=()=>{try{return JSON.parse(localStorage.getItem(DETAIL_KEY)||'[]')}catch{return[]}};
const detailState=()=>{try{return JSON.parse(localStorage.getItem(DETAIL_STATE_KEY)||'null')}catch{return null}};
const saveDetailState=s=>{localStorage.setItem(DETAIL_STATE_KEY,JSON.stringify(s));count()};

function saveDetailOrder(rec){
  const a=detailOrders();
  const i=a.findIndex(x=>String(x.orderId)===String(rec.orderId));
  if(i>=0)a[i]=rec;else a.push(rec);
  localStorage.setItem(DETAIL_KEY,JSON.stringify(a));
  count();
}

function translatorActive(){
  const cls=String(document.documentElement?.className||'');
  if(/translated-ltr|translated-rtl/i.test(cls))return true;
  if(document.querySelector('iframe.goog-te-banner-frame,.goog-te-banner-frame'))return true;
  return /(?:^|;\s*)googtrans=/i.test(document.cookie||'');
}
function currencyOf(s){return /€|EUR/i.test(s)?'EUR':/US\s*\$|USD|\$/i.test(s)?'USD':/£|GBP/i.test(s)?'GBP':/CZK|Kč/i.test(s)?'CZK':''}
function money(s){const m=/(US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*([0-9]+(?:[.,][0-9]{1,2})?)/i.exec(clean(s));return m?{value:m[2].replace(',','.'),currency:currencyOf(m[1])}:{value:'',currency:currencyOf(s)}}
function quantity(s){s=clean(s);for(const r of [/(?:^|\s)[x×]\s*(\d+)\b/i,/(?:^|\s)(\d+)\s*[x×](?:\s|$)/i,/\b(?:quantity|množstvo|počet)\s*[:：]?\s*(\d+)/i]){const m=s.match(r);if(m)return m[1]}return''}

function detail(root){
  const all=[...root.querySelectorAll('a[href*="/p/order/detail"],a[href*="orderId="]')].filter(a=>oid(a.href));
  if(!all.length)return'';
  const preferred=all.find(a=>/^(details?|detaily)$/i.test(txt(a)))||all.find(a=>/\/p\/order\/detail/i.test(a.href))||all[0];
  return abs(preferred.href);
}
function orderId(root){return oid(location.href)||oid(detail(root))||((txt(root).match(/(?:referenčné číslo|reference number|ref\.? number|order id|číslo objednávky)\s*[:：]?\s*(\d{12,20})/i)||[])[1]||'')}
function status(s){const h=clean(s).slice(0,180).toLowerCase();const map=[['platnosť vypršala','Platnosť vypršala'],['expired','Platnosť vypršala'],['čaká sa na doručenie','Čaká sa na doručenie'],['awaiting delivery','Čaká sa na doručenie'],['zrušené','Zrušené'],['cancelled','Zrušené'],['canceled','Zrušené'],['dokončené','Dokončené'],['completed','Dokončené'],['finished','Dokončené'],['shipped','Odoslané'],['processing','Spracovanie'],['closed','Uzavreté']];for(const[n,l]of map){const p=h.indexOf(n);if(p>=0&&p<45)return l}return''}
function seller(root){for(const e of root.querySelectorAll('a[href*="/store/"],[class*="seller"],[class*="store"]')){const s=txt(e);if(s.length>1&&s.length<120&&!/detail|contact|message/i.test(s))return s}return''}
function orderDate(raw){const t=clean(raw);const m=t.match(/(?:Date|Dátum)\s*:\s*(.{3,35}?)(?=\s+(?:Ref\.|Referenčné|Reference|Copy|Kopírovať))/i);return m?clean(m[1]):''}
function total(raw){const m=clean(raw).match(/(?:Celkom|Total|Order total|Grand total)\s*[:：]?\s*((?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*[0-9]+(?:[.,][0-9]{1,2})?)/i);return m?money(m[1]):{value:'',currency:''}}
function itemPriceFromRaw(raw){const t=clean(raw),p=t.search(/(?:Celkom|Total|Order total|Grand total)\s*[:：]?/i),b=p>=0?t.slice(0,p):t;const all=[...b.matchAll(/(US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi)];if(!all.length)return{value:'',currency:''};const m=all.at(-1);return{value:m[2].replace(',','.'),currency:currencyOf(m[1])}}

function anchorsForUrl(root,u){return [...root.querySelectorAll('a[href*="/item/"]')].filter(a=>itemUrl(a.href)===u)}
function bestContainer(group){let best=null,bestScore=-1;for(const a of group){let e=a;for(let i=0;i<7&&e;i++,e=e.parentElement){const raw=e?.innerText||'',t=clean(raw);if(t.length<8||t.length>2200)continue;const uniq=new Set([...e.querySelectorAll?.('a[href*="/item/"]')||[]].map(x=>itemUrl(x.href)).filter(Boolean));if(uniq.size>1)continue;let score=0;if(/US\s*\$|\$|€|EUR|USD/i.test(t))score+=5;if(/\b[x×]\s*\d+|\d+\s*[x×]/i.test(t))score+=2;score+=Math.min(t.length,500)/100;if(score>bestScore){best=e;bestScore=score}}}return best||group[0]?.parentElement||null}

function directTitleAnchor(group){
  const candidates=[];
  for(const a of group){
    for(const s of [a.getAttribute('title'),a.innerText,a.textContent]){
      const v=clean(s);
      if(v.length>=6&&!GENERIC_TITLE.test(v)&&!/^(view|details?|remove|add to cart)$/i.test(v))candidates.push({a,v});
    }
  }
  candidates.sort((x,y)=>y.v.length-x.v.length);
  return candidates[0]||null;
}
function titleFrom(group,c){const d=directTitleAnchor(group);if(d)return d.v;const a=[];if(c)for(const x of c.querySelectorAll('a[href*="/item/"]')){const v=clean(x.getAttribute('title')||x.innerText||x.textContent||'');if(v.length>=6&&!GENERIC_TITLE.test(v))a.push(v)}a.sort((x,y)=>y.length-x.length);return a[0]||''}
function variantFromRaw(raw,title,sellerName){const t=clean(raw);if(!t)return'';let part=t;const titlePos=title?t.indexOf(title):-1;if(titlePos>=0)part=t.slice(titlePos+title.length);const pricePos=part.search(/(?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*[0-9]+(?:[.,][0-9]{1,2})?/i);if(pricePos>=0)part=part.slice(0,pricePos);part=clean(part);if(!part)return'';const bad=[META_LINE,/^(add to cart|remove|free returns?|write a review|confirm received|track status)$/i];const candidates=lines(part.replace(/\s{2,}/g,'\n')).map(clean).filter(x=>x&&x.length<220&&!bad.some(r=>r.test(x))&&x!==sellerName&&x!==title);const whole=clean(candidates.join(' '));if(!whole||META_LINE.test(whole)||/^(completed|expired|date\s*:)/i.test(whole))return'';return whole}
function imageCandidates(img){if(!img)return[];const out=[];for(const k of ['data-src','data-lazy-src','data-original','data-image','src']){const v=img.getAttribute?.(k);if(v)out.push(abs(v))}if(img.currentSrc)out.push(abs(img.currentSrc));const ss=img.getAttribute?.('srcset');if(ss)for(const p of ss.split(',')){const u=p.trim().split(/\s+/)[0];if(u)out.push(abs(u))}return[...new Set(out)].filter(u=>u&&!BAD_IMAGE.test(u)&&!/^data:image/i.test(u))}
function titleTokens(s){return clean(s).toLowerCase().split(/[^a-z0-9à-ž]+/i).filter(x=>x.length>=4&&!/^(with|from|for|and|the|store|official|pcs|piece|pieces)$/i.test(x))}
function altMatchesTitle(img,title){const alt=clean(img.getAttribute('alt')||img.getAttribute('title')||'');if(!alt)return true;const t=new Set(titleTokens(title)),a=titleTokens(alt);if(!t.size||!a.length)return true;return a.some(x=>t.has(x))}
function productImageFromTitleRow(group,title){
  const d=directTitleAnchor(group);
  if(!d||!title)return'';
  let e=d.a;
  for(let level=0;level<6&&e;level++,e=e.parentElement){
    const links=[...e.querySelectorAll?.('a[href*="/item/"]')||[]];
    const uniq=new Set(links.map(x=>itemUrl(x.href)).filter(Boolean));
    if(uniq.size>1)continue;
    const imgs=[...e.querySelectorAll?.('img')||[]];
    const scored=[];
    for(const img of imgs){
      if(!altMatchesTitle(img,title))continue;
      for(const u of imageCandidates(img)){
        const w=img.naturalWidth||img.width||0,h=img.naturalHeight||img.height||0;
        if(w&&h){const ratio=Math.max(w/h,h/w);if(w<55||h<55||ratio>2.4)continue}
        let score=0;
        if(/aliexpress-media\.com|alicdn\.com/i.test(u))score+=3;
        if(/\/kf\//i.test(u))score+=3;
        if(w>=70&&h>=70)score+=3;
        if(level<=2)score+=3;
        scored.push({u,score});
      }
    }
    scored.sort((a,b)=>b.score-a.score);
    if(scored[0]?.score>=6)return scored[0].u;
  }
  return'';
}

function meta(root){const raw=root.innerText||'',t=total(raw);return{orderId:orderId(root),orderDate:orderDate(raw),status:status(raw),seller:seller(root),orderTotal:t.value,currency:t.currency,detailUrl:detail(root),sourceUrl:location.href,rawOrderText:clean(raw)}}
function scanRoot(root){const m=meta(root),out=[],seen=new Set();for(const a of root.querySelectorAll('a[href*="/item/"]')){const u=itemUrl(a.href);if(!u||seen.has(u))continue;seen.add(u);const group=anchorsForUrl(root,u),c=bestContainer(group),raw=clean(c?.innerText||''),pt=titleFrom(group,c),pv=variantFromRaw(raw,pt,m.seller),pr=itemPriceFromRaw(raw),im=productImageFromTitleRow(group,pt),note=[];if(!pt)note.push('Názov neistý/prázdny.');if(!pv)note.push('Variant nebol jednoznačný.');if(!directTitleAnchor(group))note.push('Riadok s názvom produktu nebol nájdený; obrázok sa zámerne nevyhľadával.');else if(!im)note.push('Obrázok sa pri riadku názvu nepodarilo jednoznačne priradiť.');out.push({...m,productTitle:pt,productVariant:pv,productQuantity:quantity(raw),itemPrice:pr.value,currency:pr.currency||m.currency,productUrl:u,imageUrl:im,rawProductText:raw,parserNote:note.join(' ')})}if(!out.length&&m.orderId)out.push({...m,productTitle:'',productVariant:'',productQuantity:'',itemPrice:'',productUrl:'',imageUrl:'',rawProductText:'',parserNote:'Nebol nájdený jednoznačný produktový odkaz; ručná kontrola.'});return out}
function roots(){const as=[...document.querySelectorAll('a[href*="orderId="],a[href*="/p/order/detail"]')],out=[],done=new Set();for(const a of as){const id=oid(a.href);if(!id||done.has(id))continue;let e=a,best=null;for(let i=0;i<8&&e?.parentElement;i++,e=e.parentElement){const ids=new Set([...e.querySelectorAll('a[href*="orderId="]')].map(x=>oid(x.href)).filter(Boolean)),t=txt(e);if(t.length>30&&t.length<8000&&ids.size===1)best=e;if(ids.size>1)break}out.push(best||a.parentElement);done.add(id)}return out}
function idsFromRoots(rr=roots()){return [...new Set(rr.map(r=>orderId(r)).filter(Boolean))]}
function key(r){return[r.orderId,itemUrl(r.productUrl)].join('||')}
function sanitize(r){r={...r};if(GENERIC_TITLE.test(clean(r.productTitle)))r.productTitle='';if(BAD_IMAGE.test(r.imageUrl||''))r.imageUrl='';if(META_LINE.test(clean(r.productVariant)))r.productVariant='';return r}
function merge(newRows){const map=new Map(rows().map(r=>sanitize(r)).map(r=>[key(r),r]));for(const n0 of newRows){const n=sanitize(n0),k=key(n),old=map.get(k)||{};for(const[k2,v]of Object.entries(n))if(v!==''&&v!=null)old[k2]=v;map.set(k,old)}const a=[...map.values()];save(a);return a}

function viewOrdersButton(){
  const els=[...document.querySelectorAll('button,a,[role="button"]')];
  return els.find(e=>{
    const s=txt(e).toLowerCase();
    if(!/^(view orders|show orders|load more orders|zobraziť objednávky|zobrazit objednávky|načítať ďalšie objednávky|načíst další objednávky)$/.test(s))return false;
    const r=e.getBoundingClientRect(),st=getComputedStyle(e);
    return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden';
  })||null;
}
async function waitForMoreOrders(before){
  const start=Date.now();let best=before,lastChange=start;
  while(Date.now()-start<VIEW_WAIT_MS){
    await sleep(300);const now=roots().length;
    if(now>best){best=now;lastChange=Date.now();setStatus(`AliExpress pridáva objednávky… ${best}. Čakám 3 s na ustálenie.`)}
    if(best>before&&Date.now()-lastChange>=VIEW_SETTLE_MS)return best;
  }
  return best;
}
async function waitForViewButton(timeout=5000){const start=Date.now();while(Date.now()-start<timeout){const b=viewOrdersButton();if(b)return b;await sleep(350)}return null}
async function loadAllOrders(passNo=1){
  if(/\/p\/order\/detail\.html/i.test(location.pathname))return roots().length;
  let clicks=0,last=roots().length,noGrowth=0;
  setStatus(`Priechod ${passNo}: načítavam objednávky… aktuálne ${last}.`);await sleep(1200);
  while(clicks<VIEW_MAX_CLICKS){
    const b=await waitForViewButton(clicks===0?6000:2500);if(!b)break;
    b.scrollIntoView({block:'center'});await sleep(700);try{b.click()}catch{break}clicks++;
    setStatus(`Priechod ${passNo}: View orders klik ${clicks}. Na stránke ${last}.`);
    const now=await waitForMoreOrders(last);
    if(now>last){last=now;noGrowth=0;setProgress(last,last)}else{noGrowth++;if(noGrowth>=2)break}
    await sleep(VIEW_BETWEEN_CLICKS_MS);
  }
  setStatus(`Priechod ${passNo}: View orders skončilo. Na stránke je ${roots().length} objednávok.`);return roots().length;
}
async function scanCurrentPage(passNo=1){
  const collected=[],rr=roots();
  if(!rr.length){collected.push(...scanRoot(document.body));merge(collected);return collected}
  for(let i=0;i<rr.length;i+=BATCH_SIZE){const batch=rr.slice(i,i+BATCH_SIZE);for(const r of batch)collected.push(...scanRoot(r));merge(collected);setProgress(Math.min(i+BATCH_SIZE,rr.length),rr.length);setStatus(`Priechod ${passNo}: skenujem ${Math.min(i+BATCH_SIZE,rr.length)} / ${rr.length}.`);await sleep(BATCH_DELAY)}
  return collected;
}
function translatorOkay(){if(!translatorActive())return true;return confirm('UPOZORNENIE: Google Translator je aktívny. Môže meniť DOM a skresliť údaje. Odporúčam ho vypnúť a stránku obnoviť.\n\nPokračovať aj napriek tomu?')}

async function startMultiPass(){
  if(/\/p\/order\/detail\.html/i.test(location.pathname)){setStatus('Fáza 1 sa spúšťa na hlavnej stránke Orders.',true);return}
  if(!translatorOkay()){setStatus('Skenovanie zrušené.',true);return}
  const st={running:true,pass:1,maxPasses:MULTI_MAX_PASSES,stablePasses:0,knownOrderIds:[],history:[],startedAt:new Date().toISOString()};saveMulti(st);setStatus(`Spúšťam fázu 1. Max. ${MULTI_MAX_PASSES} priechodov; koniec po ${MULTI_STABLE_REQUIRED} nulových priechodoch.`);await continueMultiPass();
}
async function continueMultiPass(){
  if(multiRunningNow)return;const st=multiState();if(!st?.running)return;if(/\/p\/order\/detail\.html/i.test(location.pathname)){return}
  multiRunningNow=true;setBusy(true);
  try{
    const pass=Number(st.pass||1);setStatus(`Priechod ${pass}/${st.maxPasses||MULTI_MAX_PASSES}: čakám 3 s po načítaní stránky.`);await sleep(PASS_START_DELAY_MS);await loadAllOrders(pass);
    const currentIds=idsFromRoots(),known=new Set(st.knownOrderIds||[]);let newlyFound=0;for(const id of currentIds)if(!known.has(id)){known.add(id);newlyFound++}
    const collected=await scanCurrentPage(pass);st.knownOrderIds=[...known];st.stablePasses=newlyFound===0?Number(st.stablePasses||0)+1:0;st.history=Array.isArray(st.history)?st.history:[];st.history.push({pass,ordersOnPage:currentIds.length,newOrders:newlyFound,totalKnown:known.size,productRows:rows().length,finishedAt:new Date().toISOString()});st.lastOrdersOnPage=currentIds.length;st.lastNewOrders=newlyFound;st.lastProductRows=collected.length;
    const doneStable=st.stablePasses>=MULTI_STABLE_REQUIRED,doneMax=pass>=Number(st.maxPasses||MULTI_MAX_PASSES);
    if(doneStable||doneMax){st.running=false;st.finishedAt=new Date().toISOString();saveMulti(st);setStatus(`Fáza 1 hotová po ${pass} priechodoch. Unikátne objednávky: ${known.size}. Produktové riadky: ${rows().length}.`);return}
    st.pass=pass+1;saveMulti(st);setStatus(`Priechod ${pass}: +${newlyFound}, spolu ${known.size}. O 3 s reload pre priechod ${st.pass}.`);await sleep(PASS_RELOAD_DELAY_MS);location.reload();
  }catch(e){const cur=multiState()||st;cur.running=false;cur.error=String(e?.message||e);saveMulti(cur);setStatus('Fáza 1 sa zastavila: '+cur.error,true)}finally{multiRunningNow=false;setBusy(false)}
}

// ---------------- FÁZA 2: DETAILS ----------------
function detailLinkMap(){
  const best=new Map();
  for(const a of document.querySelectorAll('a[href*="/p/order/detail"],a[href*="orderId="]')){
    const id=oid(a.href);if(!id)continue;
    let score=0;const s=txt(a);
    if(/^(details?|detaily)$/i.test(s))score+=5;
    if(/\/p\/order\/detail/i.test(a.href))score+=3;
    if(/[?&]spm=/i.test(a.href))score+=2;
    const prev=best.get(id);if(!prev||score>prev.score)best.set(id,{url:abs(a.href),score});
  }
  return new Map([...best].map(([id,x])=>[id,x.url]));
}
function firstCurrentSpm(map){for(const u of map.values()){try{const x=new URL(u);const s=x.searchParams.get('spm');if(s)return s}catch{}}return''}
function storedDetailUrl(id){
  const candidates=rows().filter(r=>String(r.orderId)===String(id)&&r.detailUrl).map(r=>abs(r.detailUrl));
  return candidates.sort((a,b)=>(/[?&]spm=/.test(b)?1:0)-(/[?&]spm=/.test(a)?1:0)||b.length-a.length)[0]||'';
}
function buildDetailUrl(id,domMap,spm){
  const exact=domMap.get(id);if(exact)return{url:exact,source:'exact-dom'};
  const stored=storedDetailUrl(id);if(stored&&/[?&]spm=/.test(stored))return{url:stored,source:'stored-exact'};
  if(spm){const u=new URL('https://www.aliexpress.com/p/order/detail.html');u.searchParams.set('spm',spm);u.searchParams.set('orderId',id);return{url:u.href,source:'spm-fallback'}}
  if(stored)return{url:stored,source:'stored-fallback'};
  return{url:`https://www.aliexpress.com/p/order/detail.html?orderId=${encodeURIComponent(id)}`,source:'direct-fallback'};
}
function uniqueKnownOrderIds(){const st=multiState();if(st?.knownOrderIds?.length)return [...new Set(st.knownOrderIds.map(String))];return [...new Set(rows().map(r=>String(r.orderId||'')).filter(Boolean))]}
function isDetailPage(){return /\/p\/order\/detail\.html/i.test(location.pathname)}

async function startDetails(){
  if(isDetailPage()){setStatus('Fázu 2 spusti z hlavnej stránky Orders, aby sa zachytili presné odkazy Details.',true);return}
  if(!translatorOkay()){setStatus('Čítanie Details zrušené.',true);return}
  const old=detailState();
  if(old&&!old.running&&old.queue?.length&&Number(old.index||0)<old.queue.length){
    if(confirm(`Existuje rozpracované čítanie Details: ${old.index||0} / ${old.queue.length}. Pokračovať od poslednej objednávky?`)){old.running=true;old.resumedAt=new Date().toISOString();saveDetailState(old);continueDetails();return}
  }
  const ids=uniqueKnownOrderIds();if(!ids.length){setStatus('Nemám zoznam orderId. Najprv dokonči fázu 1.',true);return}
  const domMap=detailLinkMap(),spm=firstCurrentSpm(domMap);
  const queue=ids.map(id=>({orderId:id,...buildDetailUrl(id,domMap,spm)}));
  const st={running:true,index:0,total:queue.length,queue,completedOrderIds:[],errors:[],history:[],returnUrl:location.href,startedAt:new Date().toISOString(),exactLinksFromCurrentPage:domMap.size,spmFallbackAvailable:!!spm};
  saveDetailState(st);setStatus(`Fáza 2 pripravená: ${queue.length} objednávok. Presné Details odkazy z tejto stránky: ${domMap.size}.`);await sleep(1200);continueDetails();
}

async function waitForDetailReady(expectedId){
  const start=Date.now();
  while(Date.now()-start<DETAIL_PAGE_WAIT_MS){
    const body=txt(document.body);
    const idInBody=(body.match(/(?:Ref\.?\s*Number|Referenčné číslo|Reference number)\s*[:：]?\s*(\d{12,20})/i)||[])[1]||'';
    const hasOrder=idInBody===String(expectedId)||body.includes(String(expectedId));
    const hasContent=document.querySelector('a[href*="/item/"]')||/\b(?:Subtotal|Total|Order placed on|Paid on)\b/i.test(body);
    if(hasOrder&&hasContent){await sleep(DETAIL_PAGE_SETTLE_MS);return true}
    await sleep(400);
  }
  return false;
}

function detailField(raw,labelPattern,nextPattern){
  const re=new RegExp(`(?:${labelPattern})\\s*[:：]?\\s*(.{1,80}?)(?=\\s+(?:${nextPattern})|$)`,'i');
  const m=clean(raw).match(re);return m?clean(m[1]):'';
}
function detailMoneyAfter(raw,label){
  const re=new RegExp(`\\b${label}\\b\\s*[:：]?\\s*((?:US\\s*\\$|\\$|€|EUR|USD|£|GBP|CZK|Kč)\\s*[0-9]+(?:[.,][0-9]{1,2})?)`,'gi');
  const a=[...clean(raw).matchAll(re)];if(!a.length)return{value:'',currency:''};return money(a.at(-1)[1]);
}

function detailItemBlocks(){
  const out=[],seen=new Set();
  for(const a of document.querySelectorAll('a[href*="/item/"]')){
    let best=null,e=a;
    for(let level=0;level<9&&e&&e!==document.body;level++,e=e.parentElement){
      const t=clean(e.innerText||'');if(t.length<12||t.length>2600)continue;
      const urls=new Set([...e.querySelectorAll('a[href*="/item/"]')].map(x=>itemUrl(x.href)).filter(Boolean));
      if(urls.size!==1)continue;
      if(!/(?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*[0-9]/i.test(t))continue;
      if(!/(?:^|\s)[x×]\s*\d+\b|(?:^|\s)\d+\s*[x×](?:\s|$)/i.test(t))continue;
      best=e;break;
    }
    if(best&&!seen.has(best)){seen.add(best);out.push(best)}
  }
  return out.sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
}

function parseDetailPage(expectedId,queueEntry){
  const raw=document.body?.innerText||'',cleanRaw=clean(raw);
  const bodyId=(cleanRaw.match(/(?:Ref\.?\s*Number|Referenčné číslo|Reference number)\s*[:：]?\s*(\d{12,20})/i)||[])[1]||oid(location.href)||String(expectedId||'');
  const placed=detailField(cleanRaw,'Order placed on|Objednávka vytvorená|Objednávka zadaná','Paid on|Zaplatené|Shipment completed on|Order completed on|Payment method|Ref\\.? Number');
  const paid=detailField(cleanRaw,'Paid on|Zaplatené','Shipment completed on|Order completed on|Payment method|Ref\\.? Number');
  const shipped=detailField(cleanRaw,'Shipment completed on|Odoslanie dokončené|Zásielka dokončená','Order completed on|Payment method|Ref\\.? Number');
  const completed=detailField(cleanRaw,'Order completed on|Objednávka dokončená','Payment method|Ref\\.? Number|Estimated delivery date|$');
  const subtotal=detailMoneyAfter(cleanRaw,'Subtotal');
  const dtotal=detailMoneyAfter(cleanRaw,'Total');
  const sellerName=seller(document.body);

  const items=[];let idx=0;
  for(const block of detailItemBlocks()){
    idx++;
    const links=[...block.querySelectorAll('a[href*="/item/"]')];
    const u=itemUrl(links[0]?.href||'');
    const group=anchorsForUrl(block,u);
    const r=clean(block.innerText||'');
    const title=titleFrom(group,block);
    const variant=variantFromRaw(r,title,sellerName);
    const pr=itemPriceFromRaw(r);
    const q=quantity(r);
    const note=[];if(!title)note.push('Názov z Details nebol jednoznačný.');if(!variant)note.push('Variant z Details nebol jednoznačný.');if(!pr.value)note.push('Cena položky z Details nebola nájdená.');if(!q)note.push('Množstvo z Details nebolo nájdené.');
    items.push({itemIndex:idx,productUrl:u,productTitle:title,productVariant:variant,productQuantity:q,itemPrice:pr.value,currency:pr.currency,rawItemText:r,parserNote:note.join(' ')});
  }

  const note=[];
  if(String(bodyId)!==String(expectedId))note.push(`Očakávané orderId ${expectedId}, stránka hlási ${bodyId}.`);
  if(!items.length)note.push('Na stránke Details sa nenašli jednoznačné produktové riadky.');
  if(queueEntry?.source&&/fallback/.test(queueEntry.source))note.push(`Detail URL bol vytvorený ako ${queueEntry.source}.`);

  return{
    orderId:String(bodyId),expectedOrderId:String(expectedId),detailUrl:location.href,detailUrlSource:queueEntry?.source||'',parsedAt:new Date().toISOString(),seller:sellerName,
    orderPlacedOn:placed,paidOn:paid,shipmentCompletedOn:shipped,orderCompletedOn:completed,
    subtotal:subtotal.value,orderTotal:dtotal.value,currency:dtotal.currency||subtotal.currency,
    items,rawOrderDetailText:cleanRaw,parserNote:note.join(' ')
  };
}

async function continueDetails(){
  if(detailRunningNow)return;const st=detailState();if(!st?.running)return;detailRunningNow=true;setBusy(true);
  try{
    const idx=Number(st.index||0);
    if(idx>=st.queue.length){await finishDetails(st);return}
    const entry=st.queue[idx];
    if(!isDetailPage()||oid(location.href)!==String(entry.orderId)){
      setStatus(`Fáza 2: otváram Details ${idx+1} / ${st.queue.length}, orderId ${entry.orderId}.`);location.href=entry.url;return;
    }
    setStatus(`Fáza 2: čakám na vykreslenie Details ${idx+1} / ${st.queue.length}, orderId ${entry.orderId}.`);
    const ready=await waitForDetailReady(entry.orderId);
    if(!ready){
      st.errors=Array.isArray(st.errors)?st.errors:[];st.errors.push({orderId:entry.orderId,url:location.href,error:'Timeout: detail stránky sa nepodarilo jednoznačne načítať.',at:new Date().toISOString()});
      st.history=Array.isArray(st.history)?st.history:[];st.history.push({index:idx+1,orderId:entry.orderId,ok:false,items:0,at:new Date().toISOString()});st.index=idx+1;saveDetailState(st);
    }else{
      const rec=parseDetailPage(entry.orderId,entry);saveDetailOrder(rec);
      st.completedOrderIds=Array.isArray(st.completedOrderIds)?st.completedOrderIds:[];if(!st.completedOrderIds.includes(String(entry.orderId)))st.completedOrderIds.push(String(entry.orderId));
      st.history=Array.isArray(st.history)?st.history:[];st.history.push({index:idx+1,orderId:entry.orderId,ok:String(rec.orderId)===String(entry.orderId),items:rec.items.length,at:new Date().toISOString()});st.index=idx+1;saveDetailState(st);
      setStatus(`Fáza 2: ${idx+1} / ${st.queue.length}. Order ${entry.orderId}: ${rec.items.length} položiek. O 3 s pokračujem.`);
    }
    if(st.index>=st.queue.length){await sleep(800);await finishDetails(st);return}
    await sleep(DETAIL_BETWEEN_MS);const next=st.queue[st.index];location.href=next.url;
  }catch(e){const cur=detailState()||st;cur.running=false;cur.error=String(e?.message||e);saveDetailState(cur);setStatus('Fáza 2 sa zastavila: '+cur.error,true)}finally{detailRunningNow=false;setBusy(false)}
}

async function finishDetails(st){
  st.running=false;st.finishedAt=new Date().toISOString();saveDetailState(st);
  const d=detailOrders(),items=d.reduce((n,x)=>n+(x.items?.length||0),0);
  setStatus(`Fáza 2 hotová. Detaily objednávok: ${d.length} / ${st.queue.length}; detailných položiek: ${items}; chyby: ${(st.errors||[]).length}.`);
  if(st.returnUrl&&location.href!==st.returnUrl){await sleep(2500);location.href=st.returnUrl}
}

function stopMulti(){const st=multiState();if(st){st.running=false;st.stoppedAt=new Date().toISOString();saveMulti(st)}setStatus('Fáza 1 zastavená.',true)}
function stopDetails(){const st=detailState();if(st){st.running=false;st.stoppedAt=new Date().toISOString();saveDetailState(st)}setStatus('Fáza 2 Details zastavená. Stav zostal uložený.',true)}

function esc(v){let s=String(v??'').replace(/\r?\n/g,' ');return'"'+s.replace(/"/g,'""')+'"'}
function csv(){const a=rows(),o=[HEAD.map(esc).join(SEP)];for(const r of a)o.push(HEAD.map(h=>esc(r[h]??'')).join(SEP));return'\uFEFF'+o.join('\r\n')}
function dl(name,data,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
function exportCSV(){dl(`aliexpress_orders_${stamp()}.csv`,csv(),'text/csv;charset=utf-8');setStatus(`CSV exportované: ${rows().length} riadkov.`)}
function exportJSON(){dl(`aliexpress_orders_${stamp()}.json`,JSON.stringify({exportedAt:new Date().toISOString(),scriptVersion:VERSION,multiPass:multiState(),detailState:detailState(),details:detailOrders(),rows:rows()},null,2),'application/json;charset=utf-8');setStatus(`JSON exportované. Orders riadky: ${rows().length}; Details objednávky: ${detailOrders().length}.`)}
async function copy(){const s=csv();try{if(typeof GM_setClipboard==='function')GM_setClipboard(s,'text');else await navigator.clipboard.writeText(s);setStatus(`CSV skopírované: ${rows().length} riadkov.`)}catch(e){setStatus('Kopírovanie zlyhalo: '+e.message,true)}}
function clearData(){if(confirm('Vymazať VŠETKY nazbierané údaje: Orders, stav priechodov aj údaje z Details?')){for(const k of [KEY,MULTI_KEY,DETAIL_KEY,DETAIL_STATE_KEY])localStorage.removeItem(k);count();setProgress(0,0);setStatus('Všetky údaje boli vymazané.')}}

function count(){
  const e=document.getElementById('ae-count');if(e)e.textContent=rows().length;
  const s=multiState(),m=document.getElementById('ae-multi');if(m)m.textContent=s?.knownOrderIds?.length?`Unikátne objednávky: ${s.knownOrderIds.length}`:'';
  const ds=detailState(),d=detailOrders(),de=document.getElementById('ae-details');if(de){const items=d.reduce((n,x)=>n+(x.items?.length||0),0);const total=ds?.queue?.length||s?.knownOrderIds?.length||0;de.textContent=`Details: ${d.length}${total?' / '+total:''} objednávok; položky: ${items}`}
}
function setStatus(s,err=false){const e=document.getElementById('ae-status');if(e){e.textContent=s;e.style.color=err?'#ffb4b4':'#d7ffd7'}}
function setProgress(done,total){const e=document.getElementById('ae-progress');if(e)e.textContent=total?`Spracované: ${done} / ${total}`:''}
function setBusy(b){for(const x of document.querySelectorAll(`#${PANEL} button:not([data-stop="1"])`))x.disabled=b;const e=document.getElementById('ae-busy');if(e)e.textContent=b?'Pracujem… nechaj túto kartu otvorenú.':''}
function btn(p,s,f,c,stop=false){const b=document.createElement('button');b.textContent=s;if(stop)b.dataset.stop='1';b.style.cssText=`width:100%;margin:4px 0;padding:7px;border:0;border-radius:6px;color:white;background:${c};cursor:pointer;font-size:12px`;b.onclick=f;p.append(b)}
function panel(){
  if(document.getElementById(PANEL)||!document.body)return;
  const p=document.createElement('div');p.id=PANEL;p.style.cssText='position:fixed!important;top:80px!important;right:12px!important;width:315px!important;z-index:2147483647!important;background:#18181c!important;color:white!important;border:3px solid #00d26a!important;border-radius:10px!important;padding:10px!important;font:12px Arial!important;box-shadow:0 4px 20px #0008!important;';
  p.innerHTML=`<div style="font-size:14px;font-weight:bold;color:#7CFF9A">✓ AliExpress export SK 2026</div><div>Produktové riadky: <span id="ae-count">0</span></div><div id="ae-multi" style="font-size:10px;color:#9fd3ff;margin-top:2px"></div><div id="ae-details" style="font-size:10px;color:#c7a8ff;margin-top:2px"></div><div style="font-size:10px;color:#bbb;margin-top:3px">v${VERSION} – Orders + presné Details</div><div id="ae-translator" style="margin-top:6px;padding:6px;border-radius:5px;background:#5b1d1d;color:#ffd7d7;display:none"><b>⚠ Translator je zapnutý.</b><br>Pred skenovaním ho vypni.</div><div id="ae-progress" style="margin-top:5px;color:#9fd3ff"></div><div id="ae-busy" style="color:#ffe28a"></div><div style="height:6px"></div>`;
  btn(p,'1. Viacnásobne načítať + naskenovať',startMultiPass,'#238636');
  btn(p,'Zastaviť fázu 1',stopMulti,'#a66321',true);
  btn(p,'2. Načítať presné údaje z Details',startDetails,'#8250df');
  btn(p,'Zastaviť Details',stopDetails,'#9a6700',true);
  btn(p,'3. Export CSV (Orders)',exportCSV,'#1f6feb');
  btn(p,'Export JSON (Orders + Details)',exportJSON,'#6f42c1');
  btn(p,'Kopírovať CSV',copy,'#0969da');
  btn(p,'Vymazať všetky uložené dáta',clearData,'#b62324');
  const s=document.createElement('div');s.id='ae-status';s.style.cssText='margin-top:8px;color:#d7ffd7;line-height:1.35';s.textContent='Fáza 2 používa existujúce prihlásenie AliExpressu. Heslo sa neukladá. Adresa, telefón a platobná metóda sa zámerne neukladajú.';p.append(s);document.body.append(p);count();const tw=document.getElementById('ae-translator');if(tw)tw.style.display=translatorActive()?'block':'none';
}
function init(){
  if(document.body)panel();else document.addEventListener('DOMContentLoaded',panel,{once:true});
  setTimeout(panel,500);setTimeout(panel,1500);
  setTimeout(()=>{
    count();
    const ds=detailState();
    if(ds?.running){continueDetails();return}
    const ms=multiState();if(ms?.running&&!isDetailPage())continueMultiPass();
  },2200);
}
init();
})();
