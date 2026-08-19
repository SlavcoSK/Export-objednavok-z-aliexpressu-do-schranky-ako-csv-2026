// ==UserScript==
// @name         AliExpress objednávky -> CSV/JSON + Details
// @namespace    SlavcoSK
// @version      0.9.13
// @description  Export AliExpress Orders + presné Details + konzervatívne obrázky z rovnakého produktového bloku v Details.
// @match        *://*.aliexpress.com/*
// @match        *://aliexpress.com/*
// @match        *://*.aliexpress.us/*
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(() => {
'use strict';

const VERSION='0.9.13';
// Details parser nemeníme: už overených 437 Details zostáva zachovaných.
const DETAIL_PARSER_VERSION='0.9.11-dom-variant-v3';
const IMAGE_PARSER_VERSION='0.9.13-details-image-v2';
const KEY='AE_EXPORT_SK_2026';
const MULTI_KEY='AE_EXPORT_SK_2026_MULTI';
const DETAIL_KEY='AE_EXPORT_SK_2026_DETAILS';
const DETAIL_STATE_KEY='AE_EXPORT_SK_2026_DETAIL_STATE';
const IMAGE_KEY='AE_EXPORT_SK_2026_IMAGES';
const IMAGE_STATE_KEY='AE_EXPORT_SK_2026_IMAGE_STATE';
const PANEL='ae-export-sk-panel', SEP=';';

const BATCH_SIZE=20, BATCH_DELAY=80;
const VIEW_WAIT_MS=9000, VIEW_SETTLE_MS=3000, VIEW_BETWEEN_CLICKS_MS=1600, VIEW_MAX_CLICKS=120;
const MULTI_MAX_PASSES=12, MULTI_STABLE_REQUIRED=2, PASS_START_DELAY_MS=3000, PASS_RELOAD_DELAY_MS=3000;
const DETAIL_PAGE_WAIT_MS=15000, DETAIL_PAGE_SETTLE_MS=1800, DETAIL_BETWEEN_MS=3000;
const IMAGE_PAGE_SETTLE_MS=900, IMAGE_ROW_SCROLL_WAIT_MS=180, IMAGE_BETWEEN_MS=2500;

const HEAD=['orderId','orderDate','status','seller','productTitle','productVariant','productQuantity','itemPrice','currency','orderTotal','productUrl','imageUrl','detailUrl','sourceUrl','rawProductText','rawOrderText','parserNote'];
const GENERIC_TITLE=/^(obrázok názvu|image title|image|picture|photo|product image)$/i;
const BAD_IMAGE=/Se39935ad4d904c8b9abf60a4b71fa315F\.png|6000000002182-2-tps-48-48\.png|Se5bee6b872c34652909ace14ca3d6ab50|\/272x80\.png(?:\?|$)/i;
const IMAGE_UI_HINT=/(?:logo|avatar|icon|sprite|flag|coupon|badge|choice|seller|store-logo|payment|visa|mastercard|shipping-icon|delivery-icon|arrow|star|qrcode|qr-code)/i;
const META_LINE=/^(completed|finished|expired|cancelled|canceled|awaiting delivery|processing|shipped|closed|dokončené|platnosť vypršala|zrušené|čaká sa na doručenie|date\s*:|dátum\s*:|ref\.?\s*number\s*:|referenčné číslo\s*:|copy$|kopírovať$|details?$|detaily$)/i;

let multiRunningNow=false;
let detailRunningNow=false;
let imageRunningNow=false;

console.log(`[AE Export SK] v${VERSION} spustený`, location.href);

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
const imageOrders=()=>{try{return JSON.parse(localStorage.getItem(IMAGE_KEY)||'[]')}catch{return[]}};
const imageState=()=>{try{return JSON.parse(localStorage.getItem(IMAGE_STATE_KEY)||'null')}catch{return null}};
const saveImageState=s=>{localStorage.setItem(IMAGE_STATE_KEY,JSON.stringify(s));count()};

function saveDetailOrder(rec){
  const a=detailOrders();
  const i=a.findIndex(x=>String(x.orderId)===String(rec.orderId));
  if(i>=0)a[i]=rec;else a.push(rec);
  localStorage.setItem(DETAIL_KEY,JSON.stringify(a));
  count();
}
function saveImageOrder(rec){
  const a=imageOrders();
  const i=a.findIndex(x=>String(x.orderId)===String(rec.orderId));
  if(i>=0)a[i]=rec;else a.push(rec);
  localStorage.setItem(IMAGE_KEY,JSON.stringify(a));
  count();
}

function resetDetailsOnly(silent=false){
  localStorage.removeItem(DETAIL_KEY);
  localStorage.removeItem(DETAIL_STATE_KEY);
  count();
  if(!silent)setStatus('Údaje fázy Details boli vymazané. Orders a 1. fáza zostali zachované.');
}
function resetImagesOnly(silent=false){
  localStorage.removeItem(IMAGE_KEY);
  localStorage.removeItem(IMAGE_STATE_KEY);
  count();
  if(!silent)setStatus('Vymazaná bola iba vrstva obrázkov. Orders ani Details sa nezmenili.');
}

function migrateOldDetails(){
  const st=detailState(),d=detailOrders();
  const oldState=st&&st.parserVersion!==DETAIL_PARSER_VERSION;
  const oldRecords=d.some(x=>x?.parserVersion!==DETAIL_PARSER_VERSION);
  if(oldState||oldRecords){
    resetDetailsOnly(true);
    sessionStorage.setItem('AE_EXPORT_SK_2026_DETAILS_MIGRATED','1');
  }
}
function migrateOldImages(){
  const st=imageState(),d=imageOrders();
  const oldState=st&&st.parserVersion!==IMAGE_PARSER_VERSION;
  const oldRecords=d.some(x=>x?.parserVersion!==IMAGE_PARSER_VERSION);
  if(oldState||oldRecords){
    resetImagesOnly(true);
    sessionStorage.setItem('AE_EXPORT_SK_2026_IMAGES_MIGRATED','1');
  }
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
    for(const s of [a.getAttribute('title'),a.getAttribute('aria-label'),a.innerText,a.textContent]){
      const v=clean(s);
      if(v.length>=6&&!GENERIC_TITLE.test(v)&&!/^(view|details?|remove|add to cart)$/i.test(v))candidates.push({a,v});
    }
  }
  candidates.sort((x,y)=>y.v.length-x.v.length);
  return candidates[0]||null;
}
function titleFrom(group,c){const d=directTitleAnchor(group);if(d)return d.v;const a=[];if(c)for(const x of c.querySelectorAll('a[href*="/item/"]')){const v=clean(x.getAttribute('title')||x.getAttribute('aria-label')||x.innerText||x.textContent||'');if(v.length>=6&&!GENERIC_TITLE.test(v))a.push(v)}a.sort((x,y)=>y.length-x.length);return a[0]||''}
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
    const imgs=[...e.querySelectorAll?.('img')||[]],scored=[];
    for(const img of imgs){
      if(!altMatchesTitle(img,title))continue;
      for(const u of imageCandidates(img)){
        const w=img.naturalWidth||img.width||0,h=img.naturalHeight||img.height||0;
        if(w&&h){const ratio=Math.max(w/h,h/w);if(w<55||h<55||ratio>2.4)continue}
        let score=0;if(/aliexpress-media\.com|alicdn\.com/i.test(u))score+=3;if(/\/kf\//i.test(u))score+=3;if(w>=70&&h>=70)score+=3;if(level<=2)score+=3;
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
  if(multiRunningNow)return;const st=multiState();if(!st?.running)return;if(/\/p\/order\/detail\.html/i.test(location.pathname))return;
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

// ---------------- FÁZA 2: DETAILS 0.9.11 ----------------
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
function storedRowsForOrder(id){return rows().filter(r=>String(r.orderId)===String(id))}
function storedSeller(id){return storedRowsForOrder(id).map(r=>clean(r.seller)).find(Boolean)||''}
function storedDetailOrder(id){return detailOrders().find(r=>String(r.orderId)===String(id))||null}

async function startDetails(){
  if(isDetailPage()){setStatus('Fázu 2 spusti z hlavnej stránky Orders, aby sa zachytili odkazy Details.',true);return}
  if(!translatorOkay()){setStatus('Čítanie Details zrušené.',true);return}

  const old=detailState();
  if(old?.parserVersion===DETAIL_PARSER_VERSION&&!old.running&&old.queue?.length&&Number(old.index||0)<old.queue.length){
    if(confirm(`Existuje rozpracované čítanie Details: ${old.index||0} / ${old.queue.length}. Pokračovať od poslednej objednávky?`)){old.running=true;old.resumedAt=new Date().toISOString();saveDetailState(old);continueDetails();return}
  }

  resetDetailsOnly(true);
  resetImagesOnly(true);
  const ids=uniqueKnownOrderIds();if(!ids.length){setStatus('Nemám zoznam orderId. Najprv dokonči fázu 1.',true);return}
  const domMap=detailLinkMap(),spm=firstCurrentSpm(domMap);
  const queue=ids.map(id=>({orderId:id,...buildDetailUrl(id,domMap,spm)}));
  const st={parserVersion:DETAIL_PARSER_VERSION,running:true,index:0,total:queue.length,queue,completedOrderIds:[],errors:[],history:[],returnUrl:location.href,startedAt:new Date().toISOString(),exactLinksFromCurrentPage:domMap.size,spmFallbackAvailable:!!spm};
  saveDetailState(st);setStatus(`Fáza 2 v${VERSION}: nový čistý beh ${queue.length} objednávok. Presné odkazy z DOM: ${domMap.size}.`);await sleep(1200);continueDetails();
}

async function waitForDetailReady(expectedId){
  const start=Date.now();
  while(Date.now()-start<DETAIL_PAGE_WAIT_MS){
    const body=txt(document.body);
    const idInBody=(body.match(/(?:Ref\.?\s*Number|Referenčné číslo|Reference number)\s*[:：]?\s*(\d{12,20})/i)||[])[1]||'';
    const hasOrder=idInBody===String(expectedId)||body.includes(String(expectedId));
    const hasContent=/\b(?:Subtotal|Total|Order placed on|Paid on)\b/i.test(body);
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
  const a=[...clean(raw).matchAll(re)];if(!a.length)return{value:'',currency:''};return money(a[0][1]);
}

function detailSummaryText(cleanRaw){
  const si=cleanRaw.search(/\bSubtotal\b/i);
  if(si<0)return'';
  let end=cleanRaw.length;
  for(const marker of [/\bMore to love\b/i,/\bHelp Center\b/i,/\bAliExpress Multi-Language Sites\b/i]){
    const m=marker.exec(cleanRaw.slice(si));if(m)end=Math.min(end,si+m.index);
  }
  return cleanRaw.slice(si,end);
}

function detailRegion(cleanRaw,expectedId,sellerName){
  const si=cleanRaw.search(/\bSubtotal\b/i);
  if(si<0)return'';
  const before=cleanRaw.slice(0,si);

  const est=before.search(/\bEstimated delivery date\s*:\s*/i);
  if(est>=0)return before.slice(est);

  if(sellerName){
    const pm=before.search(/\bPayment method\s*:\s*/i);
    const sellerPos=before.indexOf(sellerName,pm>=0?pm:0);
    if(sellerPos>=0)return before.slice(sellerPos+sellerName.length);
  }

  const knownTitles=storedRowsForOrder(expectedId).map(r=>clean(r.productTitle)).filter(Boolean);
  let first=-1;
  for(const t of knownTitles){const p=before.indexOf(t);if(p>=0&&(first<0||p<first))first=p}
  if(first>=0)return before.slice(first);

  return'';
}

function cleanDetailPrefix(prefix){
  let p=clean(prefix),deliveryDate='';
  const re=/\bEstimated delivery date\s*:\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/gi;
  const matches=[...p.matchAll(re)];
  if(matches.length){
    const m=matches.at(-1);
    deliveryDate=clean(m[1]);
    p=p.slice((m.index||0)+m[0].length);
  }
  p=p.replace(/^(?:(?:VAT included|Free returns?|Add to cart|Returns\/refunds|Return\/refund|View)\s*)+/i,'');
  return{descriptor:clean(p),deliveryDate};
}

function parseDetailTextSegments(cleanRaw,expectedId,sellerName){
  const region=detailRegion(cleanRaw,expectedId,sellerName);
  if(!region)return[];
  const re=/((?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*([0-9]+(?:[.,][0-9]{1,2})?))\s*[x×]\s*(\d+)\b/gi;
  const matches=[...region.matchAll(re)],out=[];
  let prev=0;
  for(const m of matches){
    const prefix=region.slice(prev,m.index);
    const x=cleanDetailPrefix(prefix);
    if(x.descriptor){
      out.push({
        productLineText:x.descriptor,
        estimatedDeliveryDate:x.deliveryDate,
        itemPrice:String(m[2]).replace(',','.'),
        currency:currencyOf(m[1]),
        productQuantity:String(m[3]),
        rawItemText:clean(`${x.deliveryDate?`Estimated delivery date: ${x.deliveryDate} `:''}${x.descriptor} ${m[1]} x${m[3]}`)
      });
    }
    prev=(m.index||0)+m[0].length;
  }
  return out;
}

function validDetailTitle(v,region){
  v=clean(v);
  if(v.length<6||v.length>700||GENERIC_TITLE.test(v))return false;
  if(/(?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*[0-9]/i.test(v))return false;
  if(/^(?:estimated delivery date|subtotal|total|add to cart|returns?\/refunds?|free returns?|vat included|view)$/i.test(v))return false;
  return region.includes(v);
}

function detailDomTitleCandidates(region){
  const best=new Map();
  for(const a of document.querySelectorAll('a[href*="/item/"]')){
    const u=itemUrl(a.href);if(!u)continue;
    const vals=[
      {v:a.getAttribute('title'),score:12},
      {v:a.getAttribute('aria-label'),score:11},
      {v:a.innerText,score:10},
      {v:a.textContent,score:9}
    ];
    for(const e of a.querySelectorAll?.('[title],[aria-label]')||[]){
      vals.push({v:e.getAttribute('title'),score:8},{v:e.getAttribute('aria-label'),score:8},{v:e.innerText,score:6});
    }
    for(const x of vals){
      const v=clean(x.v);
      if(!validDetailTitle(v,region))continue;
      const k=`${u}||${v}`;
      const old=best.get(k);
      if(!old||x.score>old.score)best.set(k,{title:v,productUrl:u,score:x.score,pos:region.indexOf(v)});
    }
  }
  return [...best.values()].sort((a,b)=>a.pos-b.pos||b.score-a.score||b.title.length-a.title.length);
}

function isDetailUiLine(v){
  v=clean(v);
  if(!v)return true;
  if(/^\d{1,3}$/.test(v))return true;
  return /^(?:Estimated delivery date\s*:|VAT included|Free returns?|Add to cart|Returns\/refunds|Return\/refund|View|Choice)$/i.test(v);
}

function parsePriceQtyLine(v){
  const m=clean(v).match(/((?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*([0-9]+(?:[.,][0-9]{1,2})?))\s*[x×]\s*(\d+)\b/i);
  return m?{itemPrice:String(m[2]).replace(',','.'),currency:currencyOf(m[1]),productQuantity:String(m[3])}:null;
}

function detailDomBlockInfo(block){
  const rawLines=lines(block?.innerText||'');
  let priceIndex=-1,pq=null;
  for(let i=0;i<rawLines.length;i++){const x=parsePriceQtyLine(rawLines[i]);if(x){priceIndex=i;pq=x;break}}
  if(priceIndex<0||!pq)return null;

  const before=[];let deliveryDate='';
  for(const line0 of rawLines.slice(0,priceIndex)){
    const line=clean(line0);
    const dm=line.match(/^Estimated delivery date\s*:\s*(.+)$/i);
    if(dm){deliveryDate=clean(dm[1]);continue}
    if(isDetailUiLine(line))continue;
    before.push(line);
  }
  if(!before.length)return null;

  const itemAnchors=[...block.querySelectorAll('a[href*="/item/"]')];
  const urls=[...new Set(itemAnchors.map(a=>itemUrl(a.href)).filter(Boolean))];
  const productUrl=urls.length===1?urls[0]:'';

  const anchorTexts=[];
  for(const a of itemAnchors){
    for(const v0 of [a.getAttribute('title'),a.getAttribute('aria-label'),a.innerText,a.textContent]){
      const v=clean(v0);
      if(v.length>=6&&!GENERIC_TITLE.test(v)&&!parsePriceQtyLine(v)&&!isDetailUiLine(v))anchorTexts.push(v);
    }
  }
  anchorTexts.sort((a,b)=>b.length-a.length);

  let title='',variant='',variantSource='';
  let titleLineIndex=-1;
  for(const at of anchorTexts){
    const idx=before.findIndex(line=>line===at||line.includes(at)||at.includes(line));
    if(idx>=0){
      title=at.length>=before[idx].length?at:before[idx];
      titleLineIndex=idx;
      break;
    }
  }

  if(titleLineIndex>=0){
    const tail=before.slice(titleLineIndex+1);
    if(tail.length){variant=clean(tail.join(' '));variantSource='dom-row-between-title-price'}
  }else if(before.length===1){
    title=before[0];
  }else{
    title=clean(before.slice(0,-1).join(' '));
    variant=clean(before.at(-1));
    variantSource='dom-last-row-before-price';
  }

  return{
    node:block,
    productUrl,
    productTitle:clean(title),
    productVariant:clean(variant),
    productVariantSource:variantSource,
    productLineText:clean(before.join(' ')),
    estimatedDeliveryDate:deliveryDate,
    itemPrice:pq.itemPrice,
    currency:pq.currency,
    productQuantity:pq.productQuantity
  };
}

function detailDomItemRows(){
  const out=[],seen=new Set();
  for(const a of document.querySelectorAll('a[href*="/item/"]')){
    let e=a,best=null,bestLen=Infinity;
    for(let level=0;level<11&&e&&e!==document.body;level++,e=e.parentElement){
      const t=clean(e.innerText||'');
      if(t.length<12||t.length>2800)continue;
      const pqs=[...t.matchAll(/((?:US\s*\$|\$|€|EUR|USD|£|GBP|CZK|Kč)\s*[0-9]+(?:[.,][0-9]{1,2})?)\s*[x×]\s*\d+\b/gi)];
      if(pqs.length!==1)continue;
      const urls=new Set([...e.querySelectorAll('a[href*="/item/"]')].map(x=>itemUrl(x.href)).filter(Boolean));
      if(urls.size>1)continue;
      if(t.length<bestLen){best=e;bestLen=t.length}
    }
    if(best&&!seen.has(best)){
      const info=detailDomBlockInfo(best);
      if(info){seen.add(best);out.push(info)}
    }
  }
  out.sort((a,b)=>a.node===b.node?0:(a.node.compareDocumentPosition(b.node)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1));
  return out;
}

function mapDetailDomRows(segments){
  const domRows=detailDomItemRows(),mapped=Array(segments.length).fill(null),used=new Set();

  if(domRows.length===segments.length){
    for(let i=0;i<segments.length;i++){
      const d=domRows[i],s=segments[i];
      if(d&&d.itemPrice===s.itemPrice&&d.productQuantity===s.productQuantity){mapped[i]=d;used.add(i)}
    }
  }

  for(let i=0;i<segments.length;i++){
    if(mapped[i])continue;
    const s=segments[i];
    let pick=-1;
    for(let j=0;j<domRows.length;j++){
      if(used.has(j))continue;
      const d=domRows[j];
      if(d.itemPrice!==s.itemPrice||d.productQuantity!==s.productQuantity)continue;
      const desc=clean(s.productLineText),domDesc=clean(d.productLineText);
      if(desc===domDesc||desc.includes(domDesc)||domDesc.includes(desc)){pick=j;break}
      if(pick<0)pick=j;
    }
    if(pick>=0){mapped[i]=domRows[pick];used.add(pick)}
  }
  return mapped;
}

function chooseKnownOrderRow(expectedId,segment,itemIndex,totalSegments){
  const rr=storedRowsForOrder(expectedId);
  if(!rr.length)return null;
  const descriptor=segment.productLineText;

  const withTitle=rr.filter(r=>clean(r.productTitle)&&descriptor.includes(clean(r.productTitle)));
  if(withTitle.length===1)return withTitle[0];

  const samePrice=rr.filter(r=>clean(r.itemPrice)&&clean(r.itemPrice)===clean(segment.itemPrice));
  if(samePrice.length===1)return samePrice[0];

  const urls=rr.filter(r=>r.productUrl);
  if(urls.length===totalSegments&&urls[itemIndex])return urls[itemIndex];
  return null;
}

function resolveDetailItem(segment,candidates,expectedId,itemIndex,totalSegments,domRow){
  const descriptor=segment.productLineText;
  const matches=candidates.filter(c=>descriptor.includes(c.title));
  let chosen=null;
  if(matches.length){matches.sort((a,b)=>b.score-a.score||b.title.length-a.title.length);chosen=matches[0]}

  const known=chooseKnownOrderRow(expectedId,segment,itemIndex,totalSegments);
  let productTitle='',productVariant='',productUrl='',productTitleSource='',productVariantSource='';

  if(domRow){
    const dt=clean(domRow.productTitle),dv=clean(domRow.productVariant);
    if(dt&&(descriptor.includes(dt)||domRow.productLineText.includes(descriptor))){productTitle=dt;productTitleSource='details-dom-row'}
    if(dv&&(descriptor===dv||descriptor.endsWith(' '+dv)||descriptor.includes(dv))){productVariant=dv;productVariantSource=domRow.productVariantSource||'details-dom-row'}
    if(domRow.productUrl)productUrl=itemUrl(domRow.productUrl);
  }

  if(!productTitle&&chosen){
    productTitle=chosen.title;
    productTitleSource='details-dom-title-anchor';
    if(!productUrl)productUrl=chosen.productUrl;
  }else if(!productTitle&&known&&clean(known.productTitle)&&descriptor.includes(clean(known.productTitle))){
    productTitle=clean(known.productTitle);
    productTitleSource='orders-known-title';
    if(!productUrl)productUrl=itemUrl(known.productUrl||'');
  }else if(!productUrl&&known){
    productUrl=itemUrl(known.productUrl||'');
  }

  if(!productVariant&&productTitle){
    const p=descriptor.indexOf(productTitle);
    if(p>=0){
      const remainder=clean(descriptor.slice(p+productTitle.length));
      if(remainder){productVariant=remainder;productVariantSource='descriptor-after-title'}
    }
  }

  const note=[];
  if(!productTitle)note.push('Názov/hranica názvu z Details nebola jednoznačná; celý text je v productLineText.');
  if(!productVariant)note.push('Samostatný variant medzi názvom a cenou nebol nájdený alebo nebol jednoznačný.');
  if(!productUrl)note.push('Produktový URL nebolo možné bezpečne priradiť.');

  return{
    itemIndex:itemIndex+1,
    productUrl,
    productTitle,
    productTitleSource,
    productVariant,
    productVariantSource,
    productLineText:descriptor,
    estimatedDeliveryDate:segment.estimatedDeliveryDate||domRow?.estimatedDeliveryDate||'',
    productQuantity:segment.productQuantity,
    itemPrice:segment.itemPrice,
    currency:segment.currency,
    rawItemText:segment.rawItemText,
    parserNote:note.join(' ')
  };
}

function safeDetailRawText(rec){
  const parts=[
    `Ref. Number: ${rec.orderId}`,
    rec.orderPlacedOn?`Order placed on: ${rec.orderPlacedOn}`:'',
    rec.paidOn?`Paid on: ${rec.paidOn}`:'',
    rec.shipmentCompletedOn?`Shipment completed on: ${rec.shipmentCompletedOn}`:'',
    rec.orderCompletedOn?`Order completed on: ${rec.orderCompletedOn}`:'',
    rec.seller?`Seller: ${rec.seller}`:'',
    ...rec.items.map(x=>x.rawItemText),
    rec.subtotal?`Subtotal ${rec.currency||''} ${rec.subtotal}`:'',
    rec.orderTotal?`Total ${rec.currency||''} ${rec.orderTotal}`:''
  ];
  return clean(parts.filter(Boolean).join(' | '));
}

function parseDetailPage(expectedId,queueEntry){
  const raw=document.body?.innerText||'',cleanRaw=clean(raw);
  const bodyId=(cleanRaw.match(/(?:Ref\.?\s*Number|Referenčné číslo|Reference number)\s*[:：]?\s*(\d{12,20})/i)||[])[1]||oid(location.href)||String(expectedId||'');
  const placed=detailField(cleanRaw,'Order placed on|Objednávka vytvorená|Objednávka zadaná','Paid on|Zaplatené|Shipment completed on|Order completed on|Payment method|Ref\\.? Number');
  const paid=detailField(cleanRaw,'Paid on|Zaplatené','Shipment completed on|Order completed on|Payment method|Ref\\.? Number');
  const shipped=detailField(cleanRaw,'Shipment completed on|Odoslanie dokončené|Zásielka dokončená','Order completed on|Payment method|Ref\\.? Number');
  const completed=detailField(cleanRaw,'Order completed on|Objednávka dokončená','Payment method|Ref\\.? Number|Estimated delivery date|$');

  const summary=detailSummaryText(cleanRaw);
  const subtotal=detailMoneyAfter(summary,'Subtotal');
  const dtotal=detailMoneyAfter(summary,'Total');

  const sellerName=storedSeller(expectedId)||seller(document.body);
  const segments=parseDetailTextSegments(cleanRaw,expectedId,sellerName);
  const region=detailRegion(cleanRaw,expectedId,sellerName);
  const candidates=detailDomTitleCandidates(region);
  const domRows=mapDetailDomRows(segments);
  const items=segments.map((seg,i)=>resolveDetailItem(seg,candidates,expectedId,i,segments.length,domRows[i]));

  const note=[];
  if(String(bodyId)!==String(expectedId))note.push(`Očakávané orderId ${expectedId}, stránka hlási ${bodyId}.`);
  if(!segments.length)note.push('V Details sa nenašla žiadna položka s väzbou cena × množstvo.');
  if(items.some(x=>!x.productTitle))note.push('Pri niektorých položkách zostala hranica názvu neistá; productLineText je zachovaný bez domýšľania.');
  if(items.some(x=>!x.productVariant))note.push('Niektoré položky nemajú samostatný variantový riadok alebo ho nebolo možné bezpečne potvrdiť.');
  if(queueEntry?.source&&/fallback/.test(queueEntry.source))note.push(`Detail URL bol vytvorený ako ${queueEntry.source}.`);

  const rec={
    parserVersion:DETAIL_PARSER_VERSION,
    orderId:String(bodyId),
    expectedOrderId:String(expectedId),
    detailUrl:location.href,
    detailUrlSource:queueEntry?.source||'',
    parsedAt:new Date().toISOString(),
    seller:sellerName,
    orderPlacedOn:placed,
    paidOn:paid,
    shipmentCompletedOn:shipped,
    orderCompletedOn:completed,
    subtotal:subtotal.value,
    orderTotal:dtotal.value,
    currency:dtotal.currency||subtotal.currency,
    items,
    rawOrderDetailText:'',
    parserNote:note.join(' ')
  };
  rec.rawOrderDetailText=safeDetailRawText(rec);
  return rec;
}

async function continueDetails(){
  if(detailRunningNow)return;
  const st=detailState();
  if(!st?.running||st.parserVersion!==DETAIL_PARSER_VERSION)return;
  detailRunningNow=true;setBusy(true);
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

// ---------------- FÁZA 3: OBRÁZKY Z DETAILS 0.9.13 ----------------
function imageUrlCandidates(img){
  if(!img)return[];
  const out=[],seen=new Set();
  const add=(u,source,bonus=0)=>{
    u=abs(u);
    if(!u||seen.has(u)||BAD_IMAGE.test(u)||/^(?:data|blob):/i.test(u)||/\.(?:svg|gif)(?:[?#]|$)/i.test(u))return;
    seen.add(u);out.push({url:u,source,bonus});
  };
  for(const [k,b] of [['data-src',3],['data-original',3],['data-lazy-src',3],['data-image',2],['src',0]])add(img.getAttribute?.(k),k,b);
  add(img.currentSrc,'currentSrc',1);
  const ss=img.getAttribute?.('srcset');
  if(ss)for(const p of ss.split(',')){const u=p.trim().split(/\s+/)[0];if(u)add(u,'srcset',1)}
  return out;
}
function imageFamily(u){
  try{const x=new URL(u);x.search='';x.hash='';return x.href.replace(/^http:/,'https:')}catch{return String(u||'').split(/[?#]/)[0]}
}
function titleOverlap(img,title){
  const alt=clean(img.getAttribute('alt')||img.getAttribute('title')||'');
  if(!alt||!title)return 0;
  const t=new Set(titleTokens(title)),a=titleTokens(alt);let n=0;
  for(const x of a)if(t.has(x))n++;
  return n;
}
function imageElementCandidate(img,item){
  const urls=imageUrlCandidates(img);if(!urls.length)return null;
  const rect=img.getBoundingClientRect?.()||{width:0,height:0};
  const w=Number(img.naturalWidth||img.getAttribute?.('width')||img.width||rect.width||0);
  const h=Number(img.naturalHeight||img.getAttribute?.('height')||img.height||rect.height||0);
  if(w&&h){const ratio=Math.max(w/h,h/w);if(w<42||h<42||ratio>3.0)return null}

  const hint=clean(`${img.className||''} ${img.id||''} ${img.getAttribute?.('alt')||''} ${img.getAttribute?.('title')||''}`);
  const closestItem=img.closest?.('a[href*="/item/"]');
  const sameProductLink=!!(closestItem&&itemUrl(closestItem.href)===itemUrl(item.productUrl||''));
  const overlap=titleOverlap(img,item.productTitle||'');

  let base=0;
  if(sameProductLink)base+=10;
  if(w>=70&&h>=70)base+=3;
  if(w>=120&&h>=120)base+=2;
  if(overlap>=2)base+=4;else if(overlap===1)base+=2;
  if(IMAGE_UI_HINT.test(hint))base-=9;

  let best=null;
  for(const u of urls){
    let score=base+u.bonus;
    if(/(?:alicdn\.com|aliexpress-media\.com)/i.test(u.url))score+=3;
    if(/\/kf\//i.test(u.url))score+=3;
    if(IMAGE_UI_HINT.test(u.url))score-=7;
    const cur={url:u.url,urlSource:u.source,score,width:w||'',height:h||'',sameProductLink,overlap};
    if(!best||cur.score>best.score)best=cur;
  }
  return best;
}
function chooseDetailImage(block,item){
  if(!block)return{status:'unmapped-item-block',url:'',source:'',candidateCount:0,candidates:[],note:'Produktový blok v aktuálnom Details DOM sa nepodarilo bezpečne priradiť.'};
  const byFamily=new Map();
  for(const img of block.querySelectorAll('img')){
    const c=imageElementCandidate(img,item);if(!c)continue;
    const fam=imageFamily(c.url),old=byFamily.get(fam);
    if(!old||c.score>old.score)byFamily.set(fam,c);
  }
  const cands=[...byFamily.values()].sort((a,b)=>b.score-a.score);
  const publicCands=cands.slice(0,3).map(c=>({url:c.url,score:c.score,width:c.width,height:c.height}));
  if(!cands.length)return{status:'not-found',url:'',source:'',candidateCount:0,candidates:[],note:'V tom istom produktovom bloku nebol nájdený použiteľný obrázok.'};
  const top=cands[0],second=cands[1];
  if(top.score<10)return{status:'ambiguous',url:'',source:'',candidateCount:cands.length,candidates:publicCands,note:`Najlepší kandidát má nízke skóre ${top.score}; obrázok sa neukladá.`};
  if(second&&top.score-second.score<3)return{status:'ambiguous',url:'',source:'',candidateCount:cands.length,candidates:publicCands,note:`Dva rozdielne obrázky majú podobné skóre ${top.score}/${second.score}; nič sa nehádalo.`};
  return{status:'ok',url:top.url,source:'details-same-item-block',candidateCount:cands.length,candidates:publicCands,note:'',score:top.score,width:top.width,height:top.height,urlSource:top.urlSource};
}
function domRowMatchScore(d,item){
  if(!d||!item)return-999;
  if(clean(d.itemPrice)!==clean(item.itemPrice)||clean(d.productQuantity)!==clean(item.productQuantity))return-999;
  let s=0;
  const du=itemUrl(d.productUrl||''),iu=itemUrl(item.productUrl||'');
  if(du&&iu&&du===iu)s+=7;
  const dt=clean(d.productTitle),it=clean(item.productTitle);
  if(dt&&it&&(dt===it||dt.includes(it)||it.includes(dt)))s+=5;
  const dv=clean(d.productVariant),iv=clean(item.productVariant);
  if(iv&&dv&&(dv===iv||dv.includes(iv)||iv.includes(dv)))s+=6;
  else if(!iv&&!dv)s+=1;
  return s;
}
function imageDomRowSignature(d){
  return [itemUrl(d?.productUrl||''),clean(d?.productTitle),clean(d?.productVariant),clean(d?.itemPrice),clean(d?.productQuantity)].join('||');
}
function imageNodeStrength(node){
  if(!node)return 0;
  let score=0;
  const imgs=[...node.querySelectorAll?.('img')||[]];
  for(const img of imgs){
    const urls=imageUrlCandidates(img);
    if(urls.length)score+=4;
    const rect=img.getBoundingClientRect?.()||{width:0,height:0};
    const w=Number(img.naturalWidth||img.getAttribute?.('width')||img.width||rect.width||0);
    const h=Number(img.naturalHeight||img.getAttribute?.('height')||img.height||rect.height||0);
    if(w>=42&&h>=42)score+=2;
    if(w>=70&&h>=70)score+=2;
    if(w>=120&&h>=120)score+=2;
    if(w&&h&&Math.max(w/h,h/w)<=3.0)score+=1;
    const hint=clean(`${img.className||''} ${img.id||''} ${img.getAttribute?.('alt')||''} ${img.getAttribute?.('title')||''}`);
    if(IMAGE_UI_HINT.test(hint))score-=6;
  }
  score+=Math.min(imgs.length,4);
  score+=Math.min((node.querySelectorAll?.('a[href*="/item/"]').length||0),2);
  return score;
}
function dedupeImageDomRows(rawRows){
  const groups=new Map();
  for(const row of rawRows||[]){
    const sig=imageDomRowSignature(row);
    if(!groups.has(sig))groups.set(sig,[]);
    groups.get(sig).push(row);
  }
  const out=[];
  for(const group of groups.values()){
    let best=group[0],bestScore=imageNodeStrength(group[0]?.node),bestLen=clean(group[0]?.node?.innerText||'').length||999999;
    for(const row of group.slice(1)){
      const sc=imageNodeStrength(row?.node),ln=clean(row?.node?.innerText||'').length||999999;
      if(sc>bestScore||(sc===bestScore&&ln<bestLen)){best=row;bestScore=sc;bestLen=ln}
    }
    out.push({...best,_imageDuplicateCount:group.length,_imageNodeStrength:bestScore});
  }
  out.sort((a,b)=>a.node===b.node?0:(a.node.compareDocumentPosition(b.node)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1));
  return out;
}
function mapStoredItemsToDomRows(orderRec){
  const items=orderRec?.items||[],rawDomRows=detailDomItemRows(),domRows=dedupeImageDomRows(rawDomRows),mapped=Array(items.length).fill(null),used=new Set();

  if(domRows.length===items.length){
    let safe=true;
    for(let i=0;i<items.length;i++)if(domRowMatchScore(domRows[i],items[i])<5){safe=false;break}
    if(safe){for(let i=0;i<items.length;i++){mapped[i]=domRows[i];used.add(i)}return{mapped,domRows,rawDomRows}}
  }

  for(let i=0;i<items.length;i++){
    const scored=[];
    for(let j=0;j<domRows.length;j++){
      if(used.has(j))continue;
      const score=domRowMatchScore(domRows[j],items[i]);
      if(score>-999)scored.push({j,score});
    }
    scored.sort((a,b)=>b.score-a.score||((domRows[b.j]?._imageDuplicateCount||1)-(domRows[a.j]?._imageDuplicateCount||1))||((domRows[b.j]?._imageNodeStrength||0)-(domRows[a.j]?._imageNodeStrength||0)));
    const top=scored[0],second=scored[1];
    if(top&&top.score>=7&&(!second||top.score-second.score>=3)){mapped[i]=domRows[top.j];used.add(top.j)}
  }
  return{mapped,domRows,rawDomRows};
}
async function wakeImageRows(mapped){
  const seen=new Set();
  for(const r of mapped){
    if(!r?.node||seen.has(r.node))continue;
    seen.add(r.node);
    try{r.node.scrollIntoView({block:'center',behavior:'auto'})}catch{}
    await sleep(IMAGE_ROW_SCROLL_WAIT_MS);
  }
  await sleep(IMAGE_PAGE_SETTLE_MS);
}
async function parseImagesPage(orderRec,queueEntry){
  const {mapped,domRows,rawDomRows}=mapStoredItemsToDomRows(orderRec);
  await wakeImageRows(mapped);
  const items=(orderRec.items||[]).map((item,i)=>{
    const row=mapped[i]||null;
    const img=chooseDetailImage(row?.node||null,item);
    return{
      itemIndex:item.itemIndex||i+1,
      productUrl:item.productUrl||'',
      productTitle:item.productTitle||'',
      productVariant:item.productVariant||'',
      itemPrice:item.itemPrice||'',
      productQuantity:item.productQuantity||'',
      detailImageUrl:img.url||'',
      detailImageSource:img.source||'',
      detailImageStatus:img.status,
      detailImageScore:img.score??'',
      detailImageWidth:img.width??'',
      detailImageHeight:img.height??'',
      detailImageUrlSource:img.urlSource||'',
      detailImageCandidateCount:img.candidateCount||0,
      detailImageCandidates:img.candidates||[],
      detailImageDuplicateBlockCount:row?._imageDuplicateCount||1,
      detailImageNodeStrength:row?._imageNodeStrength||'',
      detailImageNote:img.note||''
    };
  });
  const counts={ok:0,notFound:0,ambiguous:0,unmapped:0};
  for(const x of items){if(x.detailImageStatus==='ok')counts.ok++;else if(x.detailImageStatus==='not-found')counts.notFound++;else if(x.detailImageStatus==='ambiguous')counts.ambiguous++;else counts.unmapped++}
  return{
    parserVersion:IMAGE_PARSER_VERSION,
    orderId:String(orderRec.orderId),
    detailUrl:location.href,
    detailUrlSource:queueEntry?.source||'',
    parsedAt:new Date().toISOString(),
    expectedItems:(orderRec.items||[]).length,
    domItemRowsRaw:rawDomRows.length,
    domItemRows:domRows.length,
    counts,
    items
  };
}

async function startImages(){
  if(isDetailPage()){setStatus('Fázu 3 spusti z hlavnej stránky Orders. Hotové Details zostanú zachované.',true);return}
  if(!translatorOkay()){setStatus('Čítanie obrázkov zrušené.',true);return}
  const d=detailOrders();
  if(!d.length){setStatus('Chýba vrstva Details. Najprv musí byť hotová fáza 2.',true);return}

  const old=imageState();
  if(old?.parserVersion===IMAGE_PARSER_VERSION&&!old.running&&old.queue?.length&&Number(old.index||0)<old.queue.length){
    if(confirm(`Existuje rozpracovaná fáza obrázkov: ${old.index||0} / ${old.queue.length}. Pokračovať?`)){old.running=true;old.resumedAt=new Date().toISOString();saveImageState(old);continueImages();return}
  }

  resetImagesOnly(true);
  const usable=d.filter(x=>Array.isArray(x.items)&&x.items.length>0);
  if(!usable.length){setStatus('V Details nie sú žiadne produktové položky vhodné pre obrázky.',true);return}
  const skipped=d.filter(x=>!Array.isArray(x.items)||x.items.length===0).map(x=>String(x.orderId));
  const queue=usable.map(x=>({orderId:String(x.orderId),url:x.detailUrl||`https://www.aliexpress.com/p/order/detail.html?orderId=${encodeURIComponent(x.orderId)}`,source:x.detailUrl?'details-stored-url':'direct-fallback',expectedItems:x.items.length}));
  const st={parserVersion:IMAGE_PARSER_VERSION,running:true,index:0,total:queue.length,queue,completedOrderIds:[],skippedNoDetailItems:skipped,errors:[],history:[],returnUrl:location.href,startedAt:new Date().toISOString()};
  saveImageState(st);setStatus(`Fáza 3: začínam ${queue.length} objednávok s produktovými položkami. ${skipped.length} historických bez položiek preskakujem.`);await sleep(1000);continueImages();
}

async function continueImages(){
  if(imageRunningNow)return;
  const st=imageState();
  if(!st?.running||st.parserVersion!==IMAGE_PARSER_VERSION)return;
  imageRunningNow=true;setBusy(true);
  try{
    const idx=Number(st.index||0);
    if(idx>=st.queue.length){await finishImages(st);return}
    const entry=st.queue[idx];
    if(!isDetailPage()||oid(location.href)!==String(entry.orderId)){
      setStatus(`Fáza 3: otváram Details pre obrázky ${idx+1} / ${st.queue.length}, orderId ${entry.orderId}.`);location.href=entry.url;return;
    }
    setStatus(`Fáza 3: čakám na DOM ${idx+1} / ${st.queue.length}, orderId ${entry.orderId}.`);
    const ready=await waitForDetailReady(entry.orderId);
    if(!ready){
      st.errors=Array.isArray(st.errors)?st.errors:[];st.errors.push({orderId:entry.orderId,url:location.href,error:'Timeout pri načítaní Details pre obrázky.',at:new Date().toISOString()});
      st.history=Array.isArray(st.history)?st.history:[];st.history.push({index:idx+1,orderId:entry.orderId,ok:false,imagesOk:0,at:new Date().toISOString()});st.index=idx+1;saveImageState(st);
    }else{
      const orderRec=storedDetailOrder(entry.orderId);
      if(!orderRec?.items?.length){
        st.errors=Array.isArray(st.errors)?st.errors:[];st.errors.push({orderId:entry.orderId,url:location.href,error:'Uložený Detail záznam už nemá položky.',at:new Date().toISOString()});
        st.history=Array.isArray(st.history)?st.history:[];st.history.push({index:idx+1,orderId:entry.orderId,ok:false,imagesOk:0,at:new Date().toISOString()});st.index=idx+1;saveImageState(st);
      }else{
        const rec=await parseImagesPage(orderRec,entry);saveImageOrder(rec);
        st.completedOrderIds=Array.isArray(st.completedOrderIds)?st.completedOrderIds:[];if(!st.completedOrderIds.includes(String(entry.orderId)))st.completedOrderIds.push(String(entry.orderId));
        st.history=Array.isArray(st.history)?st.history:[];st.history.push({index:idx+1,orderId:entry.orderId,ok:true,items:rec.items.length,imagesOk:rec.counts.ok,notFound:rec.counts.notFound,ambiguous:rec.counts.ambiguous,unmapped:rec.counts.unmapped,at:new Date().toISOString()});st.index=idx+1;saveImageState(st);
        setStatus(`Fáza 3: ${idx+1}/${st.queue.length}. ${entry.orderId}: obrázky OK ${rec.counts.ok}/${rec.items.length}, nejasné ${rec.counts.ambiguous}, nenájdené ${rec.counts.notFound}, nepriradené ${rec.counts.unmapped}.`);
      }
    }
    if(st.index>=st.queue.length){await sleep(700);await finishImages(st);return}
    await sleep(IMAGE_BETWEEN_MS);const next=st.queue[st.index];location.href=next.url;
  }catch(e){const cur=imageState()||st;cur.running=false;cur.error=String(e?.message||e);saveImageState(cur);setStatus('Fáza 3 sa zastavila: '+cur.error,true)}finally{imageRunningNow=false;setBusy(false)}
}

async function finishImages(st){
  st.running=false;st.finishedAt=new Date().toISOString();saveImageState(st);
  const a=imageOrders(),all=a.flatMap(x=>x.items||[]),ok=all.filter(x=>x.detailImageStatus==='ok').length,amb=all.filter(x=>x.detailImageStatus==='ambiguous').length,nf=all.filter(x=>x.detailImageStatus==='not-found').length,um=all.length-ok-amb-nf;
  setStatus(`Fáza 3 hotová. Objednávky: ${a.length}/${st.queue.length}; položky: ${all.length}; obrázky OK: ${ok}; nejasné: ${amb}; nenájdené: ${nf}; nepriradené: ${um}; chyby stránok: ${(st.errors||[]).length}.`);
  if(st.returnUrl&&location.href!==st.returnUrl){await sleep(2500);location.href=st.returnUrl}
}

function stopMulti(){const st=multiState();if(st){st.running=false;st.stoppedAt=new Date().toISOString();saveMulti(st)}setStatus('Fáza 1 zastavená.',true)}
function stopDetails(){const st=detailState();if(st){st.running=false;st.stoppedAt=new Date().toISOString();saveDetailState(st)}setStatus('Fáza 2 Details zastavená. Stav zostal uložený.',true)}
function stopImages(){const st=imageState();if(st){st.running=false;st.stoppedAt=new Date().toISOString();saveImageState(st)}setStatus('Fáza 3 obrázky zastavená. Už získané obrázky zostali uložené.',true)}
function clearDetailsButton(){if(confirm('Vymazať iba údaje fázy Details? Orders zostanú zachované, ale vymaže sa aj vrstva obrázkov naviazaná na Details.')){resetDetailsOnly(true);resetImagesOnly(true);setStatus('Details aj naviazaná vrstva obrázkov boli vymazané. Orders zostali zachované.')}}
function clearImagesButton(){if(confirm('Vymazať iba výsledky fázy obrázkov? Orders aj Details zostanú zachované.'))resetImagesOnly(false)}

function esc(v){let s=String(v??'').replace(/\r?\n/g,' ');return'"'+s.replace(/"/g,'""')+'"'}
function csv(){const a=rows(),o=[HEAD.map(esc).join(SEP)];for(const r of a)o.push(HEAD.map(h=>esc(r[h]??'')).join(SEP));return'\uFEFF'+o.join('\r\n')}
function dl(name,data,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
function exportCSV(){dl(`aliexpress_orders_${stamp()}.csv`,csv(),'text/csv;charset=utf-8');setStatus(`CSV exportované: ${rows().length} riadkov.`)}
function exportJSON(){dl(`aliexpress_orders_${stamp()}.json`,JSON.stringify({exportedAt:new Date().toISOString(),scriptVersion:VERSION,detailParserVersion:DETAIL_PARSER_VERSION,imageParserVersion:IMAGE_PARSER_VERSION,multiPass:multiState(),detailState:detailState(),imageState:imageState(),details:detailOrders(),images:imageOrders(),rows:rows()},null,2),'application/json;charset=utf-8');setStatus(`JSON exportované. Orders: ${rows().length}; Details: ${detailOrders().length}; Images objednávky: ${imageOrders().length}.`)}
async function copy(){const s=csv();try{if(typeof GM_setClipboard==='function')GM_setClipboard(s,'text');else await navigator.clipboard.writeText(s);setStatus(`CSV skopírované: ${rows().length} riadkov.`)}catch(e){setStatus('Kopírovanie zlyhalo: '+e.message,true)}}
function clearData(){if(confirm('Vymazať VŠETKY nazbierané údaje: Orders, Details aj obrázky?')){for(const k of [KEY,MULTI_KEY,DETAIL_KEY,DETAIL_STATE_KEY,IMAGE_KEY,IMAGE_STATE_KEY])localStorage.removeItem(k);count();setProgress(0,0);setStatus('Všetky údaje boli vymazané.')}}

function count(){
  const e=document.getElementById('ae-count');if(e)e.textContent=rows().length;
  const s=multiState(),m=document.getElementById('ae-multi');if(m)m.textContent=s?.knownOrderIds?.length?`Unikátne objednávky: ${s.knownOrderIds.length}`:'';
  const ds=detailState(),d=detailOrders(),de=document.getElementById('ae-details');if(de){const items=d.reduce((n,x)=>n+(x.items?.length||0),0);const total=ds?.queue?.length||s?.knownOrderIds?.length||0;de.textContent=`Details: ${d.length}${total?' / '+total:''} objednávok; položky: ${items}`}
  const is=imageState(),im=imageOrders(),ie=document.getElementById('ae-images');if(ie){const all=im.flatMap(x=>x.items||[]),ok=all.filter(x=>x.detailImageStatus==='ok').length,amb=all.filter(x=>x.detailImageStatus==='ambiguous').length,total=is?.queue?.length||d.filter(x=>x.items?.length).length||0;ie.textContent=`Obrázky: ${im.length}${total?' / '+total:''} objednávok; OK ${ok}/${all.length}${amb?`; nejasné ${amb}`:''}`}
}
function setStatus(s,err=false){const e=document.getElementById('ae-status');if(e){e.textContent=s;e.style.color=err?'#ffb4b4':'#d7ffd7'}}
function setProgress(done,total){const e=document.getElementById('ae-progress');if(e)e.textContent=total?`Spracované: ${done} / ${total}`:''}
function setBusy(b){for(const x of document.querySelectorAll(`#${PANEL} button:not([data-stop="1"])`))x.disabled=b;const e=document.getElementById('ae-busy');if(e)e.textContent=b?'Pracujem… nechaj túto kartu otvorenú.':''}
function btn(p,s,f,c,stop=false){const b=document.createElement('button');b.textContent=s;if(stop)b.dataset.stop='1';b.style.cssText=`width:100%;margin:4px 0;padding:7px;border:0;border-radius:6px;color:white;background:${c};cursor:pointer;font-size:12px`;b.onclick=f;p.append(b)}

function panel(){
  if(document.getElementById(PANEL)||!document.body)return;
  const p=document.createElement('div');p.id=PANEL;p.style.cssText='position:fixed!important;top:62px!important;right:12px!important;width:340px!important;max-height:calc(100vh - 74px)!important;overflow:auto!important;z-index:2147483647!important;background:#18181c!important;color:white!important;border:3px solid #00d26a!important;border-radius:10px!important;padding:10px!important;font:12px Arial!important;box-shadow:0 4px 20px #0008!important;';
  p.innerHTML=`<div style="font-size:14px;font-weight:bold;color:#7CFF9A">✓ AliExpress export SK 2026</div><div>Produktové riadky: <span id="ae-count">0</span></div><div id="ae-multi" style="font-size:10px;color:#9fd3ff;margin-top:2px"></div><div id="ae-details" style="font-size:10px;color:#c7a8ff;margin-top:2px"></div><div id="ae-images" style="font-size:10px;color:#ffd479;margin-top:2px"></div><div style="font-size:10px;color:#bbb;margin-top:3px">v${VERSION} – Details images v2</div><div id="ae-translator" style="margin-top:6px;padding:6px;border-radius:5px;background:#5b1d1d;color:#ffd7d7;display:none"><b>⚠ Translator je zapnutý.</b><br>Pred skenovaním ho vypni.</div><div id="ae-progress" style="margin-top:5px;color:#9fd3ff"></div><div id="ae-busy" style="color:#ffe28a"></div><div style="height:6px"></div>`;
  btn(p,'1. Viacnásobne načítať + naskenovať',startMultiPass,'#238636');
  btn(p,'Zastaviť fázu 1',stopMulti,'#a66321',true);
  btn(p,'2. Načítať presné údaje z Details',startDetails,'#8250df');
  btn(p,'Zastaviť Details',stopDetails,'#9a6700',true);
  btn(p,'Vymazať iba Details',clearDetailsButton,'#6e5a24');
  btn(p,'3. Načítať obrázky z Details',startImages,'#bf8700');
  btn(p,'Zastaviť obrázky',stopImages,'#9a6700',true);
  btn(p,'Vymazať iba obrázky',clearImagesButton,'#6e5a24');
  btn(p,'4. Export CSV (Orders)',exportCSV,'#1f6feb');
  btn(p,'Export JSON (Orders + Details + Images)',exportJSON,'#6f42c1');
  btn(p,'Kopírovať CSV',copy,'#0969da');
  btn(p,'Vymazať všetky uložené dáta',clearData,'#b62324');
  const s=document.createElement('div');s.id='ae-status';s.style.cssText='margin-top:8px;color:#d7ffd7;line-height:1.35';
  if(sessionStorage.getItem('AE_EXPORT_SK_2026_IMAGES_MIGRATED'))s.textContent='Staré výsledky obrázkov boli odstránené. Orders a Details zostali zachované.';
  else s.textContent='v0.9.13 zachováva hotové Details. Fáza 3 teraz najprv deduplikuje dvojité DOM bloky tej istej položky a až potom hľadá obrázok v rovnakom produktovom bloku.';
  p.append(s);document.body.append(p);count();const tw=document.getElementById('ae-translator');if(tw)tw.style.display=translatorActive()?'block':'none';
}

function init(){
  migrateOldDetails();
  migrateOldImages();
  if(document.body)panel();else document.addEventListener('DOMContentLoaded',panel,{once:true});
  setTimeout(panel,500);setTimeout(panel,1500);
  setTimeout(()=>{
    count();
    const ims=imageState();
    if(ims?.running&&ims.parserVersion===IMAGE_PARSER_VERSION){continueImages();return}
    const ds=detailState();
    if(ds?.running&&ds.parserVersion===DETAIL_PARSER_VERSION){continueDetails();return}
    const ms=multiState();if(ms?.running&&!isDetailPage())continueMultiPass();
  },2200);
}
init();
})();
