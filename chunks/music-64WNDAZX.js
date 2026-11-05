import{a as N,c as J}from"./chunk-DTFBISBY.js";import{A as lt,F as G,I as Rt,a as s,b as M,c as S,f as St,h as xt,i as j,j as Lt,k as Et,l as wt,n as It,o as z,p as Nt,q as At,r as it,s as rt,t as Mt,v as Tt,w as V,x as P,z as T}from"./chunk-CU3UTLHM.js";import"./chunk-JV4UGN2N.js";import{a as kt}from"./chunk-E3HJDYPK.js";import"./chunk-WEV6AXMB.js";import{c as Ct,e as Ot}from"./chunk-IP3NPHJG.js";import{a as f}from"./chunk-DDIRHU7Q.js";import{a as l,b as _t,d,f as $t,g as b}from"./chunk-BUFEAOIA.js";import{q as k,r as vt}from"./chunk-KSYHGNLY.js";import"./chunk-L72EZ7PG.js";var Ht="ft.terminal.playHistory",W=200,re=8,Ft=1,B={idLen:40,textLen:120,secondsMax:86400,playsMax:1e5},le=/^[0-9A-Za-z_-]{1,40}$/,g=oe(),h=null,X=null,ot=!1,ct="",Pt=!1,dt=()=>Date.now();function Dt(t,e){return String(t??"").replace(/[\u0000-\u001F\u007F-\u009F]/g,"").replace(/\s+/g," ").trim().slice(0,e)}function pt(t){let e=String(t?.id??"").trim();if(!le.test(e))return null;let n=Number(t?.seconds),a=Number(t?.at),r=Number(t?.plays);return{id:e,title:Dt(t?.title,B.textLen),artist:Dt(t?.artist,B.textLen),seconds:Number.isFinite(n)?Math.min(Math.max(Math.round(n),0),B.secondsMax):0,at:Number.isFinite(a)&&a>0?Math.min(Math.round(a),dt()+6e4):dt(),plays:Number.isFinite(r)&&r>=1?Math.min(Math.round(r),B.playsMax):1}}function oe(){try{let t=JSON.parse(localStorage.getItem(Ht)||"[]");return Array.isArray(t)?t.map(pt).filter(Boolean).slice(0,W):[]}catch{return[]}}function Z(){try{localStorage.setItem(Ht,JSON.stringify(g.slice(0,W)))}catch{}k.emit("history:change",{items:K(),total:g.length})}function K(){return[...g].sort((t,e)=>(e.at||0)-(t.at||0))}function Yt(t=5){return[...g].sort((e,n)=>(n.plays||1)-(e.plays||1)||(n.at||0)-(e.at||0)).slice(0,Math.max(0,Math.round(t)))}function zt(t){let e=String(t),n=g.find(a=>a.id===e);return n?{id:n.id,title:n.title,seconds:n.seconds||0,at:n.at,plays:n.plays}:null}function ce(t,e=0){let n=ut(t);if(!n)return null;let a=pt({id:n,title:t?.title,artist:t?.artist,seconds:e,at:dt(),plays:1});if(!a)return null;let r=g.findIndex(p=>p.id===n);if(r>=0){let p=g[r];g[r]={...p,...a,seconds:Number(e)>0?a.seconds:p.seconds||0,plays:Math.min((p.plays||1)+1,B.playsMax)}}else g.push(a);return g=K().slice(0,W),Z(),tt(),g.find(p=>p.id===n)||null}function Bt(t,e){let n=String(t),a=g.findIndex(v=>v.id===n);if(a<0)return!1;let r=Number(e);if(!Number.isFinite(r)||r<=0)return!1;let p=Math.min(Math.round(r),B.secondsMax);return p===g[a].seconds?!1:(g[a]={...g[a],seconds:p},Z(),tt(),!0)}function Wt(){return g=[],Z(),tt(0,{force:!0}),!0}function ut(t){return String(t?.neteaseId||t?.id||"").trim()}function Q(){h&&(h.recorded&&h.time>=Ft&&Bt(h.id,h.time),h.lastWrite=h.time)}function Kt(t){Q();let e=ut(t);h=e?{id:e,time:0,recorded:!1,lastWrite:0}:null}function de({track:t}={}){Kt(t)}function pe(t={}){let e=s.current,n=ut(e);if(!n){h=null;return}(!h||h.id!==n)&&Kt(e);let a=Number(t.time)||0;if(h.time=a>0?a:h.time,t.playing===!0&&h.time>Ft&&!h.recorded){ce(e,h.time),h.recorded=!0,h.lastWrite=h.time;return}if(t.playing!==!0){Q();return}h.recorded&&h.time-(h.lastWrite||0)>=re&&(Bt(h.id,h.time),h.lastWrite=h.time)}function ue(){Pt||typeof window>"u"||(Pt=!0,k.on("player:track",de),k.on("player:state",pe),k.on("auth:user",({user:t}={})=>{ct="",t&&tt(1200)}),document.addEventListener("visibilitychange",()=>{document.hidden&&Q()}),window.addEventListener("pagehide",()=>{Q(),Vt()}))}async function fe(){try{return(await import("./auth-GS3ZYWC4.js")).Auth||null}catch{return null}}function me(t,e){let n=new Map;for(let a of[...t||[],...e||[]]){let r=pt(a);if(!r)continue;let p=n.get(r.id);if(!p){n.set(r.id,r);continue}let v=(r.at||0)>=(p.at||0)?r:p;n.set(r.id,{...p,...v,plays:Math.max(p.plays||1,r.plays||1)||1,seconds:v.seconds||0,at:Math.max(p.at||0,r.at||0)})}return[...n.values()].sort((a,r)=>(r.at||0)-(a.at||0)).slice(0,W)}function tt(t=4e3,{force:e=!1}={}){typeof window>"u"||(e&&(ot=!0),X&&clearTimeout(X),X=setTimeout(()=>{X=null,Vt()},Math.max(0,t)))}async function Vt(){let t=ot;ot=!1;let e=await fe();if(!e||!e.enabled||!e.loggedIn)return{ok:!1,skipped:"not-logged-in"};let n=String(e.user?.sub||"");try{if(n&&ct!==n){let r=await e.api("/history",{method:"GET"});if(r.ok){let p=Array.isArray(r.data?.items)?r.data.items:[];g=me(p,g),Z(),ct=n}}if(!g.length&&!t)return{ok:!0,count:0,skipped:"empty"};let a=await e.api("/history",{method:"POST",body:{items:g}});return a.ok?{ok:!0,count:g.length}:{ok:!1,error:a.error}}catch(a){return{ok:!1,error:String(a?.message||a)}}}ue();var o={q:"",results:[],total:0,searching:!1,error:"",apiReady:null,loadingList:!1,importing:!1,playableOnly:!1,sound:null,lyricKey:""},jt=t=>t?M(t):"--:--",Gt='<svg class="stage-ico" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="1.7"/></svg>',yt=t=>z(t)?'<span class="tag tag--vip tag--alert" title="\u7F51\u6613\u4E91\u4F1A\u5458\u66F2\u76EE\uFF1A\u672A\u767B\u5F55\u4F1A\u5458\u65F6\u5B98\u65B9\u5916\u94FE\u64AD\u653E\u5668\u4E0D\u4F1A\u51FA\u58F0">VIP</span>':"";function be(t,e){let n=s.tracks.some(a=>a.neteaseId===String(t.id));return`
  <div class="ne-row" data-song='${d(JSON.stringify(t))}' data-i="${e}">
    <span class="ne-row__no mono">No.${String(e+1).padStart(2,"0")}</span>
    <span class="ne-row__cover">${t.cover?`<img src="${d(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`:""}</span>
    <span class="ne-row__main">
      <span class="ne-row__name clamp-1">${d(t.name)} ${yt(t)}</span>
      <span class="ne-row__meta clamp-1">${d((t.artists||[]).join(" / ")||"\u672A\u77E5\u6B4C\u624B")}${t.album?` / ${d(t.album)}`:""}</span>
    </span>
    <span class="ne-row__dur mono">${jt(t.duration)}</span>
    <span class="ne-row__acts">
      <button class="btn btn--sm btn--signal" data-act="play" title="\u5728\u7AD9\u5185\u64AD\u653E">\u25B6 \u64AD\u653E</button>
      <button class="btn btn--sm${n?" is-on":""}" data-act="add" ${n?"disabled":""}>${n?"\u5DF2\u5728\u5217\u8868":"+ \u52A0\u5165"}</button>
      <a class="btn btn--sm" href="${j(t.id)}" target="_blank" rel="noopener noreferrer" title="\u6253\u5F00\u7F51\u6613\u4E91\u539F\u9875\u9762">\u2197</a>
    </span>
  </div>`}function he(t,e){let n=e===s.index?" is-active":"",a=t.provider==="netease";return`
  <div class="track${n}" data-track="${e}">
    <span class="track__idx">
      <span class="track__no">${String(e+1).padStart(2,"0")}</span>
      <span class="track__eq"><i></i><i></i><i></i></span>
    </span>
    <span class="track__cover" aria-hidden="true">
      ${t.cover?`<img src="${d(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`:`<span class="track__coverph">${b.disc}</span>`}
    </span>
    <span class="track__main">
      <span class="track__name clamp-1">${d(t.title)}</span>
      <span class="track__artist">${d(t.artist||"\u672A\u77E5\u6B4C\u624B")}${a?" / NETEASE":""}${t.album&&t.album!==t.title?` / <span class="track__album">${d(t.album)}</span>`:""}</span>
    </span>
    <span class="track__tags">
      ${(t.tags||[]).map(r=>`<span class="tag tag--muted">${d(r)}</span>`).join("")}
      ${yt(t)}
      <span class="tag ${a?"tag--source":"tag--muted"}">${a?"NETEASE":"LOCAL"}</span>
    </span>
    <span class="track__dur">${jt(t.duration)}</span>
    <button class="track__del" data-del="${e}" title="\u4ECE\u5217\u8868\u79FB\u9664" aria-label="\u4ECE\u5217\u8868\u79FB\u9664 ${d(t.title)}">\u2715</button>
  </div>`}function Jt(){return s.tracks.length?`<div class="tracks__list" id="trackList">${s.tracks.map(he).join("")}</div>`:Ot({title:"\u64AD\u653E\u5217\u8868\u662F\u7A7A\u7684",desc:"\u5728\u4E0A\u9762\u641C\u7D22\u7F51\u6613\u4E91\u66F2\u76EE\uFF0C\u70B9\u300C+ \u52A0\u5165\u300D\u52A0\u8FDB\u6765\uFF0C\u6216\u7C98\u8D34\u94FE\u63A5\u751F\u6210\u64AD\u653E\u5668\u3002",icon:"\u266B"})}function Xt(){let t=s.current,e=!!t&&t.provider==="netease"&&T.active,n=!!t&&t.provider==="netease"&&!e&&!s.isEmbed,a=T.cropped;return`
  <div class="ne-embed-slot${e?" is-active":""}" id="embedBox" data-embed-slot>
    <div class="ne-embed-slot__head">
      <span class="ne-embed-slot__title">
        <span class="status-dot ${e?"status-dot--on":""}"></span>
        <b>${e?"\u7F51\u6613\u4E91\u5B98\u65B9\u64AD\u653E\u5668":n?"\u7AD9\u5185\u76F4\u653E / \u672A\u4F7F\u7528\u5B98\u65B9\u64AD\u653E\u5668":"\u7F51\u6613\u4E91\u5B98\u65B9\u64AD\u653E\u5668 / \u5F85\u673A"}</b>
        ${e?`<span class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">ID ${d(t.neteaseId)}</span>`:""}
      </span>
      <span class="ne-embed-slot__acts">
        ${e?`
        <button class="btn btn--sm" id="embedCrop" title="\u5728\u300C\u53EA\u7559\u63A7\u5236\u6761\u300D\u4E0E\u300C\u5B98\u65B9\u5B8C\u6574\u64AD\u653E\u5668\u300D\u4E4B\u95F4\u5207\u6362"
                aria-pressed="${a}">${a?"\u5B8C\u6574\u64AD\u653E\u5668":"\u4EC5\u63A7\u5236\u6761"}</button>
        <button class="btn btn--sm" id="embedStop" title="\u505C\u6B62\u64AD\u653E\u5E76\u6536\u8D77\u64AD\u653E\u5668">\u2715 \u505C\u6B62</button>`:n?'<span class="mono" style="font-size:var(--fs-2xs)">DIRECT STREAM</span>':'<span class="mono" style="font-size:var(--fs-2xs)">OFFICIAL EMBED</span>'}
      </span>
    </div>
    ${e?`<p class="ne-embed-slot__note">
      \u5B98\u65B9\u5D4C\u5165\u53EA\u6709 <span class="mono">type/id/auto/height</span> \u56DB\u4E2A\u53C2\u6570\uFF0C\u5185\u90E8\u6837\u5F0F\u6539\u4E0D\u4E86\uFF0C\u6240\u4EE5\u8FD9\u91CC\u9ED8\u8BA4\u53EA\u7559\u5B83\u7684\u4E00\u6761\u63A7\u5236\u5E26\uFF08\u8FDB\u5EA6 / \u65F6\u95F4 / \u64AD\u653E\u952E\uFF09\uFF1B\u6682\u505C\u4F1A\u56DE\u5230 <span class="mono">0:00</span>\uFF0C\u5207\u677F\u5757\u4E0D\u5F71\u54CD\u64AD\u653E\u3002
    </p>`:n?`<p class="ne-embed-slot__note">
      \u8FD9\u4E00\u9996\u7ECF\u672C\u7AD9\u540C\u6E90\u8F6C\u53D1<b>\u76F4\u63A5\u64AD\u653E</b>\uFF1A\u8FDB\u5EA6\u3001\u97F3\u91CF\u3001\u6682\u505C\u7EED\u64AD\u90FD\u7531\u7AD9\u5185\u638C\u63E1\uFF0C\u5207\u5230\u5176\u4ED6\u677F\u5757\u3001\u628A\u6807\u7B7E\u9875\u653E\u5230\u540E\u53F0\u3001\u624B\u673A\u606F\u5C4F\uFF0C\u90FD\u80FD\u5B8C\u6574\u64AD\u5B8C\u5E76\u81EA\u52A8\u63A5\u4E0B\u4E00\u9996\u3002\u53EA\u6709\u7AD9\u5185\u62FF\u4E0D\u5230\u97F3\u9891\u6D41\u7684\u66F2\u76EE\uFF08\u4F1A\u5458 / \u7248\u6743\u53D7\u9650\uFF09\u624D\u4F1A\u6539\u7528\u5B98\u65B9\u5916\u94FE\u64AD\u653E\u5668\u3002
    </p>`:`<div class="ne-embed-slot__ph">
      ${b.music}
      <p>\u5C1A\u672A\u9009\u62E9\u7F51\u6613\u4E91\u66F2\u76EE</p>
      <p class="faint">\u4E0A\u9762\u641C\u7D22\u540E\u70B9\u300C\u25B6 \u64AD\u653E\u300D\uFF0C\u53EF\u64AD\u653E\u7684\u66F2\u76EE\u76F4\u63A5\u7531\u7AD9\u5185\u64AD\u653E\uFF08\u53F3\u4E0B\u89D2\u6709\u8FF7\u4F60\u6761\uFF09\uFF1B\u53EA\u6709\u4F1A\u5458 / \u7248\u6743\u53D7\u9650\u7684\u66F2\u76EE\u624D\u4F1A\u7528\u5B98\u65B9\u64AD\u653E\u5668\uFF0C\u5207\u5230\u5176\u4ED6\u677F\u5757\u65F6\u5B83\u4F1A\u6298\u53E0\u5230\u53F3\u4E0B\u89D2\u7EE7\u7EED\u64AD\u653E</p>
    </div>`}
    ${e?'<div class="ne-embed-slot__stage" data-embed-stage aria-hidden="true"></div>':""}
  </div>`}var Ke={id:"music",title:"\u97F3\u4E50",render(){let t=o.apiReady,e=s.current;return`
    <section class="music">
      ${Ct({title:"AUDIO DECK",sub:"\u641C\u7D22\u7F51\u6613\u4E91\u66F2\u76EE\u3001\u7C98\u8D34\u6B4C\u66F2\u6216\u6B4C\u5355\u94FE\u63A5\uFF0C\u76F4\u63A5\u5728\u7AD9\u5185\u8BD5\u542C\u3002\u9ED8\u8BA4\u7ECF\u672C\u7AD9\u540C\u6E90\u8F6C\u53D1\u97F3\u9891\u6D41\u64AD\u653E\uFF1A\u6709\u771F\u5B9E\u8FDB\u5EA6\u3001\u53EF\u62D6\u52A8\u3001\u5207\u540E\u53F0\u4E5F\u80FD\u5B8C\u6574\u64AD\u5B8C\u5E76\u81EA\u52A8\u63A5\u4E0B\u4E00\u9996\uFF1B\u4F1A\u5458\u6216\u7248\u6743\u53D7\u9650\u7684\u66F2\u76EE\u81EA\u52A8\u9000\u56DE\u7F51\u6613\u4E91\u5B98\u65B9\u5916\u94FE\u64AD\u653E\u5668\u3002\u64AD\u653E\u540E\u53EF\u4EE5\u8FDB\u5165\u6C89\u6D78\u821E\u53F0\uFF0C\u770B\u5927\u5B57\u6B4C\u8BCD\u3001\u8BD1\u6587\uFF0C\u7528\u952E\u76D8\u63A7\u5236\u6574\u5F20\u5531\u7247\u3002",idx:"MODULE / 04",meta:[{label:"PLAYLIST",value:`${String(s.tracks.length).padStart(2,"0")} TRACKS`,id:"metaTracks"},{label:"API",value:t===null?"\u68C0\u6D4B\u4E2D":t?"PROXY ONLINE":"PROXY OFFLINE",id:"metaApi"}],actions:`<button class="btn btn--sm btn--solid" id="stageTop" ${e?"":"disabled"}>${Gt}\u6C89\u6D78\u821E\u53F0</button>
          <button class="btn btn--sm" id="neteaseHome">${b.ext}\u7F51\u6613\u4E91\u9996\u9875</button>`})}

      ${t===!1?`<div class="notice" style="margin-top:var(--sp-5)">
        <span class="notice__icon">!</span>
        <div>
          <b>\u672A\u68C0\u6D4B\u5230\u670D\u52A1\u5668\uFF0C\u641C\u7D22\u4E0D\u53EF\u7528</b>
          <div class="muted" style="font-size:var(--fs-sm)">
            \u7F51\u6613\u4E91\u63A5\u53E3\u4E0D\u8FD4\u56DE CORS \u5934\uFF0C\u6D4F\u89C8\u5668\u65E0\u6CD5\u76F4\u8FDE\u3002\u8BF7\u7528 <span class="mono">node server.mjs</span> \u542F\u52A8\u540E\u8BBF\u95EE
            <span class="mono">http://localhost:5173</span>\uFF1B\u6216\u76F4\u63A5\u5728\u4E0B\u65B9\u7C98\u8D34\u7F51\u6613\u4E91\u94FE\u63A5\u751F\u6210\u64AD\u653E\u5668\u3002
          </div>
        </div>
      </div>`:""}

      <!-- \u7F51\u6613\u4E91\u8D26\u53F7\uFF1A\u672C\u7AD9\u8D26\u53F7\u7684\u9644\u5C5E\u7ED1\u5B9A\u3002\u672A\u5F00\u542F / \u672A\u767B\u5F55\u672C\u7AD9\u65F6\u8FD9\u91CC\u4F1A\u81EA\u5DF1\u6536\u8D77\uFF0C\u4E0D\u5360\u7248\u9762 -->
      ${J.stripHTML()}

      <!-- \u2460 \u4E00\u4E2A\u8F93\u5165\u6846\u641E\u5B9A\u4E09\u4EF6\u4E8B\uFF1A\u641C\u5173\u952E\u8BCD / \u7C98\u8D34\u6B4C\u66F2\u94FE\u63A5\u6216 ID / \u5BFC\u5165\u6B4C\u5355\u4E0E\u4E13\u8F91 -->
      <div class="ne-search" id="neSearch" style="margin-top:var(--sp-5)">
        <div class="ne-search__head">
          <span class="ne-section-title">
            <span class="ne-eyebrow">// SEARCH / IMPORT</span>
            <b>\u641C\u7D22\u4E0E\u5BFC\u5165</b>
          </span>
          <span class="ne-headmeta mono" id="plStatus">
            \u7C98\u8D34\u6B4C\u5355 / \u4E13\u8F91\u94FE\u63A5\u6216 ID / \u5355\u6B21\u6700\u591A ${Mt} \u9996
          </span>
        </div>
        <div class="ne-search__bar">
          <label class="ne-search__field">
            <span class="ne-search__prefix" aria-hidden="true">//</span>
            <input type="search" id="neInput" autocomplete="off" spellcheck="false"
                   placeholder="\u641C\u6B4C\u540D / \u6B4C\u624B\uFF1B\u6216\u7C98\u8D34\u7F51\u6613\u4E91\u6B4C\u66F2\u3001\u6B4C\u5355\u3001\u4E13\u8F91\u94FE\u63A5\uFF08\u542B 163cn.tv \u77ED\u94FE\uFF09"
                   value="${d(o.q)}" ${t===!1?"disabled":""} />
          </label>
          <button class="btn btn--signal" id="neGo" ${t===!1?"disabled":""}>${b.search}\u641C\u7D22 / \u64AD\u653E</button>
          <button class="btn" id="plImport" ${t===!1?"disabled":""}>${b.ext}\u5BFC\u5165\u6B4C\u5355 / \u4E13\u8F91</button>
          <button class="btn" id="plReplace" title="\u6E05\u7A7A\u73B0\u6709\u5217\u8868\u540E\u7528\u8FD9\u4E2A\u6B4C\u5355 / \u4E13\u8F91\u66FF\u6362" ${t===!1?"disabled":""}>\u66FF\u6362</button>
        </div>
        <div class="ne-search__quick">
          <span class="k-label">\u5FEB\u6377</span>
          ${["\u591C\u822A\u661F","Beyond","\u4E45\u77F3\u8BA9","Lofi","\u94A2\u7434","\u7EAF\u97F3\u4E50"].map(n=>`<button class="chip" data-kw="${d(n)}">${d(n)}</button>`).join("")}
          <span class="ne-search__sep" aria-hidden="true"></span>
          <span class="k-label">\u6B4C\u5355</span>
          ${[["\u70ED\u6B4C\u699C","3778678"],["\u98D9\u5347\u699C","19723756"],["\u65B0\u6B4C\u699C","3779629"]].map(([n,a])=>`<button class="chip" data-playlist="${a}">${d(n)}</button>`).join("")}
        </div>
        <p class="ne-search__hint">
          <b>\u5173\u952E\u8BCD</b>\u641C\u66F2\u76EE\uFF1B<b>\u6B4C\u66F2\u94FE\u63A5\u6216\u7EAF\u6570\u5B57 ID</b>\u76F4\u63A5\u64AD\u653E\uFF1B<b>\u6B4C\u5355 / \u4E13\u8F91\u94FE\u63A5</b>\uFF08\u542B App \u5206\u4EAB\u51FA\u6765\u7684
          <code>163cn.tv</code> \u77ED\u94FE\uFF09\u4F1A\u88AB\u81EA\u52A8\u8BC6\u522B\u7C7B\u578B\u5E76\u5E76\u5165\u672C\u7AD9\u5217\u8868\u3002
          \u516C\u5F00\u6B4C\u5355\u4E0E\u4E13\u8F91\u4E0D\u9700\u8981\u767B\u5F55\uFF1B<b>\u79C1\u5BC6\u6B4C\u5355</b>\u548C<b>\u6211\u559C\u6B22\u7684\u97F3\u4E50</b>\u8981\u5148\u5728\u4E0A\u9762\u300C\u7F51\u6613\u4E91\u8D26\u53F7\u300D\u91CC\u626B\u7801\u8FDE\u63A5 \u2014\u2014
          \u767B\u5F55\u53EA\u7528\u6765\u8BFB\u4F60\u81EA\u5DF1\u7684\u6B4C\u5355\uFF0C\u4E0D\u4F1A\u62FF\u5B83\u53BB\u53D6 VIP \u97F3\u9891\u3002
        </p>
      </div>

      <!-- \u641C\u7D22\u7ED3\u679C\uFF1A\u7D27\u8D34\u641C\u7D22\u6761\u4E0B\u65B9\uFF0C\u641C\u5B8C\u4E0D\u7528\u5F80\u4E0B\u7FFB\u5C31\u80FD\u770B\u5230\u3002
           \u6CA1\u6709\u641C\u7D22\u65F6\u4E0D\u5360\u7248\u9762\uFF08\u5426\u5219\u7A7A\u5360\u4F4D\u4F1A\u628A\u300C\u6B63\u5728\u64AD\u653E\u300D\u9876\u5230\u9996\u5C4F\u5916\uFF09\u3002 -->
      <div class="ne-results" id="neResults" style="margin-top:var(--sp-4)"></div>

      <!-- \u6B63\u5728\u64AD\u653E\uFF1A\u7AD9\u5185\u4F20\u8F93\u952E + \u5B98\u65B9\u63A7\u5236\u5E26\u5408\u6210\u4E00\u5757\uFF0C\u907F\u514D\u540C\u4E00\u4EFD\u4FE1\u606F\u91CD\u590D\u4E09\u904D -->
      <section class="np" style="margin-top:var(--sp-5)">
        <div class="np__head">
          <span class="np__titlewrap">
            <span class="ne-eyebrow">// NOW PLAYING</span>
            <b class="np__title">\u6B63\u5728\u64AD\u653E</b>
          </span>
          <span class="np__headmeta">
            <span class="np__src mono" id="npSource">${e?e.provider==="netease"?"NETEASE":"LOCAL":"STANDBY"}</span>
            <span class="mono np__headfield">${String(s.tracks.length).padStart(2,"0")} TRACKS</span>
          </span>
        </div>
        <div class="np__body">
          <div id="neNow" class="np__now">${Zt()}</div>
          <div id="embedWrap" class="np__embed" ${T.active?"":"hidden"}>${Xt()}</div>
        </div>
      </section>

      <!-- \u64AD\u653E\u5217\u8868\uFF08\u6700\u8FD1\u64AD\u653E\u6536\u8FDB\u5E95\u90E8\u7EC6\u6761\uFF0C\u4E0D\u518D\u5355\u72EC\u5360\u4E00\u4E2A\u9762\u677F\uFF09 -->
      <section class="tracks" style="margin-top:var(--sp-5)">
        <div class="tracks__head">
          <span class="ne-section-title">
            <span class="ne-eyebrow">// QUEUE</span>
            <b>\u7F51\u7AD9\u64AD\u653E\u5217\u8868</b>
          </span>
          <span class="mono faint" style="font-size:var(--fs-2xs)" id="trackCount">${String(s.tracks.length).padStart(2,"0")} TRACKS</span>
          <span class="grow"></span>
          <button class="btn btn--sm" id="plShuffle" aria-pressed="${s.shuffle}">${b.shuffle}\u968F\u673A</button>
          <button class="btn btn--sm" id="plAutoNext" aria-pressed="${s.embedAutoNext}"
                  title="\u7F51\u6613\u4E91\u66F2\u76EE\u6CA1\u6709\u64AD\u653E\u7ED3\u675F\u56DE\u8C03\uFF0C\u53EA\u80FD\u6309\u65F6\u957F\u4F30\u7B97\uFF1B\u9ED8\u8BA4\u5173\u95ED\u4EE5\u514D\u628A\u6CA1\u653E\u5B8C\u7684\u6B4C\u5207\u8D70">\u64AD\u5B8C\u81EA\u52A8\u4E0B\u4E00\u9996${s.embedAutoNext?"":"\uFF08\u5173\uFF09"}</button>
          <button class="btn btn--sm" id="plPrev" title="\u4E0A\u4E00\u9996">${b.prev}</button>
          <button class="btn btn--sm" id="plNext" title="\u4E0B\u4E00\u9996">${b.next}</button>
          <button class="btn btn--sm btn--danger" id="plClear">\u6E05\u7A7A\u5217\u8868</button>
        </div>
        <div id="playlistWrap">${Jt()}</div>
        <!-- \u7AD9\u5185\u64AD\u653E\u5386\u53F2\uFF1A\u53EA\u8BB0\u5728\u6211\u4EEC\u81EA\u5DF1\u8FD9\u8FB9\uFF08\u6D4F\u89C8\u5668 + \u4F60\u8D26\u53F7\u4E0B\u7684\u4E00\u4EFD\u8BB0\u5F55\uFF09\uFF0C\u4E0D\u53D1\u7ED9\u7F51\u6613\u4E91 -->
        <div class="tracks__hist" id="histWrap">
          <div class="tracks__histhead">
            <span class="ne-section-title ne-section-title--sm">
              <span class="ne-eyebrow">// RECENT</span>
              <b>\u6700\u8FD1\u64AD\u653E</b>
            </span>
            <span class="mono faint" style="font-size:var(--fs-2xs)" id="histCount"></span>
            <span class="grow"></span>
            <button class="btn btn--sm" id="histClear" title="\u53EA\u6E05\u6211\u4EEC\u7AD9\u5185\u7684\u8BB0\u5F55\uFF0C\u4E0D\u5F71\u54CD\u4F60\u5728\u7F51\u6613\u4E91\u7684\u4EFB\u4F55\u6570\u636E">\u6E05\u7A7A\u8BB0\u5F55</button>
          </div>
          <div id="neHistory">${te()}</div>
        </div>
      </section>
    </section>`},async mount(t){Rt.show();try{await J.mount(t)}catch(i){console.warn("[netease-login] mount \u5931\u8D25",i)}l("#stageTop")?.addEventListener("click",()=>G.open()),o.apiReady=await wt();let e=l("#metaApi");e&&(e.textContent=o.apiReady?"PROXY ONLINE":"PROXY OFFLINE");let n=l("#neInput"),a=l("#neGo");o.apiReady===!1&&(n?.setAttribute("disabled",""),a?.setAttribute("disabled",""));let r=l("#neInput"),p=l("#plStatus"),v=p?p.textContent.trim():"",L=(i,c=!1)=>{p&&(p.textContent=i||v,p.style.color=c?"var(--alert)":"")},w=async(i,c=!1)=>{if(o.importing)return;let u=String(i??r?.value??"").trim();if(!u){L("\u8BF7\u5148\u7C98\u8D34\u6B4C\u5355 / \u4E13\u8F91\u94FE\u63A5\u6216 ID",!0);return}o.importing=!0;let y=[l("#plImport"),l("#plReplace")].filter(Boolean);y.forEach(m=>m.setAttribute("disabled","")),L("\u6B63\u5728\u8BFB\u53D6\u6B4C\u5355 \u2026");try{let m=await Tt(u,{replace:c,onProgress:({phase:nt,done:ie,total:at})=>{nt==="link"?L("\u6B63\u5728\u5C55\u5F00\u77ED\u94FE \u2026"):nt==="meta"?L("\u6B63\u5728\u8BFB\u53D6\u6B4C\u5355 / \u4E13\u8F91 \u2026"):nt==="tracks"&&L(at?`\u6B63\u5728\u8865\u9F50\u66F2\u76EE ${Math.min(ie+1,at)}/${at} \u2026`:"\u6B63\u5728\u6574\u7406\u66F2\u76EE \u2026")}});xt({force:!0}),R(),x();let $=m.source||{},_=[];_.push(`${c?"\u5DF2\u66FF\u6362\u4E3A":"\u5DF2\u5BFC\u5165"}${$.kind==="album"?"\u4E13\u8F91":"\u6B4C\u5355"}\u300C${$.name||"\u672A\u547D\u540D"}\u300D`),$.artist&&_.push($.artist),_.push(`\u66F2\u76EE ${m.total} \u9996`),!c&&m.skipped&&_.push(`\u5DF2\u5728\u5217\u8868\u4E2D ${m.skipped} \u9996`),m.unavailable&&_.push(`\u62FF\u4E0D\u5230\u8BE6\u60C5 ${m.unavailable} \u9996`),m.truncated&&_.push(`\u5171 ${$.kind==="album"?m.album?.size:m.playlist?.trackCount} \u9996\uFF0C\u6309\u4E0A\u9650\u5BFC\u5165\u524D ${m.total} \u9996`);let E=_.join(" / ");f.show(E,"",{ttl:6e3}),L(E)}catch(m){let $=String(m.message||m);f.show(`\u5BFC\u5165\u5931\u8D25\uFF1A${$}`,"",{ttl:6e3}),L(`\u5BFC\u5165\u5931\u8D25\uFF1A${$}`,!0)}finally{o.importing=!1,o.apiReady!==!1&&y.forEach(m=>m.removeAttribute("disabled"))}};l("#plImport")?.addEventListener("click",()=>w(r?.value,!1)),l("#plReplace")?.addEventListener("click",()=>{s.tracks.length&&!confirm("\u7528\u8FD9\u4E2A\u6B4C\u5355\u66FF\u6362\u73B0\u6709\u64AD\u653E\u5217\u8868\uFF1F\u73B0\u6709\u66F2\u76EE\u4F1A\u88AB\u6E05\u7A7A\u3002")||w(r?.value,!0)}),r?.addEventListener("keydown",i=>{i.key==="Enter"&&i.preventDefault()});let A=async i=>{let c=String(i??"").trim();if(c){o.q=c,o.searching=!0,o.error="",q('<div class="ne-results__loading mono">\u6B63\u5728\u641C\u7D22 \u2026</div>');try{let{songs:u,total:y}=await It(c,{limit:20});o.results=u,o.total=y,q(ft())}catch(u){o.results=[],o.error=String(u.message||u),q(`<div class="ne-results__err mono">\u641C\u7D22\u5931\u8D25\uFF1A${d(o.error)}</div>`)}finally{o.searching=!1}}},C=i=>{let c=String(i||"").trim();return c?/^https?:\/\//i.test(c)||/163cn\.tv|music\.163\.com|y\.music\.163\.com/i.test(c)?!0:/^\d{4,12}$/.test(c):!1},D=/playlist|discover|toplist|radio|program|album/i,Y=async()=>{let i=String(n?.value||"").trim();if(!i||o.apiReady===!1)return;if(!C(i)){A(i);return}if(D.test(i)){w(i,!1);return}let c="";try{c=(await Et(i)).kind}catch{c=""}if(c==="album"||c==="playlist"){w(i,!1);return}await ne()||(f.show("\u6CA1\u627E\u5230\u8FD9\u9996\u6B4C\uFF0C\u6309\u6B4C\u5355 / \u4E13\u8F91\u518D\u8BD5\u4E00\u6B21 \u2026"),w(i,!1))};l("#neGo")?.addEventListener("click",Y),n?.addEventListener("keydown",i=>{i.key==="Enter"&&(i.preventDefault(),Y())}),n?.addEventListener("input",$t(i=>{C(i.target.value)||i.target.value.trim().length>=2&&o.apiReady&&A(i.target.value)},650)),t.addEventListener("click",i=>{let c=i.target.closest("[data-kw]");if(c){n&&(n.value=c.dataset.kw),A(c.dataset.kw);return}let u=i.target.closest("[data-playlist]");if(u){r&&(r.value=u.dataset.playlist),w(u.dataset.playlist,!1);return}let y=i.target.closest(".ne-row");if(y){let _=i.target.closest("[data-act]")?.dataset.act,E;try{E=JSON.parse(y.dataset.song)}catch{return}if(_==="add"){se(E);return}if(_==="play"){H(E);return}if(i.target.closest("a"))return;H(E);return}let m=i.target.closest("[data-del]");if(m){let _=Number(m.dataset.del),E=s.tracks[_];s.remove(_),P(s.tracks),f.show(`\u5DF2\u79FB\u9664\uFF1A${E?.title||""}`),R();return}let $=i.target.closest("[data-track]");if($&&!i.target.closest("[data-del]")){let _=Number($.dataset.track);_===s.index?s.toggle():s.prepare(_,{autoplay:!0})}});let I=0,O=async i=>{if(i?.cloud){o.sound=null,N("");return}if(!i||i.provider!=="netease"||!o.apiReady){o.sound=null,N("");return}let c=++I,u=String(i.neteaseId);o.sound={id:u,playable:null,checking:!0,alternatives:[],reason:""},x();let y=await Nt(u).catch(()=>null);if(c!==I)return;let m=y?y.playable:null;if(y?.seconds>0){i.audioSeconds=y.seconds;let _=Number(i.duration)||0;if(At(y,_)){o.sound={id:u,playable:!0,fragment:!0,checking:!1,alternatives:[],reason:`\u5916\u94FE\u53EA\u63D0\u4F9B ${Math.round(y.seconds)} \u79D2\u7684\u7247\u6BB5\uFF08\u66F2\u76EE ${Math.round(_)} \u79D2\uFF09`},x();let E=[];try{E=await it(i)}catch{E=[]}if(c!==I)return;o.sound.alternatives=E,x(),f.show(`\u300C${i.title}\u300D\u7AD9\u5185\u53EA\u6709 ${Math.round(y.seconds)} \u79D2\u7247\u6BB5${E.length?" \xB7 \u5DF2\u627E\u5230\u5B8C\u6574\u7248\u672C":""}`,"",{ttl:6e3});return}}if(m!==!1){m===!0&&(i.embedOnly=!1),o.sound=m===null&&z(i)?{id:u,playable:!1,checking:!1,alternatives:[],reason:"\u63A2\u6D4B\u5931\u8D25\uFF0C\u53EF\u80FD\u662F\u4F1A\u5458\u66F2\u76EE"}:null,N(o.sound&&!et()?"\u53EF\u80FD\u65E0\u58F0":""),x();return}if(i.cloud){o.sound=null,N("");return}if(St()){o.sound=null,N(""),x();return}i.embedOnly=!0,o.sound={id:u,playable:!1,checking:!0,alternatives:[],reason:"\u7F51\u6613\u4E91\u4E0D\u5411\u533F\u540D\u8BF7\u6C42\u63D0\u4F9B\u97F3\u9891"},N(et()?"":"\u53EF\u80FD\u65E0\u58F0"),x();let $=[];try{$=await it(i)}catch{$=[]}c===I&&(o.sound={id:u,playable:!1,checking:!1,alternatives:$,reason:"\u7F51\u6613\u4E91\u4E0D\u5411\u533F\u540D\u8BF7\u6C42\u63D0\u4F9B\u97F3\u9891"},x(),et()||(N("\u53EF\u80FD\u65E0\u58F0"),f.show(`\u300C${i.title}\u300D\u9700\u8981\u7F51\u6613\u4E91\u4F1A\u5458\uFF0C\u5B98\u65B9\u64AD\u653E\u5668\u4E0D\u4F1A\u51FA\u58F0${$.length?" \xB7 \u5DF2\u627E\u5230\u53EF\u64AD\u653E\u7684\u5176\u4ED6\u7248\u672C":""}`,"",{ttl:7e3})))},H=i=>{let c=V(i),u=s.tracks.findIndex(m=>m.neteaseId===c.neteaseId);u>=0?s.prepare(u,{autoplay:!0}):(s.add(c,{play:!0}),P(s.tracks)),R(),st(),x(),F(),O(s.current||c),l("#neNow")?.scrollIntoView({behavior:"smooth",block:"center"})},se=i=>{let c=V(i),u=s.add(c);P(s.tracks),R(),f.show(u.added?`\u5DF2\u52A0\u5165\uFF1A${c.title}`:"\u8BE5\u66F2\u76EE\u5DF2\u5728\u5217\u8868\u4E2D"),q(ft())},ne=async()=>{let i=r?.value||"",c=Lt(i);if(!c)return f.err("\u6CA1\u80FD\u4ECE\u8FD9\u6BB5\u5185\u5BB9\u91CC\u89E3\u6790\u51FA\u6B4C\u66F2 ID"),!1;if(!o.apiReady){let u={id:`ne-${c}`,provider:"netease",neteaseId:c,title:`\u7F51\u6613\u4E91\u66F2\u76EE ${c}`,artist:"",duration:0,tags:[]};return s.add(u,{play:!0}),P(s.tracks),R(),x(),F(),f.show("\u5DF2\u5728\u7AD9\u5185\u751F\u6210\u5B98\u65B9\u64AD\u653E\u5668\uFF08\u65E0\u670D\u52A1\u5668\uFF0C\u672A\u80FD\u83B7\u53D6\u66F2\u76EE\u4FE1\u606F\uFF09"),!0}try{let[u]=await rt([c]);return u?(H(u),f.ok(`\u5DF2\u8F7D\u5165\uFF1A${u.name}`),!0):!1}catch(u){return f.err(`\u83B7\u53D6\u6B4C\u66F2\u4FE1\u606F\u5931\u8D25\uFF1A${u.message}`),!1}};l("#plClear")?.addEventListener("click",()=>{s.tracks.length&&confirm("\u6E05\u7A7A\u7F51\u7AD9\u64AD\u653E\u5217\u8868\uFF1F\uFF08\u53EA\u5F71\u54CD\u672C\u5730\u4FDD\u5B58\u7684\u5217\u8868\uFF09")&&(s.clear(),P([]),R(),x(),F(),f.show("\u64AD\u653E\u5217\u8868\u5DF2\u6E05\u7A7A"))}),l("#plPrev")?.addEventListener("click",()=>s.prev()),l("#plNext")?.addEventListener("click",()=>s.next()),l("#plAutoNext")?.addEventListener("click",i=>{let c=s.setEmbedAutoNext(!s.embedAutoNext);i.currentTarget.setAttribute("aria-pressed",String(c)),i.currentTarget.textContent=`\u64AD\u5B8C\u81EA\u52A8\u4E0B\u4E00\u9996${c?"":"\uFF08\u5173\uFF09"}`,f.show(c?"\u5DF2\u5F00\u542F\uFF1A\u6309\u5143\u6570\u636E\u65F6\u957F\u4F30\u7B97\uFF0C\u53EF\u80FD\u6BD4\u771F\u5B9E\u7ED3\u675F\u5DEE\u51E0\u79D2":"\u5DF2\u5173\u95ED\u81EA\u52A8\u4E0B\u4E00\u9996\uFF1A\u7F51\u6613\u4E91\u66F2\u76EE\u653E\u5B8C\u4F1A\u505C\u5728\u539F\u5730\uFF08\u5B98\u65B9\u64AD\u653E\u5668\u6CA1\u6709\u7ED3\u675F\u56DE\u8C03\uFF09","",{ttl:6e3})}),t.addEventListener("click",i=>{let c=i.target.closest("[data-alt]");if(c){let u;try{u=JSON.parse(c.dataset.alt)}catch{return}H(u),f.ok(`\u5DF2\u5207\u5230\u53EF\u64AD\u653E\u7684\u7248\u672C\uFF1A${u.name}`);return}if(i.target.closest("#neSilentNext")){let y=o.results.filter(m=>!z(m))[0]||s.tracks.find(m=>!z(m));y&&y.name?H(y):f.show("\u5217\u8868\u91CC\u6682\u65F6\u6CA1\u6709\u522B\u7684\u53EF\u64AD\u653E\u66F2\u76EE\uFF0C\u8BD5\u8BD5\u300C\u53EA\u770B\u80FD\u64AD\u7684\u300D\u518D\u641C\u4E00\u6B21");return}if(i.target.closest("#nePlayableOnly")){o.playableOnly=!o.playableOnly,q(ft()),f.show(o.playableOnly?"\u53EA\u663E\u793A\u975E\u4F1A\u5458\u66F2\u76EE":"\u663E\u793A\u5168\u90E8\u641C\u7D22\u7ED3\u679C");return}if(i.target.closest("#neVipSet")){qt(!0),N(""),x(),f.show("\u5DF2\u8BB0\u4F4F\uFF1A\u4F60\u8FD9\u53F0\u6D4F\u89C8\u5668\u767B\u5F55\u4E86\u7F51\u6613\u4E91\u4F1A\u5458\uFF0C\u4F1A\u5458\u66F2\u76EE\u4E0D\u518D\u63D0\u793A","",{ttl:5e3});return}i.target.closest("#neVipUnset")&&(qt(!1),x(),s.current&&O(s.current),f.show("\u5DF2\u6062\u590D\u4F1A\u5458\u66F2\u76EE\u63D0\u793A"))}),l("#plShuffle")?.addEventListener("click",i=>{s.setShuffle(!s.shuffle),i.currentTarget.setAttribute("aria-pressed",String(s.shuffle)),f.show(s.shuffle?"\u968F\u673A\u64AD\u653E\uFF1A\u5F00":"\u968F\u673A\u64AD\u653E\uFF1A\u5173")}),l("#neteaseHome")?.addEventListener("click",()=>window.open("https://music.163.com/","_blank","noopener")),l("#embedWrap")?.addEventListener("click",i=>{if(i.target.closest("#embedCrop")){let c=T.toggleCrop();f.show(c?"\u5B98\u65B9\u64AD\u653E\u5668\uFF1A\u4EC5\u63A7\u5236\u6761":"\u5B98\u65B9\u64AD\u653E\u5668\uFF1A\u5B8C\u6574\u5F62\u6001"),F()}else i.target.closest("#embedStop")&&T.stop()});let ae=[k.on("player:track",()=>{x(),R(),F()}),k.on("player:state",()=>{gt(),U()}),k.on("lyrics:line",U),k.on("lyrics:ready",U),k.on("lyrics:idle",U),k.on("player:embed",({autoplay:i})=>{F(i),gt()}),k.on("playlist:change",()=>R()),k.on("history:change",()=>st()),k.on("player:advance-suspended",({track:i}={})=>{s.embedAutoNext&&f.show(`\u300C${i?.title||"\u5F53\u524D\u66F2\u76EE"}\u300D\u7684\u5B98\u65B9\u64AD\u653E\u5668\u88AB\u624B\u52A8\u64CD\u4F5C\u8FC7\uFF0C\u8FD9\u4E00\u9996\u4E0D\u518D\u81EA\u52A8\u5207 \xB7 \u70B9 \u23ED \u6362\u6B4C`,"",{ttl:6e3})})];return x(),R(),F(),st(),kt.reveal(t),s.current&&O(s.current),()=>{ae.forEach(i=>i?.()),J.unmount(),I++,N("")}}},bt="ft.terminal.vipLoggedIn",et=()=>{try{return localStorage.getItem(bt)==="1"}catch{return!1}},qt=t=>{try{t?localStorage.setItem(bt,"1"):localStorage.removeItem(bt)}catch{}};function ft(){if(o.error)return`<div class="ne-results__err mono">\u641C\u7D22\u5931\u8D25\uFF1A${d(o.error)}</div>`;if(!o.results.length)return`<div class="ne-results__hint mono">
      ${o.apiReady===!1?"\u641C\u7D22\u4E0D\u53EF\u7528\uFF08\u6CA1\u6709\u670D\u52A1\u5668\uFF09":"\u8F93\u5165\u5173\u952E\u8BCD\u540E\u6309\u56DE\u8F66\uFF0C\u6216\u7528\u4E0A\u9762\u7684\u5FEB\u6377\u6807\u7B7E"}
    </div>`;let t=o.playableOnly?o.results.filter(n=>!z(n)):o.results,e=o.results.length-t.length;return`
    <div class="ne-results__head">
      <span class="ne-section-title ne-section-title--sm">
        <span class="ne-eyebrow">// RESULTS</span>
        <b>\u641C\u7D22\u7ED3\u679C</b>
      </span>
      <span class="ne-headmeta mono">
        \u5171 ${o.total||o.results.length} \u6761 / \u663E\u793A ${t.length}${e?`\uFF08\u9690\u85CF ${e} \u9996\u4F1A\u5458\u66F2\u76EE\uFF09`:""}
      </span>
      <span class="grow"></span>
      <button class="chip${o.playableOnly?" is-on":""}" id="nePlayableOnly"
              aria-pressed="${o.playableOnly}" title="\u4F1A\u5458\u66F2\u76EE\u5728\u533F\u540D\u6001\u653E\u4E0D\u51FA\u58F0\uFF0C\u53EF\u4EE5\u53EA\u770B\u80FD\u64AD\u7684">\u53EA\u770B\u80FD\u64AD\u7684</button>
      <span class="mono faint" style="font-size:var(--fs-2xs)">\u70B9\u6574\u884C\u5373\u53EF\u64AD\u653E</span>
    </div>
    <div class="ne-results__list">${t.map(be).join("")||'<div class="ne-results__hint mono">\u8FD9\u4E00\u6279\u7ED3\u679C\u91CC\u6CA1\u6709\u975E\u4F1A\u5458\u66F2\u76EE\uFF0C\u53D6\u6D88\u8FC7\u6EE4\u770B\u770B</div>'}</div>`}function ge(){let t=o.sound;if(!t||t.playable!==!1)return"";if(et())return`
    <div class="ne-silent ne-silent--slim" id="neSilent">
      <span class="mono faint" style="font-size:var(--fs-2xs)">
        \u4F1A\u5458\u66F2\u76EE / \u5DF2\u6309\u300C\u6D4F\u89C8\u5668\u5DF2\u767B\u5F55\u7F51\u6613\u4E91\u4F1A\u5458\u300D\u5904\u7406\uFF0C\u4E0D\u518D\u63D0\u793A
      </span>
      <button class="btn btn--sm" id="neVipUnset">\u6062\u590D\u63D0\u793A</button>
    </div>`;let e=t.alternatives||[],n=t.fragment===!0;return`
  <details class="ne-silent${n?" ne-silent--frag":""}" id="neSilent">
    <summary class="ne-silent__head">
      <span class="ne-silent__ico">!</span>
      <b>${n?"\u7AD9\u5185\u53EA\u6709\u8BD5\u542C\u7247\u6BB5":"\u8FD9\u9996\u6B4C\u672A\u767B\u5F55\u4F1A\u5458\u65F6\u4E0D\u4F1A\u51FA\u58F0"}</b>
      <span class="ne-silent__reason mono">${t.checking?"\u6B63\u5728\u627E\u66F4\u5B8C\u6574\u7684\u7248\u672C \u2026":d(t.reason||"\u7F51\u6613\u4E91\u4E0D\u5411\u533F\u540D\u8BF7\u6C42\u63D0\u4F9B\u97F3\u9891")}</span>
      <span class="ne-silent__toggle mono">\u8BE6\u60C5<i>\u25BE</i></span>
    </summary>
    <div class="ne-silent__body">
      <p class="ne-silent__text">
        ${n?"\u5B98\u65B9\u5916\u94FE\u53EA\u7ED9\u8BD5\u542C\u7247\u6BB5\uFF1B\u81EA\u52A8\u4E0B\u4E00\u9996\u6309\u5B9E\u9645\u97F3\u9891\u957F\u5EA6\u5207\uFF0C\u4E0D\u4F1A\u5E72\u7B49\u3002\u60F3\u542C\u5B8C\u6574\u7248\u53EF\u4EE5\u6362\u4E0B\u9762\u7684\u7248\u672C\u3002":"\u670D\u52A1\u5668\u62FF\u4E0D\u5230\u533F\u540D\u97F3\u9891\u3002\u5B98\u65B9\u64AD\u653E\u5668\u70B9 \u25B6 \u4ECD\u4F1A\u51FA\u58F0\uFF08\u624B\u673A\u6CA1\u58F0\u97F3\u901A\u5E38\u662F\u56E0\u4E3A\u4E0D\u5141\u8BB8\u81EA\u52A8\u8D77\u64AD\uFF09\uFF1B\u4E5F\u53EF\u4EE5\u76F4\u63A5\u6362\u6210\u4E0B\u9762\u80FD\u653E\u7684\u7248\u672C\u3002"}
      </p>
      ${e.length?`<div class="ne-silent__alts">
        <span class="k-label">${n?"\u66F4\u5B8C\u6574\u7684\u7248\u672C":"\u53EF\u64AD\u653E\u7684\u7248\u672C"}</span>
        ${e.map(a=>`<button class="ne-alt" data-alt='${d(JSON.stringify(a))}'>
          ${a.cover?`<img src="${d(a.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`:""}
          <span class="ne-alt__main">
            <span class="clamp-1">${d(a.name)}</span>
            <span class="mono faint" style="font-size:var(--fs-2xs)">${d((a.artists||[]).join(" / "))}</span>
          </span>
          <span class="mono faint" style="font-size:var(--fs-2xs)">\u25B6</span>
        </button>`).join("")}
      </div>`:t.checking?"":'<p class="ne-silent__text faint">\u6CA1\u627E\u5230\u540C\u540D\u7684\u514D\u8D39\u7248\u672C\uFF0C\u8BD5\u8BD5\u6362\u4E00\u9996\uFF0C\u6216\u53BB\u7F51\u6613\u4E91\u542C\u539F\u7248\u3002</p>'}
      <div class="ne-silent__acts">
        <a class="btn btn--sm" href="${j(t.id)}" target="_blank" rel="noopener noreferrer">${b.ext}\u53BB\u7F51\u6613\u4E91\u542C</a>
        <a class="btn btn--sm" href="orpheus://song/${d(String(t.id))}"
           title="\u7528\u4F60\u624B\u673A\u4E0A\u7684\u7F51\u6613\u4E91 App \u6253\u5F00\uFF08\u5982\u679C\u4F60\u7684\u6D4F\u89C8\u5668\u652F\u6301\u5524\u8D77 App\uFF09">App \u6253\u5F00</a>
        <button class="btn btn--sm" id="neSilentNext">\u6362\u4E0B\u4E00\u9996\u80FD\u64AD\u7684</button>
        ${n?"":'<button class="btn btn--sm" id="neVipSet" title="\u5B98\u65B9\u64AD\u653E\u5668\u5728 music.163.com \u4E0A\uFF0C\u4F1A\u5E26\u4E0A\u4F60\u81EA\u5DF1\u7684\u767B\u5F55\u72B6\u6001">\u6211\u767B\u5F55\u4E86\u4F1A\u5458\uFF0C\u80FD\u542C\u5230\u58F0\u97F3</button>'}
      </div>
    </div>
  </details>`}function Qt(){if(!s.current)return"";if(S.status==="loading")return'<span class="np-lyric__cur is-placeholder">\u6B63\u5728\u53D6\u6B4C\u8BCD \u2026</span>';if(S.status==="ready"){let e=S.current(),n=S.prev(),a=S.next();return`
      <span class="np-lyric__prev">${d(n?.text||"")}</span>
      <span class="np-lyric__cur${e?"":" is-placeholder"}">${d(e?.text||"\xB7 \xB7 \xB7")}</span>
      <span class="np-lyric__trans" id="npLyricTrans" ${e?.translation?"":"hidden"}>${d(e?.translation||"")}</span>
      <span class="np-lyric__next">${d(a?.text||"")}</span>`}return S.status==="local"?'<span class="np-lyric__cur is-placeholder">\u672C\u5730\u97F3\u9891 / \u6CA1\u6709\u6B4C\u8BCD\u6765\u6E90</span>':`<span class="np-lyric__cur is-placeholder">${d(S._msg||"\u8FD9\u9996\u6B4C\u6CA1\u6709\u53EF\u663E\u793A\u7684\u6B4C\u8BCD")}</span>`}function Zt(){let t=s.current;if(!t)return`<div class="np-empty">
      <span class="np-empty__mark" aria-hidden="true">${b.music}</span>
      <div>
        <b>\u8FD8\u6CA1\u6709\u9009\u4E2D\u7684\u66F2\u76EE</b>
        <p>\u641C\u7D22\u5E76\u70B9\u4E00\u9996\u6B4C\uFF0C\u6216\u4ECE\u4E0B\u9762\u7684\u64AD\u653E\u5217\u8868\u91CC\u70B9\u4E00\u884C\u3002\u64AD\u653E\u540E\u8FD9\u91CC\u4F1A\u663E\u793A\u5C01\u9762\u3001\u8FDB\u5EA6\u3001\u6B4C\u8BCD\u548C\u6C89\u6D78\u821E\u53F0\u5165\u53E3\u3002</p>
      </div>
    </div>`;let e=t.provider==="netease",n=s.isEmbed,a=Number(t.audioSeconds)||Number(t.duration)||0,r=s.tracks.length,p=s.index+1,v=s.repeat;return`
  <div class="np-stage${s.playing?" is-playing":""}${n?" is-embed":""}">
    <span class="np-stage__ghost" aria-hidden="true">${String(p).padStart(2,"0")}</span>
    <div class="np-stage__art">
      <div class="np-stage__cover">
        ${t.cover?`<img src="${d(t.cover)}" alt="\u5C01\u9762\uFF1A${d(t.title)}" referrerpolicy="no-referrer" />`:`<span class="np-stage__coverph">${b.disc}</span>`}
        <span class="np-stage__scan" aria-hidden="true"></span>
        <span class="np-stage__corner np-stage__corner--tl" aria-hidden="true"></span>
        <span class="np-stage__corner np-stage__corner--br" aria-hidden="true"></span>
        <span class="np-stage__state mono" id="npState">${s.playing?"PLAYING":"PAUSED"}</span>
      </div>
      <div class="np-stage__artfoot mono">
        <span>TRACK ${String(p).padStart(2,"0")} / ${String(r).padStart(2,"0")}</span>
        <span>${e?"NETEASE":"LOCAL FILE"}</span>
      </div>
    </div>

    <div class="np-stage__body">
      <div class="np-stage__kicker">
        <span class="k-label k-label--signal">${n?"OFFICIAL EMBED":"NOW PLAYING"}</span>
      </div>
      <h2 class="ne-now__title clamp-2">${d(t.title)} ${yt(t)}</h2>
      <div class="ne-now__sub mono">
        ${d(t.artist||"\u672A\u77E5\u6B4C\u624B")}${t.album&&t.album!==t.title?` / ${d(t.album)}`:""}
        ${e?` / <span class="np-meta-id">ID ${d(String(t.neteaseId||"\u2014"))}</span>`:""}
      </div>

      <button class="np-lyric" id="npLyricOpen" type="button" title="\u6253\u5F00\u6C89\u6D78\u6B4C\u8BCD" aria-label="\u6253\u5F00\u6C89\u6D78\u6B4C\u8BCD">
        <span class="np-lyric__head">
          <span class="np-lyric__label" id="npLyricLabel">LYRICS</span>
          <span class="np-lyric__hint mono">\u70B9\u51FB\u8FDB\u5165\u6C89\u6D78\u821E\u53F0 \u2197</span>
        </span>
        <span class="np-lyric__body" id="npLyricBody">${Qt()}</span>
      </button>

      <div class="np-progressrow">
        <div class="np-progress${n?" is-disabled":""}" id="npSeek" role="slider" tabindex="${n?-1:0}"
             aria-label="\u64AD\u653E\u8FDB\u5EA6" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
             aria-disabled="${n}" title="${n?"\u5B98\u65B9\u64AD\u653E\u5668\u4E0D\u652F\u6301\u7AD9\u5916\u62D6\u52A8\u8FDB\u5EA6":"\u62D6\u52A8\u8DF3\u8F6C"}">
          <span class="np-progress__fill" aria-hidden="true"></span>
          <span class="np-progress__knob" aria-hidden="true"></span>
        </div>
        <div class="np-time mono">
          <span id="npTime">00:00</span>
          <span class="np-time__slash">/</span>
          <span id="npDur">${a?M(a):"--:--"}</span>
          <span class="np-time__flag" id="npFlag" ${n?"":"hidden"}>EMBED</span>
        </div>
      </div>

      <div class="np-controls">
        <div class="np-controls__main">
          <button class="pbtn pbtn--sm" id="npPrev" title="\u4E0A\u4E00\u9996" aria-label="\u4E0A\u4E00\u9996">${b.prev}</button>
          <button class="pbtn pbtn--main" id="npPlay" title="${n?"\u64AD\u653E / \u6682\u505C\uFF08\u5B98\u65B9\u64AD\u653E\u5668\u6682\u505C\u540E\u4ECE\u5934\u64AD\u653E\uFF09":"\u64AD\u653E / \u6682\u505C"}" aria-label="${s.playing?"\u6682\u505C":"\u64AD\u653E"}">${s.playing?b.pause:b.play}</button>
          <button class="pbtn pbtn--sm" id="npNext" title="\u4E0B\u4E00\u9996" aria-label="\u4E0B\u4E00\u9996">${b.next}</button>
        </div>
        <div class="np-controls__aux">
          <button class="np-aux${s.shuffle?" is-on":""}" id="npShuffle" title="\u968F\u673A\u64AD\u653E" aria-label="\u968F\u673A\u64AD\u653E" aria-pressed="${s.shuffle}">${b.shuffle}</button>
          <button class="np-aux${v!=="off"?" is-on":""}" id="npRepeat" title="${v==="one"?"\u5355\u66F2\u5FAA\u73AF":v==="off"?"\u5217\u8868\u64AD\u5B8C\u5C31\u505C":"\u5217\u8868\u5FAA\u73AF"}" aria-label="\u5FAA\u73AF\u6A21\u5F0F" aria-pressed="${v!=="off"}">
            ${b.repeat}${v==="one"?'<b class="np-aux__one">1</b>':""}
          </button>
          <span class="np-controls__sep" aria-hidden="true"></span>
          <button class="np-aux" id="npMute" title="${n?"\u5B98\u65B9\u64AD\u653E\u5668\u97F3\u91CF\u8BF7\u5728\u64AD\u653E\u5668\u5185\u8C03\u6574":"\u9759\u97F3"}" aria-label="\u9759\u97F3">${n||s.muted?b.mute:b.vol}</button>
          <div class="np-vol${n?" is-disabled":""}" id="npVol" role="slider" tabindex="${n?-1:0}"
               aria-label="\u97F3\u91CF" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-disabled="${n}">
            <span class="np-vol__fill" aria-hidden="true"></span>
          </div>
        </div>
        <button class="np-stagebtn" id="npStage" type="button" title="\u6C89\u6D78\u821E\u53F0 \xB7 \u5168\u5C4F\u6B4C\u8BCD\uFF08Esc \u9000\u51FA\uFF09">
          <span class="np-stagebtn__ico" aria-hidden="true">${Gt}</span>
          <span>\u6C89\u6D78\u821E\u53F0</span>
        </button>
      </div>
    </div>
  </div>
  ${ge()}`}function Ut(t){let e=Date.now()-Number(t||0);if(!Number.isFinite(e)||e<0)return"";let n=Math.floor(e/6e4);if(n<1)return"\u521A\u521A";if(n<60)return`${n} \u5206\u949F\u524D`;let a=Math.floor(n/60);if(a<24)return`${a} \u5C0F\u65F6\u524D`;let r=Math.floor(a/24);return r<30?`${r} \u5929\u524D`:new Date(Number(t)).toISOString().slice(0,10)}function ye(t){let e=Number(t.seconds)||0,n=j(t.id);return`
  <div class="ne-hist__row" data-hist-id="${d(t.id)}">
    <span class="ne-hist__main">
      <span class="clamp-1"><b>${d(t.title||"\u672A\u547D\u540D\u66F2\u76EE")}</b></span>
      <span class="mono faint" style="font-size:var(--fs-2xs)">
        ${d(t.artist||"\u672A\u77E5\u6B4C\u624B")}${e>=1?` / \u4E0A\u6B21\u542C\u5230 ${M(e)}`:""}${t.plays>1?` / \u64AD\u653E ${t.plays} \u6B21`:""}${Ut(t.at)?` / ${Ut(t.at)}`:""}
      </span>
    </span>
    <span class="ne-hist__acts">
      <button class="btn btn--sm btn--signal" data-act="resume" title="${e>=1?`\u4ECE ${M(e)} \u7EE7\u7EED\u64AD\u653E`:"\u4ECE\u5934\u64AD\u653E"}">\u25B6 ${e>=1?"\u7EE7\u7EED\u64AD\u653E":"\u64AD\u653E"}</button>
      <a class="btn btn--sm" href="${d(n)}" target="_blank" rel="noopener noreferrer" title="\u5728\u7F51\u6613\u4E91\u6253\u5F00\u8FD9\u9996\u6B4C\uFF08\u53EA\u662F\u8DF3\u8F6C\uFF0C\u4E0D\u643A\u5E26\u6211\u4EEC\u8FD9\u8FB9\u7684\u4EFB\u4F55\u6570\u636E\uFF09">${b.ext}</a>
    </span>
  </div>`}function te(){let t=K();if(!t.length)return`<p class="ne-hist__empty faint">
      \u8FD8\u6CA1\u6709\u64AD\u653E\u8BB0\u5F55\u3002\u5728\u7AD9\u5185\u64AD\u653E\u4EFB\u610F\u4E00\u9996\uFF08\u771F\u7684\u51FA\u58F0\uFF09\u4E4B\u540E\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF1A
      \u8BB0\u5F55\u53EA\u5B58\u5728\u4F60\u7684\u6D4F\u89C8\u5668\u91CC\uFF0C\u767B\u5F55\u540E\u53E6\u5916\u5B58\u4E00\u4EFD\u5728\u4F60\u81EA\u5DF1\u7684\u8D26\u53F7\u4E0B\uFF1B\u6211\u4EEC\u4E0D\u4F1A\u628A\u5B83\u53D1\u7ED9\u7F51\u6613\u4E91\u3002
    </p>`;let e=Yt(5);return`
    <div class="ne-hist__list">${t.slice(0,12).map(ye).join("")}</div>
    ${t.length>12?`<p class="mono faint" style="font-size:var(--fs-2xs);margin:var(--sp-2) 0 0">
      \u53EA\u663E\u793A\u6700\u8FD1 12 \u6761 / \u5171 ${t.length} \u6761\uFF08\u4E0A\u9650 ${W} \u6761\uFF0C\u8D85\u51FA\u4E22\u6700\u65E7\u7684\uFF09</p>`:""}
    ${e.length>1?`<div class="ne-hist__freq">
      <span class="k-label">\u5E38\u542C</span>
      ${e.map(n=>`<button class="chip" data-hist-id="${d(n.id)}" data-act="resume" title="\u64AD\u653E ${n.plays} \u6B21 \xB7 \u70B9\u4E00\u4E0B\u7EE7\u7EED\u542C">${d(n.title||n.id)}</button>`).join("")}
    </div>`:""}`}function q(t){let e=l("#neResults");e&&t!==void 0&&(e.innerHTML=t)}function R(){let t=l("#playlistWrap");t&&(t.innerHTML=Jt());let e=l("#plShuffle");e&&e.setAttribute("aria-pressed",String(s.shuffle));let n=s.tracks.length,a=`${String(n).padStart(2,"0")} TRACKS`,r=l("#trackCount");r&&(r.textContent=a);let p=l("#metaTracks");p&&(p.textContent=a)}function x(){let t=l("#neNow");t&&(t.innerHTML=Zt(),o.lyricKey="",$e(),gt(),U());let e=l("#npSource");if(e){let a=s.current;e.textContent=a?a.provider==="netease"?"NETEASE":"\u672C\u5730\u97F3\u9891":"\u5F85\u673A"}let n=l("#stageTop");n&&(n.disabled=!s.current)}var ht=null,ee=null;function gt(){let t=l("#neNow");if(!t)return;let e=s.current,n=l(".np-stage",t);if(!e||!n)return;let a=Number(e.audioSeconds)||Number(e.duration)||0,r=s.isEmbed?s.elapsed:s.currentTime||0,p=a?Math.min(1,Math.max(0,r/a)):0;ht?.set(p),ht?.dragging||(l("#npTime")&&(l("#npTime").textContent=M(r)),l("#npDur")&&(l("#npDur").textContent=a?M(a):"--:--"));let v=l("#npState");v&&(v.textContent=s.playing?"PLAYING":"PAUSED");let L=l("#npFlag");L&&(L.hidden=!s.isEmbed);let w=l("#npPlay");w&&(w.innerHTML=s.playing?b.pause:b.play,w.setAttribute("aria-label",s.playing?"\u6682\u505C":"\u64AD\u653E"),w.title=s.isEmbed?"\u64AD\u653E / \u6682\u505C\uFF08\u5B98\u65B9\u64AD\u653E\u5668\u6682\u505C\u540E\u4ECE\u5934\u64AD\u653E\uFF09":"\u64AD\u653E / \u6682\u505C"),n.classList.toggle("is-playing",!!s.playing),n.classList.toggle("is-embed",!!s.isEmbed);let A=l("#npShuffle");A&&(A.classList.toggle("is-on",s.shuffle),A.setAttribute("aria-pressed",String(s.shuffle)));let C=s.repeat,D=l("#npRepeat");D&&(D.classList.toggle("is-on",C!=="off"),D.setAttribute("aria-pressed",String(C!=="off")),D.title=C==="one"?"\u5355\u66F2\u5FAA\u73AF":C==="off"?"\u5217\u8868\u64AD\u5B8C\u5C31\u505C":"\u5217\u8868\u5FAA\u73AF",D.innerHTML=`${b.repeat}${C==="one"?'<b class="np-aux__one">1</b>':""}`);let Y=l("#npMute");if(Y){let H=s.isEmbed||s.muted;Y.innerHTML=H?b.mute:b.vol,Y.title=s.isEmbed?"\u5B98\u65B9\u64AD\u653E\u5668\u97F3\u91CF\u8BF7\u5728\u64AD\u653E\u5668\u5185\u8C03\u6574":s.muted?"\u53D6\u6D88\u9759\u97F3":"\u9759\u97F3"}let I=l("#npSeek");I&&(I.classList.toggle("is-disabled",!!s.isEmbed),I.setAttribute("aria-disabled",String(!!s.isEmbed)),I.tabIndex=s.isEmbed?-1:0,I.title=s.isEmbed?"\u5B98\u65B9\u64AD\u653E\u5668\u4E0D\u652F\u6301\u7AD9\u5916\u62D6\u52A8\u8FDB\u5EA6":"\u62D6\u52A8\u8DF3\u8F6C");let O=l("#npVol");O&&(ee?.set(s.isEmbed?0:s.volume),O.classList.toggle("is-disabled",!!s.isEmbed),O.setAttribute("aria-disabled",String(!!s.isEmbed)),O.tabIndex=s.isEmbed?-1:0)}function U(){let t=l("#npLyricBody");if(!t||!s.current)return;let e=S.current()?.translation||"",n=`${S.status}|${S.index}|${S.current()?.text||""}|${e}`;if(n===o.lyricKey)return;let a=o.lyricKey==="";o.lyricKey=n,t.innerHTML=Qt();let r=l("#npLyricLabel");if(r&&(r.textContent=S.status==="ready"?e?"LYRICS / \u539F\u6587 + \u8BD1\u6587":"LYRICS / \u539F\u6587":S.status==="loading"?"LYRICS / LOADING":S.status==="local"?"LYRICS / LOCAL AUDIO":"LYRICS"),!a){let p=l(".np-lyric__cur",t);p?.animate&&!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches&&p.animate([{opacity:0,transform:"translateY(10px)"},{opacity:1,transform:"none"}],{duration:260,easing:"cubic-bezier(.16,.84,.3,1)"})}}function F(){let t=l("#embedWrap");t&&(t.innerHTML=Xt(),t.hidden=!T.active,T.active&&T.noteRoute("music"))}function st(){let t=l("#neHistory");t&&(t.innerHTML=te());let e=l("#histCount");if(e){let n=K().length;e.textContent=n?`${n} TRACKS`:"EMPTY"}_e()}async function ve(t){let e=zt(t);if(!e){f.err("\u8FD9\u6761\u8BB0\u5F55\u5DF2\u7ECF\u4E0D\u5728\u5386\u53F2\u91CC\u4E86");return}let n=s.tracks.findIndex(r=>String(r.neteaseId||r.id)===String(t)),a=Math.max(0,Number(e.seconds)||0);if(n>=0){s.prepare(n,{autoplay:!0}),mt(a),f.show(a>=1?`\u4ECE ${M(a)} \u7EE7\u7EED\u64AD\u653E`:"\u4ECE\u5934\u64AD\u653E");return}try{let[r]=await rt([t]);if(!r){let v=await vt.api("/netease/login/cloud?limit=200").catch(()=>null),L=v?.ok?(v.data?.songs||[]).find(A=>String(A.id)===String(t)):null;if(!L){f.err("\u53D6\u4E0D\u5230\u8FD9\u9996\u6B4C\u7684\u4FE1\u606F\uFF08\u53EF\u80FD\u5DF2\u4E0B\u67B6\uFF0C\u6216\u4E0D\u5728\u4E91\u76D8\u91CC\uFF09");return}let w={...V(L),cloud:!0,src:L.audio||""};s.add(w,{play:!0}),P(s.tracks),mt(a);return}let p=V(r);s.add(p,{play:!0}),P(s.tracks),mt(a)}catch(r){f.err(`\u53D6\u4E0D\u5230\u8FD9\u9996\u6B4C\u7684\u4FE1\u606F\uFF1A${String(r?.message||r)}`)}}function mt(t){if(!(t>=1))return;let e=0,n=()=>{if(!s.isEmbed){if(s.duration>0){s.seek(t);return}++e>40||setTimeout(n,250)}};n()}function _e(){let t=l("#neHistory");t&&(_t('[data-act="resume"]',t).forEach(e=>{e.addEventListener("click",()=>{let n=e.dataset.histId||e.closest("[data-hist-id]")?.dataset.histId;n&&ve(n)})}),l("#histClear")?.addEventListener("click",()=>{if(!K().length){f.show("\u8FD8\u6CA1\u6709\u64AD\u653E\u8BB0\u5F55");return}confirm(`\u6E05\u7A7A\u7AD9\u5185\u64AD\u653E\u8BB0\u5F55\uFF1F

\u53EA\u6E05\u6211\u4EEC\u8FD9\u8FB9\u7684\u8BB0\u5F55\uFF08\u4F60\u6D4F\u89C8\u5668\u91CC + \u4F60\u8D26\u53F7\u4E0B\u7684\u90A3\u4E00\u4EFD\uFF09\uFF0C\u4E0D\u4F1A\u5F71\u54CD\u4F60\u5728\u7F51\u6613\u4E91\u7684\u4EFB\u4F55\u6570\u636E\uFF0C\u4E5F\u4E0D\u4F1A\u53D6\u6D88\u4EFB\u4F55\u6536\u85CF\u3002`)&&(Wt(),f.ok("\u5DF2\u6E05\u7A7A\u7AD9\u5185\u64AD\u653E\u8BB0\u5F55"),st())}))}function $e(){l("#npPlay")?.addEventListener("click",()=>s.toggle()),l("#npPrev")?.addEventListener("click",()=>s.prev()),l("#npNext")?.addEventListener("click",()=>s.next()),l("#npShuffle")?.addEventListener("click",()=>{s.setShuffle(!s.shuffle),f.show(s.shuffle?"\u968F\u673A\u64AD\u653E\uFF1A\u5F00":"\u968F\u673A\u64AD\u653E\uFF1A\u5173")}),l("#npRepeat")?.addEventListener("click",()=>{let t=["all","one","off"],e=t[(t.indexOf(s.repeat)+1)%t.length];s.setRepeat(e),f.show(e==="one"?"\u5355\u66F2\u5FAA\u73AF":e==="off"?"\u5217\u8868\u64AD\u5B8C\u5C31\u505C":"\u5217\u8868\u5FAA\u73AF")}),l("#npMute")?.addEventListener("click",()=>s.toggleMute()),l("#npStage")?.addEventListener("click",()=>G.open()),l("#npLyricOpen")?.addEventListener("click",()=>G.open()),ht=lt(l("#npSeek"),{onInput:(t,e)=>{let n=s.current;if(!n)return;let a=Number(n.audioSeconds)||Number(n.duration)||0;if(a){let r=l("#npTime");r&&(r.textContent=M(a*t))}e&&(s.isEmbed?f.show("\u5B98\u65B9\u64AD\u653E\u5668\u7684\u8FDB\u5EA6\u6761\u65E0\u6CD5\u4ECE\u7AD9\u5185\u62D6\u52A8"):s.seekRatio(t))}}),ee=lt(l("#npVol"),{onInput:t=>{s.isEmbed||(s.setVolume(t),s.muted&&s.toggleMute())}})}export{Ke as default};
