import{a as b}from"./chunk-E3HJDYPK.js";import{c as O,d as z,e as I,f as H,g as q,h as P}from"./chunk-IP3NPHJG.js";import{a as k,b as M}from"./chunk-DDIRHU7Q.js";import{a as v,b as E,d as o,e as U,g as _,i as L,k as N,m as T,n as C,o as $,p as y,q as x}from"./chunk-BUFEAOIA.js";import{r as h}from"./chunk-KSYHGNLY.js";import"./chunk-L72EZ7PG.js";var J=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;function K(a){let e=String(a??"").replace(/\r\n/g,`
`).trim();return e.length>1e3?{ok:!1,text:e,error:"\u6B63\u6587\u6700\u591A 1000 \u5B57"}:J.test(e)?{ok:!1,text:e,error:"\u6B63\u6587\u91CC\u6709\u63A7\u5236\u5B57\u7B26"}:{ok:!0,text:e}}function Q(a){let e=String(a??"").trim();return e?e.length>8e4?{ok:!1,image:"",error:`\u5185\u8054\u56FE\u7247\u592A\u5927\uFF08\u4E0A\u9650 ${Math.round(8e4/1e3)}k \u5B57\u7B26\uFF09\uFF0C\u8BF7\u6539\u7528\u56FE\u7247\u5730\u5740`}:/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(e)?{ok:!0,image:e}:/^https?:\/\/\S+$/i.test(e)?{ok:!0,image:e}:{ok:!1,image:"",error:"\u56FE\u7247\u53EA\u63A5\u53D7 data:image/\u2026;base64 \u6216 http(s) \u5730\u5740"}:{ok:!0,image:""}}function B(a={}){let e=K(a.body);if(!e.ok)return{ok:!1,error:e.error};let t=Q(a.image);return t.ok?!e.text&&!t.image?{ok:!1,error:"\u5199\u70B9\u5B57\u6216\u8005\u914D\u5F20\u56FE\uFF0C\u522B\u53D1\u7A7A\u8BC4\u8BBA"}:{ok:!0,value:{body:e.text,image:t.image}}:{ok:!1,error:t.error}}function F(a=[]){let e=a.filter(Boolean).slice(),t=new Map(e.map(n=>[n.id,n])),d=n=>{let r=n,s=0;for(;r.parentId&&t.has(r.parentId)&&s<8;)r=t.get(r.parentId),s+=1;return r},g=[],i=new Map;for(let n of e){let r=d(n);if(r===n){g.push(n);continue}i.has(r.id)||i.set(r.id,[]),i.get(r.id).push(n)}let m=(n,r)=>String(n.at).localeCompare(String(r.at));return g.sort(m),g.map(n=>({...n,replies:(i.get(n.id)||[]).sort(m)}))}var j=(a=[])=>a.filter(Boolean).length;var X=a=>`
  <section class="panel" id="cmRoot" data-post="${o(a)}" style="margin-top:var(--sp-5)">
    <div class="panel__head">
      <span class="panel__title">\u8BC4\u8BBA <b id="cmCount" class="mono">\u2014</b></span>
      <span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">COMMENTS</span>
    </div>
    <div class="panel__body" id="cmBody">
      <p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">\u6B63\u5728\u52A0\u8F7D\u8BC4\u8BBA\u2026</p>
    </div>
  </section>`,W=a=>{let e=new Date(a);if(Number.isNaN(e.getTime()))return"";let t=d=>String(d).padStart(2,"0");return`${e.getFullYear()}-${t(e.getMonth()+1)}-${t(e.getDate())} ${t(e.getHours())}:${t(e.getMinutes())}`},tt=a=>a.picture?`<img class="cm-ava" src="${o(a.picture)}" alt="" referrerpolicy="no-referrer" loading="lazy" />`:`<span class="cm-ava cm-ava--txt">${o((a.name||"\u533F")[0])}</span>`;function G(a,e){let t=e&&(e.role==="owner"||a.sub&&a.sub===e.sub);return`
    <div class="cm-item" data-cid="${o(a.id)}">
      ${tt(a)}
      <div class="cm-main">
        <div class="cm-meta mono">
          <b>${o(a.name)}</b> \xB7 ${o(W(a.at))}
          ${t?`<button class="cm-del" data-del="${o(a.id)}" title="\u5220\u6389\u8FD9\u6761\u8BC4\u8BBA">\xD7</button>`:""}
        </div>
        ${a.body?`<div class="cm-text">${o(a.body)}</div>`:""}
        ${a.image?`<a class="cm-img" href="${o(a.image)}" target="_blank" rel="noopener noreferrer"><img src="${o(a.image)}" alt="\u8BC4\u8BBA\u56FE\u7247" loading="lazy" /></a>`:""}
        <button class="cm-reply mono" data-reply="${o(a.id)}" data-name="${o(a.name)}">\u56DE\u590D</button>
      </div>
    </div>`}function et(a,e){let t=F(a);return t.length?t.map(d=>`
    ${G(d,e)}
    ${d.replies.length?`<div class="cm-replies">${d.replies.map(g=>G(g,e)).join("")}</div>`:""}
  `).join(""):'<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">\u8FD8\u6CA1\u6709\u8BC4\u8BBA \u2014\u2014 \u6765\u505A\u7B2C\u4E00\u4E2A\u3002</p>'}function at(){return h.enabled?h.loggedIn?`
    <div id="cmReplyChip" class="cm-chip mono" hidden>
      \u56DE\u590D <b id="cmReplyTo"></b>
      <button class="cm-chip__x" id="cmReplyCancel" aria-label="\u53D6\u6D88\u56DE\u590D">\xD7</button>
    </div>
    <textarea id="cmInput" class="cm-input" rows="3" maxlength="1000" placeholder="\u8BF4\u70B9\u4EC0\u4E48\u2026\uFF08\u53EF\u4EE5\u53EA\u53D1\u56FE\uFF09"></textarea>
    <div class="cm-row">
      <label class="btn btn--sm">\u914D\u56FE<input type="file" id="cmFile" accept="image/*" hidden /></label>
      <span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)" id="cmImgHint"></span>
      <button class="btn btn--sm btn--signal" id="cmSend">\u53D1\u8868\u8BC4\u8BBA</button>
    </div>`:`<div class="cm-row"><span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">\u767B\u5F55\u540E\u53EF\u4EE5\u8BC4\u8BBA</span>
      <button class="btn btn--sm" id="cmLogin">\u767B\u5F55 / \u6CE8\u518C</button></div>`:'<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">\u8FD9\u4E2A\u90E8\u7F72\u6CA1\u914D\u8D26\u53F7\u529F\u80FD\uFF0C\u8BC4\u8BBA\u6682\u65F6\u4E0D\u53EF\u7528\u3002</p>'}function st(a){return new Promise((e,t)=>{let d=new FileReader;d.onload=()=>{let g=new Image;g.onload=()=>{let m=Math.min(1,640/Math.max(g.width,g.height)),n=document.createElement("canvas");n.width=Math.max(1,Math.round(g.width*m)),n.height=Math.max(1,Math.round(g.height*m));let r=n.getContext("2d");if(!r){t(new Error("canvas \u4E0D\u53EF\u7528"));return}r.drawImage(g,0,0,n.width,n.height),e(n.toDataURL("image/jpeg",.8))},g.onerror=t,g.src=String(d.result||"")},d.onerror=t,d.readAsDataURL(a)})}async function Y(a,e){let t=a.querySelector("#cmBody"),d=a.querySelector("#cmCount");if(!t)return;let g=[],i=null,m="",n=()=>{let c=h.user?{sub:h.user.sub,role:h.user.role}:null;t.innerHTML=`${et(g,c)}<div class="cm-compose">${at()}</div>`,d&&(d.textContent=String(j(g)))},r=async()=>{let c=await h.api(`/forum/posts/${encodeURIComponent(e)}/comments`,{cache:"no-store"});c.ok?(g=Array.isArray(c.data?.items)?c.data.items:[],n()):t.innerHTML=`<p class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">\u8BC4\u8BBA\u52A0\u8F7D\u5931\u8D25\uFF1A${o(c.error||"\u672A\u77E5\u539F\u56E0")}</p>`},s=async()=>{let c=t.querySelector("#cmInput"),p=B({body:c?.value||"",image:m});if(!p.ok){k.show(p.error,"err");return}let u=t.querySelector("#cmSend");u&&(u.disabled=!0,u.textContent="\u53D1\u9001\u4E2D\u2026");let f=await h.api(`/forum/posts/${encodeURIComponent(e)}/comments`,{method:"POST",body:{body:p.value.body,image:p.value.image,parentId:i}});if(u&&(u.disabled=!1,u.textContent="\u53D1\u8868\u8BC4\u8BBA"),!f.ok){k.show(f.error||"\u53D1\u9001\u5931\u8D25","err");return}m="",i=null,await r(),k.ok("\u8BC4\u8BBA\u5DF2\u53D1\u51FA")};return a.addEventListener("click",async c=>{if(c.target.closest("#cmLogin")){h.login();return}if(c.target.closest("#cmReplyCancel")){i=null;let f=t.querySelector("#cmReplyChip");f&&(f.hidden=!0);return}let p=c.target.closest("[data-reply]");if(p){i=p.dataset.reply;let f=t.querySelector("#cmReplyChip"),S=t.querySelector("#cmReplyTo");f&&(f.hidden=!1),S&&(S.textContent=p.dataset.name||""),t.querySelector("#cmInput")?.focus();return}let u=c.target.closest("[data-del]");if(u){if(!confirm("\u5220\u6389\u8FD9\u6761\u8BC4\u8BBA\uFF1F\u5220\u9876\u5C42\u8BC4\u8BBA\u4F1A\u8FDE\u5E26\u5220\u6389\u5B83\u7684\u56DE\u590D\u3002"))return;let f=await h.api(`/forum/posts/${encodeURIComponent(e)}/comments/${encodeURIComponent(u.dataset.del)}`,{method:"DELETE"});if(!f.ok){k.show(f.error||"\u5220\u9664\u5931\u8D25","err");return}await r(),k.ok("\u5DF2\u5220\u9664");return}c.target.closest("#cmSend")&&await s()}),a.addEventListener("change",async c=>{let p=c.target.closest("#cmFile")?.files?.[0];if(p)try{m=await st(p);let u=t.querySelector("#cmImgHint");u&&(u.textContent=`\u5DF2\u9009\u56FE\uFF08\u7EA6 ${Math.round(m.length/1024)}k\uFF09`)}catch{k.show("\u8FD9\u5F20\u56FE\u8BFB\u4E0D\u51FA\u6765","err")}}),await r(),()=>{}}var R={id:"post",title:"\u6587\u7AE0",titleFor(a){return $.get(a.params[0])?.title||"\u6587\u7AE0\u4E0D\u5B58\u5728"},render(a){let e=a.params[0],t=$.get(e);if(!t)return`<section style="padding-top:var(--sp-8)">
        ${I({title:"\u6587\u7AE0\u4E0D\u5B58\u5728",desc:"\u5B83\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF0C\u6216\u94FE\u63A5\u6709\u8BEF\u3002",icon:"\u25A6"})}
        <div style="display:grid;place-items:center;margin-top:var(--sp-5)"><a class="btn" href="#/logs" data-nav>\u2190 \u8FD4\u56DE\u6587\u7AE0\u5217\u8868</a></div>
      </section>`;let{html:d,toc:g}=L(t.content),i=$.sorted.filter(p=>!p.draft),m=i.findIndex(p=>p.id===t.id),n=i[m+1]||null,r=i[m-1]||null,s=i.filter(p=>p.id!==t.id).map(p=>({p,s:(p.tags||[]).filter(u=>(t.tags||[]).includes(u)).length+(p.category===t.category?1:0)})).filter(p=>p.s>0).sort((p,u)=>u.s-p.s).slice(0,3).map(p=>p.p),c=t.stats||N(t.content);return`
    <div class="readbar" id="readbar"></div>
    <article class="post">
      <header class="post__head">
        <div class="post__kicker">
          <a class="tag tag--muted" href="#/logs?cat=${encodeURIComponent(t.category)}" data-nav>${o(t.category)}</a>          ${t.pinned?'<span class="tag tag--alert">PINNED</span>':""}
          ${t.draft?'<span class="tag tag--signal">DRAFT</span>':""}
          ${t.local?'<span class="tag tag--muted">LOCAL</span>':""}
          <span class="mono faint" style="font-size:var(--fs-2xs)">${o(t.id)}</span>
        </div>
        <h1 class="post__title display">${o(t.title)}</h1>
        ${t.summary?`<p class="post__sub">${o(t.summary)}</p>`:""}
        <div class="post__info">
          <div><span class="k-label">PUBLISHED</span><b>${T(t.date)}</b></div>
          <div><span class="k-label">UPDATED</span><b>${t.updatedAt?C(t.updatedAt):T(t.date)}</b></div>
          <div><span class="k-label">AUTHOR</span><b>${o(t.author||window.__SITE__?.author||"\u2014")}</b></div>
          <div><span class="k-label">READING</span><b>${c.minutes} MIN \xB7 ${c.chars} CHARS</b></div>
        </div>
        ${t.cover?`<div class="post__cover"><img src="${o(t.cover)}" alt="${o(t.title)}" /></div>`:""}
      </header>

      <div class="post__layout">
        <div>
          <div class="prose" id="prose">${d}</div>

          ${z(t.tags,'style="margin-top:32px"')}

          ${X(t.id)}

          <div class="hero__cta" style="margin-top:var(--sp-6)">
            <button class="btn btn--sm" id="postShare">${_.ext}\u590D\u5236\u94FE\u63A5</button>
            <button class="btn btn--sm" id="postPrint">\u6253\u5370 / \u5B58\u4E3A PDF</button>
            <a class="btn btn--sm" href="#/admin?tab=posts&edit=${o(t.id)}" data-nav>${_.edit}\u5728\u63A7\u5236\u53F0\u7F16\u8F91</a>
          </div>

          <nav class="grid grid--2" style="margin-top:var(--sp-7);gap:var(--sp-3)">
            ${n?`<a class="panel" style="padding:16px" href="#/logs/${n.id}" data-nav>
              <span class="k-label">\u2190 \u4E0A\u4E00\u7BC7</span><div style="margin-top:6px;font-weight:700">${o(n.title)}</div></a>`:"<div></div>"}
            ${r?`<a class="panel" style="padding:16px;text-align:right" href="#/logs/${r.id}" data-nav>
              <span class="k-label">\u4E0B\u4E00\u7BC7 \u2192</span><div style="margin-top:6px;font-weight:700">${o(r.title)}</div></a>`:"<div></div>"}
          </nav>

          ${s.length?`<section class="sect">
            <div class="sect__head"><h2 class="sect__title display"><span class="sect__no">REL</span>\u76F8\u5173\u6587\u7AE0</h2></div>
            <div class="list">${s.map(p=>q(p)).join("")}</div>
          </section>`:""}
        </div>

        <aside class="post__aside">
          <div class="panel">
            <div class="panel__head"><span class="panel__title">\u76EE\u5F55</span><span class="mono faint" style="font-size:var(--fs-2xs)">TOC</span></div>
            <div class="panel__body">
              ${g.length?`<nav class="toc" id="toc">${g.map(p=>`<a href="#${p.id}" class="toc--h${p.level}" data-toc>${o(p.text)}</a>`).join("")}</nav>`:'<p class="faint mono" style="font-size:var(--fs-2xs)">\u65E0\u5C0F\u8282</p>'}
            </div>
          </div>
          <div class="panel">
            <div class="panel__head"><span class="panel__title">\u6587\u7AE0\u4FE1\u606F</span></div>
            <div class="panel__body grid" style="gap:8px">
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">\u5B57\u6570</span><b class="mono" style="font-size:var(--fs-sm)">${c.chars}</b></div>
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">\u9605\u8BFB</span><b class="mono" style="font-size:var(--fs-sm)">${c.minutes} MIN</b></div>
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">\u5206\u7C7B</span><b class="mono" style="font-size:var(--fs-sm)">${o(t.category)}</b></div>
              <div class="grid" style="grid-template-columns:auto 1fr;gap:8px"><span class="k-label">\u6807\u7B7E</span><b class="mono" style="font-size:var(--fs-sm)">${(t.tags||[]).length}</b></div>
            </div>
          </div>
          <button class="btn btn--block" id="backTop">${_.up}\u56DE\u5230\u9876\u90E8</button>
        </aside>
      </div>
    </article>`},mount(a,e){let t=a.querySelector("#cmRoot");if(t){let i=t.dataset.post;i&&Y(a,i)}let d=$.get(e.params[0]);x.mark(e.params[0]),b.readProgress(v("#readbar"));let g=E("#toc a",a);if(g.length){let i=g.map(n=>document.getElementById(n.getAttribute("href").slice(1))).filter(Boolean),m=U(()=>{let n=window.scrollY+140,r=0;i.forEach((s,c)=>{s.offsetTop<=n&&(r=c)}),g.forEach((s,c)=>s.classList.toggle("is-active",c===r))});window.addEventListener("scroll",m,{passive:!0}),m(),a.__cleanupScroll=()=>window.removeEventListener("scroll",m)}return a.addEventListener("click",i=>{let m=i.target.closest("[data-toc]");if(!m)return;i.preventDefault(),document.getElementById(m.getAttribute("href").slice(1))?.scrollIntoView({behavior:"smooth",block:"start"}),g.forEach(r=>r.classList.toggle("is-active",r===m))}),v("#postShare")?.addEventListener("click",()=>M(location.href,"\u6587\u7AE0\u94FE\u63A5\u5DF2\u590D\u5236")),v("#postPrint")?.addEventListener("click",()=>window.print()),v("#backTop")?.addEventListener("click",()=>b.scrollToTop()),b.reveal(a),()=>{a.__cleanupScroll?.()}}};var V={id:"newsItem",title:"\u516C\u544A",titleFor(a){return y.get(a.params[0])?.title||"\u516C\u544A\u4E0D\u5B58\u5728"},render(a){let e=y.get(a.params[0]);if(!e)return`<section style="padding-top:var(--sp-8)">
        ${I({title:"\u516C\u544A\u4E0D\u5B58\u5728",desc:"\u5B83\u53EF\u80FD\u5DF2\u88AB\u5220\u9664\uFF0C\u6216\u94FE\u63A5\u6709\u8BEF\u3002",icon:"\u25C6"})}
        <div style="display:grid;place-items:center;margin-top:var(--sp-5)"><a class="btn" href="#/logs" data-nav>\u2190 \u8FD4\u56DE\u516C\u544A\u5217\u8868</a></div>
      </section>`;let{html:t}=L(e.content),d=e.level>=2?"\u7D27\u6025\u516C\u544A":e.level===1?"\u91CD\u8981\u516C\u544A":"\u4E00\u822C\u516C\u544A",g=e.level>=2?"tag--alert":e.level===1?"tag--signal":"tag--muted",i=y.sorted.filter(s=>!s.draft),m=i.findIndex(s=>s.id===e.id),n=i[m+1],r=i[m-1];return`
    <div class="readbar" id="readbar"></div>
    <article class="post">
      <header class="post__head">
        <div class="post__kicker">
          <a class="tag tag--muted" href="#/logs" data-nav>\u2190 NOTICE</a>
          <span class="tag ${g}">${d}</span>
          <span class="tag tag--muted">${o(e.category)}</span>
          ${e.pinned?'<span class="tag tag--alert">PINNED</span>':""}
        </div>
        <h1 class="post__title display" style="font-size:clamp(1.6rem,4vw,3rem)">${o(e.title)}</h1>
        ${e.summary?`<p class="post__sub">${o(e.summary)}</p>`:""}
        <div class="post__info">
          <div><span class="k-label">\u53D1\u5E03\u4E8E</span><b>${T(e.date)}</b></div>
          <div><span class="k-label">\u8DDD\u4ECA</span><b>${C(e.date)}</b></div>
          <div><span class="k-label">\u7F16\u53F7</span><b>${o(e.id)}</b></div>
        </div>
      </header>

      <div class="post__layout">
        <div>
          <div class="prose" id="prose">${t}</div>
          <div class="hero__cta" style="margin-top:var(--sp-6)">
            <button class="btn btn--sm" id="newsShare">${_.ext}\u590D\u5236\u94FE\u63A5</button>
            <a class="btn btn--sm" href="#/admin?tab=news&edit=${o(e.id)}" data-nav>${_.edit}\u7F16\u8F91</a>
          </div>
          <nav class="grid grid--2" style="margin-top:var(--sp-7);gap:var(--sp-3)">
            ${n?`<a class="panel" style="padding:16px" href="#/logs/${n.id}" data-nav>
              <span class="k-label">\u2190 \u66F4\u65E9</span><div style="margin-top:6px;font-weight:700">${o(n.title)}</div></a>`:"<div></div>"}
            ${r?`<a class="panel" style="padding:16px;text-align:right" href="#/logs/${r.id}" data-nav>
              <span class="k-label">\u66F4\u65B0 \u2192</span><div style="margin-top:6px;font-weight:700">${o(r.title)}</div></a>`:"<div></div>"}
          </nav>
        </div>
        <aside class="post__aside">
          <div class="panel">
            <div class="panel__head"><span class="panel__title">\u5176\u4ED6\u516C\u544A</span></div>
            <div class="panel__body grid" style="gap:10px">
              ${i.filter(s=>s.id!==e.id).slice(0,6).map(s=>`
                <a href="#/logs/${s.id}" data-nav style="display:block">
                  <div class="mono faint" style="font-size:var(--fs-2xs)">${T(s.date)}</div>
                  <div class="clamp-2" style="font-size:var(--fs-sm);font-weight:600">${o(s.title)}</div>
                </a>`).join("")||'<p class="faint mono" style="font-size:var(--fs-2xs)">\u6682\u65E0</p>'}
            </div>
          </div>
          <button class="btn btn--block" id="backTop">${_.up}\u56DE\u5230\u9876\u90E8</button>
        </aside>
      </div>
    </article>`},mount(a,e){x.mark(e.params[0]),b.readProgress(v("#readbar")),v("#newsShare")?.addEventListener("click",()=>M(location.href,"\u516C\u544A\u94FE\u63A5\u5DF2\u590D\u5236")),v("#backTop")?.addEventListener("click",()=>b.scrollToTop()),b.reveal(a)}};var w=9,l={q:"",cat:"\u5168\u90E8",tag:"",kind:"\u5168\u90E8",onlyUnread:!1,limit:w};function A(){let a=$.sorted.filter(t=>!t.draft).map(t=>({kind:"post",item:t})),e=y.sorted.filter(t=>!t.draft).map(t=>({kind:"news",item:t}));return[...a,...e].sort((t,d)=>new Date(d.item.date)-new Date(t.item.date))}function nt(a){return a.filter(e=>l.kind==="\u5168\u90E8"?!0:e.kind===l.kind).filter(e=>l.cat==="\u5168\u90E8"?!0:e.item.category===l.cat).filter(e=>l.tag?(e.item.tags||[]).includes(l.tag):!0).filter(e=>l.onlyUnread?e.kind==="news"&&!x.has(e.item.id):!0).filter(e=>{if(!l.q)return!0;let t=e.item;return`${t.title} ${t.summary} ${t.category} ${(t.tags||[]).join(" ")} ${t.content}`.toLowerCase().includes(l.q.toLowerCase())})}function D(a){let e=a?.params?.[0];return e?$.get(e)?{view:R,item:$.get(e),kind:"post"}:y.get(e)?{view:V,item:y.get(e),kind:"news"}:{view:R,item:null,kind:"post"}:null}var At={id:"logs",title:"\u6587\u7AE0\u4E0E\u516C\u544A",titleFor(a){let e=D(a);return e?e.item?.title||"\u5185\u5BB9\u4E0D\u5B58\u5728":"\u6587\u7AE0\u4E0E\u516C\u544A"},render(a){let e=D(a);if(e)return e.view.render(a);let t=new URLSearchParams(location.hash.split("?")[1]||"");t.get("cat")&&(l.cat=t.get("cat")),t.get("tag")&&(l.tag=t.get("tag")),t.get("q")&&(l.q=t.q??t.get("q")),t.get("kind")&&(l.kind=t.get("kind"));let d=A(),g=["\u5168\u90E8",...new Set(d.map(s=>s.item.category).filter(Boolean))],i=[...new Set(d.flatMap(s=>s.item.tags||[]))].slice(0,14),m=d.filter(s=>s.kind==="post").length,n=d.length-m,r=y.sorted.filter(s=>!s.draft&&!x.has(s.id)).length;return`
    <section class="logs">
      ${O({title:"FIELD LOGS",sub:"\u6587\u7AE0\u4E0E\u516C\u544A\u5408\u5E76\u6210\u4E00\u6761\u65F6\u95F4\u7EBF\uFF1A\u6587\u7AE0\u504F\u957F\u8BFB\uFF0C\u516C\u544A\u504F\u5FEB\u8BAF\uFF08\u5E26\u91CD\u8981\u7A0B\u5EA6\uFF09\u3002\u7C7B\u578B\u3001\u5206\u7C7B\u3001\u6807\u7B7E\u3001\u5173\u952E\u8BCD\u90FD\u80FD\u7B5B\uFF0C\u7F6E\u9876\u5185\u5BB9\u6392\u6700\u524D\u3002",idx:"MODULE / 03",meta:[{label:"TOTAL",value:`${String(d.length).padStart(2,"0")} ENTRIES`},{label:"POSTS",value:String(m).padStart(2,"0")},{label:"NOTICES",value:String(n).padStart(2,"0")},{label:"UNREAD",value:String(r).padStart(2,"0"),id:"logsUnread"}],actions:'<a class="btn" href="#/admin?tab=posts&new=1" data-nav>+ \u5199\u5185\u5BB9</a>'})}

      <div class="gallery__bar" style="margin-top:var(--sp-5)">
        <div class="searchline" style="flex:1 1 240px;max-width:400px">
          <input type="search" id="logsSearch" placeholder="\u641C\u7D22\u6807\u9898 / \u6458\u8981 / \u6807\u7B7E / \u6B63\u6587\u2026" value="${o(l.q)}" />
        </div>
        <div class="grid" style="grid-auto-flow:column;gap:6px;flex:0 0 auto">
          ${[["\u5168\u90E8","\u5168\u90E8"],["post","\u6587\u7AE0"],["news","\u516C\u544A"]].map(([s,c])=>`<button class="chip${l.kind===s?" is-on":""}" data-kind="${s}">${c}</button>`).join("")}
        </div>
        <div class="grid" style="grid-auto-flow:column;gap:6px;overflow-x:auto;flex:1 1 auto">
          ${g.map(s=>`<button class="chip${l.cat===s?" is-on":""}" data-cat="${o(s)}">${o(s)}</button>`).join("")}
        </div>
        <button class="chip${l.onlyUnread?" is-on":""}" id="logsUnreadOnly" aria-pressed="${l.onlyUnread}">\u53EA\u770B\u672A\u8BFB</button>
        <span class="result-count" id="logsCount">\u2014</span>
      </div>

      ${i.length?`<div class="grid" style="grid-auto-flow:column;gap:6px;overflow-x:auto;padding:var(--sp-3) 0">
        <span class="k-label" style="align-self:center">TAGS</span>
        ${i.map(s=>`<button class="chip${l.tag===s?" is-on":""}" data-tag="${o(s)}">#${o(s)}</button>`).join("")}
      </div>`:""}

      <div id="logsList" style="margin-top:var(--sp-5)"></div>
    </section>`},mount(a,e){let t=D(e);if(t)return t.view.mount?.(a,e);let d=()=>{let i=nt(A()),m=i.slice(0,l.limit),n=v("#logsList");if(!n)return;if(!m.length)n.innerHTML=I({title:"\u6CA1\u6709\u5339\u914D\u7684\u5185\u5BB9",desc:l.onlyUnread?"\u516C\u544A\u90FD\u8BFB\u5B8C\u4E86\u3002":"\u8BD5\u8BD5\u6E05\u7A7A\u641C\u7D22\u8BCD\u6216\u5207\u6362\u7C7B\u578B / \u5206\u7C7B\u3002",icon:"\u25A4"});else{let c=m.filter(f=>f.item.pinned),p=m.filter(f=>!f.item.pinned),u=f=>`<div class="grid grid--3">${f.map((S,Z)=>S.kind==="news"?`<div class="logs__news">${P(S.item,{compact:!0})}</div>`:H(S.item,{index:Z})).join("")}</div>`;n.innerHTML=`
          ${c.length?`<div class="logs__pinned"><span class="k-label">PINNED</span>${u(c)}</div>`:""}
          ${p.length?u(p):""}
          ${i.length>l.limit?`<div class="loadmore"><button class="btn" id="logsMore">\u52A0\u8F7D\u66F4\u591A \xB7 \u8FD8\u6709 ${i.length-l.limit} \u6761</button></div>`:""}`}let r=v("#logsCount");r&&(r.textContent=`${String(i.length).padStart(2,"0")} / ${String(A().length).padStart(2,"0")} ENTRIES`);let s=v("#logsUnread");s&&(s.textContent=String(y.sorted.filter(c=>!c.draft&&!x.has(c.id)).length).padStart(2,"0")),v("#logsMore")?.addEventListener("click",()=>{l.limit+=w,d(),b.reveal(a)}),b.reveal(n)},g;v("#logsSearch")?.addEventListener("input",i=>{clearTimeout(g),g=setTimeout(()=>{l.q=i.target.value.trim(),l.limit=w,d()},160)}),a.addEventListener("click",i=>{let m=i.target.closest("[data-kind]");if(m){l.kind=m.dataset.kind,E("[data-kind]",a).forEach(s=>s.classList.toggle("is-on",s===m)),l.limit=w,d();return}let n=i.target.closest("[data-cat]");if(n){l.cat=n.dataset.cat,E("[data-cat]",a).forEach(s=>s.classList.toggle("is-on",s===n)),l.limit=w,d();return}let r=i.target.closest("[data-tag]");if(r){let s=r.dataset.tag;l.tag=l.tag===s?"":s,E("[data-tag]",a).forEach(c=>c.classList.toggle("is-on",c.dataset.tag===l.tag)),l.limit=w,d();return}i.target.closest("#logsUnreadOnly")&&(l.onlyUnread=!l.onlyUnread,i.target.closest("#logsUnreadOnly").classList.toggle("is-on",l.onlyUnread),l.limit=w,d())}),d()}};export{At as default};
