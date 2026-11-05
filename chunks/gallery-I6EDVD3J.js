import{a as T,f as z,g as a}from"./chunk-JV4UGN2N.js";import{a as I}from"./chunk-E3HJDYPK.js";import"./chunk-WEV6AXMB.js";import{c as U,e as C,i as O}from"./chunk-IP3NPHJG.js";import{a as f,b as R,c as K}from"./chunk-DDIRHU7Q.js";import{a as e,b as P,d as o,g as v}from"./chunk-BUFEAOIA.js";import{f as L,h as k,q as w}from"./chunk-KSYHGNLY.js";import"./chunk-L72EZ7PG.js";var H=null,M=null,$=[],h=0,S=[],D=()=>T.imageProviders.map(t=>`
  <button class="chip" data-provider="${o(t.id)}" title="${o(t.note||"")}">${o(t.label)}</button>`).join(""),F=()=>L.entries.map(t=>`
  <a class="pixiv__link" href="${t.href}" target="_blank" rel="noopener noreferrer">
    <span><b>${o(t.label)}</b><br /><span>pixiv.net</span></span>${v.ext}
  </a>`).join("");function J(){return`
  <div class="stage" id="stage">
    <span class="stage__badge" id="stageBadge">RANDOM ART</span>
    <span class="stage__corner stage__corner--tl"></span>
    <span class="stage__corner stage__corner--br"></span>
    <div class="stage__placeholder" id="stagePh">
      ${v.image}
      <p class="mono" style="font-size:var(--fs-xs);letter-spacing:var(--ls-wide);text-transform:uppercase">\u6B63\u5728\u62BD\u53D6 \xB7 \u4E5F\u53EF\u70B9\u4E0B\u65B9\u300C\u968F\u673A\u63D2\u753B\u300D</p>
    </div>
    <img class="stage__img is-loading" id="stageImg" alt="\u968F\u673A\u63D2\u753B" referrerpolicy="no-referrer" />
    <div class="stage__loading" id="stageLoading" hidden>
      <div class="stage__spinner"></div>
      <span class="mono" style="font-size:var(--fs-2xs);letter-spacing:var(--ls-widest);text-transform:uppercase" id="stageLoadingText">\u6B63\u5728\u83B7\u53D6 \u2026</span>
    </div>
    <div class="stage__hud">
      <span id="stageTitle">\u2014</span>
      <span id="stageAuthor">\u2014</span>
    </div>
  </div>`}function W(){return`
  <aside class="grid" style="gap:var(--sp-4)">
    <div class="panel">
      <div class="panel__head"><span class="panel__title">\u6570\u636E\u6E90</span><span class="mono faint" style="font-size:var(--fs-2xs)">SOURCE</span></div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px">${D()}</div>
        <button class="btn btn--sm btn--block" id="autoProvider" aria-pressed="true">\u81EA\u52A8 \xB7 \u4F9D\u6B21\u5C1D\u8BD5</button>
        <p class="faint mono" style="font-size:var(--fs-2xs);margin:0;line-height:1.7">
          \u9ED8\u8BA4\u987A\u5E8F\uFF1A<b>\u76F8\u518C</b>\uFF08\u624B\u673A\u7167\u7247\uFF09\u2192 \u672C\u5730\u753B\u5ECA \u2192 \u516C\u5F00 API \u2192 <b>PIXIV \u968F\u673A</b>\u3002<br />
          \u76F8\u518C\u8BFB <b>${o(k.manifest)}</b>\uFF0C\u672C\u5730\u753B\u5ECA\u8BFB <b>data/gallery.json</b>\uFF0C\u90FD\u79BB\u7EBF\u53EF\u7528\u3002<br />
          Pixiv \u8D70 <b>server.mjs</b> \u4EE3\u7406\u53D6\u968F\u673A\u4F5C\u54C1\u3001\u56FE\u7247\u7ECF <b>pixiv.re</b> \u955C\u50CF\u663E\u793A
          \uFF08\u9996\u6B21 20-40 \u79D2\uFF0C\u4E4B\u540E\u79D2\u5F00\uFF09\uFF1B\u70B9\u300C\u968F\u673A\u63D2\u753B\u300D\u65C1\u8FB9\u7684\u6570\u636E\u6E90\u53EF\u5355\u72EC\u62BD Pixiv\u3002
        </p>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">Pixiv \u5165\u53E3</span><span class="mono faint" style="font-size:var(--fs-2xs)">EXTERNAL</span></div>
      <div class="panel__body pixiv" style="gap:6px">
        ${F()}
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">\u641C\u7D22 Pixiv</span><span class="mono faint" style="font-size:var(--fs-2xs)">TAG</span></div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        <div class="searchline">
          <input type="search" id="pixivKw" placeholder="\u8F93\u5165\u6807\u7B7E\uFF0C\u5982 \u98A8\u666F" value="${o(L.defaultKeyword)}" />
          <button class="btn btn--sm" id="pixivGo">GO</button>
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px">
          ${L.keywords.map(t=>`<button class="chip" data-kw="${o(t)}">${o(t)}</button>`).join("")}
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">\u5386\u53F2</span><span class="mono faint" id="histCount" style="font-size:var(--fs-2xs)">0</span></div>
      <div class="panel__body grid" style="gap:var(--sp-3)">
        <div class="thumbs" id="stageThumbs"></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px">
          <button class="btn btn--sm" id="histPrev">\u2190 \u4E0A\u4E00\u5F20</button>
          <button class="btn btn--sm" id="histNext">\u4E0B\u4E00\u5F20 \u2192</button>
        </div>
        <div class="grid" style="gap:6px">
          <button class="btn btn--sm btn--block" id="histKeep">\u6536\u85CF\u5230\u672C\u5730</button>
          <button class="btn btn--sm btn--block" id="histClear">\u6E05\u7A7A\u5386\u53F2</button>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__head"><span class="panel__title">\u5BFC\u51FA</span><span class="mono faint" style="font-size:var(--fs-2xs)">IO</span></div>
      <div class="panel__body grid" style="gap:6px">
        <button class="btn btn--sm btn--block" id="exportGallery">\u4E0B\u8F7D gallery.json</button>
        <button class="btn btn--sm btn--block" id="copyGallery">\u590D\u5236\u4E3A JSON</button>
        <p class="faint mono" style="font-size:var(--fs-2xs);margin:0">\u628A\u6587\u4EF6\u653E\u5230 <b>data/</b> \u76EE\u5F55\u5373\u53EF\u6210\u4E3A\u79BB\u7EBF\u753B\u5ECA\u3002</p>
      </div>
    </div>
  </aside>`}function V(){let t=e("#stageImg"),r=e("#stagePh"),c=e("#stageTitle"),s=e("#stageAuthor"),b=e("#stageBadge"),l=a.current;if(!l){t?.classList.add("is-loading"),r&&(r.hidden=!1),c&&(c.textContent="\u2014"),s&&(s.textContent="\u2014");return}if(b&&(b.textContent=l.source?`SOURCE \xB7 ${String(l.source).toUpperCase()}`:l.pixiv?"PIXIV LINK":"RANDOM ART"),c&&(c.textContent=l.title||"\u65E0\u6807\u9898"),s&&(s.textContent=l.author||(l.pixivId?`ID ${l.pixivId}`:"UNKNOWN")),!l.url){t?.classList.add("is-loading"),r&&(r.hidden=!1,r.innerHTML=`${v.ext}<p class="mono" style="font-size:var(--fs-xs)">\u8BE5\u7ED3\u679C\u9700\u8981\u5728 Pixiv \u6253\u5F00</p>
        <a class="btn btn--signal btn--sm" href="${o(l.pixiv||"#")}" target="_blank" rel="noopener noreferrer">\u524D\u5F80 PIXIV</a>`);return}r&&(r.hidden=!0),t&&t.getAttribute("src")!==l.url&&(t.classList.add("is-loading"),t.onload=()=>t.classList.remove("is-loading"),t.onerror=()=>{t.classList.add("is-loading"),f.err("\u56FE\u7247\u52A0\u8F7D\u5931\u8D25\uFF08\u53EF\u80FD\u88AB\u9632\u76D7\u94FE\u62E6\u622A\uFF09")},t.src=l.url)}function N(){let t=e("#stageThumbs"),r=e("#histCount");if(!t)return;let c=a.history.slice().reverse();if(r&&(r.textContent=String(a.history.length).padStart(2,"0")),!c.length){t.innerHTML='<p class="faint mono" style="font-size:var(--fs-2xs);margin:0">\u6682\u65E0\u8BB0\u5F55</p>';return}t.innerHTML=c.map((s,b)=>{let l=a.history.length-1-b;return s.url?`<div class="thumb${a.cursor===l?" is-on":""}" data-jump="${l}" title="${o(s.title||s.author||"")}">
      <img src="${o(s.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <span class="thumb__x" data-remove="${o(s.url)}" title="\u79FB\u51FA\u5386\u53F2">\u2715</span>
    </div>`:`<div class="thumb${a.cursor===l?" is-on":""}" data-jump="${l}" title="${o(s.title||"")}">
        <div style="display:grid;place-items:center;height:100%;color:var(--signal-deep);font-family:var(--font-mono);font-size:10px">PIXIV</div>
      </div>`}).join("")}function A(t,r="\u6B63\u5728\u83B7\u53D6 \u2026"){let c=e("#stageLoading"),s=e("#stageLoadingText");s&&(s.textContent=r),c&&(c.hidden=!t)}var rt={id:"gallery",title:"\u63D2\u753B\u753B\u5ECA",render(){let t=a.history.length;return`
    <section class="gallery">
      ${U({title:"GALLERY",sub:"\u672C\u5730\u76F8\u518C + \u968F\u673A\u63D2\u753B\uFF1A\u76F8\u518C\u662F\u5BFC\u5165\u5230\u7AD9\u70B9\u91CC\u7684\u624B\u673A\u7167\u7247\uFF0C\u7F51\u683C\u6D4F\u89C8\u3001\u706F\u7BB1\u9010\u5F20\u7FFB\uFF0C\u5B8C\u5168\u79BB\u7EBF\uFF1B\u968F\u673A\u63D2\u753B\u5F15\u64CE\u4ECE\u5404\u6570\u636E\u6E90\u53D6\u56FE\u5E76\u81EA\u52A8\u6821\u9A8C\u53EF\u7528\u6027\uFF0C\u574F\u56FE\u81EA\u52A8\u8DF3\u8FC7\uFF0C\u7ED3\u679C\u6C89\u6DC0\u4E3A\u53EF\u56DE\u6EAF\u7684\u5386\u53F2\u3002",idx:"MODULE / 05",meta:[{label:"ALBUM",value:"\u2014 \u8BFB\u53D6\u4E2D",id:"metaAlbum"},{label:"DATA SOURCE",value:`${T.imageProviders.length} PROVIDERS`},{label:"HISTORY",value:`${String(t).padStart(2,"0")} ITEMS`,id:"metaHistory"},{label:"OFFLINE",value:"100% LOCAL"}],actions:`<button class="btn" id="pixivTop">${v.ext}\u6253\u5F00 PIXIV</button>`})}
      <div class="gallery__layout">
        <div class="grid" style="gap:var(--sp-4)">
          ${J()}
          <!-- \u5927\u56FE\u4E0B\u65B9\u7684\u64CD\u4F5C\u6761\uFF1A\u968F\u673A\u63D2\u753B\u662F\u4E3B\u64CD\u4F5C\uFF0C\u8FDB\u6765\u5C31\u4F1A\u81EA\u52A8\u62BD\u4E00\u5F20 -->
          <div class="gallery__bar">
            <button class="btn btn--signal" id="rollBtn">${v.refresh}\u968F\u673A\u63D2\u753B</button>
            <button class="btn btn--sm" id="stagePrev">\u2190 \u4E0A\u4E00\u5F20</button>
            <button class="btn btn--sm" id="stageNext">\u4E0B\u4E00\u5F20 \u2192</button>
            <span class="grow"></span>
            <button class="btn btn--sm" id="stageOpenPixiv">${v.ext}\u5728 Pixiv \u67E5\u770B</button>
            <button class="btn btn--sm" id="stageKeep">\u6536\u85CF</button>
            <button class="btn btn--sm" id="stageFull">\u5168\u5C4F</button>
          </div>

          <div>
            ${O("01","\u76F8\u518C",null)}
            <div class="photo-album" id="albumPanel">
              <div class="photo-album__bar">
                <button class="btn btn--sm btn--signal" id="albumRandom">${v.refresh}\u968F\u673A\u4E00\u5F20</button>
                <button class="btn btn--sm" id="albumExpand" aria-expanded="false" disabled>${v.grid}\u5C55\u5F00\u5168\u90E8</button>
                <span class="grow"></span>
                <span class="mono faint" id="albumCount" style="font-size:var(--fs-2xs)">\u8BFB\u53D6\u4E2D \u2026</span>
              </div>
              <div class="masonry" id="albumGrid"></div>
            </div>
          </div>

          <div>
            ${O("02","\u968F\u673A\u63D2\u753B\u5386\u53F2",null)}
            <div id="historyGridWrap"></div>
          </div>
        </div>
        ${W()}
      </div>
    </section>`},mount(t){let r=null,c=n=>{r=n,P("[data-provider]",t).forEach(d=>d.classList.toggle("is-on",d.dataset.provider===n)),e("#autoProvider")?.setAttribute("aria-pressed",String(!n))},s=async()=>{A(!0,r?`\u6B63\u5728\u4ECE ${r} \u83B7\u53D6 \u2026`:"\u6B63\u5728\u83B7\u53D6 \u2026"),await a.random({provider:r}),A(!1)},b=()=>e("#albumPanel")?.classList.contains("is-expanded")===!0,l=(n=!1)=>{let d=e("#albumGrid"),g=e("#albumCount"),u=e("#albumExpand"),x=e("#albumPanel");if(!d)return;if(n&&(d.innerHTML="",h=0),!$.length){d.innerHTML=C({title:"\u76F8\u518C\u8FD8\u662F\u7A7A\u7684",desc:`\u7528 tools/album-pull.ps1 \u4ECE\u624B\u673A\u62F7\u7167\u7247\u3001\u518D\u7528 tools/album-build.py \u538B\u7F29\uFF0C\u7ED3\u679C\u4F1A\u5199\u8FDB ${k.manifest}\u3002`,icon:"\u25A4"}),g&&(g.textContent="0 PHOTOS"),u&&(u.hidden=!0);let E=e("#metaAlbum");E&&(E.textContent="\u2014 \u7A7A");return}let i=x?.classList.contains("is-expanded")===!0,_=i?$.length-h:k.pageSize,p=$.slice(h,h+_);d.insertAdjacentHTML("beforeend",p.map((E,X)=>q(E,h+X)).join("")),h+=p.length,g&&(g.textContent=`${h} / ${$.length} PHOTOS`),u&&(u.hidden=!1,u.disabled=!1,u.setAttribute("aria-expanded",String(i)),u.innerHTML=i?`${v.up}\u6536\u8D77`:`${v.grid}\u5C55\u5F00\u5168\u90E8`,u.title=i?"\u6536\u8D77\u5230 24 \u5F20\u5E76\u6062\u590D\u53F3\u4FA7\u680F":"\u94FA\u6EE1\u5168\u90E8\u7167\u7247\uFF0C\u540C\u65F6\u628A\u76F8\u518C\u653E\u5927\u5230\u6574\u9875\u5BBD\u5EA6");let G=e("#metaAlbum");G&&(G.textContent=`${h}${i?"":` / ${$.length}`} PHOTOS`),I.reveal(d)},m=n=>{let d=e("#albumPanel"),g=e(".gallery__layout");if(!d)return;d.classList.toggle("is-expanded",n),g?.classList.toggle("is-album-expanded",n);let u=e("#albumGrid");u&&(u.innerHTML=""),h=0,l(!1),n||e("#albumPanel")?.scrollIntoView({block:"start",behavior:"smooth"})};e("#albumExpand")?.addEventListener("click",()=>m(!b())),e("#albumRandom")?.addEventListener("click",()=>{c("album"),f.show("\u4ECE\u76F8\u518C\u91CC\u968F\u673A\u62BD\u4E00\u5F20"),s()}),e("#rollBtn")?.addEventListener("click",s),e("#stagePrev")?.addEventListener("click",()=>a.back()),e("#stageNext")?.addEventListener("click",()=>a.forward()),e("#histPrev")?.addEventListener("click",()=>a.back()),e("#histNext")?.addEventListener("click",()=>a.forward()),e("#stageFull")?.addEventListener("click",()=>a.current?.url&&j(a.current)),e("#stageOpenPixiv")?.addEventListener("click",()=>a.openPixiv()),e("#pixivTop")?.addEventListener("click",()=>window.open("https://www.pixiv.net/","_blank","noopener"));let y=()=>{let n=a.current;if(!n?.url){f.err("\u5F53\u524D\u6CA1\u6709\u53EF\u6536\u85CF\u7684\u56FE\u7247");return}a.addToAllowlist(n.url),f.ok("\u5DF2\u52A0\u5165\u672C\u5730\u753B\u5ECA\uFF08\u53EF\u5728 gallery.json \u5BFC\u51FA\u4E2D\u4F7F\u7528\uFF09"),N()};return e("#stageKeep")?.addEventListener("click",y),e("#histKeep")?.addEventListener("click",y),e("#histClear")?.addEventListener("click",()=>{a.clearHistory(),f.show("\u5386\u53F2\u5DF2\u6E05\u7A7A")}),t.addEventListener("click",n=>{let d=n.target.closest("[data-album]");if(d){let p=Number(d.dataset.album);j($[p],{list:$,index:p});return}let g=n.target.closest("[data-hist]");if(g){let p=Number(g.dataset.hist);S[p]&&j(S[p],{list:S,index:p});return}let u=n.target.closest("[data-provider]");if(u){c(u.dataset.provider),f.show(`\u6570\u636E\u6E90 \xB7 ${r}`),s();return}let x=n.target.closest("[data-kw]");if(x){let p=e("#pixivKw");p&&(p.value=x.dataset.kw),window.open(L.searchUrl(x.dataset.kw),"_blank","noopener");return}let i=n.target.closest("[data-jump]");if(i){let p=Number(i.dataset.jump);a.cursor=p,a.current=a.history[p],w.emit("art:change",{current:a.current,history:a.history,source:"history"});return}let _=n.target.closest("[data-remove]");_&&(n.stopPropagation(),a.removeFromAllowlist(_.dataset.remove),a.history=a.history.filter(p=>p.url!==_.dataset.remove),a.cursor=Math.min(a.cursor,a.history.length-1),a.current=a.history[a.cursor]||null,w.emit("art:change",{current:a.current,history:a.history,source:"history"}))}),e("#autoProvider")?.addEventListener("click",n=>{r=null,P("[data-provider]",t).forEach(d=>d.classList.remove("is-on")),n.currentTarget.setAttribute("aria-pressed","true"),f.show("\u6570\u636E\u6E90 \xB7 \u81EA\u52A8")}),e("#pixivGo")?.addEventListener("click",()=>{let n=e("#pixivKw")?.value?.trim()||L.defaultKeyword;window.open(L.searchUrl(n),"_blank","noopener")}),e("#pixivKw")?.addEventListener("keydown",n=>{n.key==="Enter"&&e("#pixivGo")?.click()}),e("#exportGallery")?.addEventListener("click",()=>{K("gallery.json",a.toGalleryJSON(),"application/json"),f.ok("\u5DF2\u4E0B\u8F7D gallery.json")}),e("#copyGallery")?.addEventListener("click",()=>R(a.toGalleryJSON(),"\u5DF2\u590D\u5236\u753B\u5ECA JSON")),H=w.on("art:change",()=>{V(),N(),B(),A(!1)}),M=w.on("art:loading",({provider:n})=>{let d=n?T.getImageProvider(n):null;A(!0,d?.loadingText||(n?`\u6B63\u5728\u4ECE ${n} \u83B7\u53D6 \u2026`:"\u6B63\u5728\u83B7\u53D6 \u2026"))}),V(),N(),B(),I.reveal(t),z(k.manifest).then(n=>{$=n.filter(d=>d.url),l(!0)}).catch(()=>l(!0)),setTimeout(s,260),()=>{H?.(),M?.(),H=null,M=null,P(".lightbox").forEach(n=>n.remove()),document.body.classList.remove("is-locked")}}};function q(t,r){let c=t.thumb||t.url,s=t.width&&t.height?` width="${t.width}" height="${t.height}"`:"";return`<figure class="masonry__item" data-album="${r}" title="${o(t.title||"")}">
    <img src="${o(c)}" alt="${o(t.title||"")}" loading="lazy" decoding="async"${s} referrerpolicy="no-referrer" />
    <figcaption class="masonry__cap"><span>${o(t.title||"\u65E0\u6807\u9898")}</span><span>${o(t.author||"")}</span></figcaption>
  </figure>`}function B(){let t=e("#historyGridWrap");if(!t)return;let r=a.history.filter(s=>s.url).slice().reverse();S=r;let c=e("#metaHistory");if(c&&(c.textContent=`${String(a.history.length).padStart(2,"0")} ITEMS`),!r.length){t.innerHTML=C({title:"\u8FD8\u6CA1\u6709\u63D2\u753B\u8BB0\u5F55",desc:"\u70B9\u51FB\u4E0A\u65B9\u300C\u968F\u673A\u63D2\u753B\u300D\u5F00\u59CB\u6536\u96C6\u3002\u5386\u53F2\u4F1A\u4FDD\u5B58\u5728\u672C\u5730\u6D4F\u89C8\u5668\u4E2D\u3002"});return}t.innerHTML=`<div class="masonry">${r.map((s,b)=>`
    <figure class="masonry__item" data-hist="${b}" title="${o(s.title||s.author||"")}">
      <img src="${o(s.thumb||s.url)}" alt="${o(s.title||"")}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
      <figcaption class="masonry__cap"><span>${o(s.title||"\u65E0\u6807\u9898")}</span><span>${o(s.author||"")}</span></figcaption>
    </figure>`).join("")}</div>`}function j(t,{list:r=null,index:c=-1}={}){let s=Array.isArray(r)&&r.length?r:t?[t]:[];if(!s.length)return;let b=c>=0&&c<s.length?c:0,l=s.length>1,m=document.createElement("div");m.className="lightbox",m.innerHTML=`
    <img class="lightbox__img" alt="" referrerpolicy="no-referrer" />
    <button class="iconbtn lightbox__close" aria-label="\u5173\u95ED">\u2715</button>
    ${l?`
      <button class="iconbtn lightbox__nav lightbox__nav--prev" aria-label="\u4E0A\u4E00\u5F20">\u2039</button>
      <button class="iconbtn lightbox__nav lightbox__nav--next" aria-label="\u4E0B\u4E00\u5F20">\u203A</button>`:""}
    <div class="lightbox__bar">
      <span class="lightbox__cap"></span>
      <span>${l?"\u2190 \u2192 \u7FFB\u9875 \xB7 ":""}ESC / \u70B9\u51FB\u80CC\u666F\u5173\u95ED</span>
    </div>`;let y=m.querySelector(".lightbox__img"),n=m.querySelector(".lightbox__cap");y.addEventListener("error",()=>{let i=s[b];i?.full&&i.url&&y.getAttribute("src")!==i.url&&(y.setAttribute("src",i.url),f.show("\u6B63\u56FE\u53D6\u4E0D\u5230\uFF0C\u5DF2\u56DE\u9000\u5C0F\u56FE","warn",{ttl:1800}))});let d=()=>{let i=s[b];if(!i)return;y.src=i.full||i.url,y.alt=i.title||"";let _=i.title||"\u65E0\u6807\u9898",p=i.author?` \xB7 ${i.author}`:"";n.textContent=l?`${b+1} / ${s.length} \xB7 ${_}${p}`:`${_}${p}`},g=i=>{l&&(b=(b+i+s.length)%s.length,d())},u=()=>{m.remove(),document.removeEventListener("keydown",x),document.body.classList.remove("is-locked")},x=i=>{i.key==="Escape"?u():i.key==="ArrowLeft"?g(-1):i.key==="ArrowRight"&&g(1)};m.addEventListener("click",i=>{if(i.target.closest(".lightbox__nav--prev")){g(-1);return}if(i.target.closest(".lightbox__nav--next")){g(1);return}(i.target===m||i.target.closest(".lightbox__close"))&&u()}),document.addEventListener("keydown",x),document.body.append(m),document.body.classList.add("is-locked"),d()}export{rt as default,j as openLightbox};
