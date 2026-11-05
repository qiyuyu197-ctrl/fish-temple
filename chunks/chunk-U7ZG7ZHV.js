import{a as m,c as b,d as X,e as J,f as Z,g as tt,h as x,l as et,s as nt,t as F,u as at,x as P}from"./chunk-C4U237QN.js";import{a as d}from"./chunk-DDIRHU7Q.js";import{a as $,d as p}from"./chunk-BUFEAOIA.js";import{q as w,r as B}from"./chunk-KSYHGNLY.js";var Q=[],y=null,ut=()=>window.matchMedia?.("(prefers-reduced-motion: reduce)").matches||document.documentElement.dataset.reduceMotion==="1",pt=170,bt=260,C="";function Et(t){let a=String(t||"");a!==C&&(C=a,j())}function h(t,a,{distance:e="0.7em"}={}){if(!t)return;let n=String(a??"");if(t.dataset.text===n)return;if(t.dataset.text=n,ut()||!t.animate){t.textContent=n;return}t._rollOut?.cancel(),t._rollIn?.cancel();let s=t.animate([{opacity:1,transform:"none"},{opacity:0,transform:`translateY(-${e}) rotateX(62deg)`}],{duration:pt,easing:"cubic-bezier(.4,0,1,.6)",fill:"forwards"});t._rollOut=s,s.finished.then(()=>{if(t._rollOut!==s)return;t.textContent=n;let l=t.animate([{opacity:0,transform:`translateY(${e}) rotateX(-62deg)`},{opacity:1,transform:"none"}],{duration:bt,easing:"cubic-bezier(.16,.84,.3,1)",fill:"forwards"});t._rollIn=l,l.finished.then(()=>{t._rollIn===l&&(l.cancel(),s.cancel(),t._rollIn=null,t._rollOut=null)}).catch(()=>{})}).catch(()=>{})}function j(){let t=$("#lyricBox");if(!t)return;let a=$("#lyricLabel"),e=$("#lyricCur"),n=$("#lyricNext"),s=b.track;if(!s){t.hidden=!0;return}t.hidden=!1,t.classList.toggle("is-silent",!!C);let l=(r,u="")=>{a&&(a.textContent=C?`${r} / ${C}`:r,a.dataset.tone=C?"alert":u)},o=s.title||"\u672A\u547D\u540D\u66F2\u76EE";switch(b.status){case"loading":l(`NOW PLAYING / ${o}`),h(e,"\u6B63\u5728\u53D6\u6B4C\u8BCD \u2026"),h(n,"");break;case"ready":{let r=b.current(),u=b.next();l(`LYRICS / ${o}`),h(e,r?r.text:"\xB7 \xB7 \xB7"),h(n,u?u.text:"");break}case"empty":l(`NOW PLAYING / ${o}`,"muted"),h(e,b._msg||"\u6CA1\u6709\u53EF\u663E\u793A\u7684\u6B4C\u8BCD"),h(n,"");break;case"error":l(`NOW PLAYING / ${o}`,"muted"),h(e,b._msg||"\u6B4C\u8BCD\u83B7\u53D6\u5931\u8D25"),h(n,"");break;case"local":l(`NOW PLAYING / ${o}`,"muted"),h(e,"\u672C\u5730\u97F3\u9891 / \u6CA1\u6709\u6B4C\u8BCD\u6765\u6E90"),h(n,"");break;default:t.hidden=!0}}function D(){y?.remove(),y=null,document.removeEventListener("keydown",st),document.body.classList.remove("is-locked")}function st(t){t.key==="Escape"&&D()}function ot(){if(!y)return;let t=y.querySelector(".lyricfull__list");if(!t)return;let a=b.track,e=y.querySelector(".lyricfull__title");e&&(e.textContent=a?.title||"\u2014");let n=y.querySelector(".lyricfull__artist");if(n&&(n.textContent=a?.artist||""),!b.lines.length){t.innerHTML=`<p class="lyricfull__empty">${p(b._msg||"\u8FD9\u9996\u6B4C\u6CA1\u6709\u53EF\u663E\u793A\u7684\u6B4C\u8BCD")}</p>`;return}let s=b.lines.map((o,r)=>`<p class="lyricfull__line${r===b.index?" is-cur":""}" data-line="${r}">${p(o.text)}</p>`).join("");t.dataset.count!==String(b.lines.length)?(t.innerHTML=s,t.dataset.count=String(b.lines.length)):t.querySelectorAll(".lyricfull__line").forEach((o,r)=>{o.classList.toggle("is-cur",r===b.index)});let l=t.querySelector(".lyricfull__line.is-cur");if(l){let o=l.offsetTop-t.clientHeight/2+l.offsetHeight/2,r=Math.abs(t.scrollTop-o)<t.clientHeight;t.scrollTo({top:Math.max(0,o),behavior:r?"smooth":"auto"})}}function ft(){y||!b.track||(y=document.createElement("div"),y.className="lyricfull",y.innerHTML=`
    <div class="lyricfull__panel" role="dialog" aria-label="\u5B8C\u6574\u6B4C\u8BCD">
      <div class="lyricfull__head">
        <span class="lyricfull__meta">
          <b class="lyricfull__title">\u2014</b>
          <i class="lyricfull__artist mono"></i>
        </span>
        <span class="lyricfull__acts">
          <span class="mono lyricfull__hint">\u6B4C\u8BCD\u6309 LRC \u65F6\u95F4\u8F74\u8DDF\u5531 \xB7 \u7AD9\u5185\u76F4\u653E\u7528\u771F\u5B9E\u8FDB\u5EA6\uFF0C\u5B98\u65B9\u64AD\u653E\u5668\u4E3A\u4F30\u7B97</span>
          <button class="btn btn--sm" id="lyricOffsetBack" title="\u6B4C\u8BCD\u63D0\u524D 0.5 \u79D2">\u22120.5s</button>
          <button class="btn btn--sm" id="lyricOffsetFwd" title="\u6B4C\u8BCD\u5EF6\u540E 0.5 \u79D2">+0.5s</button>
          <button class="btn btn--sm" id="lyricClose">\u2715 \u5173\u95ED</button>
        </span>
      </div>
      <div class="lyricfull__list mono"></div>
    </div>`,document.body.append(y),document.body.classList.add("is-locked"),document.addEventListener("keydown",st),y.addEventListener("click",t=>{if(t.target===y)return D();let a=t.target.closest("button")?.id;if(a==="lyricClose")return D();if(a==="lyricOffsetFwd"){b.setOffset(b.offset+500);return}if(a==="lyricOffsetBack"){b.setOffset(b.offset-500);return}let e=t.target.closest(".lyricfull__line");if(e){let n=Number(e.dataset.line),s=b.lines[n]?.t;Number.isFinite(s)&&(b.index=n,b.setOffset(-s))}}),ot())}function Ct(){if(Q.length)return;let t=()=>{j(),ot()};return Q=[w.on("lyrics:ready",t),w.on("lyrics:line",t),w.on("lyrics:idle",t),w.on("route:change",()=>setTimeout(t,40))],document.addEventListener("click",a=>{a.target.closest("#lyricBox")&&ft()}),j(),Q}var mt=2200,M=3,i={loaded:!1,available:!0,enabled:!1,mode:"owner",canBind:!1,reason:"",riskNotice:"",siteUser:null,bound:null,error:"",busy:!1};async function L(t,a){try{return await B.api(t,a)}catch(e){return{ok:!1,status:0,data:null,error:String(e?.message||e)}}}async function U(){let t=await L("/netease/login/status");if(t.status===0)return i.available=!1,i.loaded=!0,i;if(!t.ok||!t.data){let n=t.status===404||t.status===501?await et(!0).catch(()=>!1):!1;return i.available=n,i.stale=n,i.loaded=!0,i.error=t.error||`HTTP ${t.status}`,i}let a=t.data;return Object.assign(i,{available:!0,stale:!1,loaded:!0,enabled:!!a.enabled,mode:a.mode||"owner",canBind:!!a.canBind,reason:a.reason||"",riskNotice:a.riskNotice||"",siteUser:a.siteUser||null,bound:a.bound||null,error:""}),i}function it(t){let a=String(t?.nickname||"?").trim().slice(0,1)||"?";return t?.avatarUrl?`<img class="neacct__avatar" src="${p(t.avatarUrl)}" alt="" width="34" height="34" loading="lazy" referrerpolicy="no-referrer" />`:`<span class="neacct__avatar neacct__avatar--text" aria-hidden="true">${p(a)}</span>`}function _t(){if(!i.available)return"";if(i.stale)return`<div class="neacct__row">
      <span class="neacct__state mono">OLD</span>
      <div class="neacct__who">
        <b class="neacct__name">\u670D\u52A1\u7AEF\u8FD8\u662F\u65E7\u7248\u672C</b>
        <span class="neacct__meta">\u9759\u6001\u6587\u4EF6\u5DF2\u7ECF\u662F\u65B0\u7684\uFF0C\u4F46 <span class="mono">/api</span> \u7684\u4EE3\u7801\u53EA\u5728\u8FDB\u7A0B\u542F\u52A8\u65F6\u52A0\u8F7D \u2014\u2014
          \u91CD\u542F\u4E00\u4E0B <span class="mono">node server.mjs</span>\uFF08\u6216 <span class="mono">start.cmd</span>\uFF09\uFF0C\u5237\u65B0\u540E\u8FD9\u91CC\u5C31\u6709\u626B\u7801\u5165\u53E3\u4E86\u3002</span>
      </div>
    </div>`;if(!i.enabled)return`<div class="neacct__row">
      <span class="neacct__state mono">OFF</span>
      <span class="muted">\u672C\u7AD9\u6CA1\u6709\u5F00\u542F\u7F51\u6613\u4E91\u767B\u5F55</span>
    </div>`;if(i.bound){let t=i.bound;return`
      <div class="neacct__row">
        ${it(t)}
        <div class="neacct__who">
          <b class="neacct__name">${p(t.nickname||"\u7F51\u6613\u4E91\u8D26\u53F7")}</b>
          <span class="neacct__meta mono">UID ${p(t.uid||"\u2014")} \xB7 \u5DF2\u7ED1\u5B9A</span>
        </div>
        <span class="grow"></span>
        <button class="btn btn--sm" id="neLibrary" type="button">\u6211\u7684\u6B4C\u5355</button>
        <button class="btn btn--sm" id="neRecommend" type="button">\u6BCF\u65E5\u63A8\u8350</button>
        <button class="btn btn--sm" id="neCloud" type="button">\u4E91\u76D8</button>
        <button class="btn btn--sm" id="neAccountSettings" type="button">\u8BBE\u7F6E</button>
        <button class="btn btn--sm btn--danger" id="neUnbind" type="button">\u89E3\u7ED1</button>
      </div>`}return i.canBind?`
    <div class="neacct__row">
      <span class="neacct__state mono">OFFLINE</span>
      <div class="neacct__who">
        <b class="neacct__name">\u8FD8\u6CA1\u8FDE\u63A5\u7F51\u6613\u4E91</b>
        <span class="neacct__meta">\u626B\u7801\u540E\u53EF\u4EE5\u5BFC\u5165\u81EA\u5DF1\u7684\u6B4C\u5355\u3001\u770B\u6211\u559C\u6B22\u7684\u97F3\u4E50\u3001\u8BFB\u6BCF\u65E5\u63A8\u8350</span>
      </div>
      <span class="grow"></span>
      <button class="btn btn--sm btn--signal" id="neLogin" type="button">\u626B\u7801\u767B\u5F55</button>
    </div>`:`<div class="neacct__row">
      <span class="neacct__state mono">${i.mode==="owner"?"OWNER":"CLOSED"}</span>
      <span class="muted">${p(i.reason||"\u5F53\u524D\u8D26\u53F7\u4E0D\u80FD\u7ED1\u5B9A\u7F51\u6613\u4E91")}</span>
      ${i.siteUser?"":'<span class="grow"></span><span class="muted">\u5148\u5728\u53F3\u4E0A\u89D2\u767B\u5F55\u672C\u7AD9\u8D26\u53F7</span>'}
    </div>`}function yt(){return`
    <section class="neacct" id="neAccount" aria-live="polite" hidden>
      <div class="neacct__head">
        <span class="ne-eyebrow">// NETEASE ACCOUNT</span>
        <b>\u7F51\u6613\u4E91\u8D26\u53F7</b>
      </div>
      <div class="neacct__body" id="neAccountBody">
        <div class="neacct__row"><span class="neacct__state mono">CHECK</span><span class="muted">\u6B63\u5728\u8BFB\u53D6\u767B\u5F55\u72B6\u6001\u2026</span></div>
      </div>
    </section>`}function O(){let t=$("#neAccount"),a=$("#neAccountBody");if(!(!t||!a)){if(!i.available){t.hidden=!0;return}t.hidden=!1,a.innerHTML=_t()}}var c=null,E=null,N=null,T=0;function g(){q(),c&&(c.remove(),c=null)}function q(){E&&(clearTimeout(E),E=null),N=null,T=0}function V(t,a){let e=document.createElement("div");return e.className="authpanel__scrim",e.innerHTML=`
    <div class="authpanel neacct__panel" role="dialog" aria-modal="true" aria-labelledby="nePanelTitle">
      <div class="authpanel__head">
        <b id="nePanelTitle">${p(t)}</b>
        <button class="authpanel__x" id="nePanelClose" type="button" aria-label="\u5173\u95ED">\xD7</button>
      </div>
      <div class="neacct__panelbody">${a}</div>
    </div>`,e.addEventListener("click",n=>{n.target===e&&g()}),e.addEventListener("keydown",n=>{n.key==="Escape"&&(n.preventDefault(),g())}),e.querySelector("#nePanelClose")?.addEventListener("click",g),document.body.append(e),e}var ct=()=>i.riskNotice?`<p class="neacct__risk mono">${p(i.riskNotice)}</p>`:'<p class="neacct__risk mono">\u626B\u7801\u540E\u672C\u7AD9\u4F1A\u4FDD\u7BA1\u4E00\u4E2A\u767B\u5F55\u51ED\u636E\uFF1B\u5EFA\u8BAE\u7528\u5C0F\u53F7\u3002</p>';function vt(){return`
    <p class="authpanel__lead">\u6253\u5F00\u7F51\u6613\u4E91 App \u2192 \u5DE6\u4E0A\u89D2\u626B\u4E00\u626B\uFF1BApp \u91CC\u4E5F\u53EF\u4EE5\u76F4\u63A5\u70B9\u300C\u5B98\u65B9\u9875\u9762\u767B\u5F55\u300D\u3002</p>
    <div class="neacct__actions" id="neOfficialRow" hidden>
      <button class="btn btn--sm btn--signal" id="neOfficialLogin" type="button">\u6253\u5F00\u7F51\u6613\u4E91\u5B98\u65B9\u767B\u5F55\u9875\uFF08\u63A8\u8350\uFF09</button>
    </div>
    <div class="neacct__qr" id="neQrBox">
      <div class="neacct__qrph mono">\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026</div>
    </div>
    <p class="neacct__status mono" id="neQrStatus">\u51C6\u5907\u4E2D\u2026</p>
    <div class="neacct__actions">
      <button class="btn btn--sm" id="neQrRefresh" type="button">\u91CD\u65B0\u751F\u6210</button>
      <button class="btn btn--sm" id="neQrFallback" type="button" hidden>\u6539\u7528\u672C\u7AD9\u4E8C\u7EF4\u7801</button>
    </div>
    <p class="neacct__hint mono">
      \u624B\u673A\u63D0\u793A\u300C\u68C0\u6D4B\u5230\u5F53\u524D\u8BBE\u5907\u73AF\u5883\u5F02\u5E38 / \u672C\u6B21\u64CD\u4F5C\u5DF2\u62E6\u622A\u300D\u65F6\uFF0C\u90A3\u662F<b>\u7F51\u6613\u4E91\u81EA\u5DF1\u7684\u98CE\u63A7</b>\uFF0C\u4E0D\u662F\u4E8C\u7EF4\u7801\u574F\u4E86\u3002
      \u5148\u522B\u518D\u5237\u65B0\uFF08\u8D8A\u70B9\u8D8A\u50CF\u5F02\u5E38\uFF09\uFF0C\u9694\u4E00\u4F1A\u513F\u6216\u6362\u7F51\u7EDC\u518D\u8BD5\uFF1B\u6025\u7528\u5C31\u8D70\u4E0B\u9762\u8FD9\u6761\u3002
      \u5728 App \u91CC\u4E5F\u53EF\u4EE5\u76F4\u63A5\u70B9\u300C\u5B98\u65B9\u9875\u9762\u767B\u5F55\u300D\uFF0C\u7531\u7F51\u6613\u4E91\u81EA\u5DF1\u7684\u9875\u9762\u626B\u7801 / \u8D26\u53F7\u5BC6\u7801\u767B\u5F55\u3002
    </p>
    <details class="neacct__manual">
      <summary>\u626B\u7801\u88AB\u62E6\uFF1F\u6539\u7528\u6D4F\u89C8\u5668\u91CC\u7684 MUSIC_U \u8FDE\u63A5</summary>
      <ol class="neacct__steps">
        <li>\u5728\u6D4F\u89C8\u5668\u6253\u5F00 <span class="mono">music.163.com</span> \u5E76\u767B\u5F55\uFF08\u4F60\u5DF2\u7ECF\u767B\u5F55\u8FC7\u5C31\u8DF3\u8FC7\uFF09</li>
        <li>F12 \u2192 Application\uFF08\u5E94\u7528\uFF09\u2192 Cookies \u2192 <span class="mono">https://music.163.com</span></li>
        <li>\u627E\u5230 <span class="mono">MUSIC_U</span>\uFF0C\u590D\u5236\u5B83\u7684\u503C\uFF08\u5F88\u957F\u7684\u4E00\u4E32\uFF09\uFF0C\u7C98\u5230\u4E0B\u9762</li>
      </ol>
      <textarea id="neCookieInput" class="neacct__cookieinput" rows="3" spellcheck="false"
        placeholder="MUSIC_U=\u2026\uFF08\u53EA\u7C98\u503C\u4E5F\u53EF\u4EE5\uFF09"></textarea>
      <div class="neacct__actions">
        <button class="btn btn--sm btn--signal" id="neCookieGo" type="button">\u7528\u8FD9\u4E2A Cookie \u8FDE\u63A5</button>
      </div>
      <p class="neacct__risk mono">MUSIC_U \u7B49\u4E8E\u5B8C\u6574\u767B\u5F55\u6001\uFF0C\u6BD4\u626B\u7801\u62FF\u5230\u7684\u4F1A\u8BDD\u66F4\u654F\u611F\uFF1A\u53EA\u586B\u7ED9\u4F60\u81EA\u5DF1\u7684\u7AD9\u70B9\uFF0C\u522B\u53D1\u7ED9\u4EFB\u4F55\u4EBA\u3002</p>
    </details>
    ${ct()}`}async function W(){if(c){c.querySelector("#nePanelClose")?.focus?.();return}if(!i.available){d.show("\u8FD9\u4E2A\u90E8\u7F72\u6CA1\u6709\u670D\u52A1\u7AEF\uFF0C\u7F51\u6613\u4E91\u767B\u5F55\u4E0D\u53EF\u7528","err");return}if(!i.enabled){d.show("\u672C\u7AD9\u6CA1\u6709\u5F00\u542F\u7F51\u6613\u4E91\u767B\u5F55","err");return}if(!i.canBind){d.show(i.reason||"\u5F53\u524D\u8D26\u53F7\u4E0D\u80FD\u7ED1\u5B9A\u7F51\u6613\u4E91","err");return}if(i.bound){K();return}c=V("\u8FDE\u63A5\u7F51\u6613\u4E91\u8D26\u53F7",vt()),c.querySelector("#neQrRefresh")?.addEventListener("click",()=>{Y()}),c.querySelector("#neCookieGo")?.addEventListener("click",()=>{gt()});let t=c.querySelector("#neOfficialRow");if(t&&window.FTNative?.openNeteaseLogin){t.hidden=!1;let a=c.querySelector("#neQrBox"),e=c.querySelector("#neQrRefresh"),n=c.querySelector("#neQrFallback");a&&(a.hidden=!0),e&&(e.hidden=!0),n&&(n.hidden=!1,n.addEventListener("click",()=>{a&&(a.hidden=!1),e&&(e.hidden=!1),n.hidden=!0,Y()})),v("\u70B9\u4E0A\u9762\u7684\u300C\u5B98\u65B9\u9875\u9762\u767B\u5F55\u300D\uFF1B\u767B\u5F55\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u7ED1\u5B9A","warn"),c.querySelector("#neOfficialLogin")?.addEventListener("click",async()=>{let s=await B.token();if(!s){d.show("\u5148\u767B\u5F55\u672C\u7AD9\u8D26\u53F7\uFF0C\u518D\u8FDE\u7F51\u6613\u4E91","err");return}try{window.FTNative.openNeteaseLogin(s),v("\u5DF2\u6253\u5F00\u7F51\u6613\u4E91\u5B98\u65B9\u767B\u5F55\u9875\uFF1B\u767B\u5F55\u5B8C\u6210\u540E\u4F1A\u81EA\u52A8\u7ED1\u5B9A\u2026","warn")}catch{d.show("\u6253\u4E0D\u5F00\u5B98\u65B9\u767B\u5F55\u9875\uFF0C\u8BD5\u8BD5\u4E0B\u9762\u7684 MUSIC_U","err")}});return}await Y()}function K(){g();let t=i.bound;c=V("\u7F51\u6613\u4E91\u8D26\u53F7",`
    <div class="neacct__profile">
      ${it(t)}
      <div class="neacct__who">
        <b class="neacct__name">${p(t.nickname||"\u7F51\u6613\u4E91\u8D26\u53F7")}</b>
        <span class="neacct__meta mono">UID ${p(t.uid||"\u2014")}${t.vipType?" \xB7 VIP":""}</span>
        <span class="neacct__meta mono">\u7ED1\u5B9A\u4E8E ${p(String(t.boundAt||"").slice(0,10))}</span>
      </div>
    </div>
    <div class="neacct__actions">
      <button class="btn btn--sm btn--signal" id="nePanelLibrary" type="button">\u6211\u7684\u6B4C\u5355</button>
      <button class="btn btn--sm" id="nePanelRecommend" type="button">\u6BCF\u65E5\u63A8\u8350</button>
      <button class="btn btn--sm" id="nePanelCloud" type="button">\u4E91\u76D8</button>
      <button class="btn btn--sm btn--danger" id="nePanelUnbind" type="button">\u89E3\u7ED1</button>
    </div>
    <label class="neacct__replace">
      <input type="checkbox" id="neUseVip" ${Z()?"checked":""}/>
      \u7528\u8FD9\u4E2A\u8D26\u53F7\u64AD\u653E\u4F1A\u5458\u66F2\u76EE\uFF08\u7ECF\u7531\u672C\u7AD9\u8F6C\u53D1\uFF0C\u53EF\u80FD\u89E6\u53D1\u7F51\u6613\u4E91\u98CE\u63A7\uFF09
    </label>
    <label class="neacct__replace">\u97F3\u8D28
      <select id="neAudioLevel" class="neacct__select">
        ${[["standard","\u6807\u51C6 128k"],["exhigh","\u9AD8 320k"],["lossless","\u65E0\u635F"],["hires","Hi-Res"]].map(([e,n])=>`<option value="${e}" ${X()===e?"selected":""}>${n}</option>`).join("")}
      </select>
      <span class="muted" style="font-size:var(--fs-2xs)">\u5B9E\u9645\u6863\u4F4D\u7531\u7F51\u6613\u4E91\u6309\u8D26\u53F7\u6743\u9650\u51B3\u5B9A</span>
    </label>
    ${ct()}`),c.querySelector("#nePanelLibrary")?.addEventListener("click",()=>{g(),A("playlists")}),c.querySelector("#nePanelRecommend")?.addEventListener("click",()=>{g(),A("recommend")}),c.querySelector("#nePanelCloud")?.addEventListener("click",()=>{g(),A("cloud")}),c.querySelector("#nePanelUnbind")?.addEventListener("click",()=>{dt()});let a={standard:"\u6807\u51C6 128k",exhigh:"\u9AD8 320k",lossless:"\u65E0\u635F",hires:"Hi-Res"};c.querySelector("#neAudioLevel")?.addEventListener("change",e=>{let n=J(e.target.value);d.show(`\u97F3\u8D28\uFF1A${a[n]||n}\uFF08\u5207\u4E0B\u4E00\u9996\u751F\u6548\uFF09`),x({force:!0})}),c.querySelector("#neUseVip")?.addEventListener("change",e=>{tt(e.target.checked),d.show(e.target.checked?"\u5DF2\u5F00\u542F\uFF1A\u4F1A\u5458\u66F2\u76EE\u4F1A\u7528\u4F60\u7684\u8D26\u53F7\u64AD\u653E\uFF08\u62FF\u4E0D\u5230\u4F1A\u81EA\u52A8\u56DE\u9000\u5B98\u65B9\u64AD\u653E\u5668\uFF09":"\u5DF2\u5173\u95ED\uFF1A\u4F1A\u5458\u66F2\u76EE\u4ECD\u4EA4\u7ED9\u5B98\u65B9\u64AD\u653E\u5668"),e.target.checked&&x({force:!0})})}async function gt(){let t=c?.querySelector("#neCookieInput"),a=c?.querySelector("#neCookieGo"),e=String(t?.value||"").trim();if(!e){d.show("\u5148\u628A MUSIC_U \u7C98\u8FDB\u6765"),t?.focus();return}a?.setAttribute("disabled",""),a&&(a.textContent="\u6B63\u5728\u9A8C\u8BC1\u2026");let n=await L("/netease/login/cookie",{method:"POST",body:{cookie:e}});if(a?.removeAttribute("disabled"),a&&(a.textContent="\u7528\u8FD9\u4E2A Cookie \u8FDE\u63A5"),!n.ok||!n.data){let s=n.error||`HTTP ${n.status}`;v(s,"err"),d.err(`\u6CA1\u8FDE\u4E0A\uFF1A${s}`);return}q(),i.bound=n.data.binding||null,O(),x(),d.ok(`\u5DF2\u8FDE\u63A5\uFF1A${n.data.profile?.nickname||"\u7F51\u6613\u4E91\u8D26\u53F7"}`),K()}async function Y(){q();let t=c?.querySelector("#neQrBox"),a=c?.querySelector("#neQrStatus");if(!t||!a)return;t.innerHTML='<div class="neacct__qrph mono">\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026</div>',a.textContent="\u6B63\u5728\u5411\u7F51\u6613\u4E91\u8981\u4E00\u628A\u626B\u7801 key\u2026",a.dataset.kind="";let e=await L("/netease/login/qr");if(!e.ok||!e.data?.qrSvg){t.innerHTML='<div class="neacct__qrph mono">\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25</div>',a.textContent=e.error||`HTTP ${e.status}`,a.dataset.kind="err";return}t.innerHTML=e.data.qrSvg,a.textContent="\u7B49\u5F85\u626B\u7801\u2026",N={key:e.data.key,state:e.data.state,expiresAt:Date.now()+(Number(e.data.expiresIn)||180)*1e3},T=0,H(600)}function H(t=mt){E&&clearTimeout(E),E=setTimeout(()=>{ht()},t)}function v(t,a=""){let e=c?.querySelector("#neQrStatus");e&&(e.textContent=t,e.dataset.kind=a)}async function ht(){if(E=null,!N||!c)return;if(Date.now()>N.expiresAt){v("\u4E8C\u7EF4\u7801\u8FC7\u671F\u4E86\uFF0C\u70B9\u300C\u91CD\u65B0\u751F\u6210\u300D\u518D\u6765\u4E00\u6B21","warn");return}let{key:t,state:a}=N,e=await L(`/netease/login/qr/check?key=${encodeURIComponent(t)}&state=${encodeURIComponent(a)}`);if(!c)return;if(!e.ok||!e.data){let s=e.error||`HTTP ${e.status}`;if(e.status>=500&&(T+=1,T<=M)){v(`\u7F51\u7EDC\u6CE2\u52A8\uFF0C\u6B63\u5728\u91CD\u8BD5\uFF08${T}/${M}\uFF09\u2026`,"warn"),H(2500);return}v(s,"err");return}let n=e.data;switch(n.status){case"waiting":v("\u7B49\u5F85\u626B\u7801\u2026\uFF08\u8FD8\u6CA1\u8BC6\u522B\u5230\uFF09"),H();return;case"scanned":v("\u5DF2\u626B\u7801 \u2014\u2014 \u8BF7\u5728\u624B\u673A\u4E0A\u70B9\u300C\u786E\u8BA4\u767B\u5F55\u300D","ok"),H(1500);return;case"confirmed":q(),i.bound=n.binding||null,O(),x(),n.profile&&d.ok(`\u5DF2\u8FDE\u63A5\u7F51\u6613\u4E91\uFF1A${n.profile.nickname||"\u8D26\u53F7"}`),K();return;case"expired":q(),v("\u4E8C\u7EF4\u7801\u8FC7\u671F\u4E86\uFF0C\u70B9\u300C\u91CD\u65B0\u751F\u6210\u300D\u518D\u6765\u4E00\u6B21","warn");return;case"risk":q(),v(n.message||"\u7F51\u6613\u4E91\u5224\u5B9A\u8FD9\u6B21\u767B\u5F55\u6709\u98CE\u9669","err");return;case"network":T+=1,T<=M?(v(`\u7F51\u7EDC\u6CE2\u52A8\uFF0C\u6B63\u5728\u91CD\u8BD5\uFF08${T}/${M}\uFF09\u2026`,"warn"),H(2500)):v("\u8FDE\u4E0D\u4E0A\u7F51\u6613\u4E91\uFF0C\u7A0D\u540E\u518D\u8BD5","err");return;default:q(),v(n.message||"\u767B\u5F55\u5931\u8D25","err")}}var f=null;async function A(t="playlists"){if(!i.bound){d.show("\u5148\u8FDE\u63A5\u7F51\u6613\u4E91\u8D26\u53F7");return}g(),f={mode:t,loading:!0},c=V({playlists:"\u6211\u7684\u6B4C\u5355",recommend:"\u6BCF\u65E5\u63A8\u8350",cloud:"\u4E91\u76D8"}[t]||"\u6211\u7684\u6B4C\u5355",`
    <div class="neacct__tabs" role="tablist">
      <button class="neacct__tab${t==="playlists"?" is-on":""}" data-lib="playlists" type="button" role="tab">\u6B4C\u5355</button>
      <button class="neacct__tab${t==="recommend"?" is-on":""}" data-lib="recommend" type="button" role="tab">\u6BCF\u65E5\u63A8\u8350</button>
      <button class="neacct__tab${t==="cloud"?" is-on":""}" data-lib="cloud" type="button" role="tab">\u4E91\u76D8</button>
    </div>
    <div class="neacct__lib" id="neLibBody"><div class="neacct__qrph mono">\u8BFB\u53D6\u4E2D\u2026</div></div>`),c.querySelectorAll("[data-lib]").forEach(e=>{e.addEventListener("click",()=>{c?.querySelectorAll(".neacct__tab").forEach(n=>n.classList.toggle("is-on",n===e)),f.mode=e.dataset.lib,z()})}),await z()}async function kt(t){if(!t||!f?.songs?.length)return;let a=m.current,e=a?.cloud&&f.songs.find(_=>String(_.id)===String(a.neteaseId))||f.songs[0],n=m.tracks.find(_=>String(_.neteaseId)===String(e.id)),s=m.audio,l=[],o=(_,S)=>l.push(`${_}: ${S}`);o("\u66F2\u76EE",`${e.name} (id ${e.id})`),o("\u64AD\u653E\u5668",`provider=${m.providerId} playing=${m.playing} isEmbed=${m.isEmbed}`),o("\u5217\u8868\u6761\u76EE",n?`cloud=${!!n.cloud} embedOnly=${!!n.embedOnly}`:"\u4E0D\u5728\u7AD9\u5185\u5217\u8868\u91CC"),o("audio",`volume=${s?.volume} muted=${s?.muted} paused=${s?.paused} ready=${s?.readyState} err=${s?.error?.code??"none"} t=${Number(s?.currentTime||0).toFixed(2)} dur=${Number.isFinite(s?.duration)?s.duration.toFixed(2):"\u2014"}`),o("\u5B98\u65B9 iframe",document.querySelector("#embedHost iframe")?"\u5B58\u5728":"\u65E0");let r=n?.src||e.audio;o("\u5730\u5740\u5C3E\u90E8",String(r).slice(-16));try{let _=await fetch(r,{headers:{Range:"bytes=0-4095"}}),S=await _.arrayBuffer(),I=[...new Uint8Array(S).slice(0,4)].map(R=>R.toString(16).padStart(2,"0")).join("");o("HTTP",`${_.status} ${_.headers.get("content-type")} ${_.headers.get("content-range")||""} magic=${I}`)}catch(_){o("HTTP",`\u5931\u8D25\uFF1A${String(_?.message||_)}`)}let u=document.createElement("audio");u.muted=!0,u.preload="metadata",u.src=r;let k=await new Promise(_=>{let S=!1,I=R=>{S||(S=!0,_(R))};u.addEventListener("loadedmetadata",()=>I("loadedmetadata"),{once:!0}),u.addEventListener("error",()=>I("error"),{once:!0}),setTimeout(()=>I("timeout"),8e3)});o("\u72EC\u7ACB\u63A2\u6D4B",`${k} ready=${u.readyState} err=${u.error?.code??"none"} dur=${Number.isFinite(u.duration)?u.duration.toFixed(2):"\u2014"}`),u.remove(),t.innerHTML=`<pre class="neacct__diag mono">${p(l.join(`
`))}</pre>
    <div class="neacct__actions"><button class="btn btn--sm" id="neDiagBack" type="button">\u8FD4\u56DE\u5217\u8868</button></div>`,t.querySelector("#neDiagBack")?.addEventListener("click",()=>{z()})}async function z(){let t=c?.querySelector("#neLibBody");if(!t||!f)return;if(t.innerHTML='<div class="neacct__qrph mono">\u8BFB\u53D6\u4E2D\u2026</div>',f.mode==="cloud"){let n=await L("/netease/login/cloud?limit=200");if(!c)return;if(!n.ok||!n.data){t.innerHTML=`<div class="neacct__err mono">${p(n.error||`HTTP ${n.status}`)}</div>`;return}if(f.songs=n.data.songs||[],!f.songs.length){t.innerHTML='<div class="neacct__qrph mono">\u4E91\u76D8\u91CC\u8FD8\u6CA1\u6709\u6B4C\uFF08\u5728\u7F51\u6613\u4E91 App \u91CC\u300C\u4E0A\u4F20\u5230\u4E91\u76D8\u300D\u4E4B\u540E\u8FD9\u91CC\u4F1A\u51FA\u73B0\uFF09</div>';return}t.innerHTML=`
      <p class="muted neacct__libnote">\u4E91\u76D8\u91CC\u662F<b>\u4F60\u81EA\u5DF1\u4E0A\u4F20</b>\u7684\u6587\u4EF6\uFF0C\u6240\u4EE5\u80FD\u7528\u767B\u5F55\u6001\u53D6\u5230\u539F\u59CB\u97F3\u9891 \u2014\u2014 \u8FD9\u4E0D\u662F VIP \u66F2\u76EE\u3002</p>
      <div class="neacct__libbar">
        <span class="mono faint">${f.songs.length} \u9996</span>
        <span class="grow"></span>
        <button class="btn btn--sm" id="neCloudDiag" type="button">\u81EA\u68C0</button>
        <button class="btn btn--sm btn--signal" id="neCloudImport" type="button">\u5168\u90E8\u52A0\u5165</button>
      </div>
      <ul class="neacct__songs">${f.songs.map((o,r)=>`
        <li class="neacct__song" data-i="${r}">
          <span class="mono neacct__songidx">${String(r+1).padStart(2,"0")}</span>
          <span class="neacct__songmain">
            <b>${p(o.name)}</b>
            <span class="muted">${p(o.artist||"\u672A\u77E5\u6B4C\u624B")}${o.matched?"":" \xB7 \u672A\u5339\u914D"}</span>
          </span>
          <button class="btn btn--sm" data-cloud-play="${r}" type="button">\u64AD\u653E</button>
          <button class="btn btn--sm" data-cloud-add="${r}" type="button">\u52A0\u5165</button>
        </li>`).join("")}</ul>`;let s=o=>({...rt(o),cloud:!0,src:o.audio||""}),l=(o,{play:r=!1}={})=>{let u=s(o),k=m.tracks.findIndex(S=>S.neteaseId===String(o.id));if(k>=0)return Object.assign(m.tracks[k],{src:u.src,cloud:!0,embedOnly:!1,cover:m.tracks[k].cover||u.cover,duration:m.tracks[k].duration||u.duration}),P(m.tracks),r&&m.prepare(k,{autoplay:!0}),{added:!1,index:k};let _=m.add(u,{play:r});return P(m.tracks),_};t.querySelectorAll("[data-cloud-play]").forEach(o=>{o.addEventListener("click",()=>{let r=f.songs[Number(o.dataset.cloudPlay)];r&&(l(r,{play:!0}),d.ok(`\u64AD\u653E\uFF1A${r.name||"\u4E91\u76D8\u66F2\u76EE"}`))})}),t.querySelectorAll("[data-cloud-add]").forEach(o=>{o.addEventListener("click",()=>{let r=f.songs[Number(o.dataset.cloudAdd)];if(!r)return;let u=l(r);d.show(u.added?`\u5DF2\u52A0\u5165\uFF1A${r.name||"\u4E91\u76D8\u66F2\u76EE"}`:"\u8FD9\u9996\u5DF2\u7ECF\u5728\u5217\u8868\u91CC\u4E86\uFF08\u5DF2\u6362\u6210\u65B0\u5730\u5740\uFF09")})}),t.querySelector("#neCloudImport")?.addEventListener("click",()=>{let o=0,r=0;for(let u of f.songs)l(u).added?o+=1:r+=1;P(m.tracks),d.ok([o?`\u5DF2\u52A0\u5165 ${o} \u9996`:"",r?`${r} \u9996\u5DF2\u5728\u5217\u8868\uFF08\u5730\u5740\u5DF2\u5237\u65B0\uFF09`:""].filter(Boolean).join(" \xB7 ")||"\u4E91\u76D8\u66F2\u76EE\u90FD\u5DF2\u5728\u5217\u8868\u91CC")}),t.querySelector("#neCloudDiag")?.addEventListener("click",()=>{kt(t)});return}if(f.mode==="recommend"){let n=await L("/netease/login/recommend?limit=30");if(!c)return;if(!n.ok||!n.data){t.innerHTML=`<div class="neacct__err mono">${p(n.error||`HTTP ${n.status}`)}</div>`;return}if(f.songs=n.data.songs||[],!f.songs.length){t.innerHTML='<div class="neacct__qrph mono">\u4ECA\u5929\u8FD8\u6CA1\u6709\u63A8\u8350\uFF08\u6216\u8D26\u53F7\u592A\u65B0\uFF09</div>';return}t.innerHTML=`
      <div class="neacct__libbar">
        <span class="mono faint">${f.songs.length} \u9996</span>
        <span class="grow"></span>
        <button class="btn btn--sm btn--signal" id="neRecImport" type="button">\u5168\u90E8\u5BFC\u5165</button>
      </div>
      <ul class="neacct__songs">${f.songs.map((s,l)=>`
        <li class="neacct__song" data-i="${l}">
          <span class="mono neacct__songidx">${String(l+1).padStart(2,"0")}</span>
          <span class="neacct__songmain"><b>${p(s.name)}</b><span class="muted">${p(s.artist||"")}</span></span>
          <button class="btn btn--sm" data-play="${l}" type="button">\u64AD\u653E</button>
        </li>`).join("")}</ul>`,t.querySelector("#neRecImport")?.addEventListener("click",()=>lt(f.songs,{replace:!1})),t.querySelectorAll("[data-play]").forEach(s=>{s.addEventListener("click",()=>{let l=f.songs[Number(s.dataset.play)];l&&(m.add(rt(l),{play:!0}),P(m.tracks),d.ok(`\u64AD\u653E\uFF1A${l.name||"\u66F2\u76EE"}`))})});return}let a=await L("/netease/login/playlists?limit=80");if(!c)return;if(!a.ok||!a.data){t.innerHTML=`<div class="neacct__err mono">${p(a.error||`HTTP ${a.status}`)}</div>`;return}let e=a.data.playlists||[];if(f.playlists=e,!e.length){t.innerHTML='<div class="neacct__qrph mono">\u8FD9\u4E2A\u8D26\u53F7\u8FD8\u6CA1\u6709\u6B4C\u5355</div>';return}t.innerHTML=`
    <p class="muted neacct__libnote">\u8FD9\u91CC\u80FD\u8BFB\u5230\u79C1\u5BC6\u6B4C\u5355\u548C\u300C\u6211\u559C\u6B22\u7684\u97F3\u4E50\u300D\u2014\u2014 \u533F\u540D\u63A5\u53E3\u62FF\u4E0D\u5230\u7684\u90A3\u4E00\u90E8\u5206\u3002</p>
    <ul class="neacct__pls">${e.map((n,s)=>`
      <li class="neacct__pl" data-i="${s}">
        <span class="neacct__plcover">${n.cover?`<img src="${p(n.cover)}" alt="" width="44" height="44" loading="lazy" referrerpolicy="no-referrer" />`:'<span class="neacct__plno" aria-hidden="true">\u266A</span>'}</span>
        <span class="neacct__plmain">
          <b>${p(n.name)}</b>
          <span class="muted mono">${n.trackCount} \u9996${n.specialType===5?" \xB7 \u6211\u559C\u6B22\u7684\u97F3\u4E50":""}${n.subscribed?" \xB7 \u6536\u85CF":""}</span>
        </span>
        <button class="btn btn--sm" data-import="${s}" type="button">\u5BFC\u5165</button>
      </li>`).join("")}</ul>
    <label class="neacct__replace"><input type="checkbox" id="neReplace" /> \u5BFC\u5165\u524D\u6E05\u7A7A\u7AD9\u5185\u73B0\u6709\u5217\u8868</label>`,t.querySelectorAll("[data-import]").forEach(n=>{n.addEventListener("click",()=>{let s=f.playlists?.[Number(n.dataset.import)];s&&$t(s,{replace:!!t.querySelector("#neReplace")?.checked})})})}function rt(t){return{id:`ne-${t.id}`,provider:"netease",neteaseId:String(t.id),title:t.name||"",artist:t.artist||"",album:t.album||"",cover:t.cover||"",duration:Number(t.duration)||0,fee:Number(t.fee)||0,tags:[]}}function lt(t,{replace:a=!1}={}){if(!t?.length){d.show("\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u66F2\u76EE");return}let e=at(t,{replace:a});x({force:!0});let n=[`${a?"\u5DF2\u66FF\u6362\u4E3A":"\u5DF2\u5BFC\u5165"} ${e.total} \u9996`];!a&&e.skipped&&n.push(`\u5DF2\u5728\u5217\u8868\u4E2D ${e.skipped} \u9996`),d.ok(n.join(" \xB7 ")),g()}async function $t(t,{replace:a=!1}={}){d.show(`\u6B63\u5728\u8BFB\u53D6\u300C${t.name}\u300D\u2026`);let e=await L(`/netease/login/playlist?id=${encodeURIComponent(t.id)}&limit=${F}`);if(!e.ok||!e.data?.playlist){d.err(`\u8BFB\u53D6\u6B4C\u5355\u5931\u8D25\uFF1A${e.error||`HTTP ${e.status}`}`);return}let n=e.data.playlist,s=(n.trackIds||[]).slice(0,F);if(!s.length){d.show("\u8FD9\u4E2A\u6B4C\u5355\u91CC\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u66F2\u76EE");return}let l=[];for(let r=0;r<s.length;r+=50)try{let u=await nt(s.slice(r,r+50));l.push(...u)}catch{}if(!l.length){d.err("\u66F2\u76EE\u8BE6\u60C5\u4E00\u9996\u90FD\u6CA1\u62FF\u5230\uFF08\u53EF\u80FD\u88AB\u98CE\u63A7\uFF09\uFF0C\u7A0D\u540E\u518D\u8BD5");return}lt(l,{replace:a});let o=n.trackCount>s.length?`\uFF08\u5171 ${n.trackCount} \u9996\uFF0C\u6309\u4E0A\u9650\u5BFC\u5165\u524D ${s.length} \u9996\uFF09`:"";d.show(`\u300C${n.name}\u300D${o}`,"",{ttl:6e3})}async function dt(){if(!confirm(`\u89E3\u7ED1\u7F51\u6613\u4E91\u8D26\u53F7\uFF1F

\u672C\u7AD9\u4F1A\u5220\u9664\u4FDD\u5B58\u7684\u767B\u5F55\u51ED\u636E\uFF0C\u4E0D\u4F1A\u5F71\u54CD\u4F60\u5728\u7F51\u6613\u4E91\u4E0A\u7684\u4EFB\u4F55\u6570\u636E\u3002`))return;let t=await L("/netease/login/logout",{method:"POST"});if(!t.ok){d.err(`\u89E3\u7ED1\u5931\u8D25\uFF1A${t.error||`HTTP ${t.status}`}`);return}i.bound=null,O(),g(),d.ok("\u5DF2\u89E3\u7ED1")}async function Lt(t){let a=t?.querySelector?.("#neAccount")||$("#neAccount");a&&(i.loaded||await U(),O(),i.bound&&x(),a.addEventListener("click",e=>{if(e.target.closest("#neLogin")){W();return}if(e.target.closest("#neLibrary")){A("playlists");return}if(e.target.closest("#neRecommend")){A("recommend");return}if(e.target.closest("#neCloud")){A("cloud");return}if(e.target.closest("#neAccountSettings")){W();return}e.target.closest("#neUnbind")&&dt()}))}function St(){g()}async function G(){i.loaded=!1,await U(),O()}async function wt(){try{await U()}catch{}w.on("auth:user",()=>{G()}),w.on("auth:ready",()=>{G()}),window.addEventListener("ft:netease-bound",()=>{g(),G().then(()=>{i.bound?d.ok("\u7F51\u6613\u4E91\u8D26\u53F7\u5DF2\u7ED1\u5B9A"):d.show("\u5B98\u65B9\u767B\u5F55\u9875\u5B8C\u6210\u4E86\uFF0C\u4F46\u7ED1\u5B9A\u8FD8\u6CA1\u751F\u6548\uFF0C\u518D\u8BD5\u4E00\u6B21","err")})})}var Ut={state:i,init:wt,mount:Lt,unmount:St,stripHTML:yt,open:W,refresh:U};export{Et as a,Ct as b,Ut as c};
