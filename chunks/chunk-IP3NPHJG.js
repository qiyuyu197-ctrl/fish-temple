import{d as s,m as d,n as i}from"./chunk-BUFEAOIA.js";var r=()=>`
  <button class="lyricbox" id="lyricBox" type="button" hidden
          title="\u70B9\u51FB\u67E5\u770B\u5B8C\u6574\u6B4C\u8BCD" aria-label="\u67E5\u770B\u5B8C\u6574\u6B4C\u8BCD">
    <span class="lyricbox__label mono" id="lyricLabel">NOW PLAYING</span>
    <span class="lyricbox__cur" id="lyricCur">\u2014</span>
    <span class="lyricbox__next" id="lyricNext"></span>
  </button>`,p=40,_=()=>`
  <div class="wave-row" hidden>
    <span class="wave-row__cover" aria-hidden="true"></span>
    <div class="mp-wave wave-row__wave" aria-hidden="true">
      <span class="mp-wave__mid"></span>
      ${"<i></i>".repeat(p)}
    </div>
  </div>`,$=({title:a,sub:l,idx:t,meta:n=[],actions:c=""})=>`  <!-- meta \u9879\u53EF\u9009\u5E26 id\uFF1A\u503C\u4F1A\u968F\u72B6\u6001\u53D8\u5316\u65F6\uFF08\u4F8B\u5982\u66F2\u76EE\u6570\uFF09\u4FBF\u4E8E\u5C31\u5730\u66F4\u65B0 -->
  <header class="viewhead">
    <span class="viewhead__idx">${s(t||"")}</span>
    <div class="viewhead__row">
      <div>
        <h1 class="viewhead__title display">${s(a)}</h1>
        ${l?`<p class="muted" style="margin:12px 0 0;max-width:70ch">${s(l)}</p>`:""}
      </div>
      ${r()}
      ${c?`<div class="hero__cta" style="margin:0">${c}</div>`:""}
    </div>
    ${n.length?`<div class="viewhead__meta">${n.map(e=>`
      <div><span class="k-label">${s(e.label)}</span><b${e.id?` id="${s(e.id)}"`:""}>${e.html?e.value:s(e.value)}</b></div>`).join("")}</div>`:""}
  </header>`,g=(a=[],l="")=>a.length?`<div class="track__tags ${l}">${a.map(t=>`<span class="tag tag--muted">${s(t)}</span>`).join("")}</div>`:"",h=({title:a="\u6682\u65E0\u5185\u5BB9",desc:l="",icon:t="\u25A4"}={})=>`
  <div class="empty">
    <div class="mono" style="font-size:28px;color:var(--ink-25)">${s(t)}</div>
    <b>${s(a)}</b>
    ${l?`<p>${s(l)}</p>`:""}
  </div>`;function u(a,{index:l=0,href:t=null}={}){return`
    <a class="card" href="${t||`#/logs/${a.id}`}" data-nav data-reveal data-reveal-delay="${Math.min(l*60,360)}">
      <span class="card__idx mono">${String(l+1).padStart(2,"0")}</span>
      ${a.cover?`<div class="card__thumb"><img src="${s(a.cover)}" alt="${s(a.title)}" loading="lazy" /></div>`:""}
      <div class="card__body">
        <div class="card__meta">
          <span class="tag tag--signal">${s(a.category)}</span>
          <span>${d(a.date)}</span>
          ${a.pinned?'<span class="tag tag--alert">PINNED</span>':""}
        </div>
        <h3 class="card__title">${s(a.title)}</h3>
        <p class="card__excerpt clamp-3">${s(a.summary||"")}</p>
        <div class="card__foot">
          <span class="mono faint" style="font-size:var(--fs-2xs)">${a.stats?.minutes||1} MIN READ</span>
          <span class="mono" style="font-size:var(--fs-2xs)">READ \u2192</span>
        </div>
      </div>
    </a>`}function w(a,{href:l=null,side:t=""}={}){return`
    <a class="row" href="${l||`#/logs/${a.id}`}" data-nav>
      <div class="row__date">
        <span>${d(a.date)}</span>
        <span class="faint">${i(a.date)}</span>
      </div>
      <div class="row__main">
        <span class="row__title clamp-1">${a.pinned?'<span class="tag tag--alert" style="margin-right:6px">PIN</span>':""}${s(a.title)}</span>
        <span class="row__sub clamp-1">${s(a.summary||"")}</span>
      </div>
      <div class="row__side">
        ${t||`<span class="tag tag--muted">${s(a.category)}</span>`}
      </div>
    </a>`}function y(a,{compact:l=!1,index:t=null}={}){let n=a.level>=2?"tag--alert":a.level===1?"tag--signal":"tag--muted",c=a.level>=2?"\u7D27\u6025":a.level===1?"\u91CD\u8981":a.category;return`
    <a class="row${l?" row--compact":""}" href="#/logs/${a.id}" data-nav>${t===null?"":`<span class="card__idx mono" style="position:static;margin-right:var(--sp-2)">${String(t+1).padStart(2,"0")}</span>`}
      <div class="row__date">
        <span>${d(a.date)}</span>
        <span class="faint">${s(a.category)}</span>
      </div>
      <div class="row__main">
        <span class="row__title clamp-1">${a.pinned?'<span class="tag tag--alert" style="margin-right:6px">PIN</span>':""}${s(a.title)}</span>
        <span class="row__sub clamp-2">${s(a.summary||"")}</span>
      </div>
      <div class="row__side">
        <span class="tag ${n}">${s(c)}</span>
      </div>
    </a>`}var x=(a,l,t,n)=>`
  <div class="sect__head">
    <h2 class="sect__title display"><span class="sect__no">${s(a)}</span>${s(l)}</h2>
    <div class="sect__aside">
      <span class="sect__barcode" aria-hidden="true"></span>
      ${t?`<a class="sect__link" href="${t}" data-nav>${s(n||"VIEW ALL")} \u2192</a>`:""}
    </div>
  </div>`,f=(a,l,t="")=>`
  <div class="hero__stat">
    <b class="tnum" ${t}>${s(String(l))}</b>
    <span>${s(a)}</span>
  </div>`;export{r as a,_ as b,$ as c,g as d,h as e,u as f,w as g,y as h,x as i,f as j};
