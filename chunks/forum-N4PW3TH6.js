import{b as E}from"./chunk-WEV6AXMB.js";import{c as $,e as U}from"./chunk-IP3NPHJG.js";import{a as p}from"./chunk-DDIRHU7Q.js";import{a as l,d as r,g as f,i as I,n as S}from"./chunk-BUFEAOIA.js";import{q as T,r as o}from"./chunk-KSYHGNLY.js";import"./chunk-L72EZ7PG.js";var g=10,a={posts:[],total:0,limit:g,q:"",loading:!1,error:"",loaded:!1},b={id:"",post:null};function L(){a={posts:[],total:0,limit:g,q:"",loading:!1,error:"",loaded:!1}}async function M({append:t=!1}={}){if(a.loading)return;a.loading=!0;let e=t?a.posts.length:0,n=t?g:Math.max(a.limit,g),s=new URLSearchParams({limit:String(n),offset:String(e)});a.q&&s.set("q",a.q);let c=await o.api(`/forum/posts?${s.toString()}`);if(a.loading=!1,a.loaded=!0,!c.ok)return a.error=c.status===404?"\u670D\u52A1\u7AEF\u8FD8\u6CA1\u6709\u63D0\u4F9B\u8BBA\u575B\u63A5\u53E3\uFF08/api/forum/posts\uFF09":c.error||"\u8BBA\u575B\u6682\u65F6\u4E0D\u53EF\u7528",!1;let v=c.data?.posts||[];return a.posts=t?[...a.posts,...v]:v,a.total=Number(c.data?.total)||a.posts.length,a.error="",!0}async function A(t){if(b.id===t&&b.post)return b.post;let e=await o.api(`/forum/posts/${encodeURIComponent(t)}`);return!e.ok||!e.data?.post?null:(b={id:t,post:e.data.post},b.post)}function R(t){let e=t?.updatedAt&&t.updatedAt!==t.createdAt?t.updatedAt:t.createdAt;return S?S(e):String(e||"")}function q(t){return t?.author?.name||t?.author?.email||"\u533F\u540D"}function O(t,e=18){let n=t?.author?.picture;return n?`<img class="forum__avatar" src="${r(n)}" alt="" width="${e}" height="${e}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`:""}function x(t){return!o.loggedIn||!t?!1:o.isOwner?!0:!!t.author?.sub&&t.author.sub===o.user?.sub}function P(t="\u53D1\u5E16"){return o.enabled?o.loggedIn?"":`<p class="muted mono" style="font-size:var(--fs-xs)">
    \u9700\u8981\u767B\u5F55\u540E\u624D\u80FD${r(t)}\u3002<button class="btn btn--sm" id="forumLogin">${f.doc}\u767B\u5F55 / \u6CE8\u518C</button></p>`:`<p class="muted mono" style="font-size:var(--fs-xs)">\u672C\u7AD9\u672A\u542F\u7528\u8D26\u53F7\u529F\u80FD\uFF0C\u6682\u65F6\u4E0D\u80FD${r(t)}\u3002</p>`}function H(t,e){let n=(t.tags||[]).slice(0,4);return`<a class="forum__row" href="#/forum/${encodeURIComponent(t.id)}" data-post="${r(t.id)}">
    <span class="forum__no mono">${String(e+1).padStart(2,"0")}</span>
    <span class="forum__main">
      <b class="clamp-1">${r(t.title||"\uFF08\u65E0\u6807\u9898\uFF09")}</b>
      <span class="forum__meta mono">
        ${O(t)}${r(q(t))}${o.isOwner&&t.author?.role==="owner"?' <i class="forum__owner">\u7AD9\u957F</i>':""}
        \xB7 ${r(R(t))}
      </span>
    </span>
    ${n.length?`<span class="forum__tags">${n.map(s=>`<span class="tag tag--muted">${r(s)}</span>`).join("")}</span>`:""}
    <span class="forum__arrow mono" aria-hidden="true">\u2192</span>
  </a>`}function N(){let t=o.enabled&&o.loggedIn,e=a.posts.length<a.total;return`${$({title:"FORUM",sub:"\u8FD9\u91CC\u53EA\u653E\u7528\u6237\u521B\u4F5C\uFF08\u53D1\u5E16 / \u8BA8\u8BBA\uFF09\u3002\u7F51\u7AD9\u516C\u544A\u4E0E\u6587\u6848\u5728\u300C\u6587\u7AE0\u4E0E\u516C\u544A\u300D\u677F\u5757\uFF0C\u4EC5\u7AD9\u957F\u53EF\u6539\u3002",idx:"MODULE / 08",meta:[{label:"POSTS",value:String(a.total).padStart(2,"0"),id:"forumTotal"},{label:"ACCOUNT",value:o.enabled?o.loggedIn?r(o.user?.name||"\u5DF2\u767B\u5F55"):"\u672A\u767B\u5F55":"\u672A\u542F\u7528"}],actions:t?`<button class="btn btn--signal" id="forumNew">${f.edit}\u5199\u65B0\u5E16</button>`:""})}

  ${o.enabled?"":`<div class="forum__banner mono">
    <b>\u672C\u7AD9\u672A\u542F\u7528\u8D26\u53F7\u529F\u80FD</b>
    <span>\u53EF\u4EE5\u6D4F\u89C8\u5E16\u5B50\uFF1B\u53D1\u5E16 / \u7F16\u8F91\u9700\u8981\u670D\u52A1\u7AEF\u914D\u7F6E Auth0 \u540E\u624D\u53EF\u7528\u3002</span>
  </div>`}
  ${o.enabled&&!o.loggedIn?`<div class="forum__banner mono">
    <b>\u8FD8\u6CA1\u6709\u767B\u5F55</b>
    <span>\u6D4F\u89C8\u4E0D\u9700\u8981\u767B\u5F55\uFF1B\u53D1\u5E16\u3001\u7F16\u8F91\u81EA\u5DF1\u7684\u5E16\u5B50\u9700\u8981\u767B\u5F55\u3002</span>
  </div>`:""}
  ${o.loggedIn&&o.notice&&/过期/.test(o.notice)?`<div class="forum__banner forum__banner--warn mono">
    <b>${r(o.notice)}</b>
  </div>`:""}

  <div class="forum__tools">
    <label class="forum__search">
      <span class="mono faint">SEARCH</span>
      <input id="forumQ" type="search" placeholder="\u641C\u7D22\u6807\u9898 / \u6B63\u6587 / \u6807\u7B7E\u2026" value="${r(a.q)}" autocomplete="off" spellcheck="false" />
    </label>
    <button class="btn btn--sm" id="forumSearch">${f.search}\u641C\u7D22</button>
    ${a.q?'<button class="btn btn--sm" id="forumClear">\u6E05\u7A7A</button>':""}
    <span class="grow"></span>
    ${P("\u53D1\u5E16")}
  </div>

  ${a.error?`<div class="forum__banner forum__banner--warn mono"><b>${r(a.error)}</b></div>`:""}

  ${a.posts.length?`<div class="forum__list">${a.posts.map(H).join("")}</div>`:a.loaded&&!a.error?U({title:a.q?"\u6CA1\u6709\u5339\u914D\u7684\u5E16\u5B50":"\u8FD8\u6CA1\u6709\u4EBA\u53D1\u5E16",desc:a.q?"\u6362\u4E2A\u5173\u952E\u8BCD\u8BD5\u8BD5\u3002":"\u767B\u5F55\u540E\u53EF\u4EE5\u5728\u8FD9\u91CC\u53D1\u7B2C\u4E00\u5E16\u3002",icon:"\u25A4"}):`<div class="forum__list forum__list--skeleton">${Array.from({length:3},()=>'<div class="forum__row is-ghost"></div>').join("")}</div>`}

  ${e?`<div class="forum__more"><button class="btn btn--sm" id="forumMore">${f.arrow}\u52A0\u8F7D\u66F4\u591A\uFF08${a.posts.length} / ${a.total}\uFF09</button></div>`:""}`}function j(t){if(!t)return`${$({title:"\u5E16\u5B50\u4E0D\u5B58\u5728",sub:"\u5B83\u53EF\u80FD\u5DF2\u88AB\u4F5C\u8005\u6216\u7AD9\u957F\u5220\u9664\u3002",idx:"MODULE / 08"})}
      <p><a class="btn btn--sm" href="#/forum" data-nav>\u2190 \u56DE\u5230\u8BBA\u575B\u5217\u8868</a></p>`;let e=x(t),n=t.tags||[];return`${$({title:t.title||"\uFF08\u65E0\u6807\u9898\uFF09",sub:"",idx:"FORUM / POST",meta:[{label:"AUTHOR",value:q(t)},{label:"UPDATED",value:R(t)},{label:"TAGS",value:String(n.length).padStart(2,"0")}],actions:`<a class="btn btn--sm" href="#/forum" data-nav>\u2190 \u8BBA\u575B\u5217\u8868</a>
      ${e?`<button class="btn btn--sm" id="forumEdit">${f.edit}\u7F16\u8F91</button>
      <button class="btn btn--sm" id="forumDelete">${f.trash}\u5220\u9664</button>`:""}`})}

  <article class="forum__post">
    <div class="forum__postmeta mono">
      <span class="forum__author">${O(t,22)}<span>${r(q(t))}</span></span>
      ${t.author?.role==="owner"?'<i class="forum__owner">\u7AD9\u957F</i>':""}
      <span>\xB7</span>
      <span>${r(R(t))}</span>
      ${t.author?.email?`<span>\xB7</span><span class="faint">${r(t.author.email)}</span>`:""}
    </div>
    ${n.length?`<div class="forum__posttags">${n.map(s=>`<span class="tag tag--muted">${r(s)}</span>`).join("")}</div>`:""}
    <div class="prose">${I(t.body||"").html}</div>
    ${e?"":`<p class="muted mono" style="font-size:var(--fs-xs);margin-top:var(--sp-5)">
      \u53EA\u6709\u4F5C\u8005\u672C\u4EBA\u6216\u7AD9\u957F\u53EF\u4EE5\u4FEE\u6539\u8FD9\u7BC7\u5185\u5BB9\u3002</p>`}
  </article>`}function k({post:t=null,error:e=""}={}){let n=!!t;return`${$({title:n?"\u7F16\u8F91\u5E16\u5B50":"\u5199\u65B0\u5E16",sub:n?"\u53EA\u6709\u4F5C\u8005\u672C\u4EBA\u6216\u7AD9\u957F\u80FD\u4FDD\u5B58\u4FEE\u6539\u3002":"\u53D1\u5E16\u9700\u8981\u767B\u5F55\u3002\u6807\u9898\u5FC5\u586B\uFF0C\u6B63\u6587\u652F\u6301 Markdown\u3002",idx:"FORUM / WRITE",actions:`<a class="btn btn--sm" href="${n?`#/forum/${encodeURIComponent(t.id)}`:"#/forum"}" data-nav>\u53D6\u6D88</a>`})}
  ${e?`<div class="forum__banner forum__banner--warn mono"><b>${r(e)}</b></div>`:""}
  <form class="forum__form" id="forumForm">
    <label class="field">
      <span class="field__label k-label">\u6807\u9898</span>
      <input id="fTitle" type="text" maxlength="120" required value="${r(t?.title||"")}" placeholder="\u4E00\u53E5\u8BDD\u8BF4\u6E05\u4E3B\u9898" />
    </label>
    <label class="field">
      <span class="field__label k-label">\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF0C\u53EF\u7A7A\uFF09</span>
      <input id="fTags" type="text" maxlength="200" value="${r((t?.tags||[]).join(", "))}" placeholder="\u968F\u7B14, \u6C42\u52A9, \u5206\u4EAB" />
    </label>
    <label class="field">
      <span class="field__label k-label">\u6B63\u6587\uFF08Markdown\uFF09</span>
      <textarea id="fBody" rows="14" placeholder="\u652F\u6301 **\u7C97\u4F53**\u3001\u5217\u8868\u3001\u4EE3\u7801\u5757\u3001> [!NOTE] \u63D0\u793A\u5757\u2026">${r(t?.body||"")}</textarea>
    </label>
    <div class="forum__formacts">
      <button class="btn btn--signal" id="forumSubmit" type="submit">${f.dl}${n?"\u4FDD\u5B58\u4FEE\u6539":"\u53D1\u5E03"}</button>
      <span class="muted mono" style="font-size:var(--fs-2xs)">\u53D1\u5E03\u540E\u4F5C\u8005\u672C\u4EBA\uFF08\u6216\u7AD9\u957F\uFF09\u53EF\u4EE5\u518D\u6B21\u7F16\u8F91\u6216\u5220\u9664\u3002</span>
    </div>
  </form>`}var K={id:"forum",title:"\u8BBA\u575B",async render(t){let e=t?.params?.[0]||"",n=t?.query||{};if(n.write)return k({});if(n.edit){let s=await A(n.edit);return s?x(s)?k({post:s}):`${$({title:"\u65E0\u6743\u7F16\u8F91",sub:"\u53EA\u6709\u4F5C\u8005\u672C\u4EBA\u6216\u7AD9\u957F\u53EF\u4EE5\u4FEE\u6539\u8FD9\u7BC7\u5185\u5BB9\u3002",idx:"FORUM / WRITE"})}
          <p><a class="btn btn--sm" href="#/forum/${encodeURIComponent(s.id)}" data-nav>\u2190 \u56DE\u5230\u8FD9\u7BC7\u5E16\u5B50</a></p>`:k({error:"\u8FD9\u7BC7\u5E16\u5B50\u4E0D\u5B58\u5728\u6216\u5DF2\u88AB\u5220\u9664"})}return e?j(await A(e)):(a.q=n.q||a.q||"",a.limit=g,await M(),N())},mount(t,e){let n=[],s=(i,u,m)=>{i?.addEventListener(u,m),n.push(()=>i?.removeEventListener(u,m))};s(l("#forumLogin",t),"click",()=>o.login()),s(l("#forumNew",t),"click",()=>{location.hash="#/forum?write=1"});let c=()=>{let i=l("#forumQ",t)?.value.trim()||"";location.hash=i?`#/forum?q=${encodeURIComponent(i)}`:"#/forum"};s(l("#forumSearch",t),"click",c),s(l("#forumQ",t),"keydown",i=>{i.key==="Enter"&&(i.preventDefault(),c())}),s(l("#forumClear",t),"click",()=>{a.q="",location.hash="#/forum"}),s(l("#forumMore",t),"click",async i=>{let u=i.currentTarget;if(u.disabled=!0,u.textContent="\u52A0\u8F7D\u4E2D\u2026",!await M({append:!0})){u.disabled=!1,u.textContent="\u52A0\u8F7D\u5931\u8D25\uFF0C\u70B9\u51FB\u91CD\u8BD5";return}let d=l(".forum__list",t);d&&(d.innerHTML=a.posts.map(H).join(""));let w=l(".forum__more",t);a.posts.length>=a.total?w?.remove():(u.disabled=!1,u.textContent=`\u52A0\u8F7D\u66F4\u591A\uFF08${a.posts.length} / ${a.total}\uFF09`);let h=l("#forumTotal",t);h&&(h.textContent=String(a.total).padStart(2,"0"))}),s(l("#forumEdit",t),"click",()=>{let i=e?.params?.[0];i&&(location.hash=`#/forum?edit=${encodeURIComponent(i)}`)}),s(l("#forumDelete",t),"click",async i=>{let u=e?.params?.[0];if(!u||!confirm("\u5220\u9664\u8FD9\u7BC7\u5E16\u5B50\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002"))return;let m=i.currentTarget;m.disabled=!0;let d=await o.api(`/forum/posts/${encodeURIComponent(u)}`,{method:"DELETE"});if(!d.ok){m.disabled=!1,p.show(d.error||"\u5220\u9664\u5931\u8D25","err");return}b={id:"",post:null},p.ok("\u5DF2\u5220\u9664"),L(),location.hash="#/forum"});let v=l("#forumForm",t);s(v,"submit",async i=>{i.preventDefault();let u=l("#forumSubmit",t),m=l("#fTitle",t).value.trim(),d=l("#fBody",t).value,w=l("#fTags",t).value.split(/[,，]/).map(D=>D.trim()).filter(Boolean).slice(0,6);if(!m){p.show("\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A","err");return}if(!d.trim()){p.show("\u6B63\u6587\u4E0D\u80FD\u4E3A\u7A7A","err");return}let h=e?.query?.edit;u.disabled=!0;let y=h?await o.api(`/forum/posts/${encodeURIComponent(h)}`,{method:"PATCH",body:{title:m,body:d,tags:w}}):await o.api("/forum/posts",{method:"POST",body:{title:m,body:d,tags:w}});if(u.disabled=!1,!y.ok){p.show(y.error||"\u4FDD\u5B58\u5931\u8D25","err");return}let _=y.data?.post;b=_?{id:_.id,post:_}:{id:"",post:null},p.ok(h?"\u5DF2\u4FDD\u5B58\u4FEE\u6539":"\u5DF2\u53D1\u5E03"),L(),location.hash=_?.id?`#/forum/${encodeURIComponent(_.id)}`:"#/forum"});let C=()=>{!e?.params?.[0]&&!e?.query?.write&&!e?.query?.edit&&E.resolve()};return n.push(T.on("auth:user",C)),n.push(T.on("auth:ready",C)),()=>n.forEach(i=>{try{i()}catch{}})}};export{K as default};
