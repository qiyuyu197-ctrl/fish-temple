import{a as j}from"./chunks/chunk-UWG3LF7U.js";import{b as _s,c as ks}from"./chunks/chunk-U7ZG7ZHV.js";import{A as bs,B as ys,C as ws,a as E,c as _t,m as us,n as ms,o as fs,s as hs,w as gs,y as vs,z as $t}from"./chunks/chunk-C4U237QN.js";import{a as P,b as Le,c as wt,d as cs,e as Xe,f as ds,g as z}from"./chunks/chunk-JV4UGN2N.js";import{a as W}from"./chunks/chunk-E3HJDYPK.js";import{a as yt,b as be}from"./chunks/chunk-WEV6AXMB.js";import{a as $s,b as xs,c as Ee,e as xt,f as Ls,h as Es,i as Ze,j as ye}from"./chunks/chunk-IP3NPHJG.js";import{a as b,c as ps}from"./chunks/chunk-DDIRHU7Q.js";import{a as l,b as is,d as f,g as N,m as de,o as J,p as F,q as ne,r as Je,s as rs,t as ls}from"./chunks/chunk-BUFEAOIA.js";import{a as I,d as ss,e as ns,f as bt,l as as,n as ce,o as os,q as S,r as $}from"./chunks/chunk-KSYHGNLY.js";import{b as vn}from"./chunks/chunk-L72EZ7PG.js";var Ss=()=>P.nav;function Ms(){let e=ne.unreadNews;return e>0?`<span class="nav__badge" title="\u672A\u8BFB\u516C\u544A">${e>99?"99+":e}</span>`:""}function bn(){let e=F.published[0]?.title||"\u6682\u65E0\u516C\u544A",t=ss.map((s,n)=>{let a=s.replace("{latest}",`\u6700\u65B0\u516C\u544A\uFF1A${e}`);return`<span class="ticker__item"><i>${String(n+1).padStart(2,"0")}</i><b>${f(a)}</b></span>`}).join("");return t+t}var Ts={init(){let e=l("#year");e&&(e.textContent=String(new Date().getFullYear()));let t=l("#brandName"),s=l("#brandSub");t&&(t.textContent=I.name),s&&(s.textContent=I.subtitle),this.paintNav(null),this.paintTicker(),this.paintFooter(),this.paintAuth(),this.clock(),this.wire(),S.on("route:change",n=>{this.paintNav(n),this.closeDrawer()}),S.on("content:change",()=>{this.paintTicker(),this.paintNav(be.current)}),S.on("theme:change",()=>this.paintThemeBtn()),this.paintThemeBtn(),S.on("auth:ready",()=>this.paintAuth()),S.on("auth:user",({notice:n}={})=>{this.paintAuth(),n&&b.show(n,"",{ttl:7e3})}),S.on("auth:error",({message:n}={})=>{this.paintAuth(),n&&b.show(n,"err",{ttl:8e3})})},paintAuth(){let e=l("#authBox");if(!e)return;if(!$.enabled||$.state==="loading"){e.hidden=!0,e.innerHTML="",delete e.dataset.open;return}e.hidden=!1;let t=$.user;if(!t){let i=$.isLocal?"\u767B\u5F55 / \u6CE8\u518C\uFF08\u672C\u673A\u8D26\u53F7\uFF09":"\u767B\u5F55 / \u6CE8\u518C\uFF08Auth0\uFF09";e.innerHTML=`<button class="authbox__btn" id="authLogin" type="button" title="${i}">
        ${N.user}<span class="authbox__label">\u767B\u5F55</span>
      </button>`,delete e.dataset.open;return}let s=t.name||t.email||"\u5DF2\u767B\u5F55",n=String(s).trim().slice(0,1).toUpperCase()||"U",a=t.picture?`<img class="authbox__avatar" src="${f(t.picture)}" alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer" />`:`<span class="authbox__initial" aria-hidden="true">${f(n)}</span>`;e.innerHTML=`
      <button class="authbox__btn is-user" id="authToggle" type="button"
              aria-expanded="${e.dataset.open==="1"?"true":"false"}" aria-haspopup="menu"
              title="${f(s)}${t.email?` \xB7 ${f(t.email)}`:""}">
        ${a}<span class="authbox__label clamp-1">${f(s)}</span>
      </button>
      <div class="authbox__menu" role="menu">
        <div class="authbox__head">
          ${a}
          <span class="authbox__id">
            <b class="clamp-1">${f(s)}</b>
            <i class="mono clamp-1">${f(t.email||"\uFF08\u672A\u63D0\u4F9B\u90AE\u7BB1\uFF09")}</i>
          </span>
        </div>
        <div class="authbox__rows mono">
          <span><i>\u89D2\u8272</i><b>${$.isOwner?"\u7AD9\u957F OWNER":"\u666E\u901A\u7528\u6237 MEMBER"}</b></span>
          <span><i>\u90AE\u7BB1</i><b>${t.source==="local"?"\u672C\u673A\u8D26\u53F7":t.verified?"\u5DF2\u9A8C\u8BC1":$.enabled?"\u672A\u9A8C\u8BC1":"\u2014"}</b></span>
          ${t.source==="token"?"<span><i>\u8EAB\u4EFD</i><b>\u670D\u52A1\u7AEF\u672A\u786E\u8BA4</b></span>":""}
        </div>
        <button class="authbox__item" id="authEdit" type="button" role="menuitem">\u7F16\u8F91\u8D44\u6599</button>
        <button class="authbox__logout" id="authLogout" type="button" role="menuitem">\u9000\u51FA\u767B\u5F55</button>
      </div>`,e.dataset.open==="1"?e.dataset.open="1":delete e.dataset.open},closeAuthMenu(){let e=l("#authBox");e&&(delete e.dataset.open,l("#authToggle")?.setAttribute("aria-expanded","false"))},openAuthPanel(){if(l("#authPanel"))return;if(!$.enabled){b.show($.notice||"\u672C\u7AD9\u672A\u542F\u7528\u8D26\u53F7\u529F\u80FD","err");return}if($.isLocal)return this._openLocalAuthPanel();let e=document.createElement("div");e.className="authpanel__scrim",e.id="authPanelScrim",e.innerHTML=`
      <div class="authpanel" id="authPanel" role="dialog" aria-modal="true" aria-labelledby="authPanelTitle">
        <div class="authpanel__head">
          <b id="authPanelTitle">\u767B\u5F55 / \u6CE8\u518C</b>
          <button class="authpanel__x" id="authPanelClose" type="button" aria-label="\u5173\u95ED">\xD7</button>
        </div>
        <p class="authpanel__lead">\u8F93\u5165\u90AE\u7BB1\uFF0C\u4E0B\u4E00\u6B65\u5728 <b>Auth0</b> \u9875\u9762\u8F93\u5165\u5BC6\u7801 \u2014\u2014 \u6211\u4EEC\u4E0D\u63A5\u89E6\u4F60\u7684\u5BC6\u7801\u3002</p>
        <form class="authpanel__form" id="authPanelForm" novalidate>
          <label class="authpanel__label mono" for="authPanelEmail">\u90AE\u7BB1</label>
          <input class="authpanel__input" id="authPanelEmail" type="email" name="email" required
                 autocomplete="email" inputmode="email" spellcheck="false" placeholder="you@example.com" />
          <p class="authpanel__err mono" id="authPanelErr" role="alert" hidden></p>
          <button class="btn btn--signal authpanel__go" id="authPanelGo" type="submit">\u7EE7\u7EED</button>
        </form>
        <button class="authpanel__alt" id="authPanelDirect" type="button">\u4E0D\u586B\u90AE\u7BB1\uFF0C\u76F4\u63A5\u8DF3\u8F6C\u767B\u5F55</button>
        <p class="authpanel__foot mono">\u5BC6\u7801\u3001\u90AE\u7BB1\u9A8C\u8BC1\u3001\u627E\u56DE\u5BC6\u7801\u90FD\u7531 Auth0 \u8D1F\u8D23</p>
      </div>`,document.body.append(e);let t=l("#authPanel"),s=l("#authPanelEmail"),n=l("#authPanelErr"),a=o=>{n.textContent=o,n.hidden=!1,s?.setAttribute("aria-invalid","true")},i=()=>{n.hidden=!0,n.textContent="",s?.removeAttribute("aria-invalid")},r=()=>{e.remove(),l("#authLogin")?.focus?.()};this._closeAuthPanel=r,e.addEventListener("click",o=>{o.target===e&&r()}),e.addEventListener("keydown",o=>{o.key==="Escape"&&(o.preventDefault(),r())}),l("#authPanelClose")?.addEventListener("click",r),l("#authPanelDirect")?.addEventListener("click",()=>{r(),$.login()}),l("#authPanelForm")?.addEventListener("submit",o=>{o.preventDefault();let u=String(s?.value||"").trim();if(!u){a("\u8BF7\u5148\u586B\u90AE\u7BB1"),s?.focus();return}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u)){a("\u90AE\u7BB1\u683C\u5F0F\u770B\u8D77\u6765\u4E0D\u5BF9\uFF0C\u68C0\u67E5\u4E00\u4E0B"),s?.focus();return}i(),$.login({loginHint:u})}),s?.addEventListener("input",()=>{n.hidden||i()}),t?.setAttribute("tabindex","-1"),s?.focus?.()},closeAuthPanel(){if(typeof this._closeAuthPanel=="function"){let e=this._closeAuthPanel;this._closeAuthPanel=null,e()}},_openLocalAuthPanel(){let e=Number($.config.accounts||0)===0,t=document.createElement("div");t.className="authpanel__scrim",t.id="authPanelScrim",t.innerHTML=`
      <div class="authpanel" id="authPanel" role="dialog" aria-modal="true" aria-labelledby="authPanelTitle">
        <div class="authpanel__head">
          <b id="authPanelTitle">\u767B\u5F55 / \u6CE8\u518C</b>
          <button class="authpanel__x" id="authPanelClose" type="button" aria-label="\u5173\u95ED">\xD7</button>
        </div>
        <p class="authpanel__lead">\u8FD9\u662F<b>\u672C\u673A\u8D26\u53F7</b>\uFF1A\u5BC6\u7801\u53EA\u4FDD\u5B58\u5728\u8FD9\u53F0\u7535\u8111\u4E0A\uFF0C\u7531\u672C\u5730\u670D\u52A1\u52A0\u76D0\u54C8\u5E0C\u540E\u5B58\u50A8\u3002</p>
        <form class="authpanel__form" id="authPanelForm" novalidate>
          <label class="authpanel__label mono" for="authPanelEmail">\u90AE\u7BB1</label>
          <input class="authpanel__input" id="authPanelEmail" type="email" name="email" required
                 autocomplete="username" inputmode="email" spellcheck="false" placeholder="you@example.com" />
          <label class="authpanel__label mono" for="authPanelPassword">\u5BC6\u7801</label>
          <input class="authpanel__input" id="authPanelPassword" type="password" name="password" required
                 autocomplete="current-password" minlength="6" placeholder="\u81F3\u5C11 6 \u4F4D" />
          <p class="authpanel__err mono" id="authPanelErr" role="alert" hidden></p>
          <button class="btn btn--signal authpanel__go" id="authPanelGo" type="submit">\u767B\u5F55</button>
        </form>
        <button class="authpanel__alt" id="authPanelSwitch" type="button">\u6CA1\u6709\u8D26\u53F7\uFF1F\u6CE8\u518C\u4E00\u4E2A</button>
        <p class="authpanel__foot mono">\u8D26\u53F7\u5B58\u5728\u6570\u636E\u76EE\u5F55\u7684 auth/users.json\uFF1B\u5FD8\u4E86\u5BC6\u7801\u53EA\u80FD\u5220\u6389\u5B83\u91CD\u6765</p>
      </div>`,document.body.append(t);let s=l("#authPanel"),n=l("#authPanelEmail"),a=l("#authPanelPassword"),i=l("#authPanelErr"),r=l("#authPanelGo"),o=l("#authPanelSwitch"),u=y=>{i.textContent=y,i.hidden=!1,n?.setAttribute("aria-invalid","true")},c=()=>{i.hidden=!0,i.textContent="",n?.removeAttribute("aria-invalid")},d=()=>{t.remove(),l("#authLogin")?.focus?.()};this._closeAuthPanel=d;let h=()=>{let y=l("#authPanelTitle");y&&(y.textContent=e?"\u6CE8\u518C\u672C\u673A\u8D26\u53F7":"\u767B\u5F55"),r&&(r.textContent=e?"\u6CE8\u518C\u5E76\u767B\u5F55":"\u767B\u5F55"),o&&(o.textContent=e?"\u5DF2\u6709\u8D26\u53F7\uFF1F\u76F4\u63A5\u767B\u5F55":"\u6CA1\u6709\u8D26\u53F7\uFF1F\u6CE8\u518C\u4E00\u4E2A"),a?.setAttribute("autocomplete",e?"new-password":"current-password")};o?.addEventListener("click",()=>{e=!e,c(),h(),a?.focus?.()}),t.addEventListener("click",y=>{y.target===t&&d()}),t.addEventListener("keydown",y=>{y.key==="Escape"&&(y.preventDefault(),d())}),l("#authPanelClose")?.addEventListener("click",d),l("#authPanelForm")?.addEventListener("submit",async y=>{y.preventDefault();let M=String(n?.value||"").trim(),C=String(a?.value||"");if(!M){u("\u8BF7\u5148\u586B\u90AE\u7BB1"),n?.focus();return}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(M)){u("\u90AE\u7BB1\u683C\u5F0F\u770B\u8D77\u6765\u4E0D\u5BF9\uFF0C\u68C0\u67E5\u4E00\u4E0B"),n?.focus();return}if(C.length<6){u("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D"),a?.focus();return}c(),r&&(r.disabled=!0,r.textContent=e?"\u6CE8\u518C\u4E2D\u2026":"\u767B\u5F55\u4E2D\u2026");try{let B=await $.loginLocal({email:M,password:C,register:e});d(),b.ok(e?`\u8D26\u53F7\u5DF2\u5EFA\u597D\uFF0C\u6B22\u8FCE ${B.name}`:`\u6B22\u8FCE\u56DE\u6765\uFF0C${B.name}`)}catch(B){u(String(B?.message||B)),r&&(r.disabled=!1,h()),a?.select?.()}}),n?.addEventListener("input",()=>{i?.hidden||c()}),a?.addEventListener("input",()=>{i?.hidden||c()}),h(),s?.setAttribute("tabindex","-1"),n?.focus?.()},async _downscaleAvatar(e){let s=document.createElement("canvas");s.width=192,s.height=192;let n=s.getContext("2d"),a=null,i=null;if(typeof createImageBitmap=="function")a=await createImageBitmap(e);else{let h=URL.createObjectURL(e);i=h,a=await new Promise((y,M)=>{let C=new Image;C.onload=()=>y(C),C.onerror=()=>M(new Error("\u8FD9\u5F20\u56FE\u7247\u89E3\u4E0D\u5F00")),C.src=h})}let r=a.width||a.naturalWidth||0,o=a.height||a.naturalHeight||0;if(!r||!o)throw new Error("\u8FD9\u5F20\u56FE\u7247\u6CA1\u6709\u6709\u6548\u7684\u5C3A\u5BF8");let u=Math.max(192/r,192/o),c=r*u,d=o*u;return n.drawImage(a,(192-c)/2,(192-d)/2,c,d),a.close?.(),i&&URL.revokeObjectURL(i),s.toDataURL("image/jpeg",.82)},openProfilePanel(){if(l("#profilePanel"))return;if(!$.enabled||!$.user){b.show("\u767B\u5F55\u540E\u624D\u80FD\u7F16\u8F91\u8D44\u6599","err");return}let e=$.user,t=String(e.displayName||""),s=String(e.avatar||""),n=!1,a=String(e.name||e.email||"U").trim().slice(0,1).toUpperCase()||"U",i=x=>x?`<img class="profile__img" id="profilePreview" src="${f(x)}" alt="" referrerpolicy="no-referrer" />`:`<span class="profile__initial" id="profilePreview" aria-hidden="true">${f(a)}</span>`,r=document.createElement("div");r.className="authpanel__scrim",r.id="profileScrim",r.innerHTML=`
      <div class="authpanel profile" id="profilePanel" role="dialog" aria-modal="true" aria-labelledby="profileTitle">
        <div class="authpanel__head">
          <b id="profileTitle">\u7F16\u8F91\u8D44\u6599</b>
          <button class="authpanel__x" id="profileClose" type="button" aria-label="\u5173\u95ED">\xD7</button>
        </div>
        <p class="authpanel__lead">\u6635\u79F0\u4E0E\u5934\u50CF\u5B58\u5728\u672C\u7AD9\u81EA\u5DF1\u7684\u5B58\u50A8\u91CC\uFF08\u4E0D\u52A8 Auth0 \u8D26\u53F7\uFF09\u3002\u7559\u7A7A\u5373\u7528 Auth0 \u7684\u539F\u59CB\u8D44\u6599\u3002</p>
        <form class="authpanel__form" id="profileForm" novalidate>
          <label class="authpanel__label mono" for="profileName">\u6635\u79F0\uFF08\u6700\u591A 24 \u5B57\uFF09</label>
          <input class="authpanel__input" id="profileName" type="text" name="name" maxlength="24"
                 autocomplete="nickname" spellcheck="false" placeholder="${f(e.name||"\u7ED9\u81EA\u5DF1\u8D77\u4E2A\u540D\u5B57")}" value="${f(t)}" />

          <span class="authpanel__label mono">\u5934\u50CF</span>
          <div class="profile__row">
            <span class="profile__avatar" id="profileAvatarBox">${i(s)}</span>
            <div class="profile__acts">
              <label class="btn btn--sm profile__file">
                \u9009\u62E9\u56FE\u7247
                <input id="profileFile" type="file" accept="image/*" hidden />
              </label>
              <button class="btn btn--sm" id="profileClear" type="button">\u6E05\u9664\u81EA\u5B9A\u4E49</button>
            </div>
          </div>
          <input class="authpanel__input profile__url" id="profileAvatarUrl" type="url" inputmode="url"
                 spellcheck="false" placeholder="\u6216\u7C98\u8D34\u56FE\u7247\u5730\u5740 https://\u2026" value="${f(/^https?:/i.test(s)?s:"")}" />

          <p class="authpanel__err mono" id="profileErr" role="alert" hidden></p>
          <p class="authpanel__foot mono" id="profileHint" hidden></p>
          <div class="profile__foot">
            <button class="btn btn--signal" id="profileSave" type="submit">\u4FDD\u5B58</button>
            <button class="btn" id="profileCancel" type="button">\u53D6\u6D88</button>
          </div>
        </form>
      </div>`,document.body.append(r);let o=l("#profilePanel"),u=l("#profileErr"),c=l("#profileHint"),d=l("#profileAvatarBox"),h=l("#profileAvatarUrl"),y=l("#profileName"),M=l("#profileSave"),C=x=>{u.textContent=x,u.hidden=!1,u.setAttribute("role","alert")},B=()=>{u.hidden=!0,u.textContent=""},H=x=>{c.textContent=x,c.hidden=!x},R=()=>{d.innerHTML=i(s)},U=()=>{r.remove(),l("#authToggle")?.focus?.()};this._closeProfilePanel=U,r.addEventListener("click",x=>{x.target===r&&U()}),r.addEventListener("keydown",x=>{x.key==="Escape"&&(x.preventDefault(),U())}),l("#profileClose")?.addEventListener("click",U),l("#profileCancel")?.addEventListener("click",U),y?.addEventListener("input",()=>{u.hidden||B()}),h?.addEventListener("input",()=>{let x=String(h.value||"").trim();if(x){if(!/^https?:\/\//i.test(x)){C("\u56FE\u7247\u5730\u5740\u8981\u4EE5 http:// \u6216 https:// \u5F00\u5934");return}B(),s=x,n=!0,R()}}),l("#profileClear")?.addEventListener("click",()=>{s="",n=!0,h&&(h.value=""),B(),H("\u5DF2\u6E05\u9664\u81EA\u5B9A\u4E49\u5934\u50CF\uFF0C\u4FDD\u5B58\u540E\u4F1A\u7528 Auth0 \u7684\u539F\u59CB\u5934\u50CF"),R()}),l("#profileFile")?.addEventListener("change",async x=>{let O=x.target.files&&x.target.files[0];if(O){B(),H("\u6B63\u5728\u5904\u7406\u56FE\u7247\u2026");try{s=await this._downscaleAvatar(O),n=!0,R(),H(`\u5DF2\u9009\u62E9\u56FE\u7247\uFF08\u7EA6 ${Math.round(s.length/1024)}KB\uFF0C\u5DF2\u538B\u5230 192px \u65B9\u5F62\uFF09`)}catch(D){H("");let q=String(D?.message||D);C(/decod|decode|解不开|解不了/i.test(q)?"\u8FD9\u5F20\u56FE\u7247\u6D4F\u89C8\u5668\u89E3\u4E0D\u5F00\uFF1A\u53EF\u80FD\u662F\u6587\u4EF6\u635F\u574F\uFF0C\u6216\u683C\u5F0F\u4E0D\u652F\u6301\uFF08\u6BD4\u5982 iPhone \u7684 HEIC \u7167\u7247\uFF09\u3002\u6362\u4E00\u5F20 JPG / PNG \u518D\u8BD5\u3002":`\u8FD9\u5F20\u56FE\u7247\u7528\u4E0D\u4E86\uFF1A${q}`)}finally{x.target.value=""}}}),l("#profileForm")?.addEventListener("submit",async x=>{x.preventDefault(),B();let O=String(y?.value??"").trim();if(O.length>24){C("\u6635\u79F0\u6700\u591A 24 \u4E2A\u5B57"),y?.focus();return}let D={name:O};n&&(D.picture=s),M.disabled=!0;let q=await $.saveProfile(D);if(M.disabled=!1,!q.ok){C(q.error||"\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");return}b.ok("\u8D44\u6599\u5DF2\u66F4\u65B0"),U()}),o?.setAttribute("tabindex","-1"),y?.focus?.()},closeProfilePanel(){if(typeof this._closeProfilePanel=="function"){let e=this._closeProfilePanel;this._closeProfilePanel=null,e()}},paintNav(e){let t=l("#nav"),s=l("#drawerNav");t&&(t.innerHTML=Ss().map((a,i)=>{let r=e?.view===a.id||a.id==="posts"&&e?.view==="post"?" is-active":"",o=a.badgeKey==="unreadNews"?Ms():a.badge?`<span class="nav__badge">${f(a.badge)}</span>`:"";return`<a class="nav__link${r}" href="${a.path}" data-nav data-view="${a.id}" title="${f(a.cn||a.label)}">
          <span class="nav__idx">${String(i+1).padStart(2,"0")}</span>${f(a.label)}${o}
          <span class="sr-only">${f(a.cn||"")}</span></a>`}).join("")),s&&(s.innerHTML=Ss().map((a,i)=>{let r=e?.view===a.id?' class="is-active"':"",o=a.badgeKey==="unreadNews"?Ms():"";return`<a href="${a.path}"${r} data-nav><span>${f(a.label)} \xB7 ${f(a.cn||"")}</span>
          <span class="mono faint">${String(i+1).padStart(2,"0")}${o}</span></a>`}).join(""));let n=l("#drawerFoot");n&&(n.innerHTML=`${f(I.author)}<br />BUILD ${f(I.version)}<br />${f(I.tagline)}`)},paintTicker(){let e=l("#tickerRun");e&&(e.innerHTML=bn())},paintFooter(){let e=l("#footerMeta");e&&(e.innerHTML=`${f(I.author)}<br />${f(I.description)}`);let t=l("#footerLinks");t&&(t.innerHTML=ns.map(n=>`<a href="${n.href}" ${/^https?:/.test(n.href)?'target="_blank" rel="noopener noreferrer"':""}>${N.ext}${f(n.label)}</a>`).join(""));let s=l("#footerBuild");s&&(s.innerHTML=`VERSION ${f(I.version)}<br />SINCE ${I.since}<br />NOTICES ${String(F.published.length).padStart(3,"0")}`)},clock(){let e=l("#clockTime"),t=l("#clockDate"),s=a=>String(a).padStart(2,"0"),n=()=>{let a=new Date;e&&(e.textContent=`${s(a.getHours())}:${s(a.getMinutes())}:${s(a.getSeconds())}`),t&&(t.textContent=`${a.getFullYear()}.${s(a.getMonth()+1)}.${s(a.getDate())} / ${"\u65E5\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D"[a.getDay()]}`)};n(),setInterval(n,1e3)},paintThemeBtn(){let e=l("#themeBtn");if(!e)return;let t=j.list.findIndex(s=>s.id===j.current);e.dataset.themeIdx=String(t),e.title=`\u5207\u6362\u4E3B\u9898\uFF08\u5F53\u524D\uFF1A${j.list[t]?.label||j.current}\uFF09`},openDrawer(){l("#drawer")?.removeAttribute("hidden"),l("#drawerScrim")?.removeAttribute("hidden"),l("#menuBtn")?.setAttribute("aria-expanded","true"),document.body.classList.add("is-locked")},closeDrawer(){l("#drawer")?.setAttribute("hidden",""),l("#drawerScrim")?.setAttribute("hidden",""),l("#menuBtn")?.setAttribute("aria-expanded","false"),document.body.classList.remove("is-locked")},wire(){l("#themeBtn")?.addEventListener("click",()=>j.cycle());let e=l("#authBox");e?.addEventListener("click",n=>{if(n.target.closest("#authLogin")){this.openAuthPanel();return}if(n.target.closest("#authEdit")){this.closeAuthMenu(),this.openProfilePanel();return}if(n.target.closest("#authLogout")){$.logout(),this.closeAuthMenu(),b.show("\u5DF2\u9000\u51FA\u767B\u5F55");return}n.target.closest("#authToggle")&&(e.dataset.open==="1"?this.closeAuthMenu():(e.dataset.open="1",l("#authToggle")?.setAttribute("aria-expanded","true")))}),document.addEventListener("click",n=>{!e||e.hidden||n.target.closest("#authBox")||this.closeAuthMenu()}),l("#menuBtn")?.addEventListener("click",()=>{l("#drawer")?.hasAttribute("hidden")?this.openDrawer():this.closeDrawer()}),l("#drawerScrim")?.addEventListener("click",()=>this.closeDrawer());let t,s=document.querySelector(".brand__glyph");s?.addEventListener("pointerdown",()=>{t=setTimeout(()=>{b.show("\u672C\u5730\u5185\u5BB9\u5DF2\u91CD\u7F6E\u4E3A\u5185\u7F6E\u793A\u4F8B\uFF0C\u6B63\u5728\u91CD\u65B0\u8F7D\u5165\u2026"),Object.keys(localStorage).filter(n=>n.startsWith(as)).forEach(n=>localStorage.removeItem(n)),setTimeout(()=>location.reload(),900)},1200)}),["pointerup","pointerleave","pointercancel"].forEach(n=>s?.addEventListener(n,()=>clearTimeout(t))),window.addEventListener("keydown",n=>{let a=(n.target.tagName||"").toLowerCase();a==="input"||a==="textarea"||n.target.isContentEditable||(n.key==="Escape"&&(this.closeDrawer(),this.closeAuthMenu(),this.closeAuthPanel(),this.closeProfilePanel()),n.key.toLowerCase()==="t"&&!n.metaKey&&!n.ctrlKey&&j.cycle())}),document.addEventListener("click",n=>{let a=n.target.closest('a[href^="http"]');a&&!a.target&&(a.target="_blank",a.rel="noopener noreferrer")})}};var je={},Ps=[],ae=0,Se=[],Qe=!1,Be={page:"\u25A4",post:"\u25A6",news:"\u25C6",cmd:"\u2318",theme:"\u25D0"};function yn(){let e=[];return P.nav.forEach((t,s)=>e.push({group:"PAGE",label:`${t.label} \xB7 ${t.cn||""}`,sub:String(s+1).padStart(2,"0"),icon:Be.page,search:`${t.label} ${t.cn||""} ${t.id}`,run:()=>je.navigate?.(t.path)})),J.published.slice(0,60).forEach(t=>e.push({group:"LOGS",label:t.title,sub:de(t.date),icon:Be.post,search:`${t.title} ${t.category} ${(t.tags||[]).join(" ")}`,run:()=>je.navigate?.(`#/logs/${t.id}`)})),F.published.slice(0,40).forEach(t=>e.push({group:"NOTICE",label:t.title,sub:de(t.date),icon:Be.news,search:`${t.title} ${t.category}`,run:()=>je.navigate?.(`#/logs/${t.id}`)})),P.commands.forEach(t=>e.push({group:"ACTION",label:t.label,sub:t.hint,icon:Be.cmd,search:`${t.label} ${t.id} ${t.hint||""}`,run:()=>t.run(je)})),j.list.forEach(t=>e.push({group:"THEME",label:`\u4E3B\u9898 \xB7 ${t.label}`,sub:t.hint,icon:Be.theme,search:`theme ${t.label} ${t.hint} \u4E3B\u9898`,run:()=>j.set(t.id,{announce:!0})})),e}function wn(e,t){if(!t)return 1;let s=e.search.toLowerCase(),n=s.indexOf(t);if(n<0){let a=0;for(let i of t){if(a=s.indexOf(i,a),a<0)return 0;a++}return 1}return 100-Math.min(50,n)}function Lt(){let e=l("#cmdkList");if(!e)return;if(!Se.length){e.innerHTML='<div class="cmdk__empty">\u6CA1\u6709\u5339\u914D\u7ED3\u679C \xB7 \u8BD5\u8BD5\u300C\u97F3\u4E50\u300D\u300C\u4E3B\u9898\u300D\u6216\u516C\u544A\u6807\u9898</div>',l("#cmdkCount").textContent="0 RESULT";return}let t="",s="";Se.forEach((n,a)=>{n.group!==s&&(t+=`<div class="cmdk__group">${f(n.group)}</div>`,s=n.group),t+=`<div class="cmdk__item${a===ae?" is-cursor":""}" data-i="${a}">
      <span class="cmdk__ico">${n.icon}</span>
      <span class="cmdk__label">${f(n.label)}</span>
      <span class="cmdk__sub">${f(n.sub||"")}</span>
    </div>`}),e.innerHTML=t,l("#cmdkCount").textContent=`${Se.length} RESULT`,e.querySelector(`[data-i="${ae}"]`)?.scrollIntoView({block:"nearest"})}function Cs(e){let t=String(e||"").trim().toLowerCase();Se=Ps.map(s=>({it:s,s:wn(s,t)})).filter(s=>s.s>0).sort((s,n)=>n.s-s.s||s.it.group.localeCompare(n.it.group)).map(s=>s.it),ae=0,Lt()}function As(){let e=Se[ae];e&&(close(),setTimeout(()=>e.run(),10))}function ke(e=""){let t=l("#cmdk");if(!t)return;Ps=yn(),Qe=!0,t.removeAttribute("hidden");let s=l("#cmdkInput");s.value=e,Cs(e),setTimeout(()=>s.focus(),30),document.body.classList.add("is-locked"),S.emit("cmd:open")}function Oe(){let e=l("#cmdk");!e||e.hasAttribute("hidden")||(e.setAttribute("hidden",""),Qe=!1,document.body.classList.remove("is-locked"),S.emit("cmd:close"))}var Et={init(e){je=e||{};let t=l("#cmdk"),s=l("#cmdkInput");!t||!s||(s.addEventListener("input",()=>Cs(s.value)),s.addEventListener("keydown",n=>{n.key==="ArrowDown"?(n.preventDefault(),ae=Math.min(Se.length-1,ae+1),Lt()):n.key==="ArrowUp"?(n.preventDefault(),ae=Math.max(0,ae-1),Lt()):n.key==="Enter"?(n.preventDefault(),As()):n.key==="Escape"&&(n.preventDefault(),Oe())}),l("#cmdkList")?.addEventListener("click",n=>{let a=n.target.closest(".cmdk__item");a&&(ae=Number(a.dataset.i),As())}),l("#cmdkScrim")?.addEventListener("click",Oe),l("#searchBtn")?.addEventListener("click",()=>ke()),window.addEventListener("keydown",n=>{if((n.metaKey||n.ctrlKey)&&n.key.toLowerCase()==="k"){n.preventDefault(),Qe?Oe():ke();return}if(n.key==="Escape"&&Oe(),n.key==="/"&&!Qe){let i=(n.target.tagName||"").toLowerCase();if(i==="input"||i==="textarea"||n.target.isContentEditable)return;n.preventDefault(),ke()}}))},open:ke,close:Oe};var Is="assets/vendor/lunar-javascript/lunar.js",_n=new Set(["\u9664","\u5371","\u5B9A","\u6267","\u6210","\u5F00"]),Ns="\u8BF8\u4E8B\u4E0D\u5B9C",Ue=null,He=null;function Rs(){return Ue?Promise.resolve(Ue):He||(He=new Promise((e,t)=>{let s=window.module;window.module={exports:{}};let n=document.createElement("script");n.src=Is,n.async=!0;let a=i=>{let r=window.module?.exports||{};window.module=s,i&&r.Solar&&r.Lunar?(Ue=r,S.emit("almanac:ready",{ok:!0}),e(Ue)):(He=null,S.emit("almanac:ready",{ok:!1}),t(new Error("\u9EC4\u5386\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A"+Is)))};n.onload=()=>a(!0),n.onerror=()=>{n.remove(),a(!1)},document.head.append(n)}),He)}var et=e=>String(e).padStart(2,"0");function Me(e=new Date){return`${e.getFullYear()}-${et(e.getMonth()+1)}-${et(e.getDate())}`}function St(e,t){let[s,n,a]=String(e).split("-").map(Number),i=new Date(s,n-1,a+t);return Me(i)}function Ds(e){let t=/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(String(e||"").trim());if(!t)return"";let s=Number(t[1]),n=Number(t[2]),a=Number(t[3]);if(s<1901||s>2099||n<1||n>12||a<1||a>31)return"";let i=new Date(s,n-1,a);return i.getMonth()!==n-1||i.getDate()!==a?"":`${s}-${et(n)}-${et(a)}`}function $n(e){let t=e.getDayYi()||[],s=e.getDayJi()||[],n=e.getZhiXing(),a=e.getXiuLuck(),i=e.getDayTianShen(),r=e.getDayTianShenType(),o=e.getDayJiShen()||[],u=e.getDayXiongSha()||[],c=t.includes(Ns)||s.includes(Ns),d=[],h=0;r==="\u9EC4\u9053"?h+=2:h-=2,d.push(`${i}${r}`);let y=_n.has(n);h+=y?1:-1,d.push(`${n}\u65E5`),h+=a==="\u5409"?1:-1,d.push(`${e.getXiu()}\u5BBF${a}`),t.length>=6&&(h+=1),s.length>=6&&(h-=1),o.length>=3&&(h+=1),u.length>=4&&(h-=1),c&&(h=-99,d.unshift("\u5B9C\u5FCC\u89C1\u300C\u8BF8\u4E8B\u4E0D\u5B9C\u300D"));let C=Number(ce.luckyScore),B=Number.isFinite(C)?C:2;return{yi:t,ji:s,zhiXing:n,xiu:e.getXiu(),xiuLuck:a,tianShen:i,tianShenType:r,tianShenLuck:e.getDayTianShenLuck(),jiShen:o,xiongSha:u,score:c?-99:h,veto:c,lucky:!c&&h>=B,reason:d.join(" \xB7 ")}}async function kt(e){let t=await Rs(),s=Ds(e)||Me(),[n,a,i]=s.split("-").map(Number),r=t.Solar.fromYmd(n,a,i),o=r.getLunar(),u=$n(o);return{date:s,week:`\u661F\u671F${r.getWeekInChinese()}`,isToday:s===Me(),isTomorrow:s===St(Me(),1),lunarText:`${o.getYearInChinese()}\u5E74${o.getMonthInChinese()}\u6708${o.getDayInChinese()}`,ganZhi:{year:o.getYearInGanZhi(),month:o.getMonthInGanZhiExact(),day:o.getDayInGanZhi()},shengXiao:o.getYearShengXiao(),jieQi:o.getJieQi()||"",nextJieQi:(()=>{let c=o.getNextJieQi();return c?{name:c.getName(),date:c.getSolar().toYmd()}:null})(),chong:o.getDayChongDesc(),sha:o.getDaySha(),xi:o.getDayPositionXiDesc(),cai:o.getDayPositionCaiDesc(),...u}}async function xn(){let e=Me(),t=[await kt(e)];return t.push(await kt(St(e,1))),t}var pe={el:null,playing:!1,reason:"",pausedMusic:!1,_fade:null,get title(){return ce.anthem?.title||"\u5409\u65E5\u4E4B\u6B4C"},get artist(){return ce.anthem?.artist||""},url(){let e=ce.anthem||{};return e.src?e.src:e.neteaseId?`/api/netease/audio?id=${encodeURIComponent(e.neteaseId)}`:""},ensure(){if(this.el)return this.el;let e=document.createElement("audio");return e.id="anthem",e.preload="auto",e.setAttribute("aria-hidden","true"),e.style.cssText="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none",e.addEventListener("ended",()=>this._finish()),e.addEventListener("error",()=>{let t=this.url();S.emit("toast",{message:`\u300C${this.title}\u300D\u52A0\u8F7D\u5931\u8D25\uFF1A${t}`,kind:"err"}),this._finish()}),document.body.append(e),this.el=e,e},_targetVolume(){let e=Number(ce.anthem?.volume);return Number.isFinite(e)?Math.min(1,Math.max(0,e)):.9},_fadeTo(e,t=700){let s=this.el;if(!s)return;clearInterval(this._fade);let n=s.volume,a=Math.max(1,Math.round(t/50)),i=0;this._fade=setInterval(()=>{i+=1;let r=Math.min(1,i/a);s.volume=Math.min(1,Math.max(0,n+(e-n)*r)),r>=1&&(clearInterval(this._fade),this._fade=null)},50)},_finish(){clearInterval(this._fade),this._fade=null,this.playing=!1,S.emit("almanac:anthem",{playing:!1,reason:this.reason,title:this.title})},async play({reason:e=""}={}){let t=this.url();if(!t)return{ok:!1,error:"\u6CA1\u6709\u914D\u7F6E\u5409\u65E5\u4E4B\u6B4C\u7684\u97F3\u6E90\uFF08\u89C1 site.config.js \u7684 ALMANAC.anthem\uFF09"};if(this.playing&&this.el&&!this.el.paused)return this.reason=e||this.reason,S.emit("almanac:anthem",{playing:!0,reason:this.reason,title:this.title}),{ok:!0,already:!0};let s=this.ensure();if(s.getAttribute("src")!==t){s.src=t;try{s.load()}catch{}}ce.anthem?.pauseMusic!==!1&&E.playing&&(this.pausedMusic=!0,E.pause()),this.reason=e,s.volume=0;try{await s.play()}catch{return this.playing=!1,S.emit("almanac:anthem",{playing:!1,reason:e,title:this.title}),{ok:!1,error:"\u6D4F\u89C8\u5668\u62E6\u4F4F\u4E86\u81EA\u52A8\u64AD\u653E\uFF0C\u70B9\u4E00\u4E0B\u300C\u25B6 "+this.title+"\u300D\u5373\u53EF"}}return this._fadeTo(this._targetVolume(),700),this.playing=!0,S.emit("almanac:anthem",{playing:!0,reason:e,title:this.title}),{ok:!0}},stop({silent:e=!1}={}){let t=this.el;t&&(this._fadeTo(0,300),clearTimeout(this._stopTimer),this._stopTimer=setTimeout(()=>{try{t.pause(),t.currentTime=0}catch{}},320),this.playing=!1,e||S.emit("almanac:anthem",{playing:!1,reason:"",title:this.title}))},toggle(e){return this.playing?(this.stop(),{ok:!0,playing:!1}):this.play(e)},resumeMusic(){return this.pausedMusic?(this.pausedMusic=!1,E.play(),!0):!1}},V={load:Rs,day:kt,todayPair:xn,ymd:Me,addDays:St,normalizeDate:Ds,anthem:pe,get config(){return ce},get loaded(){return!!Ue}};var X=!1,tt="pair",Q=[],st=!1,Ae=e=>String(e).replace(/-/g,".");function Pt(e){return e.isToday?"\u4ECA\u5929":e.isTomorrow?"\u660E\u5929":""}function Ln(e){let t=e.lucky?'<span class="almanac__tag almanac__tag--lucky">\u5409\u65E5</span>':'<span class="almanac__tag">\u51F6\u65E5</span>',s=Pt(e),n=e.yi.length?e.yi.join(" "):"\u2014",a=e.ji.length?e.ji.join(" "):"\u2014";return`
  <article class="almanac__day${e.lucky?" is-lucky":""}">
    <header class="almanac__day-head">
      <span class="almanac__day-date">${Ae(e.date)}<i class="mono">${f(e.week)}</i></span>
      ${s?`<span class="almanac__rel mono">${s}</span>`:""}
      ${t}
    </header>

    <p class="almanac__line">
      \u519C\u5386 <b>${f(e.lunarText)}</b>
      <span class="almanac__sep">\xB7</span>${f(e.ganZhi.year)}\u5E74 \u5C5E${f(e.shengXiao)}
      ${e.jieQi?`<span class="almanac__sep">\xB7</span><b class="almanac__jieqi">${f(e.jieQi)}</b>`:""}
    </p>
    <p class="almanac__line mono">
      ${f(e.ganZhi.year)} / ${f(e.ganZhi.month)} / ${f(e.ganZhi.day)}
      <span class="almanac__sep">\xB7</span>${f(e.zhiXing)}\u65E5
      <span class="almanac__sep">\xB7</span>${f(e.xiu)}\u5BBF${f(e.xiuLuck)}
      <span class="almanac__sep">\xB7</span>${f(e.tianShen)}${f(e.tianShenType)}
    </p>

    <div class="almanac__yiji">
      <div class="almanac__yiji-row almanac__yiji-row--yi">
        <span class="almanac__yiji-key">\u5B9C</span>
        <span class="almanac__yiji-val">${f(n)}</span>
      </div>
      <div class="almanac__yiji-row almanac__yiji-row--ji">
        <span class="almanac__yiji-key">\u5FCC</span>
        <span class="almanac__yiji-val">${f(a)}</span>
      </div>
    </div>

    <footer class="almanac__day-foot mono">
      <span>\u51B2${f(e.chong)} \u715E${f(e.sha)}</span>
      <span class="almanac__sep">\xB7</span><span>\u559C\u795E${f(e.xi)} \u8D22\u795E${f(e.cai)}</span>
      <br />
      <span class="faint">\u5224${e.lucky?"\u5409":"\u51F6"}\u4F9D\u636E\uFF1A${f(e.reason)}${e.veto?"":` \xB7 \u8BC4\u5206 ${e.score}`}</span>
    </footer>
  </article>`}function En(){let e=V.config?.anthem||{},t=`${f(e.title||"\u5409\u65E5\u4E4B\u6B4C")}${e.artist?` \xB7 ${f(e.artist)}`:""}`;return pe.playing?`
    <div class="almanac__anthem is-on" id="almanacAnthemBox">
      <span class="almanac__anthem-wave" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="almanac__anthem-text">\u6B63\u5728\u64AD\u653E ${t}<i class="almanac__anthem-note">\u5173\u95ED\u9762\u677F\u5373\u505C\u6B62</i></span>
      <button class="btn btn--sm" id="almanacAnthemStop" type="button">\u505C\u6B62</button>
    </div>`:`
  <div class="almanac__anthem" id="almanacAnthemBox">
    <span class="almanac__anthem-text faint">\u5409\u65E5\u4E4B\u6B4C ${t}</span>
    <button class="btn btn--sm" id="almanacAnthemPlay" type="button">\u25B6 \u64AD\u653E</button>
  </div>`}function Tt(){return pe.pausedMusic?'<button class="almanac__linkbtn" id="almanacResume" type="button">\u7EE7\u7EED\u64AD\u653E\u521A\u624D\u7684\u6B4C</button>':""}function At(){pe.resumeMusic()&&(b.ok("\u5DF2\u7EE7\u7EED\u7AD9\u5185\u64AD\u653E"),Pe())}function kn(){let e=Q.filter(a=>a.lucky),t=V.config?.anthem?.autoplay!==!1,s=[];if(e.length){let a=e.map(i=>Pt(i)||Ae(i.date)).join("\u3001");s.push(`${a}\u662F\u5409\u65E5${t?` \xB7 \u5DF2\u81EA\u52A8\u64AD\u653E\u300A${f(V.config.anthem.title)}\u300B`:""}`)}else tt==="pair"?s.push("\u4ECA\u5929\u4E0E\u660E\u5929\u90FD\u4E0D\u662F\u5409\u65E5 \xB7 \u5409\u65E5\u624D\u4F1A\u54CD\u8D77\u5409\u65E5\u4E4B\u6B4C"):s.push("\u8FD9\u4E00\u5929\u4E0D\u662F\u5409\u65E5 \xB7 \u5409\u65E5\u624D\u4F1A\u54CD\u8D77\u5409\u65E5\u4E4B\u6B4C");let n=Tt();return n&&s.push(n),tt==="single"&&s.push('<button class="almanac__linkbtn" id="almanacBackToday" type="button">\u56DE\u5230\u4ECA\u5929</button>'),s.join(' <span class="almanac__sep">\xB7</span> ')}function Pe(){let e=l("#almanacBody"),t=l("#almanacHint"),s=l("#almanacHeadDate");if(!e)return;if(st){e.innerHTML='<p class="almanac__loading mono">\u6B63\u5728\u52A0\u8F7D\u9EC4\u5386\u6570\u636E\u2026</p>',t&&(t.innerHTML=Tt(),l("#almanacResume")?.addEventListener("click",At));return}if(!Q.length){e.innerHTML='<p class="almanac__loading mono">\u6682\u65F6\u53D6\u4E0D\u5230\u9EC4\u5386\u6570\u636E\u3002</p>',t&&(t.innerHTML=Tt(),l("#almanacResume")?.addEventListener("click",At));return}e.innerHTML=Q.map(Ln).join("");let n=l("#almanacAnthem");n&&(n.innerHTML=En()),s&&(s.textContent=tt==="pair"?`${Ae(Q[0].date)} \u2014 ${Ae(Q[Q.length-1].date)}`:Ae(Q[0].date)),t&&(t.innerHTML=kn()),Sn()}function Sn(){l("#almanacAnthemPlay")?.addEventListener("click",()=>Hs("\u624B\u52A8\u64AD\u653E")),l("#almanacAnthemStop")?.addEventListener("click",()=>pe.stop()),l("#almanacResume")?.addEventListener("click",At),l("#almanacBackToday")?.addEventListener("click",()=>Os())}async function Bs(e){st=!0,Pe();try{let t=await Promise.all(e.map(s=>V.day(s)));Q=t,tt=t.length>1?"pair":"single"}catch(t){Q=[],b.show(`\u9EC4\u5386\u6570\u636E\u52A0\u8F7D\u5931\u8D25\uFF1A${t?.message||t}`,"",{ttl:6e3})}finally{st=!1,Pe()}}async function Os(){let e=V.ymd();await Bs([e,V.addDays(e,1)]),js()}function js(){if(V.config?.anthem?.autoplay===!1)return;let e=Q.find(s=>s.lucky);if(!e)return;let t=Pt(e)||Ae(e.date);Hs(`${t}\u662F\u5409\u65E5`)}async function Hs(e){let t=await pe.play({reason:e});!t.ok&&t.error&&b.show(t.error,"",{ttl:6e3}),Pe()}function Us(){let e=l("#almanac"),t=l("#almanacBtn");if(!e||!t)return;if(window.innerWidth<=620){e.style.right="";return}let s=t.getBoundingClientRect(),n=16;e.style.right=`${Math.max(n,window.innerWidth-s.right)}px`}async function Mt(){let e=l("#almanac"),t=l("#almanacBtn");e&&(X=!0,e.removeAttribute("hidden"),t?.setAttribute("aria-expanded","true"),Us(),await Os())}function Te(){let e=l("#almanac"),t=l("#almanacBtn");!e||!X||(X=!1,e.setAttribute("hidden",""),t?.setAttribute("aria-expanded","false"),pe.stop({silent:!1}))}var Ct={get isOpen(){return X},init(){let e=l("#almanac"),t=l("#almanacBtn");if(!e||!t||V.config?.enabled===!1)return this;t.addEventListener("click",i=>{i.stopPropagation(),X?Te():Mt()}),l("#almanacClose")?.addEventListener("click",()=>Te()),e.addEventListener("click",i=>i.stopPropagation()),document.addEventListener("click",()=>{X&&Te()}),document.addEventListener("keydown",i=>{i.key==="Escape"&&X&&Te()}),window.addEventListener("resize",()=>{X&&Us()},{passive:!0});let s=l("#almanacDate"),n=l("#almanacGo");s&&(s.value=V.ymd());let a=()=>{let i=V.normalizeDate(s?.value);if(!i){b.show("\u65E5\u671F\u683C\u5F0F\u770B\u4E0D\u6E05\uFF0C\u7528 2026-10-09 \u8FD9\u79CD\u5199\u6CD5","",{ttl:5e3});return}s&&(s.value=i),Bs([i]).then(()=>js())};return n?.addEventListener("click",a),s?.addEventListener("keydown",i=>{i.key==="Enter"&&(i.preventDefault(),a())}),s?.addEventListener("change",a),S.on("almanac:anthem",()=>{X&&Pe()}),S.on("player:state",()=>{X&&!st&&Pe()}),this},toggle(){return X?(Te(),!1):(Mt(),!0)},open:Mt,close:Te};var we=null,nt=null;function at(){let e=document.querySelector(".wave-row");if(!e){we?.(),we=null,nt=null;return}let t=E.current;if(!t){e.hidden=!0,we?.(),we=null,nt=null;return}e.hidden=!1,e.classList.toggle("is-playing",!!E.playing);let s=e.querySelector(".wave-row__cover");s&&s.dataset.cover!==(t.cover||"")&&(s.dataset.cover=t.cover||"",s.style.backgroundImage=t.cover?`url("${t.cover}")`:"",s.classList.toggle("is-empty",!t.cover));let n=e.querySelector(".mp-wave");if(n&&(n.classList.toggle("is-live",!!E.playing),n!==nt)){we?.(),nt=n;let a=[...n.querySelectorAll("i")];we=a.length?ys(a,()=>E.playing):null}}function Gs(){return S.on("player:track",()=>at()),S.on("player:state",()=>at()),S.on("route:change",()=>setTimeout(at,40)),at(),()=>we?.()}var It=[["MOUNT","\u6838\u5FC3\u6A21\u5757\u6302\u8F7D\u5B8C\u6210"],["CONTENT","\u5185\u5BB9\u4ED3\u5E93\u63E1\u624B"],["AUDIO","\u521D\u59CB\u5316\u97F3\u9891\u5F15\u64CE"],["GALLERY","\u8FDE\u63A5\u63D2\u753B\u901A\u9053"],["THEME","\u8F7D\u5165\u89C6\u89C9\u4EE4\u724C"],["READY","\u7EC8\u7AEF\u5C31\u7EEA"]],Fs={async run({minDuration:e=1150}={}){let t=l("#boot"),s=l("#bootLog"),n=l("#bootBar"),a=l("#bootPct");if(!t||!s)return;if(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches){t.classList.add("is-done");return}let i=performance.now();for(let o=0;o<It.length;o++){let[u,c]=It[o],d=document.createElement("div");d.innerHTML=`<b>[${u}]</b> ${c}`,d.style.opacity="0",d.style.transition="opacity 180ms ease",s.append(d),setTimeout(()=>{d.style.opacity="1"},0);let h=Math.round((o+1)/It.length*100);n&&(n.style.width=`${h}%`),a&&(a.textContent=`${String(h).padStart(3,"0")}%`),await new Promise(y=>setTimeout(y,130+Math.random()*130))}let r=performance.now()-i;r<e&&await new Promise(o=>setTimeout(o,e-r)),t.classList.add("is-done"),setTimeout(()=>t.setAttribute("hidden",""),700)}};var Ge={registered:!1,updateReady:!1,version:""};function zs(e){if(Ge.updateReady)return;Ge.updateReady=!0;let t=b.show("\u65B0\u7248\u672C\u5DF2\u5C31\u7EEA \xB7 \u70B9\u8FD9\u91CC\u5237\u65B0","ok",{ttl:12e3});t&&(t.style.cursor="pointer",t.title="\u5E94\u7528\u65B0\u7248\u672C",t.addEventListener("click",()=>{e?.postMessage({type:"SKIP_WAITING"}),setTimeout(()=>location.reload(),900)},{once:!0}))}function Ws(){if(!("serviceWorker"in navigator)||location.protocol!=="http:"&&location.protocol!=="https:")return;if(window.FTNative){try{navigator.serviceWorker.getRegistrations?.().then(t=>t.forEach(s=>s.unregister())).catch(()=>{})}catch{}return}let e=async()=>{try{let t=await navigator.serviceWorker.register("sw.js",{scope:"./"});Ge.registered=!0;let s=n=>{n&&n.state==="installed"&&navigator.serviceWorker.controller&&zs(n)};s(t.waiting),s(t.installing),t.addEventListener("updatefound",()=>{let n=t.installing;n&&n.addEventListener("statechange",()=>{n.state==="installed"&&navigator.serviceWorker.controller&&zs(n)})}),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"&&t.update().catch(()=>{})}),navigator.serviceWorker.controller&&(Ge.version="active"),navigator.serviceWorker.addEventListener("controllerchange",()=>{Ge.updateReady&&location.reload()})}catch(t){console.warn("[pwa] Service Worker \u6CE8\u518C\u5931\u8D25",t)}};document.readyState==="complete"?e():window.addEventListener("load",e,{once:!0}),window.addEventListener("offline",()=>{b.show("\u65AD\u7F51\u4E86 \xB7 \u5DF2\u7F13\u5B58\u7684\u9875\u9762\u8FD8\u80FD\u7FFB","",{ttl:4200})}),window.addEventListener("online",()=>{b.ok("\u7F51\u7EDC\u56DE\u6765\u4E86")})}var Vs=null,_e=null,qs="";function Mn(){return(Array.isArray(I.heroTitle)&&I.heroTitle.length?I.heroTitle:[{text:I.name}]).slice(0,3).map(t=>{let s=typeof t=="string"?{text:t}:t,n=f(s.text);return s.style==="em"?n=`<em>${n}</em>`:n=n.replace(/&amp;/g,'<span class="amp">&amp;</span>'),`<span class="row"><span>${n}</span></span>`}).join("")}var Ys={id:"home",title:"\u9996\u9875",render(){let e=J.published,t=F.sorted.filter(o=>!o.draft),s=t.filter(o=>o.pinned||o.level>0).slice(0,2),n=t.slice(0,5),a=e.slice(0,6),i=ne.unreadNews,r=[...new Set(e.flatMap(o=>o.tags||[]))].slice(0,10);return`
    <section class="hero" id="hero">
      <div class="hero__media" id="heroMedia" aria-hidden="true">
        <img class="hero__media-img" id="heroMediaImg" alt="" decoding="async" fetchpriority="high" draggable="false" />
        <span class="hero__media-scrim"></span>
      </div>
      <div class="hero__bg" id="heroBg">
        <div class="hero__slash"></div>
        <div class="ruled-mask"></div>
      </div>
      <!-- hero HUD \u88C5\u9970\uFF08\u5706\u73AF + \u4E00\u5708\u523B\u5EA6\uFF09\u7AD9\u4E3B 2026-11-05 \u8981\u6C42\u5168\u90E8\u64A4\u6389 \u2713 -->
      <div class="hero__inner">
        <button class="hero__media-fab" id="heroMediaFab" type="button" disabled
                aria-label="\u6362\u4E00\u5F20\u6A2A\u5E45" aria-keyshortcuts="R" title="\u6362\u4E00\u5F20\u6A2A\u5E45\uFF08\u5FEB\u6377\u952E R\uFF09">${N.refresh}</button>
        <div class="hero__eyebrow">
          <span class="hero__eyebrow-line"></span>
          <span class="k-label k-label--ink">${f(I.subtitle)}</span>
          <span class="k-label k-label--signal">\u25CF ONLINE</span>
          <span class="k-label">${de(new Date().toISOString())}</span>
        </div>

        <!-- \u5927\u6807\u9898 + \u53F3\u4FA7\u300C\u6B63\u5728\u64AD\u653E\u300D\uFF1A\u6B4C\u8BCD\u5728\u4E0A\uFF0C\u5706\u5F62\u97F3\u6D6A\uFF08\u5706\u5FC3\u5C01\u9762\uFF09\u5728\u4E0B -->
        <div class="hero__stage">
          <h1 class="hero__title">
            ${Mn()}
          </h1>
          <div class="hero__playing">
            ${$s()}
            ${xs()}
          </div>
        </div>

        <p class="hero__lede">${f(I.tagline)}<br />
          \u8FD9\u91CC\u6536\u96C6\u6587\u7AE0\u3001\u516C\u544A\u3001\u6B63\u5728\u5FAA\u73AF\u7684\u97F3\u4E50\uFF0C\u4EE5\u53CA\u76F8\u518C\u91CC\u7684\u63D2\u753B\u3002</p>

        <div class="hero__cta">
          <a class="btn btn--signal" href="#/logs" data-nav>${N.doc}\u9605\u8BFB\u6587\u7AE0</a>
          <a class="btn" href="#/gallery" data-nav>${N.image}\u63D2\u753B</a>
          <button class="btn" id="heroPlay">${N.play}\u64AD\u653E\u97F3\u4E50</button>
          <a class="btn" href="#/admin" data-nav>${N.settings}\u53D1\u5E03\u5185\u5BB9</a>
          ${P.renderWidgets("hero-actions",{})}
        </div>

        <div class="hero__media-bar" id="heroMediaBar" hidden>
          <a class="hero__media-credit" id="heroMediaCredit" href="#/gallery" data-nav>
            <span class="hero__media-kicker" id="heroMediaKicker">// RANDOM ARCHIVE</span>
            <span class="hero__media-no" id="heroMediaNo">NO.---</span>
            <b class="hero__media-title" id="heroMediaTitle">\u7B49\u5F85\u62BD\u53D6</b>
            <span class="hero__media-meta" id="heroMediaMeta">\u6A2A\u5E45\u76F8\u518C</span>
          </a>
          <span class="hero__media-count" id="heroMediaCount">SCAN ---</span>
          <button class="btn btn--sm" id="heroMediaPin" type="button" aria-pressed="false"
                  title="\u56FA\u5B9A\u5F53\u524D\u6A2A\u5E45\uFF1A\u4E4B\u540E\u8FDB\u9996\u9875\u4E0D\u518D\u6362">\u56FA\u5B9A</button>
          <button class="btn btn--sm" id="heroMediaPick" type="button" disabled
                  aria-keyshortcuts="G" title="\u4ECE\u56FE\u5E93\u9009\u4E00\u5F20 / \u5BFC\u5165\u81EA\u5DF1\u7684\u56FE\uFF08\u5FEB\u6377\u952E G\uFF09">\u9009\u56FE</button>
          <button class="btn btn--sm" id="heroMediaShuffle" type="button" disabled
                  aria-keyshortcuts="R" title="\u6362\u4E00\u5F20\u6A2A\u5E45\uFF08\u5FEB\u6377\u952E R\uFF09">${N.refresh}\u6362\u4E00\u5F20</button>
        </div>

        <div class="hero__stats">
          ${ye("\u7BC7\u6587\u7AE0",String(e.length).padStart(2,"0"))}
          ${ye("\u6761\u516C\u544A",String(t.length).padStart(2,"0"))}
          ${ye("\u672A\u8BFB",String(i).padStart(2,"0"))}
          ${ye("\u66F2\u76EE",String(E.tracks.length).padStart(2,"0"))}
          ${ye("\u63D2\u753B\u6570\u636E\u6E90",String(P.imageProviders.length).padStart(2,"0"))}
          ${ye("\u7248\u672C",I.version)}
        </div>
        ${P.renderWidgets("after-hero",{})}
      </div>
    </section>

    ${s.length?`<div class="grid" style="gap:var(--sp-2);margin-top:var(--sp-5)">
      ${s.map(o=>`<div class="notice ${o.level>=2?"":"notice--signal"}">
        <span class="notice__icon">${o.level>=2?"!!":"\u2605"}</span>
        <div style="flex:1;min-width:0">
          <a href="#/logs/${o.id}" data-nav style="font-weight:700">${f(o.title)}</a>
          <div class="mono faint" style="font-size:var(--fs-2xs)">${de(o.date)} \xB7 ${f(o.category)}</div>
        </div>
        <span class="tag ${o.level>=2?"tag--alert":"tag--signal"}">${o.level>=2?"\u7D27\u6025":"\u91CD\u8981"}</span>
      </div>`).join("")}
    </div>`:""}

    <section class="sect">
      ${Ze("01","\u6700\u65B0\u6587\u7AE0","#/logs","ALL LOGS")}
      ${a.length?`<div class="grid grid--3">${a.map((o,u)=>Ls(o,{index:u})).join("")}</div>`:xt({title:"\u8FD8\u6CA1\u6709\u6587\u7AE0",desc:"\u8FDB\u5165\u300C\u53D1\u5E03\u300D\u63A7\u5236\u53F0\u5199\u4E0B\u7B2C\u4E00\u7BC7\u3002",icon:"\u25A6"})}
    </section>

    <section class="sect">
      ${Ze("02","\u516C\u544A\u4E0E\u63D2\u753B","#/gallery","OPEN GALLERY")}
      <div class="grid grid--split">
        <div>
          ${n.length?`<div class="list">${n.map((o,u)=>Es(o,{compact:!0,index:u})).join("")}</div>
               <div style="margin-top:var(--sp-4)"><a class="btn btn--sm" href="#/logs" data-nav>\u5168\u90E8\u516C\u544A \u2192</a></div>`:xt({title:"\u6682\u65E0\u516C\u544A",desc:"\u53D1\u5E03\u4E00\u6761\u516C\u544A\u4F1A\u7ACB\u523B\u663E\u793A\u5728\u8FD9\u91CC\u3002",icon:"\u25C6"})}
        </div>
        <div class="grid" style="gap:var(--sp-4)">
          <div class="panel">
            <div class="panel__head">
              <span class="panel__title">\u63D2\u753B</span>
              <span class="status-dot status-dot--on">LIVE</span>
            </div>
            <div class="panel__body grid" style="gap:var(--sp-3)">
              <div class="stage" id="homeStage" style="min-height:200px">
                <span class="stage__badge" id="homeStageBadge">ART</span>
                <div class="stage__placeholder" id="homeStagePh">${N.image}<p class="mono" style="font-size:var(--fs-2xs)">\u70B9\u51FB\u4E0B\u65B9\u8FDB\u5165\u753B\u5ECA</p></div>
                <img class="stage__img is-loading" id="homeStageImg" alt="\u63D2\u753B\u9884\u89C8" referrerpolicy="no-referrer" fetchpriority="high" decoding="async" style="max-height:320px" />
              </div>
              <div class="grid" style="grid-template-columns:1fr 1fr;gap:6px">
                <a class="btn btn--sm btn--signal" href="#/gallery" data-nav>${N.image}\u53BB\u63D2\u753B\u677F\u5757</a>
                <button class="btn btn--sm" id="homePixiv">${N.ext}PIXIV</button>
              </div>
              <div class="faint mono" style="font-size:var(--fs-2xs)" id="homeStageMeta">SOURCE \u2014</div>
            </div>
          </div>

          <div class="panel">
            <div class="panel__head"><span class="panel__title">\u6807\u7B7E</span><span class="mono faint" style="font-size:var(--fs-2xs)">TAGS</span></div>
            <div class="panel__body" style="display:flex;flex-wrap:wrap;gap:6px">
              ${r.length?r.map(o=>`<a class="chip" href="#/logs?tag=${encodeURIComponent(o)}" data-nav>#${f(o)}</a>`).join(""):'<span class="faint mono" style="font-size:var(--fs-2xs)">\u6682\u65E0\u6807\u7B7E</span>'}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="sect">
      ${Ze("03","\u6A21\u5757\u7D22\u5F15",null)}
      <div class="grid grid--auto">
        ${[{t:"\u6587\u7AE0\u4E0E\u516C\u544A",e:"LOGS",d:"\u4E24\u7C7B\u53D1\u5E03\u7269\u5408\u6210\u4E00\u6761\u65F6\u95F4\u7EBF\uFF1A\u6587\u7AE0\u4E0E\u516C\u544A\u3002",h:"#/logs",i:N.doc,n:`${String(J.published.length).padStart(2,"0")}+${String(F.published.length).padStart(2,"0")}`},{t:"\u97F3\u4E50",e:"MUSIC",d:"\u641C\u7D22\u7F51\u6613\u4E91\u66F2\u76EE\uFF0C\u5B98\u65B9\u64AD\u653E\u5668\u7AD9\u5185\u8BD5\u542C\u3002",h:"#/music",i:N.music,n:String(E.tracks.length).padStart(2,"0")},{t:"\u63D2\u753B",e:"GALLERY",d:"\u672C\u5730\u76F8\u518C\u7F51\u683C + \u968F\u673A\u62BD\u56FE\uFF0C\u4E00\u952E\u8DF3\u8F6C Pixiv\u3002",h:"#/gallery",i:N.image,n:`${P.imageProviders.length}`},{t:"\u6587\u5A31",e:"LEISURE",d:"\u5F53\u5B63\u65B0\u756A\u3001\u79C1\u5FC3\u63A8\u8350\uFF0C\u4EE5\u53CA\u53EA\u5B58\u5728\u672C\u5730\u7684\u8FFD\u756A\u6807\u8BB0\u3002",h:"#/leisure",i:N.screen,n:"22"},{t:"\u4E0B\u8F7D App",e:"DOWNLOAD",d:"Android APK \u4E0E Windows \u684C\u9762\u7248\uFF0C\u7AD9\u70B9\u548C\u76F8\u518C\u6253\u8FDB\u672C\u5730\u3002",h:"#/download",i:N.ext,n:"APK \xB7 ZIP"},{t:"\u626B\u96F7",e:"MINES",d:"\u4E09\u6863\u96BE\u5EA6\uFF0C\u9996\u70B9\u5B89\u5168\u3001\u548C\u5F26\u3001\u952E\u76D8\u90FD\u80FD\u6765\u3002",h:"#/mine",i:N.grid,n:"GAME"},{t:"\u5DE5\u5177\u53F0",e:"TOOLS",d:"\u683C\u5F0F\u8F6C\u6362 / \u56FE\u7247\u538B\u7F29 / \u6587\u672C\u5904\u7406\uFF0C\u6587\u4EF6\u4E0D\u51FA\u6D4F\u89C8\u5668\u3002",h:"#/tools",i:N.tools,n:"03"},{t:"\u53D1\u5E03",e:"CONSOLE",d:"\u5728\u6D4F\u89C8\u5668\u91CC\u5199\u6587\u7AE0\u3001\u53D1\u516C\u544A\u3001\u5BFC\u51FA\u6570\u636E\u3002",h:"#/admin",i:N.settings,n:"IO"}].map((o,u)=>`
          <a class="panel" href="${o.h}" data-nav data-reveal data-reveal-delay="${u*50}" style="padding:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-3);transition:border-color 120ms">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <span style="color:var(--fg-muted);width:20px;height:20px">${o.i}</span>
              <span class="mono faint" style="font-size:var(--fs-2xs)">${o.n}</span>
            </div>
            <div>
              <div class="k-label">${f(o.e)}</div>
              <div style="font-size:1.15rem;font-weight:800;margin-top:2px">${f(o.t)}</div>
            </div>
            <p class="muted" style="font-size:var(--fs-sm);margin:0">${f(o.d)}</p>
          </a>`).join("")}
      </div>
    </section>

    ${P.renderWidgets("before-footer",{})}`},mount(e){let t=W.parallax("#heroBg",16),s=window.matchMedia?.("(pointer: coarse)").matches?4:8,n=W.parallax("#heroMediaImg",s);is(".hero__stat b",e).forEach(g=>{let w=Number(String(g.textContent).replace(/\D/g,""))||0;w>0&&w<1e4&&W.countup(g,w,{pad:String(g.textContent).length})});let a=0,i=(g,w)=>{let T=Le(g);return T==="portrait"||T==="landscape"?T:w?"portrait":"landscape"},r=async()=>{if(!_e)try{let m=await ds("data/album.json");_e=wt(m)}catch{_e=wt([])}let g=Xe(l("#hero")),w=cs(_e,{portrait:g}),T=w.pool;if(R&&!U){let m=R;if(g&&Le(m)==="landscape")R=null,H(null),b.show("\u624B\u673A\u7AD6\u5C4F\u4E0B\u5DF2\u53D6\u6D88\u56FA\u5B9A\u7684\u6A2A\u56FE\uFF0C\u6539\u4E3A\u7AD6\u56FE\u968F\u673A");else return{photo:m,count:T.length,orientation:i(m,g),pinned:!0}}if(!T.length){let m=z.current;return m?.url?g&&Le(m)==="landscape"?null:{photo:m,count:1,orientation:i(m,g)}:null}let p=T[Math.floor(Math.random()*T.length)];for(let m=0;m<6&&p.url===qs&&T.length>1;m++)p=T[Math.floor(Math.random()*T.length)];return g&&_e.portrait.length&&Le(p)!=="portrait"&&(p=_e.portrait[Math.floor(Math.random()*_e.portrait.length)]),qs=p.url,{photo:p,count:T.length,orientation:i(p,g),fallback:w.fallback}},o=document.getElementById("topbar"),u=document.getElementById("ticker"),c=l("#hero"),d=l("#heroMedia"),h=()=>{if(!o||!c||!d)return;let g=d.getBoundingClientRect(),w=o.getBoundingClientRect(),T=c.classList.contains("is-media")&&g.top<w.bottom-1&&g.bottom>w.top+1;o.classList.toggle("is-over-media",T),u?.classList.toggle("is-over-media",T)};h(),window.addEventListener("scroll",h,{passive:!0}),window.addEventListener("resize",h);let y=!1,M=!1,C="ft.terminal.heroPinned",B=()=>{try{let g=JSON.parse(localStorage.getItem(C)||"null");return g?.url?g:null}catch{return null}},H=g=>{try{return g?.url?localStorage.setItem(C,JSON.stringify(g)):localStorage.removeItem(C),!0}catch{return!1}},R=B(),U=!1,x=null,O=()=>{let g=l("#heroMediaPin");if(!g)return;let w=!!R;g.textContent=w?"\u5DF2\u56FA\u5B9A":"\u56FA\u5B9A",g.setAttribute("aria-pressed",String(w)),g.classList.toggle("is-on",w),g.title=w?"\u5DF2\u56FA\u5B9A\u8FD9\u5F20\u6A2A\u5E45\uFF1A\u70B9\u4E00\u4E0B\u6062\u590D\u968F\u673A":"\u56FA\u5B9A\u5F53\u524D\u6A2A\u5E45\uFF1A\u4E4B\u540E\u8FDB\u9996\u9875\u4E0D\u518D\u6362"},D=async()=>{let g=l("#hero"),w=l("#heroMediaImg"),T=l("#heroMediaBar"),p=[l("#heroMediaShuffle"),l("#heroMediaFab"),l("#heroMediaPin"),l("#heroMediaPick")].filter(Boolean);if(!(!g||!w||y)){y=!0,p.forEach(m=>{m.disabled=!0}),g.classList.add("is-loading"),g.setAttribute("aria-busy","true"),T?.classList.add("is-loading");try{let m=await r();if(!m){T&&(T.hidden=!0);return}let{photo:v}=m;for(let gt=0;gt<3;gt+=1)try{await new Promise((Ke,gn)=>{let vt=new Image;vt.onload=Ke,vt.onerror=gn,vt.src=v.url});break}catch(Ke){if(gt>=2||m.pinned||(m=await r(),!m))throw Ke;v=m.photo}if(!document.body.contains(g)||g!==l("#hero"))return;let _=g.classList.contains("is-media");w.src=v.url,w.alt="",_&&(w.classList.remove("is-swapping"),w.offsetWidth,w.classList.add("is-swapping"),setTimeout(()=>w.classList.remove("is-swapping"),520)),a+=1;let L=`NO.${String(a).padStart(3,"0")}`,A=v.width&&v.height?`${v.width} \xD7 ${v.height}`:"",Y=l("#heroMediaNo"),re=l("#heroMediaTitle"),le=l("#heroMediaMeta"),De=l("#heroMediaCount"),ts=l("#heroMediaKicker"),ht=l("#heroMediaCredit");Y&&(Y.textContent=L),re&&(re.textContent=v.title||"\u672A\u547D\u540D\u6863\u6848"),le&&(le.textContent=[v.author,A].filter(Boolean).join(" / ")||`ALBUM / \u76F8\u518C \xB7 ${m.count} \u5F20${m.orientation==="portrait"?"\u7AD6\u56FE":"\u6A2A\u56FE"}`),De&&(De.textContent=`${m.orientation==="portrait"?"PORTRAIT":"LANDSCAPE"} ${String(m.count).padStart(3,"0")}`),ts&&(ts.textContent=v.custom?"// LOCAL IMAGE":"// RANDOM ARCHIVE"),ht&&(ht.href="#/gallery",ht.setAttribute("aria-label",`\u5728\u76F8\u518C\u4E2D\u67E5\u770B${v.title?`\uFF1A${v.title}`:"\u968F\u673A\u7167\u7247"}`)),T&&(T.hidden=!1),g.classList.add("is-media"),x=v,R&&U&&(R=v,H(v)),O(),h()}catch{b.show("\u8FD9\u5F20\u6A2A\u5E45\u6CA1\u52A0\u8F7D\u51FA\u6765\uFF0C\u6362\u4E00\u5F20\u8BD5\u8BD5")}finally{y=!1,U=!1;let m=g.classList.contains("is-media");p.forEach(v=>{v.disabled=!m}),O(),g.classList.remove("is-loading"),g.setAttribute("aria-busy","false"),T?.classList.remove("is-loading"),M&&(M=!1,setTimeout(D,0))}}},q=()=>{let g=z.current,w=l("#homeStageImg"),T=l("#homeStagePh"),p=l("#homeStageMeta"),m=l("#homeStageBadge");if(g){if(m&&(m.textContent=g.source?String(g.source).toUpperCase():"ART"),p&&(p.textContent=`SOURCE \u2014 ${g.source||(g.pixiv?"pixiv":"history")} \xB7 ${g.author||g.title||""}`),!g.url){w?.classList.add("is-loading"),T&&(T.hidden=!1,T.innerHTML=`${N.ext}<p class="mono" style="font-size:var(--fs-2xs)">\u5728 Pixiv \u6253\u5F00</p>`);return}T&&(T.hidden=!0),w&&(w.classList.add("is-loading"),w.onload=()=>w.classList.remove("is-loading"),w.onerror=()=>w.classList.add("is-loading"),w.src=g.thumb||g.url)}};l("#heroPlay")?.addEventListener("click",()=>{if(!E.current){location.hash="#/music",b.show("\u64AD\u653E\u5217\u8868\u8FD8\u662F\u7A7A\u7684\uFF0C\u53BB\u97F3\u4E50\u53F0\u641C\u4E00\u9996\u5427");return}E.playing?E.pause():E.play()}),l("#homePixiv")?.addEventListener("click",()=>{let g=z.current?.keyword||bt.defaultKeyword;window.open(bt.searchUrl(g),"_blank","noopener")});let ie=()=>{let g=l("#hero");g&&g.classList.toggle("is-playing",!!E.current&&!!E.playing)};ie();let Ye=S.on("player:state",ie),Ce=S.on("player:track",ie),xe=()=>{U=!!R,D()};l("#heroMediaShuffle")?.addEventListener("click",xe),l("#heroMediaFab")?.addEventListener("click",xe),l("#heroMediaPin")?.addEventListener("click",()=>{R?(R=null,H(null),b.show("\u5DF2\u53D6\u6D88\u56FA\u5B9A\uFF0C\u6A2A\u5E45\u6062\u590D\u968F\u673A")):x&&(R=x,H(x),b.show("\u5DF2\u56FA\u5B9A\u8FD9\u5F20\u6A2A\u5E45\uFF0C\u4E0B\u6B21\u8FDB\u9996\u9875\u8FD8\u662F\u5B83")),O()});let Ie=async()=>{if(document.body.classList.contains("is-bgpicker-open"))return;let g=await bs({scope:"home",currentUrl:x?.url||"",currentPhoto:x});if(!g?.url)return;R=g,U=!1;let w=H(g);await D(),b.show(w?"\u5DF2\u6362\u6210\u8FD9\u5F20\u80CC\u666F\uFF0C\u5E76\u56FA\u5B9A":"\u5DF2\u6362\u6210\u8FD9\u5F20\u80CC\u666F\uFF1B\u56FE\u592A\u5927\uFF0C\u4E0B\u6B21\u6253\u5F00\u53EF\u80FD\u4E22\u5931")};l("#heroMediaPick")?.addEventListener("click",Ie),O();let fe=g=>{if(document.body.classList.contains("is-bgpicker-open")||g.metaKey||g.ctrlKey||g.altKey||g.repeat)return;let w=String(g.key).toLowerCase();w!=="r"&&w!=="g"||g.target?.closest?.('input, textarea, select, [contenteditable="true"]')||document.querySelector("#cmdk:not([hidden])")||(g.preventDefault(),w==="g"?Ie():xe())};window.addEventListener("keydown",fe);let se=0,he=()=>{if(!c||!x)return;let g=Xe(c);if(i(x,g)!==(g?"portrait":"landscape")){if(y){M=!0;return}D()}},ge=()=>{clearTimeout(se),se=setTimeout(he,240)},ve=typeof ResizeObserver=="function"?new ResizeObserver(ge):null;ve?.observe(c),window.addEventListener("resize",ge),window.addEventListener("orientationchange",ge),Vs=S.on("art:change",q);let Ne=[P.mountWidgets("hero-actions",e,{}),P.mountWidgets("after-hero",e,{}),P.mountWidgets("before-footer",e,{})];D();let Re=Xe(l("#hero"))?"portrait":null,ft=Re==="portrait"&&Le(z.current)!=="portrait";return z.history.length&&!ft?q():setTimeout(()=>z.random({silent:!0,orientation:Re}),320),W.reveal(e),W.magnetic(e),()=>{Vs?.(),t?.(),n?.(),Ye?.(),Ce?.(),clearTimeout(se),ve?.disconnect(),window.removeEventListener("resize",ge),window.removeEventListener("orientationchange",ge),window.removeEventListener("keydown",fe),window.removeEventListener("scroll",h),window.removeEventListener("resize",h),o?.classList.remove("is-over-media"),u?.classList.remove("is-over-media"),Ne.forEach(g=>g?.())}}};var Wt={};vn(Wt,{LEVELS:()=>ee,canChord:()=>Fe,chord:()=>Rt,clearGame:()=>Cn,createGame:()=>it,deserializeGame:()=>ct,elapsed:()=>We,elapsedMs:()=>lt,getLevel:()=>te,loadGame:()=>zt,loadStats:()=>$e,minesLeft:()=>Bt,neighbors:()=>ue,placeMines:()=>Ks,progress:()=>Ot,recordResult:()=>Ut,resetStats:()=>Gt,reveal:()=>rt,revealMines:()=>Dt,saveGame:()=>dt,saveStats:()=>Ht,serializeGame:()=>Ft,toggleFlag:()=>Nt,wrongFlags:()=>ze});var ee=[{id:"beginner",label:"\u521D\u7EA7",cn:"BEGINNER",cols:9,rows:9,mines:10},{id:"intermediate",label:"\u4E2D\u7EA7",cn:"INTERMEDIATE",cols:16,rows:16,mines:40},{id:"expert",label:"\u9AD8\u7EA7",cn:"EXPERT",cols:24,rows:16,mines:75}],te=e=>ee.find(t=>t.id===e)||ee[0],G=(e,t,s)=>t*e.cols+s,ot=(e,t,s)=>t>=0&&s>=0&&t<e.rows&&s<e.cols;function ue(e,t,s){let n=[];for(let a=-1;a<=1;a++)for(let i=-1;i<=1;i++){if(!a&&!i)continue;let r=t+a,o=s+i;ot(e,r,o)&&n.push([r,o])}return n}function it(e="beginner"){let t=te(e);return{level:t.id,cols:t.cols,rows:t.rows,mines:t.mines,cells:Array.from({length:t.cols*t.rows},()=>({mine:!1,adj:0,open:!1,flag:!1,boom:!1})),placed:!1,over:!1,won:!1,opened:0,flags:0,startedAt:0,endedAt:0}}var Tn=e=>{for(let t=e.length-1;t>0;t--){let s=Math.floor(Math.random()*(t+1));[e[t],e[s]]=[e[s],e[t]]}return e};function Ks(e,t,s){let n=new Set([G(e,t,s),...ue(e,t,s).map(([i,r])=>G(e,i,r))]),a=[];for(let i=0;i<e.cells.length;i++)n.has(i)||a.push(i);if(a.length<e.mines){a.length=0;for(let i=0;i<e.cells.length;i++)i!==G(e,t,s)&&a.push(i)}Tn(a),a.slice(0,e.mines).forEach(i=>{e.cells[i].mine=!0});for(let i=0;i<e.rows;i++)for(let r=0;r<e.cols;r++){let o=e.cells[G(e,i,r)];o.mine||(o.adj=ue(e,i,r).filter(([u,c])=>e.cells[G(e,u,c)].mine).length)}return e.placed=!0,e}var An=e=>e.won||e.over?!1:e.opened===e.cols*e.rows-e.mines?(e.won=!0,e.over=!0,e.endedAt=Date.now(),e.cells.forEach(t=>{t.mine&&(t.flag=!0)}),e.flags=e.mines,!0):!1;function rt(e,t,s){if(e.over)return{ok:!1,reason:"over"};if(!ot(e,t,s))return{ok:!1,reason:"bounds"};let n=e.cells[G(e,t,s)];if(n.flag)return{ok:!1,reason:"flagged"};if(n.open)return{ok:!1,reason:"open"};if(e.placed||(Ks(e,t,s),e.startedAt=Date.now()),e.startedAt||(e.startedAt=Date.now()),n.mine)return n.open=!0,n.boom=!0,e.over=!0,e.endedAt=Date.now(),{ok:!0,boom:!0,opened:[G(e,t,s)]};let a=[],i=[[t,s]];for(;i.length;){let[o,u]=i.pop(),c=e.cells[G(e,o,u)];c.open||c.flag||c.mine||(c.open=!0,e.opened++,a.push(G(e,o,u)),c.adj===0&&ue(e,o,u).forEach(([d,h])=>{let y=e.cells[G(e,d,h)];!y.open&&!y.flag&&!y.mine&&i.push([d,h])}))}let r=An(e);return{ok:!0,opened:a,won:r}}function Nt(e,t,s){if(e.over||!ot(e,t,s))return{ok:!1};let n=e.cells[G(e,t,s)];return n.open?{ok:!1,reason:"open"}:(n.flag=!n.flag,e.flags+=n.flag?1:-1,{ok:!0,flag:n.flag})}function Fe(e,t,s){if(e.over||!ot(e,t,s))return!1;let n=e.cells[G(e,t,s)];if(!n.open||n.adj<=0)return!1;let a=ue(e,t,s);return a.filter(([r,o])=>e.cells[G(e,r,o)].flag).length!==n.adj?!1:a.some(([r,o])=>{let u=e.cells[G(e,r,o)];return!u.open&&!u.flag})}function Rt(e,t,s){if(!Fe(e,t,s))return{ok:!1,reason:"not-chordable"};let n=[],a=!1;for(let[i,r]of ue(e,t,s)){let o=e.cells[G(e,i,r)];if(o.open||o.flag)continue;let u=rt(e,i,r);if(u.opened&&n.push(...u.opened),u.boom){a=!0;break}}return{ok:!0,opened:n,boom:a,won:e.won}}function Dt(e,t=-1){let s=[];return e.cells.forEach((n,a)=>{n.mine&&!n.flag&&(n.open=!0,s.push(a))}),{mines:s,boomIndex:t,wrongFlags:ze(e)}}function ze(e){let t=[];return e.cells.forEach((s,n)=>{s.flag&&!s.mine&&t.push(n)}),t}var Bt=e=>e.mines-e.flags;function lt(e,t=Date.now()){return e.startedAt?Math.max(0,(e.endedAt||t)-e.startedAt):0}function We(e,t=Date.now()){return Math.floor(lt(e,t)/1e3)}function Ot(e){let t=e.cols*e.rows-e.mines;return t<=0?0:Math.min(1,e.opened/t)}var Js="ft.terminal.mines",jt="ft.terminal.mines.game";function $e(){try{let e=localStorage.getItem(Js),t=e?JSON.parse(e):{};return t&&typeof t=="object"?t:{}}catch{return{}}}function Ht(e){try{localStorage.setItem(Js,JSON.stringify(e))}catch{}}function Ut(e,t,s){let n=$e(),a=n[e]||{played:0,won:0,best:0};return a.played+=1,t&&(a.won+=1,(!a.best||s<a.best)&&(a.best=s)),n[e]=a,Ht(n),n}function Gt(){return Ht({}),{}}function Ft(e,t={}){return{v:1,level:e.level,cols:e.cols,rows:e.rows,mines:e.mines,placed:e.placed,over:e.over,won:e.won,opened:e.opened,flags:e.flags,startedAt:e.startedAt,endedAt:e.endedAt,cells:e.cells.map(s=>[s.mine?1:0,s.adj,s.open?1:0,s.flag?1:0,s.boom?1:0]),cursor:0,flagMode:!1,elapsedBefore:0,...t}}var Pn=()=>({mine:!1,adj:0,open:!1,flag:!1,boom:!1});function ct(e){if(!e||typeof e!="object")return null;let t=ee.find(d=>d.id===e.level);if(!t||e.cols!==t.cols||e.rows!==t.rows||e.mines!==t.mines||!Array.isArray(e.cells)||e.cells.length!==t.cols*t.rows)return null;let s=e.cells.map(d=>Array.isArray(d)&&d.length>=5?{mine:!!d[0],adj:Number(d[1])||0,open:!!d[2],flag:!!d[3],boom:!!d[4]}:Pn());if(s.filter(d=>d.mine).length!==(e.placed?t.mines:0))return null;let a=Number(e.opened)||0;if(a>t.cols*t.rows-t.mines)return null;let i=!!e.over,r=Number(e.endedAt)||0,o=Number(e.startedAt)||0,u=Math.max(0,Number(e.elapsedBefore)||0),c=!i&&o?Date.now()-Math.round(u*1e3):o;return{game:{level:t.id,cols:t.cols,rows:t.rows,mines:t.mines,cells:s,placed:!!e.placed,over:i,won:!!e.won,opened:a,flags:Number(e.flags)||0,startedAt:c,endedAt:i?r||o:0},cursor:Math.max(0,Math.min(s.length-1,Number(e.cursor)||0)),flagMode:!!e.flagMode}}function dt(e){try{localStorage.setItem(jt,JSON.stringify(e))}catch{}}function zt(){try{let e=localStorage.getItem(jt);return e?ct(JSON.parse(e)):null}catch{return null}}function Cn(){try{localStorage.removeItem(jt)}catch{}}var k={id:null,code:null,room:null,version:0,error:"",busy:!1,onUpdate:null,_timer:null,get active(){return!!this.id&&!!this.room},get loggedIn(){return!!$.loggedIn},_set(e){e&&(this.room=e,this.version=Number(e.version)||0,this._lastChange=Date.now(),this.id=e.id,this.code=e.code,this.error="",typeof this.onUpdate=="function"&&this.onUpdate(this.room))},_fail(e){let t=e&&(e.error||e.message)||"\u8BF7\u6C42\u5931\u8D25";return this.error=t,typeof this.onUpdate=="function"&&this.onUpdate(this.room),{ok:!1,error:t,status:e&&e.status}},async create(e="beginner"){if(this.busy)return{ok:!1,error:"\u6B63\u5728\u5904\u7406\u4E0A\u4E00\u4E2A\u8BF7\u6C42"};this.busy=!0;try{let t=await $.api("/mine/rooms",{method:"POST",body:{level:e}});return!t||!t.ok?this._fail(t):(this._set(t.data?.room||t.room),this.startPolling(),{ok:!0})}finally{this.busy=!1}},async joinByCode(e){let t=String(e||"").trim().toUpperCase();if(!/^[A-Z0-9]{4,8}$/.test(t))return{ok:!1,error:"\u623F\u95F4\u53F7\u662F 6 \u4F4D\u5B57\u6BCD\u6570\u5B57"};this.busy=!0;try{let s=await $.api("/mine/rooms/join",{method:"POST",body:{code:t}});return!s||!s.ok?this._fail(s):(this._set(s.data?.room||s.room),this.startPolling(),{ok:!0})}finally{this.busy=!1}},async joinById(e){this.busy=!0;try{let t=await $.api(`/mine/rooms/${encodeURIComponent(e)}`,{method:"POST"});return!t||!t.ok?this._fail(t):(this._set(t.data?.room||t.room),this.startPolling(),{ok:!0})}finally{this.busy=!1}},async move(e,t,s){if(!this.active)return{ok:!1,error:"\u8FD8\u6CA1\u8FDB\u623F\u95F4"};if(this.room.finished)return{ok:!1,error:"\u8FD9\u4E00\u5C40\u5DF2\u7ECF\u7ED3\u675F\u4E86"};let n=await $.api(`/mine/rooms/${encodeURIComponent(this.id)}/move`,{method:"POST",body:{action:e,r:t,c:s}});return!n||!n.ok?this._fail(n):(this._set(n.data?.room||n.room),{ok:!0})},async restart(){if(!this.active)return{ok:!1,error:"\u8FD8\u6CA1\u8FDB\u623F\u95F4"};let e=await $.api(`/mine/rooms/${encodeURIComponent(this.id)}/restart`,{method:"POST"});return!e||!e.ok?this._fail(e):(this._set(e.data?.room||e.room),{ok:!0})},async leave(){return this.active&&await $.api(`/mine/rooms/${encodeURIComponent(this.id)}`,{method:"DELETE"}).catch(()=>null),this.stopPolling(),this.id=null,this.code=null,this.room=null,this.version=0,this.error="",typeof this.onUpdate=="function"&&this.onUpdate(null),{ok:!0}},async pull(){if(!this.id)return;let e=await $.api(`/mine/rooms/${encodeURIComponent(this.id)}`,{cache:"no-store"}).catch(()=>null);if(!e||!e.ok){e&&(e.status===404||e.status===403)&&(this.error=e.error||"\u623F\u95F4\u4E0D\u53EF\u7528\uFF08\u53EF\u80FD\u88AB\u89E3\u6563\u4E86\uFF09",this.stopPolling(),this.id=null,this.room=null,typeof this.onUpdate=="function"&&this.onUpdate(null));return}let t=e.data?.room||e.room;t&&Number(t.version)!==this.version?this._set(t):t&&(this.room=t)},startPolling(){this.stopPolling(),this._closed=!1,this._lastChange=Date.now(),this._schedule()},_schedule(){if(this._closed)return;let e=Date.now()-(this._lastChange||0),t=e<3e3?150:e<15e3?500:1500;this._timer=setTimeout(async()=>{await this.pull().catch(()=>null),this._schedule()},t)},stopPolling(){this._closed=!0,this._timer&&(clearTimeout(this._timer),this._timer=null)}};var Vt="\u5173\u7FBD\u4E4B\u6B4C",In=60*1e3,Xs=0,qt=null;async function pt({force:e=!1}={}){let t=Date.now();if(!e&&t-Xs<In)return{ok:!1,reason:"\u521A\u64AD\u8FC7\uFF08\u4E00\u5206\u949F\u5185\u53EA\u64AD\u4E00\u6B21\uFF09"};if(!us())return{ok:!1,reason:"\u7F51\u6613\u4E91\u901A\u9053\u5F53\u524D\u4E0D\u53EF\u7528"};try{let s=null;if(qt&&(s=(await hs([qt]).catch(()=>null)||[])[0]||null),!s){let i=await ms(Vt,{limit:10}),r=i&&i.songs||[];s=r.find(o=>!fs(o))||r[0]||null,s&&(qt=String(s.id))}if(!s)return{ok:!1,reason:`\u6CA1\u641C\u5230\u300C${Vt}\u300D`};let n=gs(s),a=[...E.tracks,n];return E.setTracks(a,{keepIndex:!0}),E.load(a.length-1,{play:!0}),Xs=Date.now(),{ok:!0,title:n.title||s.name||Vt}}catch(s){return{ok:!1,reason:String(s?.message||s)}}}var Zs=e=>String(e||"")==="expert";var Nn=25*1e3,Rn=500,oe={level:"beginner",mode:"dig"},K=null,me=-1,Dn=e=>{let t=0,s=String(e);for(let n=0;n<s.length;n++)t=(t*31+s.charCodeAt(n))%360;return t},Bn=e=>`${location.origin}${location.pathname}#/mine?room=${encodeURIComponent(e)}`,Qs=e=>e&&e.lastAt&&Date.now()-Date.parse(e.lastAt)<Nn,Kt=e=>!!e&&(!!e.over||!!e.won),sn=e=>e.flag&&!e.open?"\u2691":e.open?e.mine?"\u2738":e.adj?String(e.adj):"":"";function On(e){let t=e.game,s=te(e.level),n=Math.round((e.elapsedMs||0)/1e3),a=t.won?"CLEAR":t.over?"BOOM":t.startedAt?"RUN":"READY";return`
    <div class="ms-hud" style="margin-top:var(--sp-5)">
      <div class="ms-hud__group ms-hud__levels">
        <span class="ms-lv" aria-selected="true" title="\u96BE\u5EA6\u7531\u623F\u4E3B\u5EFA\u623F\u65F6\u9009\u5B9A">
          <span class="mono">${f(s.label)}</span><span class="ms-lv__cn">${s.cols}\xD7${s.rows} \xB7 ${s.mines}</span>
        </span>
      </div>
      <div class="ms-hud__group ms-hud__meters">
        <span class="ms-meter" title="\u5269\u4F59\u96F7\u6570"><em class="mono">MINES</em><b id="mrMines">${e.minesLeft}</b></span>
        <span class="ms-meter" title="\u7528\u65F6"><em class="mono">TIME</em><b id="mrTime">${n}s</b></span>
        <span class="ms-progress" title="\u5DF2\u6316\u5F00\u6BD4\u4F8B"><i id="mrProg" style="width:${Math.round((e.progress||0)*100)}%"></i></span>
        <span class="ms-state" id="mrState"><span class="status-dot"></span><b class="mono">${a}</b></span>
      </div>
      <div class="ms-hud__group ms-hud__modes">
        <button class="ms-mode" id="mrMode" aria-pressed="${oe.mode==="flag"}" title="\u5207\u6362\u5DE6\u952E\u884C\u4E3A\uFF08\u89E6\u5C4F\u4E5F\u80FD\u53EA\u63D2\u65D7\uFF09">
          <span class="ms-mode__ico">${oe.mode==="flag"?"\u2691":"\u26CF"}</span><span class="ms-mode__txt">${oe.mode==="flag"?"\u63D2\u65D7":"\u6316\u5F00"}</span>
        </button>
      </div>
    </div>`}function nn(e){let t=e.game,s=t.cols>16?26:30,n=t.cells.map((a,i)=>{let r=["ms-cell",a.open?"is-open":"",a.flag&&!a.open?"is-flag":"",a.mine&&a.open?"is-mine":"",a.boom?"is-boom":""].filter(Boolean).join(" "),o=a.open&&a.adj&&!a.mine?` data-n="${a.adj}"`:"";return`<button class="${r}" data-i="${i}" data-r="${Math.floor(i/t.cols)}" data-c="${i%t.cols}" role="gridcell" tabindex="-1"${o}
      aria-label="\u7B2C ${Math.floor(i/t.cols)+1} \u884C\u7B2C ${i%t.cols+1} \u5217">${f(sn(a))}</button>`}).join("");return`
    <div class="ms-stage" id="mrStage">
      <div class="ms-scroll" id="mrScroll">
        <div class="ms-board" id="mrBoard" tabindex="0" role="grid" aria-label="\u5171\u4EAB\u68CB\u76D8"
             style="--ms-cell:${s}px;grid-template-columns:repeat(${t.cols},var(--ms-cell))">${n}</div>
      </div>
    </div>`}function an(e){return`<ul class="mr-members mono">${e.members.map(t=>`
    <li class="${Qs(t)?"is-on":""}">
      <span class="mr-dot" aria-hidden="true"></span>
      <span style="display:inline-block;width:10px;height:10px;background:hsl(${Dn(t.sub)} 72% 52%);border:1px solid var(--ink-100)" title="\u8FD9\u4E2A\u989C\u8272\u4EE3\u8868 ${f(t.name)}" aria-hidden="true"></span>
      <b>${f(t.name)}</b>
      ${t.host?'<i class="mr-tag">\u623F\u4E3B</i>':""}
      <span class="mr-state">${Qs(t)?"\u5728\u7EBF":"\u79BB\u7EBF"}</span>
    </li>`).join("")}</ul>`}function jn(e){let s=!!e.game.won,n=e.members.map(i=>{let r=(e.stats||{})[i.sub]||{steps:0,opened:0,flags:0};return{name:i.name,sub:i.sub,steps:r.steps||0,opened:r.opened||0,flags:r.flags||0}}).sort((i,r)=>r.steps-i.steps||r.opened-i.opened),a=n.length&&n[0].steps>0?n[0].sub:null;return`<div class="ms-banner ${s?"is-win":""}" style="margin-top:var(--sp-4)">
    <div class="ms-banner__main">
      <b class="mono">${s?"ALL CLEAR":"BOOM"}</b>
      <span>${s?"\u5168\u90E8\u626B\u6E05\uFF0C\u5408\u4F5C\u901A\u5173\uFF01":"\u8E29\u5230\u96F7\u4E86 \u2014\u2014 \u96F7\u5DF2\u7ECF\u5168\u7FFB\u51FA\u6765\u4E86\uFF0C\u8BA9\u623F\u4E3B\u5F00\u65B0\u5C40"}</span>
    </div>
    <div class="mr-stats mono" style="display:grid;grid-template-columns:1fr 44px 44px 44px;gap:4px;align-items:center;margin-top:var(--sp-3);font-size:var(--fs-2xs);text-align:right">
      <span style="text-align:left;color:var(--fg-faint)">\u672C\u5C40\u7EDF\u8BA1</span><span style="color:var(--fg-faint)">\u6B65\u6570</span><span style="color:var(--fg-faint)">\u63ED\u5F00</span><span style="color:var(--fg-faint)">\u63D2\u65D7</span>
      ${n.map(i=>`
        <span style="text-align:left;${i.sub===a?"font-weight:700":""}">${f(i.name)}${i.sub===a?'<i style="font-style:normal;background:var(--signal);color:var(--signal-ink);padding:0 4px;margin-left:4px">MVP</i>':""}</span>
        <b style="${i.sub===a?"color:var(--signal-deep)":""}">${i.steps}</b>
        <b>${i.opened}</b>
        <b>${i.flags}</b>`).join("")}
    </div>
  </div>`}function en(){let e=location.protocol==="fish:"?`<div class="mr-card"><b class="mono">\u624B\u673A / \u53E6\u4E00\u53F0\u7535\u8111\u52A0\u5165</b>
        <p class="mr-note">\u5728\u7535\u8111\u83DC\u5355\u300C\u6587\u4EF6 \u2192 \u5C40\u57DF\u7F51\u8054\u673A\uFF08\u624B\u673A\u52A0\u5165\uFF09\u300D\u91CC\u590D\u5236\u5730\u5740\uFF0C\u53D1\u5230\u540C\u4E00 Wi-Fi \u4E0B\u7684\u624B\u673A\u6D4F\u89C8\u5668\uFF1B
        \u5BF9\u65B9\u5728\u7F51\u9875\u91CC\u6CE8\u518C/\u767B\u5F55\u4E00\u4E2A<b>\u4E0D\u540C\u7684\u672C\u7AD9\u8D26\u53F7</b>\uFF0C\u518D\u8F93\u5165\u623F\u95F4\u53F7\u5373\u53EF\u3002</p></div>`:"";if(!$.enabled)return`<div class="mr-card"><b class="mono">\u672C\u7AD9\u8FD8\u6CA1\u542F\u7528\u8D26\u53F7\u529F\u80FD</b>
      <p class="mr-note">\u8054\u673A\u626B\u96F7\u9700\u8981\u6CE8\u518C\u8D26\u53F7\u3002\u5F53\u524D\u90E8\u7F72\u6CA1\u914D Auth0\uFF0C\u6240\u4EE5\u8054\u673A\u4E0D\u53EF\u7528\uFF0C\u5355\u4EBA\u626B\u96F7\u7167\u5E38\u3002</p></div>`;if(!$.loggedIn)return`<div class="mr-card"><b class="mono">\u8054\u673A\u626B\u96F7\u53EA\u5BF9\u6CE8\u518C\u7528\u6237\u5F00\u653E</b>
      <p class="mr-note">\u767B\u5F55\u540E\u5C31\u80FD\u521B\u5EFA\u623F\u95F4\u3001\u628A\u9080\u8BF7\u94FE\u63A5\u53D1\u7ED9\u670B\u53CB\uFF0C\u4E00\u8D77\u6316\u540C\u4E00\u5757\u68CB\u76D8\u3002</p>
      <button class="btn btn--signal" id="mrLogin">\u767B\u5F55 / \u6CE8\u518C</button></div>`;if(!k.active)return`
      ${e}
      <div class="mr-card">
        <b class="mono">\u521B\u5EFA\u623F\u95F4</b>
        <p class="mr-note">\u540C\u4E00\u5757\u68CB\u76D8\uFF0C\u8C01\u63ED\u5F00\u7684\u90FD\u540C\u6B65\u7ED9\u5168\u623F\u95F4\uFF08\u5408\u4F5C\u6A21\u5F0F\uFF09\u3002</p>
        <div class="ms-hud" style="margin-top:var(--sp-3)">
          <div class="ms-hud__group ms-hud__levels" role="tablist" aria-label="\u96BE\u5EA6">
            ${ee.map(n=>`<button class="ms-lv" data-level="${n.id}" role="tab" aria-selected="${n.id===oe.level}"
              title="${f(n.cn||n.label)} \xB7 ${n.cols}\xD7${n.rows} \xB7 ${n.mines} \u96F7">
              <span class="mono">${f(n.label)}</span><span class="ms-lv__cn">${n.cols}\xD7${n.rows} \xB7 ${n.mines}</span></button>`).join("")}
          </div>
        </div>
        <button class="btn btn--signal" id="mrCreate" style="margin-top:var(--sp-3)">\u521B\u5EFA\u623F\u95F4</button>
      </div>
      <div class="mr-card">
        <b class="mono">\u7528\u623F\u95F4\u53F7\u52A0\u5165</b>
        <p class="mr-note">\u627E\u623F\u4E3B\u8981\u90A3 6 \u4F4D\u623F\u95F4\u53F7\uFF0C\u6216\u8005\u76F4\u63A5\u6253\u5F00\u4ED6\u7ED9\u7684\u9080\u8BF7\u94FE\u63A5\u3002</p>
        <div class="mr-row">
          <input class="mr-input mono" id="mrCode" maxlength="8" placeholder="ABC123" autocomplete="off" spellcheck="false" />
          <button class="btn" id="mrJoin">\u52A0\u5165</button>
        </div>
      </div>
      ${k.error?`<div class="mr-err mono">${f(k.error)}</div>`:""}`;let t=k.room,s=t.finished||Kt(t.game);return`
    <div class="mr-card">
      <div class="mr-head">
        <b class="mono">\u623F\u95F4 <span class="mr-code">${f(t.code)}</span></b>
        <span class="mr-meta mono">${f(te(t.level).label)} \xB7 \u7248\u672C ${t.version}</span>
      </div>
      <div class="mr-row">
        <input class="mr-input mono" id="mrLink" readonly value="${f(Bn(t.id))}" aria-label="\u9080\u8BF7\u94FE\u63A5" />
        <button class="btn btn--sm" id="mrCopy">\u590D\u5236</button>
      </div>
      <p class="mr-note">\u628A\u94FE\u63A5\u53D1\u7ED9\u5DF2\u6CE8\u518C\u7684\u7AD9\u53CB\uFF0C\u4ED6\u4EEC\u6253\u5F00\u5C31\u81EA\u52A8\u8FDB\u8FD9\u95F4\u623F\uFF08\u6CA1\u767B\u5F55\u4F1A\u5148\u5F15\u5BFC\u767B\u5F55\uFF09\u3002</p>
      ${e}
    </div>

    <div class="mr-card">
      <b class="mono">\u961F\u53CB\uFF08${t.members.length}\uFF09</b>
      <div id="mrMembers">${an(t)}</div>
    </div>

    <section class="ms">
      ${On(t)}
      ${nn(t)}
      ${s?jn(t):""}
      <div class="mr-row" style="margin-top:var(--sp-4)">
        ${t.isHost?`<button class="btn btn--sm ${s?"btn--signal":""}" id="mrRestart">\u5F00\u65B0\u5C40\uFF08\u623F\u4E3B\uFF09</button>`:""}
        <button class="btn btn--sm" id="mrLeave">${t.isHost?"\u89E3\u6563\u623F\u95F4":"\u9000\u51FA\u623F\u95F4"}</button>
      </div>
      <p class="mr-note">\u5DE6\u952E\u63ED\u683C\u3001\u53F3\u952E\u63D2\u65D7\u3001\u70B9\u5DF2\u63ED\u5F00\u7684\u6570\u5B57\u548C\u5F26\uFF08\u4E0E\u5355\u4EBA\u5C40\u624B\u52BF\u4E00\u81F4\uFF09\uFF1B\u89E6\u5C4F\u957F\u6309\u63D2\u65D7\uFF0C\u6216\u7528\u53F3\u4E0A\u89D2\u7684\u201C\u6316\u5F00/\u63D2\u65D7\u201D\u5207\u6362\u3002</p>
    </section>
    ${k.error?`<div class="mr-err mono">${f(k.error)}</div>`:""}`}var Jt=e=>document.querySelector(`#mrBoard .ms-cell[data-i="${e}"]`);function Ve(e,t,s=0){let n=Jt(t);n&&(s&&n.style.setProperty("--ms-d",`${s}ms`),n.classList.add(e),e!=="is-flag"&&e!=="is-nope"&&setTimeout(()=>n.classList.remove(e),700))}function Hn(e,t){let s=Jt(e);if(!s)return;let n={isOpen:!!t.open,isFlag:!!t.flag&&!t.open,isMine:!!t.mine&&!!t.open,isBoom:!!t.boom};s.classList.contains("is-open")!==n.isOpen&&s.classList.toggle("is-open",n.isOpen),s.classList.contains("is-flag")!==n.isFlag&&s.classList.toggle("is-flag",n.isFlag),s.classList.contains("is-mine")!==n.isMine&&s.classList.toggle("is-mine",n.isMine),s.classList.contains("is-boom")!==n.isBoom&&s.classList.toggle("is-boom",n.isBoom);let a=t.open&&t.adj&&!t.mine?String(t.adj):"";(s.getAttribute("data-n")||"")!==a&&(a?s.setAttribute("data-n",a):s.removeAttribute("data-n"));let i=sn(t);s.textContent!==i&&(s.textContent=i)}function tn(e){let t=e.game;if(!document.getElementById("mrBoard"))return;if(!K||K.cols!==t.cols||K.count!==t.cells.length){let c=document.getElementById("mrStage");c&&(c.outerHTML=nn(e)),K={cols:t.cols,count:t.cells.length,over:t.over,won:t.won,cells:t.cells.map(d=>({...d}))};return}let s=[],n=[];t.cells.forEach((c,d)=>{let h=K.cells[d]||{};(c.open!==h.open||c.flag!==h.flag||c.boom!==h.boom||c.adj!==h.adj||c.mine!==h.mine)&&(c.open&&!h.open&&s.push(d),!!c.flag!=!!h.flag&&!c.open&&n.push(d),Hn(d,c))}),s.forEach((c,d)=>Ve("is-pop",c,Math.min(d,40)*12)),n.forEach(c=>Ve("is-flagged",c));let a=document.getElementById("mrStage");t.over&&!t.won&&!(K.over&&!K.won)&&(t.cells.forEach((c,d)=>{c.flag&&!c.mine&&Ve("is-wrong",d)}),t.cells.forEach((c,d)=>{c.mine&&c.open&&Ve("is-cascade",d)}),a&&(a.classList.add("is-shake"),setTimeout(()=>a.classList.remove("is-shake"),420))),t.won&&!K.won&&(te(e.level).id==="expert"&&pt().then(c=>{c.ok?b.ok(`\u901A\u5173\uFF01\u6B63\u5728\u64AD\u653E\u300A${c.title}\u300B`):b.show(`\u901A\u5173\uFF01\u4F46\u6CA1\u80FD\u81EA\u52A8\u64AD\u653E\uFF1A${c.reason||"\u672A\u77E5\u539F\u56E0"}`,"",{ttl:5e3})}),t.cells.forEach((c,d)=>{c.open&&Ve("is-win",d,Math.min(d,60)*8)}));let i=document.getElementById("mrMines");if(i){let c=String(e.minesLeft);i.textContent!==c&&(i.textContent=c)}let r=document.getElementById("mrTime");if(r){let c=`${Math.round((e.elapsedMs||0)/1e3)}s`;r.textContent!==c&&(r.textContent=c)}let o=document.getElementById("mrProg");o&&(o.style.width=`${Math.round((e.progress||0)*100)}%`);let u=document.getElementById("mrState");if(u){let c=t.won?"CLEAR":t.over?"BOOM":t.startedAt?"RUN":"READY",d=u.querySelector("b");d&&d.textContent!==c&&(d.textContent=c)}K={cols:t.cols,count:t.cells.length,over:t.over,won:t.won,cells:t.cells.map(c=>({...c}))}}function Yt(e,t){let s=k.room;if(!s)return;let n=s.game,a=n.cells[e];if(!a)return;let i=Math.floor(e/n.cols),r=e%n.cols,o=[];for(let d=-1;d<=1;d++)for(let h=-1;h<=1;h++){if(!d&&!h)continue;let y=i+d,M=r+h;y>=0&&M>=0&&y<n.rows&&M<n.cols&&o.push(y*n.cols+M)}let u=o.filter(d=>n.cells[d].flag&&!n.cells[d].open).length,c=!!a.open&&a.adj>0&&u===a.adj;o.forEach(d=>{let h=Jt(d);!h||n.cells[d].open||(h.classList.toggle("is-pre",t&&c),t&&a.open&&a.adj>0&&!c?(h.classList.add("is-nope"),setTimeout(()=>h.classList.remove("is-nope"),300)):t||h.classList.remove("is-nope"))})}var Xt={id:"mine-room",title:"\u8054\u673A\u626B\u96F7",render(){return K=null,me=-1,`${Ee({title:"MINESWEEPER \xB7 \u8054\u673A",sub:"\u4E00\u5757\u5171\u4EAB\u68CB\u76D8\uFF0C\u8C01\u63ED\u5F00\u7684\u90FD\u540C\u6B65\u7ED9\u5168\u623F\u95F4\uFF1B\u68CB\u76D8\u4E0E\u53CD\u9988\u548C\u5355\u4EBA\u5C40\u4E00\u81F4\u3002\u53EA\u5BF9\u6CE8\u518C\u7528\u6237\u5F00\u653E\uFF0C\u5EFA\u623F\u540E\u628A\u9080\u8BF7\u94FE\u63A5\u53D1\u7ED9\u670B\u53CB\u5373\u53EF\u3002",idx:"MINES / ONLINE"})}
    <div class="mr-tabs" role="tablist" aria-label="\u626B\u96F7\u6A21\u5F0F">
      <a class="mr-tab" href="#/mine" role="tab">\u5355\u4EBA</a>
      <a class="mr-tab is-on" href="#/mine?room=1" role="tab" aria-selected="true">\u8054\u673A</a>
    </div>
    <div id="mrRoot">${en()}</div>`},mount(e){let t=()=>{if(!k.active){K=null;return}let r=k.room.game;K={cols:r.cols,count:r.cells.length,over:r.over,won:r.won,cells:r.cells.map(o=>({...o}))}},s=(r=!1)=>{let o=e.querySelector("#mrRoot");o&&(o.innerHTML=en(),t(),r&&k.active&&tn(k.room))};k.onUpdate=r=>{if(!r){s();return}if(!document.getElementById("mrBoard")){s(!0);return}tn(r);let o=document.getElementById("mrMembers");o&&(o.innerHTML=an(r));let u=o?.closest(".mr-card")?.querySelector("b.mono");u&&(u.textContent=`\u961F\u53CB\uFF08${r.members.length}\uFF09`),(r.finished||Kt(r.game))&&!document.querySelector(".ms-banner")&&s(!0)};let n=/[?&]room=([A-Za-z0-9_-]{4,40})/.exec(String(location.hash||"")),a=n&&n[1]!=="1"?n[1]:null;a&&$.loggedIn&&(!k.active||k.id!==a)?k.joinById(a).then(r=>{r.ok||b.show(r.error||"\u52A0\u5165\u623F\u95F4\u5931\u8D25","err"),s(!0)}):k.active&&(k.startPolling(),s(!0)),e.addEventListener("click",async r=>{let o=r.target.closest("[data-level]");if(o&&!k.active){oe.level=o.dataset.level,s();return}if(r.target.closest("#mrLogin")){$.login();return}if(r.target.closest("#mrMode")){oe.mode=oe.mode==="flag"?"dig":"flag",s(!0);return}if(r.target.closest("#mrCreate")){let c=await k.create(oe.level);c.ok||b.show(c.error,"err"),s(!0);return}if(r.target.closest("#mrJoin")){let c=e.querySelector("#mrCode")?.value||"",d=await k.joinByCode(c);d.ok||b.show(d.error,"err"),s(!0);return}if(r.target.closest("#mrCopy")){let c=e.querySelector("#mrLink")?.value||"";try{await navigator.clipboard.writeText(c),b.ok("\u9080\u8BF7\u94FE\u63A5\u5DF2\u590D\u5236")}catch{e.querySelector("#mrLink")?.select(),b.show("\u81EA\u52A8\u590D\u5236\u88AB\u6D4F\u89C8\u5668\u62E6\u4E86\uFF1A\u94FE\u63A5\u5DF2\u9009\u4E2D\uFF0C\u6309 Ctrl+C","err")}return}if(r.target.closest("#mrRestart")){let c=await k.restart();c.ok||b.show(c.error,"err"),s(!0);return}if(r.target.closest("#mrLeave")){await k.leave(),b.ok("\u5DF2\u9000\u51FA\u623F\u95F4"),s();return}let u=r.target.closest(".ms-cell");if(u&&k.active&&!u.disabled){let c=Number(u.dataset.r),d=Number(u.dataset.c),h=k.room.game.cells[Number(u.dataset.i)],y=oe.mode==="flag"?"flag":h&&h.open&&h.adj?"chord":"reveal",M=await k.move(y,c,d);M.ok?Kt(k.room.game)&&s(!0):b.show(M.error,"err")}}),e.addEventListener("pointerover",r=>{let o=r.target.closest("#mrBoard .ms-cell");if(!o||!k.active)return;let u=Number(o.dataset.i);u!==me&&(me>=0&&Yt(me,!1),me=u,Yt(u,!0))}),e.addEventListener("pointerleave",()=>{me>=0&&Yt(me,!1),me=-1});let i=null;return e.addEventListener("contextmenu",r=>{let o=r.target.closest("#mrBoard .ms-cell");!o||!k.active||(r.preventDefault(),k.move("flag",Number(o.dataset.r),Number(o.dataset.c)).then(u=>{u.ok||b.show(u.error,"err")}))}),e.addEventListener("touchstart",r=>{let o=r.target.closest("#mrBoard .ms-cell");!o||!k.active||(i=setTimeout(()=>{k.move("flag",Number(o.dataset.r),Number(o.dataset.c)).then(u=>{u.ok||b.show(u.error,"err")})},Rn))},{passive:!0}),e.addEventListener("touchend",()=>{i&&(clearTimeout(i),i=null)}),()=>{k.stopPolling(),k.onUpdate=null,i&&clearTimeout(i)}}};var Un=34,Gn=22,Fn=500,ut=null,Zt=null,Qt=e=>String(Math.max(0,Math.min(999,Math.floor(e)))).padStart(3,"0"),zn=e=>e>0?String(e):"";function es(e,t){let s=e[t]||{played:0,won:0,best:0},n=s.played?Math.round(s.won/s.played*100):0;return`
    <span class="ms-stat"><em>\u5DF2\u73A9</em><b class="mono">${String(s.played).padStart(2,"0")}</b></span>
    <span class="ms-stat"><em>\u80DC\u5C40</em><b class="mono">${String(s.won).padStart(2,"0")}</b></span>
    <span class="ms-stat"><em>\u80DC\u7387</em><b class="mono">${n}%</b></span>
    <span class="ms-stat"><em>\u6700\u4F73</em><b class="mono">${s.best?`${s.best}s`:"--"}</b></span>`}var on={id:"mine",title:"\u626B\u96F7",render(){let e=$e(),t=ee[0];return/[?&]room=/.test(String(location.hash||""))?Xt.render():`
    <section class="ms">
      <div class="mr-tabs" role="tablist" aria-label="\u626B\u96F7\u6A21\u5F0F">
        <a class="mr-tab is-on" href="#/mine" role="tab" aria-selected="true">\u5355\u4EBA</a>
        <a class="mr-tab" href="#/mine?room=1" role="tab">\u8054\u673A</a>
        <a class="mr-tab" href="#/fishrun" role="tab">\u50CF\u7D20\u5C0F\u9C7C</a>
      </div>
      ${Ee({title:"MINESWEEPER",sub:"\u4E00\u5757\u5E72\u51C0\u7684\u5E03\u96F7\u573A\u3002\u5DE6\u952E\u6316\u5F00\u3001\u53F3\u952E\u63D2\u65D7\uFF0C\u6570\u5B57\u8868\u793A\u76F8\u90BB\u516B\u683C\u91CC\u7684\u96F7\u6570\uFF1B\u70B9\u5230\u5DF2\u6316\u5F00\u7684\u6570\u5B57\u53EF\u4EE5\u548C\u5F26\uFF0C\u4E00\u6B21\u5F00\u5B8C\u5468\u56F4\u3002\u7B2C\u4E00\u4E0B\u6C38\u8FDC\u5B89\u5168\uFF0C\u8BA1\u65F6\u4ECE\u7B2C\u4E00\u4E0B\u5F00\u59CB\u3002",idx:"MODULE / 06",meta:[{label:"GRID",value:`${t.cols} \xD7 ${t.rows}`,id:"msMetaGrid"},{label:"MINES",value:String(t.mines).padStart(2,"0"),id:"msMetaMines"},{label:"BEST",value:"--",id:"msMetaBest"}],actions:'<button class="btn btn--sm" id="msNew">\u27F3 \u65B0\u7684\u4E00\u5C40</button>'})}

      <div class="ms-hud" style="margin-top:var(--sp-5)">
        <div class="ms-hud__group ms-hud__levels" role="tablist" aria-label="\u96BE\u5EA6">
          ${ee.map(s=>`<button class="ms-lv" data-level="${s.id}" role="tab"
              aria-selected="${s.id===t.id}" title="${s.cn} \xB7 ${s.cols}\xD7${s.rows} \xB7 ${s.mines} \u96F7">
              <span class="mono">${f(s.label)}</span><span class="ms-lv__cn">${s.cols}\xD7${s.rows} \xB7 ${s.mines}</span>
            </button>`).join("")}
        </div>

        <div class="ms-hud__group ms-hud__meters">
          <span class="ms-meter" title="\u5269\u4F59\u96F7\u6570\uFF08\u65D7\u63D2\u591A\u4E86\u4F1A\u53D8\u8D1F\uFF09">
            <em class="k-label">MINES</em><b class="mono" id="msMines">${Qt(t.mines)}</b>
          </span>
          <span class="ms-meter" title="\u7528\u65F6\uFF08\u7B2C\u4E00\u4E0B\u8D77\u8868\uFF09">
            <em class="k-label">TIME</em><b class="mono" id="msTime">000</b>
          </span>
          <span class="ms-progress" title="\u5DF2\u6316\u5F00\u6BD4\u4F8B">
            <i id="msProgress" style="width:0%"></i>
          </span>
          <span class="ms-state" id="msState"><span class="status-dot"></span><b class="mono">READY</b></span>
        </div>

        <div class="ms-hud__group ms-hud__modes">
          <button class="ms-mode" id="msMode" aria-pressed="false" title="\u5207\u6362\u5DE6\u952E\u884C\u4E3A\uFF08\u89E6\u5C4F\u4E5F\u80FD\u53EA\u63D2\u65D7\uFF09">
            <span class="ms-mode__ico">\u26CF</span><span class="ms-mode__txt">\u6316\u5F00</span>
          </button>
        </div>
      </div>

      <div class="ms-stage" id="msStage">
        <span class="hud-corner hud-corner--tl"></span>
        <span class="hud-corner hud-corner--tr"></span>
        <span class="hud-corner hud-corner--bl"></span>
        <span class="hud-corner hud-corner--br"></span>
        <div class="ms-scroll" id="msScroll">
          <div class="ms-board" id="msBoard" tabindex="0" role="grid"
               aria-label="\u626B\u96F7\u68CB\u76D8\uFF1A\u65B9\u5411\u952E\u79FB\u52A8\uFF0C\u7A7A\u683C\u6316\u5F00\uFF0CF \u63D2\u65D7"></div>
        </div>
      </div>
      <div class="ms-banner" id="msBanner" hidden>
        <div class="ms-banner__main">
          <b class="mono" id="msBannerTitle">\u2014</b>
          <span class="mono faint" id="msBannerSub"></span>
        </div>
        <button class="btn btn--sm btn--signal" id="msAgain">\u518D\u6765\u4E00\u5C40</button>
      </div>

      <div class="grid grid--split" style="margin-top:var(--sp-5);align-items:start">
        <div class="panel" data-reveal>
          <div class="panel__head">
            <span class="panel__title">\u672C\u673A\u6218\u7EE9</span>
            <span class="mono faint" style="font-size:var(--fs-2xs)" id="msStatsFor">BEGINNER</span>
          </div>
          <div class="panel__body">
            <div class="ms-stats" id="msStats">${es(e,t.id)}</div>
            <div style="display:flex;gap:6px;margin-top:var(--sp-4);flex-wrap:wrap">
              <button class="btn btn--sm btn--danger" id="msReset">\u6E05\u7A7A\u6218\u7EE9</button>
              <span class="faint mono" style="font-size:var(--fs-2xs);align-self:center">\u53EA\u5B58\u5728\u8FD9\u53F0\u8BBE\u5907\u4E0A</span>
            </div>
          </div>
        </div>

        <div class="panel" data-reveal data-reveal-delay="60">
          <div class="panel__head">
            <span class="panel__title">\u64CD\u4F5C</span>
            <span class="mono faint" style="font-size:var(--fs-2xs)">CONTROLS</span>
          </div>
          <div class="panel__body">
            <div class="ms-keys">
              ${[["\u5DE6\u952E","\u6316\u5F00\uFF1B\u70B9\u5230\u6570\u5B57\uFF1D\u548C\u5F26"],["\u53F3\u952E / \u957F\u6309","\u63D2\u65D7\u3001\u53D6\u6D88"],["\u65B9\u5411\u952E + \u7A7A\u683C","\u952E\u76D8\u64CD\u4F5C\u6574\u76D8"],["F","\u5149\u6807\u5904\u63D2\u65D7"],["R","\u91CD\u5F00\u4E00\u5C40"],["\u26CF / \u2691","\u5207\u6362\u5DE6\u952E\u884C\u4E3A"]].map(([s,n])=>`<div class="ms-key"><kbd>${f(s)}</kbd><span>${f(n)}</span></div>`).join("")}
            </div>
            <p class="faint" style="font-size:var(--fs-2xs);margin:var(--sp-4) 0 0;line-height:1.7">
              \u548C\u5F26\u7684\u524D\u63D0\u662F\u300C\u6570\u5B57\u5468\u56F4\u7684\u65D7\u6570 = \u6570\u5B57\u300D\uFF1B\u65D7\u63D2\u9519\u4E86\uFF0C\u548C\u5F26\u4F1A\u76F4\u63A5\u8E29\u96F7 \u2014\u2014 \u548C\u7ECF\u5178\u89C4\u5219\u4E00\u81F4\u3002
              \u7B2C\u4E00\u6B21\u70B9\u51FB\u7684\u683C\u5B50\u53CA\u5176\u516B\u90BB\u57DF\u5FC5\u5B9A\u6CA1\u6709\u96F7\uFF0C\u6240\u4EE5\u5F00\u5C40\u7B2C\u4E00\u4E0B\u4E00\u5B9A\u80FD\u5C55\u5F00\u4E00\u7247\u3002
            </p>
          </div>
        </div>
      </div>
    </section>`},mount(e){if(/[?&]room=/.test(String(location.hash||"")))return Xt.mount(e);W.reveal(e),W.reveal(e);let t=p=>e.querySelector(p),s=t("#msBoard"),n=t("#msScroll"),a=t("#msStage"),i={mines:t("#msMines"),time:t("#msTime"),progress:t("#msProgress"),state:t("#msState"),stats:t("#msStats"),statsFor:t("#msStatsFor"),banner:t("#msBanner"),bannerTitle:t("#msBannerTitle"),bannerSub:t("#msBannerSub"),metaGrid:t("#msMetaGrid"),metaMines:t("#msMetaMines"),metaBest:t("#msMetaBest"),mode:t("#msMode")},r=ee[0].id,o=it(r),u=[],c=0,d=!1,h=0,y=0,M=!1,C=!1,B=()=>Ft(o,{cursor:c,flagMode:d,elapsedBefore:lt(o)/1e3}),H=()=>dt(B()),R=()=>{let p=a.parentElement||document.body,m=(parseFloat(getComputedStyle(a).paddingLeft)||0)*2+2,v=Math.max(180,p.clientWidth-m),_=Math.max(Gn,Math.min(Un,Math.floor(v/o.cols)-2));s.style.setProperty("--ms-cell",`${_}px`),s.style.setProperty("--ms-cols",String(o.cols))},U=()=>{s.style.setProperty("--ms-cols",String(o.cols)),s.innerHTML=o.cells.map((p,m)=>{let v=Math.floor(m/o.cols),_=m%o.cols;return`<button class="ms-cell" data-i="${m}" role="gridcell" tabindex="-1"
                aria-label="\u7B2C ${v+1} \u884C\u7B2C ${_+1} \u5217"></button>`}).join(""),u=[...s.querySelectorAll(".ms-cell")],R()},x=()=>{let p=te(r),m=$e()[r]||{best:0};i.metaGrid&&(i.metaGrid.textContent=`${p.cols} \xD7 ${p.rows}`),i.metaMines&&(i.metaMines.textContent=String(p.mines).padStart(2,"0")),i.metaBest&&(i.metaBest.textContent=m.best?`${m.best}s`:"--"),i.statsFor&&(i.statsFor.textContent=p.cn),i.stats&&(i.stats.innerHTML=es($e(),r)),e.querySelectorAll(".ms-lv").forEach(v=>{v.setAttribute("aria-selected",String(v.dataset.level===r))})},O=()=>{if(i.mines&&(i.mines.textContent=Qt(Bt(o))),i.time&&(i.time.textContent=Qt(We(o))),i.progress&&(i.progress.style.width=`${(Ot(o)*100).toFixed(1)}%`),i.state){let p=i.state.querySelector(".status-dot"),m=i.state.querySelector("b"),v=o.over?o.won?"CLEARED":"DETONATED":o.placed?"SWEEPING":"READY";p.className=`status-dot${o.over?o.won?" status-dot--on":" status-dot--alert":o.placed?" status-dot--on":""}`,m.textContent=v}},D=(p,{delay:m=0,kind:v=""}={})=>{let _=o.cells[p],L=u[p];if(!L)return;L.classList.toggle("is-open",_.open),L.classList.toggle("is-flag",_.flag&&!_.open),L.classList.toggle("is-mine",_.mine&&_.open),L.classList.toggle("is-boom",!!_.boom),L.classList.toggle("is-wrong",L.classList.contains("is-wrong"));let A=_.open&&!_.mine?_.adj:0;L.dataset.n=String(A),L.textContent=_.open?_.mine?"\u2731":zn(_.adj):_.flag?"\u2691":"",v&&m!==void 0&&(L.style.setProperty("--ms-d",`${m}ms`),L.classList.add(v))},q=()=>{o.cells.forEach((p,m)=>D(m)),O(),ie()},ie=()=>{u.forEach((p,m)=>{p.classList.toggle("is-cursor",!o.over&&m===c),p.classList.remove("is-pre","is-nope")})},Ye=(p,m)=>{if(o.over)return;let v=Math.floor(p/o.cols),_=p%o.cols,L=o.cells[p],A=m&&Fe(o,v,_)?"is-pre":m&&L.open&&L.adj>0?"is-nope":null;ue(o,v,_).forEach(([Y,re])=>{let le=Y*o.cols+re,De=o.cells[le];De.open||De.flag||(u[le].classList.toggle("is-pre",A==="is-pre"),A==="is-nope"?(u[le].classList.remove("is-nope"),m&&u[le].classList.add("is-nope")):u[le].classList.remove("is-nope"))})},Ce=()=>{clearInterval(h),h=0},xe=()=>{h||(h=setInterval(()=>{O()},250))},Ie=(p,{animate:m=!0}={})=>{if(!i.banner)return;i.banner.hidden=!1,i.banner.classList.toggle("is-win",!!p);let v=We(o),_=$e()[r]||{best:0};i.bannerTitle.textContent=p?"AREA CLEARED":"DETONATED",i.bannerSub.textContent=p?`${te(r).label} \xB7 \u7528\u65F6 ${v} \u79D2${_.best===v?" \xB7 \u65B0\u7EAA\u5F55":""}`:`\u5DF2\u7ECF\u6316\u5F00 ${o.opened} \u683C \xB7 \u518D\u8BD5\u4E00\u6B21`,i.banner.style.animation=m?"":"none"},fe=p=>{Ce(),O();let m=We(o),v=Ut(r,p,m);i.stats&&(i.stats.innerHTML=es(v,r));let _=v[r]||{best:0};if(i.metaBest&&(i.metaBest.textContent=_.best?`${_.best}s`:"--"),p)Zs(r)&&pt().then(L=>{L.ok?b.ok(`\u901A\u5173\uFF01\u6B63\u5728\u64AD\u653E\u300A${L.title}\u300B`):b.show(`\u901A\u5173\uFF01\u4F46\u6CA1\u80FD\u81EA\u52A8\u64AD\u653E\uFF1A${L.reason||"\u672A\u77E5\u539F\u56E0"}`,"",{ttl:5e3})}),u.forEach((L,A)=>{let Y=Math.floor(A/o.cols),re=A%o.cols;L.style.setProperty("--ms-d",`${(Y+re)*26}ms`),L.classList.add("is-win")}),b.ok(`\u901A\u5173\uFF1A${te(r).label} \xB7 ${m}s`);else{let{mines:L}=Dt(o,u.findIndex(A=>A.classList.contains("is-boom")));L.forEach((A,Y)=>{D(A,{delay:Y*22,kind:"is-cascade"})}),ze(o).forEach(A=>u[A].classList.add("is-wrong")),a.classList.add("is-shake"),setTimeout(()=>a.classList.remove("is-shake"),420),b.err(`\u8E29\u96F7\u4E86 \xB7 \u7528\u65F6 ${m}s`)}Ie(p,{animate:!0}),O(),H()},se=p=>{let m=Math.floor(p/o.cols),v=p%o.cols;if(o.cells[p].open){if(!Fe(o,m,v)){u[p].classList.add("is-nope"),setTimeout(()=>u[p]?.classList.remove("is-nope"),320);return}let A=Rt(o,m,v);A.opened.forEach((Y,re)=>D(Y,{delay:re*16,kind:"is-pop"})),O(),A.boom?fe(!1):A.won?fe(!0):H();return}let L=rt(o,m,v);if(L.ok){if(xe(),L.boom){D(p,{delay:0,kind:"is-pop"}),fe(!1);return}L.opened.forEach((A,Y)=>D(A,{delay:Y*14,kind:"is-pop"})),O(),L.won?fe(!0):H()}},he=p=>{let m=Math.floor(p/o.cols),v=p%o.cols,_=Nt(o,m,v);_.ok&&(D(p,{delay:0,kind:_.flag?"is-flagged":""}),_.flag||u[p].classList.remove("is-flagged"),O(),H())},ge=p=>d?he(p):se(p),ve=(p=r)=>{Ce(),r=p,o=it(r),c=0,C=!1,i.banner&&(i.banner.hidden=!0,i.banner.style.animation=""),a.classList.remove("is-shake"),U(),q(),x(),H(),s.focus({preventScroll:!0})};s.addEventListener("contextmenu",p=>p.preventDefault()),s.addEventListener("pointerdown",p=>{let m=p.target.closest(".ms-cell");if(!m)return;let v=Number(m.dataset.i);M=!1,clearTimeout(y),y=setTimeout(()=>{(p.pointerType==="touch"||p.pointerType==="pen")&&(M=!0,he(v))},Fn)});let Ne=()=>{clearTimeout(y),M&&setTimeout(()=>{M=!1},400)};s.addEventListener("pointerup",Ne),s.addEventListener("pointercancel",Ne),s.addEventListener("pointerleave",Ne),s.addEventListener("click",p=>{let m=p.target.closest(".ms-cell");if(!m)return;if(M){M=!1;return}let v=Number(m.dataset.i);c=v,ie(),p.button!==2&&ge(v)}),s.addEventListener("auxclick",p=>{let m=p.target.closest(".ms-cell");if(!m||p.button!==1)return;p.preventDefault();let v=Number(m.dataset.i);o.cells[v].open&&se(v)}),s.addEventListener("mousedown",p=>{let m=p.target.closest(".ms-cell");if(!m||p.button!==2)return;p.preventDefault();let v=Number(m.dataset.i);o.cells[v].open?se(v):he(v)}),s.addEventListener("mouseover",p=>{let m=p.target.closest(".ms-cell");m&&Ye(Number(m.dataset.i),!0)}),s.addEventListener("mouseout",p=>{let m=p.target.closest(".ms-cell");m&&Ye(Number(m.dataset.i),!1)});let Re=p=>{let m=o.cols,v=o.rows,_=Math.floor(c/m),L=c%m,A=null;if(p.key==="ArrowUp")A=[Math.max(0,_-1),L];else if(p.key==="ArrowDown")A=[Math.min(v-1,_+1),L];else if(p.key==="ArrowLeft")A=[_,Math.max(0,L-1)];else if(p.key==="ArrowRight")A=[_,Math.min(m-1,L+1)];else if(p.key===" "||p.key==="Enter"){p.preventDefault(),se(c);return}else if(p.key==="f"||p.key==="F"){p.preventDefault(),he(c);return}else if(p.key==="r"||p.key==="R"){p.preventDefault(),ve();return}A&&(p.preventDefault(),c=A[0]*m+A[1],ie(),D(c))};s.addEventListener("keydown",Re);let ft=p=>{let m=p.target.closest("[data-level]");if(m){ve(m.dataset.level);return}if(p.target.closest("#msNew")||p.target.closest("#msAgain")){ve();return}if(p.target.closest("#msMode")){d=!d,i.mode.setAttribute("aria-pressed",String(d)),i.mode.querySelector(".ms-mode__ico").textContent=d?"\u2691":"\u26CF",i.mode.querySelector(".ms-mode__txt").textContent=d?"\u63D2\u65D7":"\u6316\u5F00",b.show(d?"\u5DE6\u952E\uFF1A\u63D2\u65D7":"\u5DE6\u952E\uFF1A\u6316\u5F00");return}if(p.target.closest("#msReset")){if(!confirm("\u6E05\u7A7A\u672C\u673A\u7684\u626B\u96F7\u6218\u7EE9\uFF1F"))return;Gt(),x(),b.show("\u6218\u7EE9\u5DF2\u6E05\u7A7A")}};e.addEventListener("click",ft);let g=Zt;Zt=null;let w=ct(g)||zt();w&&(o=w.game,r=o.level,c=w.cursor,d=w.flagMode,C=!0);let T=()=>R();return window.addEventListener("resize",T),U(),q(),x(),C&&(ie(),i.mode.setAttribute("aria-pressed",String(d)),i.mode.querySelector(".ms-mode__ico").textContent=d?"\u2691":"\u26CF",i.mode.querySelector(".ms-mode__txt").textContent=d?"\u63D2\u65D7":"\u6316\u5F00",o.over?(o.won?u.forEach(p=>p.classList.add("is-win")):(ze(o).forEach(p=>u[p]?.classList.add("is-wrong")),u.forEach((p,m)=>{o.cells[m].boom&&p.classList.add("is-boom")})),Ie(o.won,{animate:!1})):o.opened>0&&b.show("\u5DF2\u6062\u590D\u4E0A\u4E00\u5C40\uFF0C\u63A5\u7740\u73A9")),xe(),R(),ut={get state(){return o},get level(){return r},get restored(){return C},newGame:ve,doReveal:se,doFlag:he,paintAll:q,get cursor(){return c},keys:Re},()=>{Ce(),clearTimeout(y),window.removeEventListener("resize",T);let p=B();Zt=p,dt(p),ut&&(ut=null)}}},mt={get current(){return ut}};function qe(e,t){return{id:e,title:"",render:()=>"",mount(){let s=location.hash.replace(/^#\/[^/?]*/,""),n=`#/${t}${s}`;location.hash!==n&&location.replace(n)}}}var rn=Date.now();function ln(e){let t=Math.floor(e/1e3),s=Math.floor(t/60),n=Math.floor(s/60);return n>0?`${n}h ${s%60}m`:s>0?`${s}m ${t%60}s`:`${t}s`}var cn={id:"session-status",slot:"after-hero",render(){return`
      <div class="panel" style="margin-top:var(--sp-5);padding:var(--sp-3) var(--sp-4);display:flex;gap:var(--sp-5);flex-wrap:wrap;align-items:center">
        <span class="status-dot status-dot--on">SESSION ACTIVE</span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">\u672C\u6B21\u4F1A\u8BDD\u65F6\u957F <b id="widgetUptime">0s</b></span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">\u4F5C\u8005 <b>${f(I.author)}</b></span>
        <span class="mono faint" style="font-size:var(--fs-2xs)">\u7248\u672C <b>${f(I.version)}</b></span>
      </div>`},mount(e){let t=e.querySelector("#widgetUptime");if(!t)return;let s=setInterval(()=>{t.textContent=ln(Date.now()-rn)},1e3);return t.textContent=ln(Date.now()-rn),()=>clearInterval(s)}},dn={id:"footer-note",slot:"before-footer",render(){return`
      <section class="sect">
        <div class="panel hatch" style="height:8px;border:0"></div>
        <div class="panel" style="padding:var(--sp-5);margin-top:var(--sp-4);display:flex;gap:var(--sp-5);flex-wrap:wrap;align-items:center;justify-content:space-between">
          <div>
            <span class="k-label k-label--signal">EXTENSIBLE</span>
            <h3 style="margin-top:6px;font-size:1.4rem">\u8FD9\u5957\u9AA8\u67B6\u662F\u4E3A\u4F60\u6539\u7684</h3>
            <p class="muted" style="margin:6px 0 0;max-width:60ch;font-size:var(--fs-sm)">
              \u5728 <span class="mono">src/main.js</span> \u91CC\u7528 <span class="mono">Registry.*</span> \u6CE8\u518C\u65B0\u7684\u63D2\u753B\u6E90\u3001\u8DEF\u7531\u3001\u547D\u4EE4\u6216\u9996\u9875\u7EC4\u4EF6\uFF0C
              \u5C31\u80FD\u5728\u4E0D\u6539\u52A8\u6838\u5FC3\u4EE3\u7801\u7684\u524D\u63D0\u4E0B\u6269\u5C55\u529F\u80FD\u3002\u5F53\u524D\u8FD9\u4E2A\u533A\u5757\u672C\u8EAB\u5C31\u662F\u901A\u8FC7
              <span class="mono">Registry.addWidget()</span> \u6CE8\u5165\u7684\u3002
            </p>
          </div>
          <a class="btn btn--signal" href="#/dashboard" data-nav>\u6253\u5F00\u4EEA\u8868\u76D8 \u2192</a>
        </div>
      </section>`}};function Wn(e,{height:t=120}={}){let s=Math.max(1,...e.map(n=>n[1]));return`
  <div class="grid" style="gap:10px">
    ${e.map(([n,a])=>`
      <div class="grid" style="grid-template-columns:110px 1fr 46px;gap:10px;align-items:center">
        <span class="mono faint" style="font-size:var(--fs-2xs);text-align:right;overflow:hidden;text-overflow:ellipsis">${f(n)}</span>
        <span style="height:14px;background:var(--bg-sunk);border:1px solid var(--border);display:block;position:relative">
          <i style="position:absolute;inset:0 auto 0 0;width:${(a/s*100).toFixed(1)}%;background:var(--signal);display:block"></i>
        </span>
        <b class="mono" style="font-size:var(--fs-xs)">${String(a).padStart(2,"0")}</b>
      </div>`).join("")}
  </div>`}function Vn(e,t=150){let s=e.reduce((u,[,c])=>u+c,0)||1,n=t/2-12,a=2*Math.PI*n,i=0,r=["var(--signal)","var(--ink-100)","var(--ink-60)","var(--ink-40)","var(--ink-25)","var(--ink-12)"],o=e.map(([u,c],d)=>{let h=c/s,y=`${(h*a).toFixed(2)} ${a.toFixed(2)}`,M=-i*a;return i+=h,`<circle r="${n}" cx="${t/2}" cy="${t/2}" fill="none"
      stroke="${r[d%r.length]}" stroke-width="14"
      stroke-dasharray="${y}" stroke-dashoffset="${M.toFixed(2)}" />`}).join("");return`
  <div style="display:flex;gap:var(--sp-4);align-items:center;flex-wrap:wrap">
    <svg width="${t}" height="${t}" viewBox="0 0 ${t} ${t}" style="transform:rotate(-90deg);flex:0 0 auto">
      <circle r="${n}" cx="${t/2}" cy="${t/2}" fill="none" stroke="var(--bg-sunk)" stroke-width="14" />
      ${o}
    </svg>
    <div class="grid" style="gap:6px">
      ${e.map(([u,c],d)=>`
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:10px;height:10px;background:${r[d%r.length]};display:block;border:1px solid var(--border)"></span>
          <span style="font-size:var(--fs-sm)">${f(u)}</span>
          <b class="mono" style="font-size:var(--fs-2xs);color:var(--fg-faint)">${c}</b>
        </div>`).join("")}
    </div>
  </div>`}function qn(e,t){let s=new Map;return e.forEach(n=>{let a=t(n)||"\u672A\u5206\u7C7B";s.set(a,(s.get(a)||0)+1)}),[...s.entries()].sort((n,a)=>a[1]-n[1])}var pn={id:"dashboard",title:"\u4EEA\u8868\u76D8",render(){let e=J.sorted,t=F.sorted,s=[...e,...t],n=qn(s,d=>d.category),a=s.reduce((d,h)=>d+(h.stats?.chars||0),0),i=s.reduce((d,h)=>d+(h.stats?.minutes||0),0),r=[],o=new Date;for(let d=5;d>=0;d--){let h=new Date(o.getFullYear(),o.getMonth()-d,1),y=`${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,"0")}`,M=s.filter(C=>String(C.date).slice(0,7)===y).length;r.push([y,M])}let u=P.imageProviders,c=E.tracks;return`
    <section>
      ${Ee({title:"DASHBOARD",sub:"\u8FD9\u4E00\u9875\u4E0D\u5728\u5185\u7F6E\u5BFC\u822A\u91CC\uFF0C\u800C\u662F\u7531 Registry.addRoute() \u52A8\u6001\u6CE8\u518C\u7684\u63D2\u4EF6\u89C6\u56FE \u2014\u2014 \u6F14\u793A\u5982\u4F55\u5728\u4E0D\u4FEE\u6539\u6838\u5FC3\u4EE3\u7801\u7684\u524D\u63D0\u4E0B\u65B0\u589E\u5B8C\u6574\u9875\u9762\u3002",idx:"PLUGIN / DASHBOARD",meta:[{label:"ENTRIES",value:String(s.length).padStart(2,"0")},{label:"CHARS",value:a.toLocaleString("en-US")},{label:"READ TIME",value:`${i} MIN`},{label:"PROVIDERS",value:String(u.length)}],actions:'<a class="btn btn--sm" href="#/" data-nav>\u2190 \u8FD4\u56DE\u9996\u9875</a>'})}

      <div class="grid grid--3" style="margin-top:var(--sp-6)">
        <div class="panel" data-reveal>
          <div class="panel__head"><span class="panel__title">\u5185\u5BB9\u5206\u5E03</span><span class="mono faint" style="font-size:var(--fs-2xs)">CATEGORY</span></div>
          <div class="panel__body">${n.length?Vn(n.slice(0,6)):'<p class="faint mono">\u6682\u65E0\u6570\u636E</p>'}</div>
        </div>

        <div class="panel" data-reveal data-reveal-delay="60" style="grid-column:span 2">
          <div class="panel__head"><span class="panel__title">\u8FD1 6 \u4E2A\u6708\u53D1\u5E03\u8282\u594F</span><span class="mono faint" style="font-size:var(--fs-2xs)">TIMELINE</span></div>
          <div class="panel__body">${Wn(r)}</div>
        </div>
      </div>

      <div class="grid grid--2" style="margin-top:var(--sp-4)">
        <div class="panel" data-reveal>
          <div class="panel__head"><span class="panel__title">\u8FD0\u884C\u72B6\u6001</span><span class="status-dot status-dot--on">LIVE</span></div>
          <div class="panel__body grid" style="gap:10px">
            ${[["\u4E3B\u9898",j.current.toUpperCase()],["\u63D2\u753B\u6570\u636E\u6E90",`${u.length} \u4E2A`],["\u63D2\u753B\u5386\u53F2",`${z.history.length} / 40`],["\u66F2\u76EE",`${c.filter(d=>E.audioUrl(d)).length} / ${c.length} \u53EF\u64AD\u653E`],["\u53EF\u89C6\u5316",E.analyser?"ANALYSER\uFF08\u540C\u6E90\uFF09":"SYNTHETIC\uFF08\u8DE8\u57DF/\u5F85\u673A\uFF09"],["\u672A\u8BFB",`${ne.unreadNews+ne.unreadPosts} \u6761`],["\u5DF2\u6CE8\u518C\u8DEF\u7531",`${P.routes.length} \u4E2A\u63D2\u4EF6\u89C6\u56FE`],["\u5DF2\u6CE8\u518C\u547D\u4EE4",`${P.commands.length} \u6761`]].map(([d,h])=>`
              <div style="display:flex;justify-content:space-between;gap:var(--sp-4);border-bottom:1px solid var(--border);padding-bottom:8px">
                <span class="k-label">${f(d)}</span>
                <b class="mono" style="font-size:var(--fs-sm)">${f(String(h))}</b>
              </div>`).join("")}
          </div>
        </div>

        <div class="panel" data-reveal data-reveal-delay="60">
          <div class="panel__head"><span class="panel__title">\u6700\u8FD1\u66F4\u65B0</span><span class="mono faint" style="font-size:var(--fs-2xs)">ACTIVITY</span></div>
          <div class="panel__body grid" style="gap:10px">
            ${s.slice(0,8).map(d=>`
              <a href="#/${d.id.startsWith("news")?"news":"posts"}/${d.id}" data-nav style="display:flex;justify-content:space-between;gap:var(--sp-3);border-bottom:1px solid var(--border);padding-bottom:8px">
                <span class="clamp-1" style="font-size:var(--fs-sm)">${f(d.title)}</span>
                <span class="mono faint" style="font-size:var(--fs-2xs);flex:0 0 auto">${de(d.date)}</span>
              </a>`).join("")||'<p class="faint mono">\u6682\u65E0\u5185\u5BB9</p>'}
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:var(--sp-4)" data-reveal>
        <div class="panel__head"><span class="panel__title">\u5982\u4F55\u518D\u6269\u5C55\u4E00\u4E2A\u9875\u9762</span></div>
        <div class="panel__body">
          <div class="prose" style="max-width:80ch">
            <p>\u5728\u4EFB\u610F\u63D2\u4EF6\u6587\u4EF6\u91CC\u5B9A\u4E49\u89C6\u56FE\u5BF9\u8C61\uFF0C\u7136\u540E\u5728 <span class="mono">src/main.js</span> \u4E2D\u6CE8\u518C\uFF1A</p>
            <pre data-lang="js"><code>import { Registry } from './core/registry.js';

Registry.addRoute({
  id: 'lab',
  title: '\u5B9E\u9A8C\u5BA4',
  render(ctx) { return '&lt;h1&gt;LAB&lt;/h1&gt;'; },
  mount(root, ctx) { /* \u7ED1\u5B9A\u4EA4\u4E92 */ },
});

Registry.addNav({ id: 'lab', path: '#/lab', label: 'LAB', cn: '\u5B9E\u9A8C\u5BA4' });</code></pre>
            <p>\u5BFC\u822A\u3001\u547D\u4EE4\u9762\u677F\u7D22\u5F15\u3001\u8DEF\u7531\u89E3\u6790\u90FD\u4F1A\u81EA\u52A8\u540C\u6B65\uFF0C\u65E0\u9700\u6539\u52A8\u5176\u4ED6\u6587\u4EF6\u3002</p>
          </div>
        </div>
      </div>
    </section>`},mount(e){W.reveal(e)}};var fn={init:()=>import("./chunks/listening-stage-MBRX66EY.js").then(e=>e.ListeningStage.init()),open:(...e)=>import("./chunks/listening-stage-MBRX66EY.js").then(t=>t.ListeningStage.open(...e)),close:(...e)=>import("./chunks/listening-stage-MBRX66EY.js").then(t=>t.ListeningStage.close(...e))};function Z(e,t,s){let n=null,a=()=>n||(n=s().then(i=>i.default));return{id:e,title:t,async render(i){return(await a()).render(i)},async mount(i,r){return(await a()).mount?.(i,r)},async titleFor(i){return(await a()).titleFor?.(i)}}}var Yn=Z("logs","\u6587\u7AE0\u4E0E\u516C\u544A",()=>import("./chunks/logs-LZGCGQC6.js")),Kn=Z("forum","\u8BBA\u575B",()=>import("./chunks/forum-N4PW3TH6.js")),Jn=Z("music","\u97F3\u4E50",()=>import("./chunks/music-5LONPX4X.js")),Xn=Z("gallery","\u63D2\u753B",()=>import("./chunks/gallery-I6EDVD3J.js")),Zn=Z("leisure","\u6587\u5A31",()=>import("./chunks/leisure-VRZ2MLKB.js")),Qn=Z("download","\u4E0B\u8F7D App",()=>import("./chunks/download-Q2TMN326.js")),ui=Z("tierlist","Tier List",()=>import("./chunks/tierlist-HRBOJHM2.js")),ea=Z("fishrun","\u50CF\u7D20\u5C0F\u9C7C",()=>import("./chunks/fish-run-P7VW7XKC.js")),ta=Z("tools","\u5DE5\u5177\u53F0",()=>import("./chunks/tools-3Z7DXJ6E.js")),sa=Z("admin","\u53D1\u5E03",()=>import("./chunks/admin-CLSFPAXG.js")),na=Z("notfound","404",()=>import("./chunks/notfound-UOTIVLTX.js"));P.addWidget(cn);P.addWidget(dn);P.addRoute(pn);P.addNav({id:"dashboard",path:"#/dashboard",label:"STATUS",cn:"\u4EEA\u8868\u76D8"});P.addCommand({id:"export-all",label:"\u5BFC\u51FA\u5168\u90E8\u5185\u5BB9\u4E3A JSON",hint:"IO",run:e=>e.exportAll()});P.addCommand({id:"goto-download",label:"\u4E0B\u8F7D App\uFF08Android / Windows\uFF09",hint:"G D",run:e=>e.navigate("#/download")});P.addCommand({id:"mine",label:"\u626B\u96F7\uFF1A\u65B0\u7684\u4E00\u5C40",hint:"GAME",run:e=>{location.hash!=="#/mine"?(e.navigate("#/mine"),setTimeout(()=>mt.current?.newGame(),420)):mt.current?.newGame()}});window.__SITE__=I;var hn={navigate:e=>be.navigate(e),refresh:()=>be.resolve(),togglePlay:()=>E.toggle(),nextTrack:()=>E.next(),prevTrack:()=>E.prev(),randomArt:async()=>{let e=await z.random({});return e&&b.ok(e.title?`\u5DF2\u62BD\u53D6\uFF1A${e.title}`:"\u5DF2\u62BD\u53D6\u65B0\u63D2\u753B"),e},cycleTheme:()=>j.cycle(),setTheme:e=>j.set(e,{announce:!0}),openPixiv:()=>z.openPixiv(),exportAll:()=>{ps("content-export.json",JSON.stringify({exportedAt:new Date().toISOString(),posts:JSON.parse(J.exportJSON()),news:JSON.parse(F.exportJSON())},null,2),"application/json"),b.ok("\u5DF2\u5BFC\u51FA\u5168\u90E8\u5185\u5BB9")},stats:()=>({posts:J.published.length,news:F.published.length,unread:ne.unreadNews,tracks:E.tracks.length,providers:P.imageProviders.length})};async function aa(){document.documentElement.dataset.booted="1",document.title=`${I.name} // \u7EC8\u7AEF`,document.documentElement.lang=I.lang,await rs(),j.init(),Je.get("reduceMotion")&&(document.documentElement.dataset.reduceMotion="1"),b.init(),Ts.init();try{await Promise.race([$.init(),new Promise(e=>setTimeout(e,900))])}catch(e){console.warn("[auth] \u521D\u59CB\u5316\u5931\u8D25",e)}try{await Promise.race([ks.init(),new Promise(e=>setTimeout(e,700))])}catch(e){console.warn("[netease-login] \u521D\u59CB\u5316\u5931\u8D25",e)}E.init(),Je.get("shuffle")&&E.setShuffle(!0),vs(),ws.init(),Ct.init(),z.init(),_t.init(),_s(),fn.init(),Gs(),[Ys,Yn,Kn,Jn,Xn,Zn,Qn,on,ea,ta,sa,na,qe("posts","logs"),qe("post","logs"),qe("news","logs"),qe("newsItem","logs")].forEach(yt),P.routes.forEach(e=>yt(e)),Et.init(hn),S.on("route:change",e=>$t.noteRoute(e?.view)),window.addEventListener("error",e=>{e.message?.includes("ResizeObserver")||console.error("[global]",e.error||e.message)}),window.addEventListener("unhandledrejection",e=>{console.error("[promise]",e.reason)}),await be.init(),W.reveal(document),setTimeout(()=>{os.enabled&&ls.probe().then(e=>{e&&console.info("%c[server] \u5728\u7EBF\uFF1A\u53D1\u5E03\u5185\u5BB9\u5C06\u76F4\u63A5\u5199\u5165 data/","color:#E5BE00")})},1200),await Fs.run(),Ws()}var un=!1;function mn(){un||(un=!0,aa().catch(e=>{console.error("[boot] \u542F\u52A8\u5931\u8D25",e),document.getElementById("boot")?.classList.add("is-done");let t=document.getElementById("view");t&&(t.innerHTML=`<section class="viewhead"><div class="viewhead__row">
        <h1 class="viewhead__title display">\u542F\u52A8\u5931\u8D25</h1></div>
        <p class="muted" style="margin-top:16px">\u901A\u5E38\u662F\u56E0\u4E3A\u4EE5 <b>file://</b> \u76F4\u63A5\u6253\u5F00\u5BFC\u81F4\u6A21\u5757\u52A0\u8F7D\u88AB\u6D4F\u89C8\u5668\u62E6\u622A\u3002</p>
        <pre class="mono" style="white-space:pre-wrap;margin-top:16px;font-size:12px">${String(e?.stack||e)}</pre>
        <p class="mono" style="margin-top:16px">\u8BF7\u5728\u9879\u76EE\u76EE\u5F55\u8FD0\u884C\uFF1A<b>node server.mjs</b>\uFF0C\u7136\u540E\u8BBF\u95EE http://localhost:5173</p>
        </section>`)}))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",mn,{once:!0}):mn();window.Terminal={ctx:hn,Player:E,Stage:z,Lyrics:_t,ListeningStage:fn,Registry:P,Router:be,Posts:J,News:F,Settings:Je,Theme:j,Palette:Et,openPalette:ke,EmbedHost:$t,Mines:Wt,MinesLive:mt,Almanac:V,AlmanacUI:Ct,Auth:$};
