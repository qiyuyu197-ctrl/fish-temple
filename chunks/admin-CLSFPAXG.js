import{a as N}from"./chunk-UWG3LF7U.js";import{a as X}from"./chunk-E3HJDYPK.js";import{b as z}from"./chunk-WEV6AXMB.js";import{c as U,e as Q}from"./chunk-IP3NPHJG.js";import{a as r,b as H,c as M}from"./chunk-DDIRHU7Q.js";import{a as s,b as T,d as c,g,h as Y,i as J,j as V,k as D,l as G,m as q,n as K,o as L,p as O,q as P,r as w,t as x}from"./chunk-BUFEAOIA.js";import{a as I,k as A,l as j,q as S,r as u}from"./chunk-KSYHGNLY.js";import"./chunk-L72EZ7PG.js";var p={posts:{key:"posts",label:"\u6587\u7AE0",store:()=>L,categories:A.posts,icon:g.doc,routePrefix:"#/logs/",fields:["title","category","tags","cover","date","author","summary","content"]},news:{key:"news",label:"\u516C\u544A",store:()=>O,categories:A.news,icon:g.bell,routePrefix:"#/logs/",fields:["title","category","level","tags","date","summary","content"]}},et={posts:`## \u5C0F\u8282\u6807\u9898

\u6B63\u6587\u6BB5\u843D\u3002\u652F\u6301 **\u7C97\u4F53**\u3001*\u659C\u4F53*\u3001\`\u884C\u5185\u4EE3\u7801\`\u3001[\u94FE\u63A5](https://example.com) \u4E0E ==\u9AD8\u4EAE==\u3002

> [!NOTE]
> \u63D0\u793A\u5757\u4F1A\u6E32\u67D3\u6210\u5E26\u6807\u7B7E\u7684\u5F3A\u8C03\u6846\u3002

### \u4E09\u7EA7\u6807\u9898

- \u8981\u70B9\u4E00
- \u8981\u70B9\u4E8C

| \u53C2\u6570 | \u8BF4\u660E |
| --- | --- |
| \`foo\` | \u793A\u4F8B |

\`\`\`js
console.log('code block with language tag');
\`\`\`
`,news:`## \u53D8\u66F4\u5185\u5BB9

- \u65B0\u589E\uFF1A\u968F\u673A\u63D2\u753B\u5386\u53F2\u8BB0\u5F55
- \u4F18\u5316\uFF1A\u79FB\u52A8\u7AEF\u64AD\u653E\u6761\u5E03\u5C40
- \u4FEE\u590D\uFF1A\`file://\` \u4E0B\u5185\u5BB9\u65E0\u6CD5\u8F7D\u5165

> [!WARN]
> \u672C\u6B21\u66F4\u65B0\u4F1A\u91CD\u7F6E\u672C\u5730\u793A\u4F8B\u6570\u636E\uFF0C\u5982\u9700\u4FDD\u7559\u8BF7\u5148\u5BFC\u51FA\u3002

\u7EF4\u62A4\u65F6\u95F4\uFF1A**02:00 - 02:30 UTC+8**
`},a="posts",e=null,k=!1,C="";function Z(l){let h=new Date().toISOString();return{id:G(l==="news"?"news":"post"),title:"",category:p[l].categories[0],tags:[],cover:"",summary:"",content:et[l],date:h,author:I.author,pinned:!1,draft:!1,level:0,local:!0}}function st(l){let h=p[l],i=e,o=l==="news";return`
  <div class="section-block">
    <div class="section-block__head">
      <span>${p[l].store().get(i.id)?"\u7F16\u8F91\u5185\u5BB9":"\u65B0\u5EFA\u5185\u5BB9"}</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">${c(i.id)}</span>
    </div>
    <div class="section-block__body">
      <div class="field">
        <div class="field__label"><span class="k-label k-label--ink">\u6807\u9898 *</span><span class="field__hint">TITLE</span></div>
        <input type="text" id="fTitle" value="${c(i.title)}" placeholder="${o?"\u4F8B\u5982\uFF1Av1.2.0 \u66F4\u65B0\u516C\u544A":"\u4F8B\u5982\uFF1A\u7528\u96F6\u4F9D\u8D56\u6784\u5EFA\u9759\u6001\u7AD9\u70B9"}" />
      </div>

      <div class="field__grid">
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">\u5206\u7C7B</span><span class="field__hint">CATEGORY</span></div>
          <select id="fCategory">${h.categories.map(_=>`<option ${_===i.category?"selected":""}>${c(_)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">\u65E5\u671F</span><span class="field__hint">DATE</span></div>
          <input type="text" id="fDate" value="${c(String(i.date).slice(0,10))}" placeholder="YYYY-MM-DD" />
        </div>
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">\u6807\u7B7E</span><span class="field__hint">\u9017\u53F7\u5206\u9694</span></div>
          <input type="text" id="fTags" value="${c((i.tags||[]).join(", "))}" placeholder="\u524D\u7AEF, \u8BBE\u8BA1" />
        </div>
        ${o?`<div class="field">
          <div class="field__label"><span class="k-label k-label--ink">\u91CD\u8981\u7A0B\u5EA6</span><span class="field__hint">LEVEL</span></div>
          <select id="fLevel">
            <option value="0" ${i.level===0?"selected":""}>\u4E00\u822C</option>
            <option value="1" ${i.level===1?"selected":""}>\u91CD\u8981</option>
            <option value="2" ${i.level===2?"selected":""}>\u7D27\u6025</option>
          </select>
        </div>`:`<div class="field">
          <div class="field__label"><span class="k-label k-label--ink">\u4F5C\u8005</span><span class="field__hint">AUTHOR</span></div>
          <input type="text" id="fAuthor" value="${c(i.author||I.author)}" />
        </div>`}
      </div>

      ${o?"":`<div class="field">
        <div class="field__label"><span class="k-label k-label--ink">\u5C01\u9762\u56FE URL</span><span class="field__hint">\u53EF\u9009</span></div>
        <input type="url" id="fCover" value="${c(i.cover||"")}" placeholder="https://\u2026 \u6216 assets/img/cover.jpg" />
      </div>`}

      <div class="field">
        <div class="field__label"><span class="k-label k-label--ink">\u6458\u8981</span><span class="field__hint">\u7559\u7A7A\u81EA\u52A8\u622A\u53D6\u6B63\u6587</span></div>
        <input type="text" id="fSummary" value="${c(i.summary||"")}" placeholder="\u4E00\u53E5\u8BDD\u6982\u62EC" />
      </div>

      <div class="field">
        <div class="field__label">
          <span class="k-label k-label--ink">\u6B63\u6587 \xB7 Markdown</span>
          <span class="field__hint" id="mdHint">0 \u5B57 \xB7 1 \u5206\u949F</span>
        </div>
        <textarea id="fContent" spellcheck="false" placeholder="\u5728\u8FD9\u91CC\u5199 Markdown\u2026">${c(i.content)}</textarea>
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
        <label class="field field--row" style="cursor:pointer">
          <input type="checkbox" id="fPinned" ${i.pinned?"checked":""} style="width:auto" />
          <span class="k-label k-label--ink">\u7F6E\u9876</span>
        </label>
        <label class="field field--row" style="cursor:pointer">
          <input type="checkbox" id="fDraft" ${i.draft?"checked":""} style="width:auto" />
          <span class="k-label k-label--ink">\u5B58\u4E3A\u8349\u7A3F\uFF08\u524D\u53F0\u4E0D\u53EF\u89C1\uFF09</span>
        </label>
      </div>

      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        <button class="btn btn--signal" id="btnSave">${g.dl}\u53D1\u5E03 / \u4FDD\u5B58</button>
        <button class="btn" id="btnSaveLocal" title="\u4EC5\u4FDD\u5B58\u5230\u6D4F\u89C8\u5668\uFF0C\u4E0D\u5199\u5165\u9879\u76EE\u6587\u4EF6">\u4EC5\u4FDD\u5B58\u5230\u672C\u5730</button>
        <button class="btn" id="btnExportMd">\u5BFC\u51FA Markdown</button>
        <button class="btn" id="btnExportJson">\u5BFC\u51FA JSON</button>
        <button class="btn btn--danger" id="btnReset">\u91CD\u7F6E\u8868\u5355</button>
      </div>
      <p class="faint mono" style="font-size:var(--fs-2xs);margin:0">
        \u53D1\u5E03\u901A\u8DEF\uFF1A<span id="serverState" class="status-dot ${k?"status-dot--on":"status-dot--off"}">${k?"SERVER \u5728\u7EBF \xB7 \u5C06\u5199\u5165 data/":"STATIC \u6A21\u5F0F \xB7 \u4EC5\u672C\u5730\u5B58\u50A8"}</span>
        ${k?"":" \xB7 \u8FD0\u884C <b>node server.mjs</b> \u540E\u53EF\u76F4\u63A5\u843D\u76D8\u5230\u9879\u76EE data/ \u76EE\u5F55"}
      </p>
    </div>
  </div>`}function at(){let{html:l,toc:h}=J(e.content||""),i=D(e.content||"");return`
  <div class="section-block">
    <div class="section-block__head">
      <span>\u5B9E\u65F6\u9884\u89C8</span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">${i.chars} CHARS \xB7 ${i.minutes} MIN \xB7 ${h.length} SECTIONS</span>
    </div>
    <div class="preview-pane">
      <div class="post__kicker" style="margin-bottom:12px">
        <span class="tag tag--signal">${c(e.category)}</span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">${c(String(e.date).slice(0,10))}</span>
      </div>
      <h2 class="display" style="font-size:1.7rem;margin-bottom:12px">${c(e.title||"\uFF08\u672A\u586B\u5199\u6807\u9898\uFF09")}</h2>
      ${e.summary?`<p class="muted">${c(e.summary)}</p>`:""}
      <div class="prose" id="previewProse">${l||'<p class="faint">\uFF08\u6B63\u6587\u4E3A\u7A7A\uFF09</p>'}</div>
    </div>
  </div>`}function tt(l){let i=p[l].store().sorted;return i.length?`
  <div class="datalist">
    ${i.map(o=>`
      <div class="datalist__row">
        <div class="datalist__main">
          <span class="datalist__title">${o.pinned?"\u{1F4CC} ":""}${c(o.title)}</span>
          <span class="datalist__sub">
            ${q(o.date)} \xB7 ${c(o.category)}
            ${o.draft?' \xB7 <span style="color:var(--signal-deep)">\u8349\u7A3F</span>':""}
            ${o.local?" \xB7 \u672C\u5730":" \xB7 \u5185\u7F6E"}
            ${o.updatedAt?` \xB7 \u6539\u4E8E ${K(o.updatedAt)}`:""}
          </span>
        </div>
        <div class="datalist__acts">
          <a class="iconact" title="\u67E5\u770B" href="${p[l].routePrefix}${c(o.id)}" data-nav>${g.ext}</a>
          <button class="iconact" title="\u7F6E\u9876/\u53D6\u6D88\u7F6E\u9876" data-pin="${c(o.id)}">\u2605</button>
          <button class="iconact" title="\u7F16\u8F91" data-edit="${c(o.id)}">${g.edit}</button>
          <button class="iconact" title="\u590D\u5236 JSON" data-copy="${c(o.id)}">${g.copy}</button>
          <button class="iconact iconact--danger" title="\u5220\u9664" data-del="${c(o.id)}">${g.trash}</button>
        </div>
      </div>`).join("")}
  </div>`:Q({title:`\u8FD8\u6CA1\u6709${p[l].label}`,desc:"\u7528\u5DE6\u4FA7\u8868\u5355\u521B\u5EFA\u7B2C\u4E00\u6761\u5185\u5BB9\u3002",icon:"\u25A4"})}function nt(){return`
  <div class="grid grid--2" style="gap:var(--sp-4)">
    <div class="section-block">
      <div class="section-block__head"><span>\u6570\u636E\u5BFC\u5165</span><span class="mono faint" style="font-size:var(--fs-2xs)">JSON / MD</span></div>
      <div class="section-block__body">
        <div class="field">
          <div class="field__label"><span class="k-label k-label--ink">\u7C98\u8D34 JSON \u6570\u7EC4\u6216 Markdown\uFF08\u542B frontmatter\uFF09</span></div>
          <textarea id="importText" style="min-height:150px" placeholder='[{"title":"\u6807\u9898","content":"\u6B63\u6587"}]  \u6216  ---
title: \u6807\u9898
---
\u6B63\u6587'></textarea>
        </div>
        <div class="field__grid">
          <div class="field">
            <div class="field__label"><span class="k-label k-label--ink">\u5BFC\u5165\u5230</span></div>
            <select id="importTarget">
              <option value="posts">\u6587\u7AE0</option>
              <option value="news">\u516C\u544A</option>
            </select>
          </div>
          <div class="field">
            <div class="field__label"><span class="k-label k-label--ink">\u6A21\u5F0F</span></div>
            <select id="importMode">
              <option value="merge">\u5408\u5E76\uFF08\u540C id \u8986\u76D6\uFF09</option>
              <option value="replace">\u66FF\u6362\u5168\u90E8</option>
            </select>
          </div>
        </div>
        <button class="btn btn--block" id="btnImport">\u6267\u884C\u5BFC\u5165</button>
      </div>
    </div>

    <div class="section-block">
      <div class="section-block__head"><span>\u6570\u636E\u5BFC\u51FA / \u7EF4\u62A4</span><span class="mono faint" style="font-size:var(--fs-2xs)">IO</span></div>
      <div class="section-block__body">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn--sm" data-export="posts">\u5BFC\u51FA posts.json</button>
          <button class="btn btn--sm" data-export="news">\u5BFC\u51FA news.json</button>
          <button class="btn btn--sm" data-export-md="posts">\u6587\u7AE0\u8F6C Markdown</button>
          <button class="btn btn--sm" data-export-md="news">\u516C\u544A\u8F6C Markdown</button>
          <button class="btn btn--sm" id="btnCopyAll">\u590D\u5236\u5168\u90E8 JSON</button>
          <button class="btn btn--sm" id="btnTree">\u67E5\u770B\u9879\u76EE\u6587\u4EF6\u6811</button>
        </div>
        <hr />
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px">
          <button class="btn btn--sm" id="btnMarkRead">\u6807\u8BB0\u5168\u90E8\u5DF2\u8BFB</button>
          <button class="btn btn--sm" id="btnClearRead">\u6E05\u7A7A\u5DF2\u8BFB\u8BB0\u5F55</button>
          <button class="btn btn--sm" id="btnResetSettings">\u91CD\u7F6E\u754C\u9762\u8BBE\u7F6E</button>
          <button class="btn btn--sm btn--danger" id="btnResetSeed">\u6062\u590D\u5185\u7F6E\u793A\u4F8B\u5185\u5BB9</button>
        </div>
        <p class="faint mono" style="font-size:var(--fs-2xs);margin:0">
          \u672C\u5730\u952E\u540D\u524D\u7F00\uFF1A<b>${c(j)}</b> \xB7 \u6E05\u9664\u6D4F\u89C8\u5668\u6570\u636E\u4F1A\u4E22\u5931\u672C\u5730\u5185\u5BB9\uFF0C\u8BF7\u5B9A\u671F\u5BFC\u51FA\u3002
        </p>
      </div>
    </div>
  </div>

  <div class="section-block" id="treeBlock" hidden>
    <div class="section-block__head"><span>\u9879\u76EE\u6587\u4EF6\u6811</span><span class="mono faint" style="font-size:var(--fs-2xs)">server.mjs</span></div>
    <div class="section-block__body"><div class="mono" style="font-size:var(--fs-xs);white-space:pre-wrap" id="treeOut">\u2014</div></div>
  </div>`}function R(){return`${u.enabled?1:0}:${u.state}:${u.user?.sub||""}:${u.user?.role||""}`}var _t={id:"admin",title:"\u53D1\u5E03\u63A7\u5236\u53F0",render(){C=R();let l=new URLSearchParams(location.hash.split("?")[1]||"");if(a=l.get("tab")||a,p[a]||(a="posts"),u.enabled&&!u.isOwner)return C=R(),`
      <section class="admin">
        ${U({title:"CONSOLE",sub:"\u8FD9\u91CC\u53EA\u6539\u7AD9\u70B9\u7684\u6587\u7AE0\u4E0E\u516C\u544A\uFF0C\u56E0\u6B64\u53EA\u6709\u7AD9\u957F\u80FD\u8FDB\u3002\u7528\u6237\u5185\u5BB9\u8BF7\u53D1\u5230\u300C\u8BBA\u575B\u300D\u3002",idx:"MODULE / 05",meta:[{label:"ACCOUNT",value:u.loggedIn?"\u5DF2\u767B\u5F55":"\u672A\u767B\u5F55"},{label:"ROLE",value:u.isOwner?"OWNER":"MEMBER"}],actions:u.loggedIn?"":`<button class="btn btn--sm" id="adminLogin">${g.user||g.doc}\u767B\u5F55</button>`})}
        <div class="panel" style="margin-top:var(--sp-5)">
          <div class="panel__head"><span class="panel__title">\u6743\u9650\u4E0D\u8DB3</span></div>
          <div class="panel__body" style="display:flex;flex-direction:column;gap:var(--sp-3)">
            <p class="muted">
              ${u.loggedIn?`\u5F53\u524D\u767B\u5F55\u7684\u662F <b>${c(u.user?.name||u.user?.email||"\u666E\u901A\u7528\u6237")}</b>\uFF0C\u4E0D\u662F\u7AD9\u957F\uFF0C\u56E0\u6B64\u4E0D\u80FD\u4FEE\u6539\u516C\u544A\u4E0E\u7F51\u7AD9\u6587\u6848\u3002`:"\u4F60\u8FD8\u6CA1\u6709\u767B\u5F55\u3002\u8FD9\u4E2A\u677F\u5757\u9700\u8981<b>\u7AD9\u957F</b>\u8EAB\u4EFD\u3002"}
            </p>
            <p class="muted">
              \u8981\u53D1\u81EA\u5DF1\u7684\u5185\u5BB9\uFF0C\u8BF7\u53BB <a href="#/forum" data-nav>\u8BBA\u575B</a> \u2014\u2014 \u767B\u5F55\u540E\u5C31\u80FD\u53D1\u5E16\uFF0C
              \u800C\u4E14\u53EA\u6709\u4F5C\u8005\u672C\u4EBA\uFF08\u6216\u7AD9\u957F\uFF09\u80FD\u4FEE\u6539\u3002
            </p>
            <div class="hero__cta" style="margin:0">
              <a class="btn btn--sm" href="#/forum" data-nav>${g.doc}\u53BB\u8BBA\u575B</a>
              ${u.loggedIn?"":`<button class="btn btn--sm" id="adminLogin2">${g.user||g.doc}\u767B\u5F55</button>`}
            </div>
          </div>
        </div>
      </section>`;let h=l.get("edit"),i=p[a].store();if(h&&i.get(h)){let _=i.get(h);e={..._,tags:[..._.tags||[]]}}else l.get("new")||!e||e.__kind!==a?e=Z(a):e={...e,tags:[...e.tags||[]]};e.__kind=a;let o={posts:L.all.length,news:O.all.length};return`
    <section class="admin">
      ${U({title:"CONSOLE",sub:"\u5728\u6D4F\u89C8\u5668\u91CC\u64B0\u5199\u3001\u7F16\u8F91\u3001\u5BFC\u51FA\u5185\u5BB9\u3002\u8FD0\u884C node server.mjs \u540E\uFF0C\u4FDD\u5B58\u4F1A\u76F4\u63A5\u5199\u5165\u9879\u76EE\u7684 data/ \u76EE\u5F55\uFF1B\u7EAF\u9759\u6001\u6258\u7BA1\u65F6\u5185\u5BB9\u4FDD\u5B58\u5728\u672C\u5730\u6D4F\u89C8\u5668\u3002",idx:"MODULE / 05",meta:[{label:"SERVER",value:`<span id="serverMeta">${k?"ONLINE":"STATIC"}</span>`,html:!0},{label:"POSTS",value:String(o.posts).padStart(2,"0")},{label:"NOTICES",value:String(o.news).padStart(2,"0")}],actions:`<button class="btn btn--sm" id="checkServer">${g.refresh}\u68C0\u6D4B\u670D\u52A1\u5668</button>`})}

      <div class="admin__grid">
        <aside class="admin__side">
          <div class="panel">
            <div class="panel__head"><span class="panel__title">\u5185\u5BB9\u7C7B\u578B</span></div>
            <div class="admin__tabs" style="border:0">
              <button class="admin__tab${a==="posts"?" is-on":""}" data-tab="posts">\u6587\u7AE0 <span class="admin__count">${o.posts}</span></button>
              <button class="admin__tab${a==="news"?" is-on":""}" data-tab="news">\u516C\u544A <span class="admin__count">${o.news}</span></button>
              <button class="admin__tab${a==="tools"?" is-on":""}" data-tab="tools">\u6570\u636E <span class="admin__count">IO</span></button>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><span class="panel__title">\u5FEB\u6377\u64CD\u4F5C</span></div>
            <div class="panel__body grid" style="gap:6px">
              <button class="btn btn--sm btn--block" id="newItem">+ \u65B0\u5EFA${p[a==="tools"?"posts":a].label}</button>
              <a class="btn btn--sm btn--block" href="#/logs" data-nav>\u67E5\u770B\u524D\u53F0\u6587\u7AE0\u9875</a>
              <a class="btn btn--sm btn--block" href="#/logs" data-nav>\u67E5\u770B\u524D\u53F0\u516C\u544A\u9875</a>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><span class="panel__title">\u754C\u9762</span></div>
            <div class="panel__body grid" style="gap:8px">
              <div class="field">
                <div class="field__label"><span class="k-label">\u4E3B\u9898</span></div>
                <select id="themeSelect">${N.list.map(_=>`<option value="${_.id}" ${_.id===N.current?"selected":""}>${c(_.label)} \xB7 ${c(_.hint)}</option>`).join("")}</select>
              </div>
              <div class="field">
                <div class="field__label"><span class="k-label">\u5BC6\u5EA6</span></div>
                <select id="densitySelect">
                  <option value="normal" ${w.get("density")==="normal"?"selected":""}>\u6807\u51C6</option>
                  <option value="compact" ${w.get("density")==="compact"?"selected":""}>\u7D27\u51D1</option>
                </select>
              </div>
              <label class="field field--row" style="cursor:pointer">
                <input type="checkbox" id="reduceMotion" ${w.get("reduceMotion")?"checked":""} style="width:auto" />
                <span class="k-label">\u5173\u95ED\u52A8\u6548</span>
              </label>
            </div>
          </div>
        </aside>

        <div class="admin__pane">
          ${a==="tools"?nt():`${st(a)}
               ${at()}
               <div class="section-block">
                 <div class="section-block__head">
                   <span>\u5DF2\u6709${p[a].label}</span>
                   <span class="mono faint" style="font-size:var(--fs-2xs)">${p[a].store().all.length} ENTRIES</span>
                 </div>
                 <div class="section-block__body" style="padding:0">${tt(a)}</div>
               </div>`}
        </div>
      </div>
    </section>`},async mount(l){let h=S.on("auth:user",()=>{R()!==C&&z.resolve()}),i=S.on("auth:ready",()=>{R()!==C&&z.resolve()}),o=()=>{h(),i()};if(!s(".admin__grid",l))return s("#adminLogin",l)?.addEventListener("click",()=>u.login()),s("#adminLogin2",l)?.addEventListener("click",()=>u.login()),o;k=await x.probe();let _=()=>{let t=s("#serverState");t&&(t.className=`status-dot ${k?"status-dot--on":"status-dot--off"}`,t.textContent=k?"SERVER \u5728\u7EBF \xB7 \u5C06\u5199\u5165 data/":"STATIC \u6A21\u5F0F \xB7 \u4EC5\u672C\u5730\u5B58\u50A8");let n=s("#serverMeta");n&&(n.textContent=k?"ONLINE":"STATIC")};_();let B=a!=="tools",E=()=>{if(!B)return;e.title=s("#fTitle")?.value.trim()??"",e.category=s("#fCategory")?.value??e.category,e.summary=s("#fSummary")?.value.trim()??"",e.content=s("#fContent")?.value??"",e.cover=s("#fCover")?.value.trim()??e.cover,e.author=s("#fAuthor")?.value.trim()??e.author,e.pinned=!!s("#fPinned")?.checked,e.draft=!!s("#fDraft")?.checked,e.level=Number(s("#fLevel")?.value||e.level||0),e.tags=(s("#fTags")?.value||"").split(/[,，]/).map(m=>m.trim()).filter(Boolean);let t=s("#fDate")?.value?.trim();if(t){let m=new Date(t.length<=10?`${t}T09:00:00`:t);Number.isNaN(m.getTime())||(e.date=m.toISOString())}let n=D(e.content),v=s("#mdHint");v&&(v.textContent=`${n.chars} \u5B57 \xB7 ${n.minutes} \u5206\u949F`);let b=s("#previewProse");b&&(b.innerHTML=J(e.content).html||'<p class="faint">\uFF08\u6B63\u6587\u4E3A\u7A7A\uFF09</p>');let f=s(".preview-pane h2");f&&(f.textContent=e.title||"\uFF08\u672A\u586B\u5199\u6807\u9898\uFF09");let d=s(".preview-pane .tag");d&&(d.textContent=e.category)};if(B){let t;l.addEventListener("input",()=>{clearTimeout(t),t=setTimeout(E,120)}),l.addEventListener("change",E)}let F=async({remote:t=!0,silent:n=!1}={})=>{if(E(),!e.title){r.err("\u8BF7\u5148\u586B\u5199\u6807\u9898"),s("#fTitle")?.focus();return}e.summary||(e.summary=V(e.content,150));let v=p[a].store(),b=v.get(e.id)?{...v.get(e.id)}:null,f=v.upsert({...e,__kind:void 0}),d={ok:!1,status:0,storage:"",file:""};t&&k?(d=await x.save(a,f),n||(d.ok?d.storage==="blobs"?r.ok("\u5DF2\u53D1\u5E03\u5230\u7EBF\u4E0A\u5185\u5BB9\u5B58\u50A8 \xB7 \u5237\u65B0\u9875\u9762\u5373\u53EF\u770B\u5230"):r.ok(`\u5DF2\u4FDD\u5B58\u5E76\u5199\u5165 ${d.file||"data/ \u76EE\u5F55"}`):d.status===401?r.show("\u9700\u8981\u767B\u5F55\u540E\u624D\u80FD\u53D1\u5E03\u5230\u7EBF\u4E0A\uFF1A\u5185\u5BB9\u6CA1\u6709\u4E0A\u4F20\uFF08\u8868\u5355\u91CC\u7684\u6587\u5B57\u8FD8\u5728\uFF0C\u767B\u5F55\u540E\u53EF\u518D\u70B9\u4FDD\u5B58\uFF09","err",{ttl:9e3}):d.status===403?r.show("\u53EA\u6709\u7AD9\u957F\u624D\u80FD\u4FEE\u6539\u516C\u544A\u4E0E\u7F51\u7AD9\u6587\u6848\uFF1A\u5185\u5BB9\u6CA1\u6709\u4E0A\u4F20\uFF08\u8868\u5355\u91CC\u7684\u6587\u5B57\u8FD8\u5728\uFF09","err",{ttl:9e3}):r.show(`\u5DF2\u4FDD\u5B58\u5230\u672C\u5730\uFF08\u670D\u52A1\u5668\u5199\u5165\u5931\u8D25\uFF1A${d.error||"\u672A\u77E5\u539F\u56E0"}\uFF09`)),!d.ok&&(d.status===401||d.status===403)&&(b?v.upsert(b):v.remove(f.id))):n||r.ok("\u5DF2\u4FDD\u5B58\u5230\u672C\u5730\u6D4F\u89C8\u5668 \xB7 \u53EF\u5BFC\u51FA JSON \u5165\u5E93"),e={...f,tags:[...f.tags||[]],__kind:a};let $=T(".section-block").find(y=>y.textContent.includes(`\u5DF2\u6709${p[a].label}`))?.querySelector(".section-block__body");return $&&($.innerHTML=tt(a)),S.emit("content:change",{collection:a}),f};s("#btnSave")?.addEventListener("click",()=>F({remote:!0})),s("#btnSaveLocal")?.addEventListener("click",()=>F({remote:!1})),s("#btnReset")?.addEventListener("click",()=>{e=Z(a),e.__kind=a,S.emit("route:change",{view:"admin",refresh:!0}),location.hash=`#/admin?tab=${a}&new=1`});let W=(t,n)=>`${["---",`title: ${t.title}`,`date: ${String(t.date).slice(0,10)}`,`category: ${t.category}`,`tags: [${(t.tags||[]).join(", ")}]`,t.pinned?"pinned: true":null,t.draft?"draft: true":null,n==="news"?`level: ${t.level||0}`:`author: ${t.author||""}`,t.summary?`summary: ${t.summary}`:null,`id: ${t.id}`,"---",""].filter(Boolean).join(`
`)}
${t.content}
`;return s("#btnExportMd")?.addEventListener("click",()=>{E(),M(`${a}-${e.id}.md`,W(e,a),"text/markdown;charset=utf-8"),r.ok("\u5DF2\u4E0B\u8F7D Markdown \u6587\u4EF6")}),s("#btnExportJson")?.addEventListener("click",()=>{E(),M(`${a}-${e.id}.json`,JSON.stringify({...e,__kind:void 0},null,2),"application/json"),r.ok("\u5DF2\u4E0B\u8F7D JSON \u6587\u4EF6")}),l.addEventListener("click",async t=>{let n=t.target.closest("[data-tab]");if(n){location.hash=`#/admin?tab=${n.dataset.tab}`;return}let v=t.target.closest("[data-edit]");if(v){let m=a==="tools"?"posts":a;location.hash=`#/admin?tab=${m}&edit=${v.dataset.edit}`;return}let b=t.target.closest("[data-del]");if(b){let m=p[a].store(),$=m.get(b.dataset.del);if(!$||!confirm(`\u786E\u5B9A\u5220\u9664\u300C${$.title}\u300D\uFF1F\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002`))return;if(m.remove($.id),k){let y=await x.remove(a,$.id);if(!y.ok){r.show(`\u672C\u5730\u5DF2\u5220\u9664\uFF0C\u4F46\u670D\u52A1\u7AEF\u5220\u9664\u5931\u8D25\uFF1A${y.error||"\u672A\u77E5\u539F\u56E0"}`,"err");return}}r.ok("\u5DF2\u5220\u9664"),T(".datalist__row").forEach(y=>{y.querySelector("[data-del]")?.dataset.del===$.id&&y.remove()});return}let f=t.target.closest("[data-pin]");if(f){p[a].store().togglePin(f.dataset.pin),r.show("\u7F6E\u9876\u72B6\u6001\u5DF2\u5207\u6362");return}let d=t.target.closest("[data-copy]");if(d){let m=p[a].store().get(d.dataset.copy);H(JSON.stringify(m,null,2),"\u5DF2\u590D\u5236 JSON")}}),s("#newItem")?.addEventListener("click",()=>{let t=a==="tools"?"posts":a;location.hash=`#/admin?tab=${t}&new=1`}),s("#checkServer")?.addEventListener("click",async()=>{k=await x.probe(),r.show(k?"\u670D\u52A1\u5668\u5728\u7EBF\uFF0C\u53EF\u5199\u5165 data/":"\u672A\u68C0\u6D4B\u5230\u670D\u52A1\u5668\uFF08\u9759\u6001\u6A21\u5F0F\uFF09",k?"ok":"err"),_()}),T("[data-export]",l).forEach(t=>t.addEventListener("click",()=>{let n=t.dataset.export;M(`${n}.json`,p[n].store().exportJSON(),"application/json"),r.ok(`\u5DF2\u4E0B\u8F7D ${n}.json`)})),T("[data-export-md]",l).forEach(t=>t.addEventListener("click",()=>{let n=t.dataset.exportMd,v=p[n].store().sorted.map(b=>W(b,n)).join(`

---

`);M(`${n}.md`,v,"text/markdown;charset=utf-8"),r.ok(`\u5DF2\u4E0B\u8F7D ${n}.md`)})),s("#btnCopyAll")?.addEventListener("click",()=>{let t={posts:JSON.parse(L.exportJSON()),news:JSON.parse(O.exportJSON())};H(JSON.stringify(t,null,2),"\u5DF2\u590D\u5236\u5168\u90E8\u5185\u5BB9")}),s("#btnTree")?.addEventListener("click",async()=>{let t=s("#treeBlock"),n=s("#treeOut");t?.removeAttribute("hidden"),n&&(n.textContent="\u6B63\u5728\u8BFB\u53D6\u2026");let v=await x.tree();n&&(n.textContent=v?Object.entries(v).map(([b,f])=>`${b}
${(f||[]).map(d=>`  \xB7 ${d}`).join(`
`)}`).join(`

`):"\u672A\u68C0\u6D4B\u5230\u670D\u52A1\u5668\u3002\u8FD0\u884C node server.mjs \u540E\u53EF\u67E5\u770B\u9879\u76EE\u6587\u4EF6\u6811\u3002")}),s("#btnImport")?.addEventListener("click",()=>{let t=s("#importText")?.value?.trim(),n=s("#importTarget")?.value||"posts",v=s("#importMode")?.value||"merge";if(!t){r.err("\u8BF7\u5148\u7C98\u8D34\u8981\u5BFC\u5165\u7684\u5185\u5BB9");return}try{let b;if(t.startsWith("[")||t.startsWith("{")){let d=JSON.parse(t);b=Array.isArray(d)?d:d.items||[d]}else b=t.split(/\n-{3,}\n/).map(d=>{let{data:m,body:$}=Y(d);return m.title?{...m,content:$}:null}).filter(Boolean);if(!b.length)throw new Error("\u672A\u89E3\u6790\u5230\u6709\u6548\u6761\u76EE");let f=p[n].store().importJSON(b,{replace:v==="replace"});r.ok(`\u5DF2\u5BFC\u5165 ${f} \u6761\u5230${p[n].label}`),S.emit("content:change",{collection:n}),setTimeout(()=>location.reload(),700)}catch(b){r.err(`\u5BFC\u5165\u5931\u8D25\uFF1A${b.message}`)}}),s("#btnMarkRead")?.addEventListener("click",()=>{P.markAll([...O.published,...L.published].map(t=>t.id)),r.ok("\u5168\u90E8\u6807\u8BB0\u4E3A\u5DF2\u8BFB")}),s("#btnClearRead")?.addEventListener("click",()=>{P.reset(),r.show("\u5DF2\u6E05\u7A7A\u5DF2\u8BFB\u8BB0\u5F55")}),s("#btnResetSettings")?.addEventListener("click",()=>{w.reset(),r.show("\u754C\u9762\u8BBE\u7F6E\u5DF2\u91CD\u7F6E\uFF0C\u6B63\u5728\u5237\u65B0\u2026"),setTimeout(()=>location.reload(),600)}),s("#btnResetSeed")?.addEventListener("click",async()=>{confirm("\u5C06\u6E05\u9664\u672C\u5730\u6240\u6709\u5185\u5BB9\u5E76\u6062\u590D\u5185\u7F6E\u793A\u4F8B\uFF0C\u786E\u5B9A\u7EE7\u7EED\uFF1F")&&(Object.keys(localStorage).filter(t=>t.startsWith(j)).forEach(t=>localStorage.removeItem(t)),r.show("\u6B63\u5728\u6062\u590D\u2026"),setTimeout(()=>location.reload(),700))}),s("#themeSelect")?.addEventListener("change",t=>N.set(t.target.value,{announce:!0})),s("#densitySelect")?.addEventListener("change",t=>N.setDensity(t.target.value)),s("#reduceMotion")?.addEventListener("change",t=>{w.set("reduceMotion",t.target.checked),document.documentElement.dataset.reduceMotion=t.target.checked?"1":"0"}),X.reveal(l),o}};export{_t as default};
