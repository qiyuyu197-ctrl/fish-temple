import{c as D,e as I}from"./chunk-IP3NPHJG.js";import{a as A}from"./chunk-DDIRHU7Q.js";import{a as u,b as S,d as r}from"./chunk-BUFEAOIA.js";import{l as se}from"./chunk-KSYHGNLY.js";import"./chunk-L72EZ7PG.js";var Me="data/anime.json",Ee="data/anime-covers.json",de=`${se}.leisure.watch`,G=[{n:1,cn:"\u5468\u4E00",ja:"\u6708",en:"MON"},{n:2,cn:"\u5468\u4E8C",ja:"\u706B",en:"TUE"},{n:3,cn:"\u5468\u4E09",ja:"\u6C34",en:"WED"},{n:4,cn:"\u5468\u56DB",ja:"\u6728",en:"THU"},{n:5,cn:"\u5468\u4E94",ja:"\u91D1",en:"FRI"},{n:6,cn:"\u5468\u516D",ja:"\u571F",en:"SAT"},{n:7,cn:"\u5468\u65E5",ja:"\u65E5",en:"SUN"}],h={watching:{label:"\u5728\u770B",icon:"\u25B6",order:0},plan:{label:"\u60F3\u770B",icon:"\u25C7",order:1},done:{label:"\u770B\u5B8C",icon:"\u2713",order:2}},W=[null,"plan","watching","done"],P=["orb","lines","blade","eye","dots","wave","plus","star"],J=["a","b","c","d"],we="https://bgmapi.anibt.net/v0/search/subjects",Le=new Set(["\u79D1\u5E7B","\u5947\u5E7B","\u6218\u6597","\u604B\u7231","\u559C\u5267","\u6821\u56ED","\u65E5\u5E38","\u6CBB\u6108","\u60AC\u7591","\u63A8\u7406","\u70ED\u8840","\u8FD0\u52A8","\u97F3\u4E50","\u767E\u5408","\u673A\u6218","\u5386\u53F2","\u5192\u9669","\u7FA4\u50CF","\u9752\u6625","\u81F4\u90C1","\u641E\u7B11","\u730E\u5947","\u540E\u5BAB","\u5F02\u4E16\u754C","\u7A7F\u8D8A","\u9B54\u6CD5","\u8D85\u80FD\u529B","\u7F8E\u98DF","\u804C\u573A","\u516C\u8DEF","\u5355\u5143\u5267","\u5267\u60C5","\u5076\u50CF","\u6CE1\u9762\u756A","\u77ED\u7247","\u52A8\u753B"]),K=[{id:"season",cn:"\u5F53\u5B63\u65B0\u756A",en:"SEASON"},{id:"picks",cn:"\u63A8\u8350\u52A8\u6F2B",en:"PICKS"},{id:"mine",cn:"\u6211\u7684\u8FFD\u756A",en:"WATCHLIST"}],c=null,E=[],_=[],w=null,F=null,ne="",ue=new Map,M=null,C=0,o={tab:"season",q:"",genre:"\u5168\u90E8",mine:"\u5168\u90E8",sort:"",mode:"local",bgm:{status:"idle",items:[],query:"",total:0,error:""}},f=e=>String(e).padStart(2,"0"),$=(e,a=0)=>Number.isFinite(Number(e))?Number(e):a,U=e=>G.find(a=>a.n===Number(e))||G[0],V=()=>{let e=new Date().getDay();return e===0?7:e},O=e=>Math.max(0,Math.min(10,$(e?.score,0))),pe=()=>c?.season?`${c.season.year} ${c.season.name}`:"\u5F53\u5B63",me=e=>String(e||"").slice(0,10).replace(/-/g,"."),Te=()=>{let e=new Date;return`${e.getFullYear()}-${f(e.getMonth()+1)}-${f(e.getDate())}`},be=e=>!e.premiere||String(e.premiere)<=Te(),z=()=>{let e=c?.season;if(!e?.start||!e?.end)return!0;let a=Date.now(),t=Date.parse(`${e.start}T00:00:00+09:00`),s=Date.parse(`${e.end}T23:59:59+09:00`);return Number.isFinite(t)&&Number.isFinite(s)&&a>=t&&a<=s};function X(e){return O(e).toFixed(1)}function Ae(e){return e.scoreLabel?String(e.scoreLabel).split("/").pop().trim():e.kind==="season"?"\u671F\u5F85":"\u8BC4\u5206"}function Ce(e){return[e.title,e.titleJa,e.posterJa,e.studio,e.station,e.hook,e.synopsis,e.note,e.audience,e.year,(e.genres||[]).join(" "),(e.cast||[]).join(" ")].filter(Boolean).join(" ").toLowerCase()}function je(){try{let e=localStorage.getItem(de),a=e?JSON.parse(e):{};return a&&typeof a=="object"&&!Array.isArray(a)?a:{}}catch{return{}}}var b=je();function q(){try{localStorage.setItem(de,JSON.stringify(b))}catch{}}function Ie(){if(!c)return;let e=!1;Object.keys(b).forEach(a=>{(!c.byId.has(a)||!h[b[a]])&&(delete b[a],e=!0)}),e&&q()}function j(){return c?c.all.filter(e=>b[e.id]).sort((e,a)=>{let t=h[b[e.id]]?.order??9,s=h[b[a.id]]?.order??9;return t-s||e.title.localeCompare(a.title,"zh-Hans-CN")}):[]}async function Ne(){if(c)return c;let[e,a]=await Promise.all([fetch(Me,{cache:"no-cache"}),fetch(Ee,{cache:"no-cache"}).catch(()=>null)]);if(!e.ok)throw new Error(`data/anime.json HTTP ${e.status}`);let t=await e.json(),s={items:{}};if(a?.ok)try{s=await a.json()}catch{s={items:{}}}let n=l=>s.items?.[l]||null,i=(l,y)=>{let k=n(l.id);return{...l,kind:y,cover:k?.cover||"",coverRemote:k?.bangumiCover||"",coverRemoteMedium:k?.bangumiCoverMedium||"",coverRemoteLarge:k?.bangumiCoverLarge||"",coverMeta:k,_search:Ce(l)}},d=(t.current||[]).map(l=>i(l,"season")),p=(t.recommended||[]).map(l=>i(l,"pick")),m=[...d,...p];return c={...t,current:d,picks:p,all:m,byId:new Map(m.map(l=>[l.id,l])),coverMeta:s},Ie(),c}function N(){return c?o.tab==="picks"?c.picks:o.tab==="mine"?j():c.current:[]}function ge(){return o.sort||(o.tab==="season"?"day":o.tab==="mine"?"mine":"score")}function Be(){let e=[...N()];if(o.tab==="mine"&&o.mine!=="\u5168\u90E8"&&(e=e.filter(t=>b[t.id]===o.mine)),o.tab!=="mine"&&o.genre!=="\u5168\u90E8"&&(e=e.filter(t=>(t.genres||[]).includes(o.genre))),o.q){let t=o.q.toLowerCase();e=e.filter(s=>s._search.includes(t))}let a=ge();return a==="date"?e.sort((t,s)=>String(t.premiere||"").localeCompare(String(s.premiere||""))):a==="day"?e.sort((t,s)=>$(t.day,9)-$(s.day,9)||String(t.time||"").localeCompare(String(s.time||""))):a==="year"?e.sort((t,s)=>$(s.year)-$(t.year)):a==="title"?e.sort((t,s)=>t.title.localeCompare(s.title,"zh-Hans-CN")):a==="mine"?e.sort((t,s)=>{let n=h[b[t.id]]?.order??9,i=h[b[s.id]]?.order??9;return n-i||t.title.localeCompare(s.title,"zh-Hans-CN")}):e.sort((t,s)=>O(s)-O(t)||t.title.localeCompare(s.title,"zh-Hans-CN")),e}function fe(e,{index:a=0,lg:t=!1}={}){let s=e.poster||{},n=Math.round(Math.max(0,Math.min(360,$(s.h,30)))),i=Math.round(Math.max(0,Math.min(360,$(s.h2,n+40)))),d=/^#[0-9a-f]{6}$/i.test(String(s.accent))?s.accent:"#ffd400",p=P.includes(s.mark)?s.mark:"orb",m=J.includes(s.layout)?s.layout:"a",l=Math.max(-40,Math.min(40,$(s.rot,0))),y=e.posterJa||e.titleJa||e.title||"",k=y.length>16?" poster--jp-long":y.length>10?" poster--jp-mid":"",ee=e.kind==="pick"?`${e.year||"\u2014"} / ${e.bangumiOnly?"BANGUMI":"PICK"}`:`${c?.season?.year||""} / ${U(e.day).en}`,x=t&&e.coverRemoteLarge||e.coverRemote||"",L=t?"":e.coverRemoteMedium||"",T=e.cover||"",v=x||T,te=x&&T?T:"",ae=v?`<img class="poster__cover" src="${r(v)}" alt=""
         ${te?`data-cover-fallback="${r(te)}"`:""}
         ${L&&L!==v?`data-cover-remote-fallback="${r(L)}"`:""}
         ${t?'loading="eager"':'loading="lazy"'} decoding="async" />`:"";return`<div class="poster${t?" poster--lg":""}${ae?" poster--cover":""}${k}"
      data-layout="${m}" data-mark="${p}"
      style="--p-h:${n};--p-h2:${i};--p-accent:${d};--p-rot:${l}deg" aria-hidden="true">
    ${ae}
    <span class="poster__wash"></span>
    <span class="poster__grid"></span>
    <span class="poster__mark"><i></i></span>
    <span class="poster__ghost">${String(a+1).padStart(2,"0")}</span>
    <span class="poster__jp" lang="ja">${r(y)}</span>
    <span class="poster__season">${r(ee)}</span>
    <span class="poster__type">${e.bangumiOnly?"BANGUMI SEARCH":e.kind==="pick"?"RECOMMENDED":"TV ANIMATION"}</span>
    <span class="poster__shine"></span>
  </div>`}var oe=["#ffd400","#cfe9ff","#ffb3c9","#b39dff","#9fffd0","#ffd9a0"];function Q(e){return String(e||"").replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()}function Re(e){let a=Q(e);if(!a)return"\u6765\u81EA Bangumi \u7684\u52A8\u753B\u6863\u6848\u3002";let s=(a.match(/[^。！？!?]+[。！？!?]?/g)||[a]).slice(0,2).join("").trim();return s.length>54&&(s=`${s.slice(0,52)}\u2026`),s}function Oe(e){let a=(e.infobox||[]).find(n=>/动画制作|製作|制作/.test(String(n.key||"")));if(!a)return"\u2014";let t=Array.isArray(a.value)?a.value.map(n=>n.v||n).join(" / "):a.value,s=Q(t).split(/[、,，]/)[0].replace(/（.*$/,"").trim();return s?s.slice(0,40):"\u2014"}function He(e){let a=[...e.meta_tags||[],...(e.tags||[]).map(t=>t.name)];return[...new Set(a.filter(t=>Le.has(t)))].slice(0,3)}function Ue(e){let a=String(e.date||""),t=Number(a.slice(0,4))||"",s=Number(e.total_episodes||e.eps||0),n=Number(e.rating?.score||0),i=Q(e.summary),d=Math.abs(Number(e.id)||0),p=e.images?.common||e.images?.medium||e.images?.large||e.image||"",m=e.images?.medium||e.images?.large||p,l=e.images?.large||e.images?.medium||p;return{id:`bgm-${e.id}`,bangumiOnly:!0,kind:"pick",title:e.name_cn||e.name||`Bangumi ${e.id}`,titleJa:e.name||"",posterJa:e.name||"",year:t,episodes:s?`${s} \u8BDD`:"\u2014",studio:Oe(e),badge:"BANGUMI",genres:He(e),hook:Re(i),synopsis:i.length>300?`${i.slice(0,299)}\u2026`:i||"\u6682\u65E0\u7B80\u4ECB\u3002",note:n?`Bangumi ${n.toFixed(1)} \u5206 \xB7 ${a||"\u2014"}`:`Bangumi \u6536\u5F55 \xB7 ${a||"\u2014"}`,audience:"",score:n,scoreLabel:"BANGUMI / \u53C2\u8003\u8BC4\u5206",coverRemote:p,coverRemoteMedium:m,coverRemoteLarge:l,coverMeta:{bangumiId:e.id,bangumiUrl:`https://bgm.tv/subject/${e.id}`,bangumiName:e.name||"",bangumiNameCn:e.name_cn||""},poster:{h:d%360,h2:(d+43)%360,accent:oe[d%oe.length],mark:P[d%P.length],layout:J[Math.floor(d/7)%J.length],rot:d%41-20}}}function qe(){let e=o.bgm;return e.status==="loading"?'<div class="leisure-bgmloading mono">\u6B63\u5728\u5411 BANGUMI \u67E5\u8BE2 \u2026</div>':e.status==="error"?`${I({title:"Bangumi \u6CA1\u6709\u54CD\u5E94",desc:e.error||"\u53CD\u4EE3\u8D85\u65F6\u6216\u9650\u6D41\uFF0C\u7A0D\u540E\u518D\u8BD5\uFF1B\u4E5F\u53EF\u4EE5\u5207\u56DE\u300C\u672C\u7AD9\u6863\u6848\u300D\u3002",icon:"!"})}<div class="leisure-bgmemptyacts"><button class="btn btn--sm" type="button" id="leisureBgmRetry">\u91CD\u8BD5</button><button class="btn btn--sm btn--ghost" type="button" data-searchmode="local">\u5207\u56DE\u672C\u7AD9</button></div>`:e.status==="ok"&&!e.items.length?I({title:"Bangumi \u6CA1\u641C\u5230",desc:`\u6CA1\u6709\u627E\u5230\u300C${e.query}\u300D\u76F8\u5173\u7684 TV \u52A8\u753B\uFF0C\u6362\u4E2A\u4E2D\u6587 / \u65E5\u6587 / \u82F1\u6587\u540D\u8BD5\u8BD5\u3002`,icon:"\u2315"}):`${I({title:"\u641C\u4E00\u90E8 Bangumi \u52A8\u753B",desc:"\u8F93\u5165\u4E2D\u6587 / \u65E5\u6587 / \u82F1\u6587\u540D\uFF0C\u56DE\u8F66\u6216\u70B9\u641C\u7D22\u3002\u7ED3\u679C\u6765\u81EA Bangumi \u5B9E\u65F6\u63A5\u53E3\uFF0C\u4E0D\u5199\u5165\u672C\u5730\u6863\u6848\u3002",icon:"\u2315"})}<div class="leisure-bgmemptyacts"><button class="btn btn--sm btn--ghost" type="button" data-searchmode="local">\u5207\u56DE\u672C\u7AD9\u6863\u6848</button></div>`}function xe(){return o.bgm.status!=="ok"||!o.bgm.items.length?qe():o.bgm.items.map((e,a)=>he(e,a)).join("")}function he(e,a){let t=b[e.id],s=t?h[t]:null,n=e.bangumiOnly===!0,i=n?`<span class="tag tag--signal">BANGUMI</span>
       <span class="acard__air mono">${r(e.year||"")} \xB7 ${r(e.episodes||"")}</span>`:e.kind==="season"?`<span class="tag ${e.status==="\u7EED\u4F5C"?"tag--signal":"tag--muted"}">${r(e.status||"\u65B0\u4F5C")}</span>
       <span class="acard__air mono">${U(e.day).ja}\u66DC ${r(e.time||"")}</span>`:`<span class="tag tag--signal">${r(e.badge||"\u63A8\u8350")}</span>
       <span class="acard__air mono">${r(e.year||"")} \xB7 ${r(e.episodes||"")}</span>`;return`<article class="acard${t?" is-tracked":""}" data-id="${r(e.id)}" style="--i:${a}">
    <div class="acard__poster">
      ${fe(e,{index:a})}
      <button class="acard__open" type="button" data-open="${r(e.id)}"
              aria-label="\u67E5\u770B\u300A${r(e.title)}\u300B\u8BE6\u60C5"></button>
      ${n?"":`<button class="acard__track${t?" is-tracked":""}" type="button" data-track="${r(e.id)}"
              aria-pressed="${t?"true":"false"}"
              aria-label="${t?`\u8FFD\u756A\u72B6\u6001\uFF1A${s.label}\uFF0C\u70B9\u51FB\u5207\u6362`:"\u52A0\u5165\u8FFD\u756A"}"
              title="${t?`\u8FFD\u756A\u72B6\u6001\uFF1A${s.label}\uFF08\u70B9\u51FB\u5207\u6362\uFF09`:"\u52A0\u5165\u8FFD\u756A"}">
        <span aria-hidden="true">${t?s.icon:"\uFF0B"}</span>
      </button>`}
    </div>
    <div class="acard__body">
      <div class="acard__kicker">${i}</div>
      <h3 class="acard__title">${r(e.title)}</h3>
      <p class="acard__hook clamp-2">${r(e.hook||"")}</p>
      <div class="acard__foot">
        <span class="acard__score"><b>${X(e)}</b><i>/10</i><em>${r(Ae(e))}</em></span>
        <span class="acard__genres mono">${(e.genres||[]).slice(0,2).map(d=>r(d)).join(" / ")}</span>
      </div>
    </div>
  </article>`}function Z(){if(!c)return"";if(o.tab==="mine"){let t={\u5168\u90E8:j().length};return Object.entries(h).forEach(([s])=>{t[s]=j().filter(n=>b[n.id]===s).length}),[`<button class="chip${o.mine==="\u5168\u90E8"?" is-on":""}" type="button" data-mine="\u5168\u90E8">\u5168\u90E8<b>${t.\u5168\u90E8}</b></button>`,...Object.entries(h).map(([s,n])=>`<button class="chip${o.mine===s?" is-on":""}" type="button" data-mine="${s}">${n.label}<b>${t[s]}</b></button>`)].join("")}let e=new Map;N().forEach(t=>(t.genres||[]).forEach(s=>e.set(s,(e.get(s)||0)+1)));let a=[...e.entries()].sort((t,s)=>s[1]-t[1]||t[0].localeCompare(s[0],"zh-Hans-CN"));return[`<button class="chip${o.genre==="\u5168\u90E8"?" is-on":""}" type="button" data-genre="\u5168\u90E8">\u5168\u90E8<b>${N().length}</b></button>`,...a.map(([t,s])=>`<button class="chip${o.genre===t?" is-on":""}" type="button" data-genre="${r(t)}">${r(t)}<b>${s}</b></button>`)].join("")}function De(){return o.tab==="season"?[["day","\u653E\u9001\u65E5 \xB7 \u5468\u4E00\u2192\u5468\u65E5"],["score","\u671F\u5F85\u503C \xB7 \u9AD8\u2192\u4F4E"],["date","\u9996\u64AD\u65E5 \xB7 \u65E9\u2192\u665A"],["title","\u540D\u79F0"]]:o.tab==="mine"?[["mine","\u8FFD\u756A\u72B6\u6001"],["score","\u8BC4\u5206 \xB7 \u9AD8\u2192\u4F4E"],["title","\u540D\u79F0"]]:[["score","\u8BC4\u5206 \xB7 \u9AD8\u2192\u4F4E"],["year","\u5E74\u4EFD \xB7 \u65B0\u2192\u65E7"],["title","\u540D\u79F0"]]}function $e(){let e=ge();return De().map(([a,t])=>`<option value="${a}"${e===a?" selected":""}>${r(t)}</option>`).join("")}function We(){if(!c)return"";let e=V(),a=z();return`<section class="leisure-week" id="leisureWeek"${o.tab!=="season"?" hidden":""}>
    <div class="leisure-week__head">
      <div>
        <span class="k-label">WEEKLY / ${a?"\u672C\u5468\u653E\u9001":"\u672C\u5B63\u653E\u9001\u8868"}</span>
        <p>\u6309\u661F\u671F\u6392\u597D\u7684\u653E\u9001\u8868\uFF0C\u70B9\u6761\u76EE\u76F4\u63A5\u770B\u8BE6\u60C5${a?"\uFF1B\u6807\u9EC4\u7684\u662F\u4ECA\u5929":""}\u3002</p>
      </div>
      <span class="mono">${c.current.length} TITLES \xB7 ${r(pe())}</span>
    </div>
    <div class="leisure-week__grid">
      ${G.map(t=>{let s=c.current.filter(n=>Number(n.day)===t.n).sort((n,i)=>String(n.time||"").localeCompare(String(i.time||"")));return`<div class="lweek__day${a&&t.n===e?" is-today":""}">
          <div class="lweek__head">
            <b>${t.ja}</b><span>${t.en}</span><em>${s.length}</em>
            ${a&&t.n===e?"<i>\u4ECA\u65E5</i>":""}
          </div>
          <div class="lweek__list">
            ${s.length?s.map(n=>`<button class="lweek__item${b[n.id]?" is-tracked":""}"
                type="button" data-open="${r(n.id)}" data-week-id="${r(n.id)}">
                <span class="lweek__time mono">${r(n.time||"")}</span>
                <span class="lweek__title">${r(n.title)}</span>
              </button>`).join(""):'<p class="lweek__off mono">\u2014</p>'}
          </div>
        </div>`}).join("")}
    </div>
  </section>`}function Fe(){let e=V(),a=c.current.filter(t=>Number(t.day)===e&&be(t)).sort((t,s)=>String(t.time||"").localeCompare(String(s.time||"")));return a.length?a.slice(0,4).map(t=>`<button class="leisure-today__item" type="button" data-open="${r(t.id)}">
    <span class="leisure-today__time mono">${r(t.time||"")}</span>
    <span class="leisure-today__title">${r(t.title)}</span>
    <span class="leisure-today__score mono">${X(t)}</span>
  </button>`).join(""):'<p class="leisure-today__empty">\u4ECA\u5929\u6CA1\u6709\u6536\u5F55\u4F5C\u54C1\u5728\u66F4\u65B0\u3002<br />\u53BB\u63A8\u8350\u91CC\u7FFB\u4E00\u90E8\uFF1F</p>'}function Ge(){let e=c.season||{},a=z(),t=V(),s=c.current.filter(i=>i.status==="\u7EED\u4F5C").length,n=a?c.current.filter(i=>Number(i.day)===t&&be(i)).length:0;return`<div class="leisure-hero">
    <div class="leisure-hero__stamp">
      <span class="leisure-hero__stamp-label mono">SEASON FILE</span>
      <span class="leisure-hero__year mono">${r(e.year||"")}</span>
      <b class="leisure-hero__kanji">${r(e.name||"\u5B63")}</b>
      <span class="leisure-hero__en mono">${r(e.nameEn||"")}</span>
    </div>
    <div class="leisure-hero__copy">
      <span class="k-label">${a?"CURRENT SEASON / \u5F53\u5B63":"ARCHIVE / \u5DF2\u5B8C\u7ED3"}</span>
      <h2 class="leisure-hero__title">
        <span class="leisure-hero__title-main">${r(e.headline||"\u8FD9\u4E00\u5B63\uFF0C")}</span>
        <span class="leisure-hero__title-sub"><i aria-hidden="true">01</i>${r(e.headlineEm||"\u770B\u70B9\u4EC0\u4E48\uFF1F")}</span>
      </h2>
      <p class="leisure-hero__intro">${r(e.intro||"")}</p>
      <div class="leisure-hero__stats">
        <div><b>${f(c.current.length)}</b><span>\u672C\u5B63\u6536\u5F55</span></div>
        <div><b>${f(s)}</b><span>\u7EED\u4F5C</span></div>
        <div><b>${f(n)}</b><span>\u4ECA\u65E5\u66F4\u65B0</span></div>
        <div><b>${f(c.picks.length)}</b><span>\u7F16\u8F91\u63A8\u8350</span></div>
      </div>
    </div>
    <aside class="leisure-hero__aside">
      <div class="leisure-hero__aside-head">
        <span class="k-label">${a?`TODAY / ${U(t).cn}`:"SEASON ARCHIVE"}</span>
        <span class="mono">${a?`${n} \u90E8`:"\u8865\u756A"}</span>
      </div>
      <div class="leisure-today">${a?Fe():'<p class="leisure-today__empty">\u672C\u5B63\u5DF2\u5B8C\u7ED3\u3002<br />\u4E0B\u9762\u6309\u653E\u9001\u65E5\u6574\u7406\u597D\u4E86\uFF0C\u6162\u6162\u8865\u3002</p>'}</div>
      <button class="leisure-hero__all mono" type="button" data-week-jump>WEEKLY TABLE <span>\u2193</span></button>
    </aside>
  </div>`}function ve(e){let a=e?.dataset?.coverRemoteFallback;if(a){e.removeAttribute("data-cover-remote-fallback"),e.src=a;return}let t=e?.dataset?.coverFallback;if(t){e.removeAttribute("data-cover-fallback"),e.classList.add("is-fallback"),e.src=t;return}Pe(e)}function Pe(e){e?.closest?.(".poster")?.classList.remove("poster--cover"),e?.remove()}function _e(e=document){S(".poster__cover",e).forEach(a=>{a.complete&&a.naturalWidth===0&&ve(a)})}function ye(e){let a=b[e];return`<div class="amodal__watch-head">
      <span class="k-label">\u6211\u7684\u8FFD\u756A</span>
      <span class="mono" id="leisureModalWatchState">${a?h[a].label:"\u672A\u52A0\u5165"}</span>
    </div>
    <div class="amodal__watchbtns">
      ${Object.entries(h).map(([t,s])=>`<button class="watchbtn${a===t?" is-on":""}"
        type="button" data-watch="${t}" aria-pressed="${a===t}"><span>${s.icon}</span>${s.label}</button>`).join("")}
    </div>
    ${a?'<button class="amodal__watchclear" type="button" data-watch="">\u2715 \u4ECE\u8FFD\u756A\u79FB\u9664</button>':'<p class="amodal__watchhint">\u9009\u4E00\u4E2A\u72B6\u6001\u5C31\u8BB0\u4E0B\u6765\u4E86\uFF1B\u53EA\u4FDD\u5B58\u5728\u8FD9\u53F0\u8BBE\u5907\u7684\u6D4F\u89C8\u5668\u91CC\u3002</p>'}`}function Je(e,a){let t=e.kind==="season",s=U(e.day),n=O(e),i=t?[["\u653E\u9001",`${s.cn} ${e.time||""}`],["\u9996\u64AD",me(e.premiere)],["\u653E\u9001\u5C40",e.station||"\u2014"],["\u8BDD\u6570",e.episodes||"\u653E\u9001\u4E2D"],["\u7C7B\u578B",(e.genres||[]).join(" / ")],["\u58F0\u4F18",(e.cast||[]).slice(0,3).join(" / ")]]:[["\u5E74\u4EFD",String(e.year||"\u2014")],["\u8BDD\u6570",e.episodes||"\u2014"],["\u5236\u4F5C",e.studio||"\u2014"],["\u7C7B\u578B",(e.genres||[]).join(" / ")]];return`<div class="amodal__grid">
    <div class="amodal__side">
      <div class="amodal__poster">${fe(e,{index:a,lg:!0})}</div>
      ${e.bangumiOnly?'<p class="amodal__watchhint">\u6765\u81EA Bangumi \u7684\u5B9E\u65F6\u641C\u7D22\u7ED3\u679C\uFF0C\u4E0D\u5199\u5165\u672C\u5730\u8FFD\u756A\u3002</p>':`<div class="amodal__watch" id="leisureModalWatch">${ye(e.id)}</div>`}
      ${e.coverRemote&&e.coverMeta?.bangumiUrl?`<p class="amodal__credit mono">COVER / <a href="${r(e.coverMeta.bangumiUrl)}" target="_blank" rel="noopener noreferrer">Bangumi</a></p>`:e.cover&&e.coverMeta?.anilistUrl?`<p class="amodal__credit mono">COVER / <a href="${r(e.coverMeta.anilistUrl)}" target="_blank" rel="noopener noreferrer">AniList</a></p>`:""}
    </div>
    <div class="amodal__main">
      <div class="amodal__eyebrow">
        <span class="tag tag--signal">${r(t?e.status||"\u65B0\u4F5C":e.badge||"\u63A8\u8350")}</span>
        <span class="mono">${t?`${r(pe())} \xB7 ${s.ja}\u66DC ${r(e.time||"")}`:`${r(e.year||"")} \xB7 ${r(e.episodes||"")}`}</span>
      </div>
      <h2 class="amodal__title" id="leisureModalTitle">${r(e.title)}</h2>
      <p class="amodal__ja" lang="ja">${r(e.titleJa||"")}</p>
      <p class="amodal__hook">${r(e.hook||"")}</p>

      <div class="amodal__score">
        <b>${X(e)}</b>
        <div class="amodal__score-body">
          <span class="k-label">${r(e.scoreLabel||(t?"EXPECTATION / \u671F\u5F85\u503C":"FISH SCORE / \u672C\u7AD9\u8BC4\u5206"))}</span>
          <span class="amodal__meter"><i style="width:${Math.round(n*10)}%"></i></span>
          <span class="amodal__score-note">${e.scoreLabel?"\u53C2\u8003\u8BC4\u5206\uFF0C\u4E0D\u662F\u672C\u7AD9\u4E3B\u89C2\u8BC4\u4EF7":"\u4E3B\u89C2\u8BC4\u5206\uFF0C\u4E0D\u662F\u8BC4\u5206\u7F51\u7AD9\u6570\u636E"}</span>
        </div>
      </div>

      <p class="amodal__synopsis">${r(e.synopsis||"")}</p>

      <blockquote class="amodal__note">
        <span class="k-label">${e.bangumiOnly?"SOURCE / \u6765\u6E90":t?"WHY / \u503C\u5F97\u770B":"WHY / \u63A8\u8350\u7406\u7531"}</span>
        <p>${r(e.note||"")}</p>
        ${e.audience?`<span class="amodal__audience">\u9002\u5408\uFF1A${r(e.audience)}</span>`:""}
      </blockquote>

      <dl class="amodal__facts">
        ${i.map(([d,p])=>`<div><dt>${r(d)}</dt><dd>${r(p||"\u2014")}</dd></div>`).join("")}
      </dl>

      <div class="amodal__tags">${(e.genres||[]).map(d=>`<span class="tag tag--muted">${r(d)}</span>`).join("")}</div>

      <div class="amodal__actions">
        <a class="btn btn--sm" href="https://search.bilibili.com/all?keyword=${encodeURIComponent(e.title)}"
           target="_blank" rel="noopener noreferrer">B \u7AD9\u641C\u7D22 \u2197</a>
        <a class="btn btn--sm btn--ghost" href="${r(e.bangumiOnly&&e.coverMeta?.bangumiUrl?e.coverMeta.bangumiUrl:`https://bgm.tv/subject_search/${encodeURIComponent(e.titleJa||e.title)}`)}"
           target="_blank" rel="noopener noreferrer">Bangumi \u2197</a>
        <button class="btn btn--sm btn--ghost" type="button" data-close>\u5173\u95ED</button>
      </div>

      <div class="amodal__pager">
        <button class="btn btn--sm btn--ghost" type="button" data-prev>\u2190 \u4E0A\u4E00\u90E8</button>
        <span class="mono">${a+1} / ${_.length}</span>
        <button class="btn btn--sm btn--ghost" type="button" data-next>\u4E0B\u4E00\u90E8 \u2192</button>
      </div>
    </div>
  </div>`}function H(e,a=null){let t=c?.byId.get(e)||ue.get(e),s=u("#leisureModal");if(!t||!s)return;_=a||(t.bangumiOnly?o.bgm.items:E.some(m=>m.id===e)?E:t.kind==="season"?[...c.current].sort((m,l)=>$(m.day,9)-$(l.day,9)||String(m.time).localeCompare(String(l.time))):c.picks),w=e;let i=Math.max(0,_.findIndex(m=>m.id===e)),d=u("#leisureModalBody");if(!d)return;d.innerHTML=Je(t,i),s.open||s.showModal(),document.documentElement.classList.add("leisure-modal-open");let p=s.querySelector(".amodal");p&&(p.scrollTop=0),_e(d),s.querySelector("[data-close]")?.focus({preventScroll:!0})}function re(){let e=u("#leisureModal");e?.open&&e.close(),document.documentElement.classList.remove("leisure-modal-open"),w=null}function B(e){if(!_.length)return;let a=_.findIndex(s=>s.id===w),t=_[(a+e+_.length)%_.length];t&&H(t.id,_)}function ke(e){let a=u("#leisureModalWatch");a&&(a.innerHTML=ye(e))}function Y(e=document){let a=u("#leisureToolbar",e),t=u("#leisureSearch",e),s=u("#leisureSearchGo",e),n=o.mode==="bangumi";a?.classList.toggle("is-bangumi",n),t&&(t.placeholder=n?"\u641C Bangumi\uFF1A\u4E2D\u6587 / \u65E5\u6587 / \u82F1\u6587\u756A\u540D\u2026":"\u641C\u7D22\u756A\u540D / \u58F0\u4F18 / \u7C7B\u578B / \u5173\u952E\u8BCD\u2026"),s&&(s.hidden=!n);let i=u("#leisureFoot",e),d=u("#leisureBgmFoot",e);i&&(i.hidden=n),d&&(d.hidden=!n),S("[data-searchmode]",e).forEach(p=>{let m=p.dataset.searchmode===o.mode;p.classList.toggle("is-on",m),p.setAttribute("aria-pressed",String(m))})}function ie(e,a=document){if(!(e!=="local"&&e!=="bangumi")){if(e===o.mode){Y(a);return}if(o.mode=e,M?.abort(),M=null,C+=1,e==="local"){o.q="",o.bgm={status:"idle",items:[],query:"",total:0,error:""};let t=u("#leisureSearch",a);t&&(t.value="")}Y(a),e==="bangumi"&&o.q?R():g()}}async function R(){let e=String(o.q||"").trim();if(!e){o.bgm={status:"idle",items:[],query:"",total:0,error:""},g(),A.show("\u5148\u8F93\u5165\u4E00\u90E8\u756A\u7684\u540D\u5B57\uFF0C\u518D\u641C Bangumi");return}M?.abort(),M=new AbortController;let a=++C;o.bgm={status:"loading",items:[],query:e,total:0,error:""},g();try{let t=await fetch(we,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({keyword:e,filter:{type:[2]}}),signal:M.signal});if(!t.ok)throw new Error(`Bangumi \u53CD\u4EE3 HTTP ${t.status}`);let s=await t.json();if(a!==C||o.q!==e)return;let n=(s.data||[]).filter(i=>!i.nsfw).map(Ue);ue=new Map(n.map(i=>[i.id,i])),o.bgm={status:"ok",items:n,query:e,total:Number(s.total)||n.length,error:""},g()}catch(t){if(t?.name==="AbortError"||a!==C)return;o.bgm={status:"error",items:[],query:e,total:0,error:t?.message||"\u53CD\u4EE3\u8D85\u65F6\u6216\u9650\u6D41\uFF0C\u7A0D\u540E\u518D\u8BD5\u3002"},g()}finally{a===C&&(M=null)}}function Ke(){let e=j().length,a=u("#leisureWatchMeta");a&&(a.textContent=f(e)),S("[data-tab]").forEach(s=>{let n=s.querySelector("b");if(!n)return;let i=s.dataset.tab;c&&(n.textContent=f(i==="season"?c.current.length:i==="picks"?c.picks.length:e))});let t=u("#leisureClear");t&&(t.hidden=e===0)}function g({focusTrack:e=null}={}){let a=u("#leisureGrid");if(!a||!c)return;if(o.mode==="bangumi"){E=o.bgm.items,a.innerHTML=xe();let s=u("#leisureCount");s&&(s.textContent=o.bgm.status==="ok"?`BANGUMI / ${f(o.bgm.items.length)} RESULTS`:o.bgm.status==="loading"?"BANGUMI / \u2026":o.bgm.status==="error"?"BANGUMI / ERROR":"BANGUMI / SEARCH");return}E=Be(),a.innerHTML=E.length?E.map((s,n)=>he(s,n)).join(""):I({title:o.tab==="mine"?"\u8FD8\u6CA1\u6709\u8FFD\u4EFB\u4F55\u4E00\u90E8":"\u6CA1\u6709\u5339\u914D\u7684\u4F5C\u54C1",desc:o.tab==="mine"?"\u5728\u5361\u7247\u53F3\u4E0A\u89D2\u70B9\u300C\uFF0B\u300D\uFF0C\u6216\u8005\u6253\u5F00\u8BE6\u60C5\u9009\u4E00\u4E2A\u8FFD\u756A\u72B6\u6001\u3002":"\u8BD5\u8BD5\u6E05\u7A7A\u641C\u7D22\u8BCD\uFF0C\u6216\u8005\u6362\u4E00\u4E2A\u7C7B\u578B\u3002",icon:"\u25A4"});let t=u("#leisureCount");if(t&&(t.textContent=`${f(E.length)} / ${f(N().length)} TITLES`),o.tab==="mine"){let s=u("#leisureFilters");s&&(s.innerHTML=Z())}S("[data-week-id]").forEach(s=>s.classList.toggle("is-tracked",!!b[s.dataset.weekId])),Ke(),e&&u(`[data-track="${CSS.escape(e)}"]`)?.focus({preventScroll:!0})}function Ye(e){let a=c?.byId.get(e);if(!a)return;let t=b[e]||null,s=W[(W.indexOf(t)+1)%W.length];s?b[e]=s:delete b[e],q(),A.ok(s?`\u300A${a.title}\u300B\xB7 ${h[s].label}`:`\u5DF2\u4ECE\u8FFD\u756A\u79FB\u9664\u300A${a.title}\u300B`),g({focusTrack:e}),w===e&&ke(e)}function Ve(e,a){let t=c?.byId.get(e);t&&(a&&h[a]?b[e]=a:delete b[e],q(),A.ok(a?`\u300A${t.title}\u300B\xB7 ${h[a].label}`:`\u5DF2\u4ECE\u8FFD\u756A\u79FB\u9664\u300A${t.title}\u300B`),g(),w===e&&ke(e))}function Se(){let e=o.tab==="season"?"":`?tab=${o.tab}`;history.replaceState(null,"",`#/leisure${e}`)}function le(e){if(!K.some(i=>i.id===e))return;o.tab=e,o.q="",o.genre="\u5168\u90E8",o.mine="\u5168\u90E8",o.sort="";let a=u("#leisureSearch");a&&(a.value="");let t=u("#leisureFilters");t&&(t.innerHTML=Z());let s=u("#leisureSort");s&&(s.innerHTML=$e());let n=u("#leisureWeek");n&&(n.hidden=e!=="season"),S("[data-tab]").forEach(i=>{let d=i.dataset.tab===e;i.classList.toggle("is-on",d),i.setAttribute("aria-selected",d?"true":"false")}),g(),Se()}function ce(){let e=N();if(!e.length){A.show("\u8FD9\u4E00\u680F\u8FD8\u6CA1\u6709\u5185\u5BB9\u3002");return}let a=e[Math.floor(Math.random()*e.length)];if(e.length>1){let t=0;for(;a.id===ne&&t++<12;)a=e[Math.floor(Math.random()*e.length)]}ne=a.id,H(a.id,[...e])}var et={id:"leisure",title:"\u6587\u5A31",async render(e){let a;try{a=await Ne()}catch(l){return`<section class="leisure">
        ${D({title:"LEISURE",sub:"\u6587\u5A31\u6863\u6848\uFF1A\u5F53\u5B63\u65B0\u756A\u4E0E\u79C1\u5FC3\u63A8\u8350\u3002",idx:"MODULE / 09"})}
        <div class="empty" style="margin-top:var(--sp-6)">
          <b>\u756A\u5267\u6570\u636E\u6CA1\u8BFB\u5230</b>
          <p>\u8BF7\u786E\u8BA4 <span class="mono">data/anime.json</span> \u5B58\u5728\uFF0C\u5E76\u4E14\u662F\u901A\u8FC7\u672C\u5730\u670D\u52A1\u5668\u8BBF\u95EE\uFF08\u4E0D\u662F file://\uFF09\u3002</p>
          <pre class="mono" style="white-space:pre-wrap;font-size:11px;max-width:100%">${r(l?.stack||l)}</pre>
        </div>
      </section>`}let t=e?.query||{},s=K.some(l=>l.id===t.tab)?t.tab:"season";s!==o.tab&&(o.tab=s,o.sort="",o.genre="\u5168\u90E8",o.mine="\u5168\u90E8"),o.q=t.q||"",o.genre="\u5168\u90E8",o.mine="\u5168\u90E8";let n=a,i=n.season||{},d=z(),p=o.tab,m=j().length;return`<section class="leisure">
      ${D({title:"LEISURE",sub:"\u6587\u5A31\u6863\u6848\uFF1A\u672C\u5B63\u503C\u5F97\u5148\u770B\u7684\u756A\u3001\u4E00\u5F20\u4ECE 2006 \u5230 2025 \u7684\u770B\u8FC7\u8868\uFF0C\u4EE5\u53CA\u53EA\u5B58\u5728\u8FD9\u53F0\u8BBE\u5907\u4E0A\u7684\u8FFD\u756A\u6807\u8BB0\u3002",idx:"MODULE / 09",meta:[{label:"SEASON",value:`${i.year||""} ${i.nameEn||""}`.trim()||"\u2014"},{label:"ON AIR",value:`${f(n.current.length)} TITLES`},{label:"PICKS",value:`${f(n.picks.length)} TITLES`},{label:"WATCH",value:f(m),id:"leisureWatchMeta"}],actions:`<span class="tag tag--muted">UPDATED ${r(me(i.updated))}</span>`})}

      ${Ge()}

      <div class="leisure-tabs" role="tablist" aria-label="\u6587\u5A31\u5185\u5BB9\u5206\u7C7B">
        ${K.map(l=>`<button class="leisure-tab${p===l.id?" is-on":""}" type="button"
            role="tab" data-tab="${l.id}" aria-selected="${p===l.id}"
            aria-controls="leisureGrid">
            <span class="leisure-tab__cn">${l.cn}</span>
            <span class="leisure-tab__en mono">${l.en}</span>
            <b>${f(l.id==="season"?n.current.length:l.id==="picks"?n.picks.length:m)}</b>
          </button>`).join("")}
        <button class="btn btn--sm leisure-random" type="button" id="leisureRandom">\u968F\u673A\u4E00\u90E8 \u2197</button>
      </div>

      ${We()}

      <div class="leisure-toolbar" id="leisureToolbar">
        <div class="leisure-searchmode" role="group" aria-label="\u641C\u7D22\u8303\u56F4">
          <button class="chip${o.mode==="local"?" is-on":""}" type="button"
                  data-searchmode="local" aria-pressed="${o.mode==="local"}">\u672C\u7AD9</button>
          <button class="chip${o.mode==="bangumi"?" is-on":""}" type="button"
                  data-searchmode="bangumi" aria-pressed="${o.mode==="bangumi"}">BANGUMI</button>
        </div>
        <div class="searchline leisure-search">
          <input type="search" id="leisureSearch" value="${r(o.q)}"
                 placeholder="${o.mode==="bangumi"?"\u641C Bangumi\uFF1A\u4E2D\u6587 / \u65E5\u6587 / \u82F1\u6587\u756A\u540D\u2026":"\u641C\u7D22\u756A\u540D / \u58F0\u4F18 / \u7C7B\u578B / \u5173\u952E\u8BCD\u2026"}"
                 autocomplete="off" spellcheck="false" />
          <button class="btn btn--sm" type="button" id="leisureSearchGo"${o.mode==="bangumi"?"":" hidden"}>\u641C\u7D22</button>
        </div>
        <div class="leisure-filters" id="leisureFilters">${Z()}</div>
        <label class="leisure-sort">
          <span class="k-label">SORT</span>
          <select id="leisureSort">${$e()}</select>
        </label>
        <button class="chip leisure-clear" type="button" id="leisureClear"${m?"":" hidden"}>\u6E05\u7A7A\u8FFD\u756A</button>
        <span class="result-count" id="leisureCount">\u2014</span>
      </div>

      <div class="leisure-grid" id="leisureGrid" aria-live="polite"></div>

      <p class="leisure-footnote" id="leisureFoot">
        ${r(i.note||"\u653E\u9001\u65F6\u95F4\u4EE5\u5173\u4E1C\u5730\u4E0A\u6CE2\u4E3A\u51C6\u3002")}
        \u756A\u5267\u4FE1\u606F\u6574\u7406\u81EA ${(n.sources||[]).map(l=>`<a href="${r(l.url)}" target="_blank" rel="noopener noreferrer">${r(l.label)}</a>`).join(" \xB7 ")}\u3002
        ${Object.keys(n.coverMeta?.items||{}).length?'\u5C01\u9762\u9ED8\u8BA4\u76F4\u8FDE <a href="https://bgm.tv" target="_blank" rel="noopener noreferrer">Bangumi</a>\uFF08bgmimg \u53CD\u4EE3\u70ED\u94FE\uFF0C\u4E0D\u843D\u76D8\uFF09\uFF1B\u52A0\u8F7D\u5931\u8D25\u56DE\u9000\u672C\u5730 AniList \u7F13\u5B58\u3002\u7248\u6743\u5F52\u539F\u4F5C\u8005\u4E0E\u5236\u4F5C\u65B9\u6240\u6709\u3002':""}
        ${i.auto?"\u672C\u5B63\u5217\u8868\u7531 AniList \u81EA\u52A8\u6574\u7406\uFF0C\u4E2D\u6587\u540D / \u77ED\u8BC4 / \u58F0\u4F18\u6301\u7EED\u8865\u5145\u4E2D\u3002":""}
        ${i.auto?"\u81EA\u52A8\u6761\u76EE\u7684\u8BC4\u5206\u6765\u81EA AniList\uFF0C\u4EC5\u4F9B\u53C2\u8003\u3002":"\u8BC4\u5206\u3001\u671F\u5F85\u503C\u4E0E\u63A8\u8350\u8BED\u4E3A\u4E3B\u89C2\u3002"}
        \u8FFD\u756A\u72B6\u6001\u53EA\u4FDD\u5B58\u5728\u8FD9\u53F0\u8BBE\u5907\u91CC\u3002${d?"":" \u672C\u5B63\u5DF2\u5B8C\u7ED3\uFF0C\u9875\u9762\u4FDD\u7559\u4E3A\u8865\u756A\u6863\u6848\u3002"}
      </p>

      <p class="leisure-footnote" id="leisureBgmFoot" hidden>
        \u641C\u7D22\u7ED3\u679C\u6765\u81EA <a href="https://bgm.tv" target="_blank" rel="noopener noreferrer">Bangumi</a> \u516C\u5F00\u63A5\u53E3\uFF1B
        \u5C01\u9762\u8D70 bgmimg \u53CD\u4EE3\u70ED\u94FE\uFF0C\u4E0D\u843D\u76D8\u3002\u8BC4\u5206\u662F Bangumi \u53C2\u8003\u5206\uFF0C\u4E0D\u662F\u672C\u7AD9\u4E3B\u89C2\u8BC4\u4EF7\uFF1B
        \u8FD9\u4E9B\u662F\u5B9E\u65F6\u641C\u7D22\u7ED3\u679C\uFF0C\u4E0D\u4F1A\u5199\u8FDB\u672C\u5730\u8FFD\u756A\u6216\u63A8\u8350\u6863\u6848\u3002
      </p>

      <dialog class="anime-modal" id="leisureModal" aria-labelledby="leisureModalTitle">
        <div class="amodal">
          <div class="amodal__bar">
            <span class="k-label">ANIME FILE / \u4F5C\u54C1\u6863\u6848</span>
            <button class="amodal__close" type="button" data-close aria-label="\u5173\u95ED">\u2715</button>
          </div>
          <div class="amodal__body" id="leisureModalBody"></div>
        </div>
      </dialog>
    </section>`},mount(e,a){if(!c)return;e.addEventListener("error",n=>{n.target?.classList?.contains("poster__cover")&&ve(n.target)},!0),g(),Y(e),_e(e);let t=u("#leisureSearch",e);t?.addEventListener("input",n=>{if(o.q=n.target.value.trim(),o.mode==="bangumi"){o.q!==o.bgm.query&&(M?.abort(),M=null,C+=1,o.bgm={status:"idle",items:[],query:"",total:0,error:""},g());return}clearTimeout(F),F=setTimeout(()=>{g()},150)}),t?.addEventListener("keydown",n=>{n.key==="Enter"&&o.mode==="bangumi"&&(n.preventDefault(),R())}),u("#leisureSort",e)?.addEventListener("change",n=>{o.sort=n.target.value,g()}),u("#leisureClear",e)?.addEventListener("click",()=>{j().length&&window.confirm("\u6E05\u7A7A\u5168\u90E8\u8FFD\u756A\u8BB0\u5F55\uFF1F\u53EA\u5F71\u54CD\u8FD9\u53F0\u8BBE\u5907\u3002")&&(b={},q(),g(),A.ok("\u5DF2\u6E05\u7A7A\u8FFD\u756A\u8BB0\u5F55"))}),u("#leisureRandom",e)?.addEventListener("click",ce);let s=u("#leisureModal",e);return s&&(s.addEventListener("click",n=>{n.target===s&&re()}),s.addEventListener("keydown",n=>{n.key==="ArrowLeft"&&(n.preventDefault(),B(-1)),n.key==="ArrowRight"&&(n.preventDefault(),B(1))}),s.addEventListener("close",()=>{w=null,document.documentElement.classList.remove("leisure-modal-open")})),e.addEventListener("click",n=>{let i=n.target.closest("[data-searchmode]");if(i){ie(i.dataset.searchmode,e);return}if(n.target.closest("#leisureSearchGo")){R();return}if(n.target.closest("#leisureBgmRetry")){R();return}let d=n.target.closest("[data-tab]");if(d){ie("local",e),le(d.dataset.tab);return}let p=n.target.closest("[data-genre]");if(p){o.genre=p.dataset.genre,S("[data-genre]",e).forEach(v=>v.classList.toggle("is-on",v===p)),g();return}let m=n.target.closest("[data-mine]");if(m){o.mine=m.dataset.mine,S("[data-mine]",e).forEach(v=>v.classList.toggle("is-on",v===m)),g();return}let l=n.target.closest("[data-track]");if(l){n.preventDefault(),n.stopPropagation(),Ye(l.dataset.track);return}let y=n.target.closest("[data-watch]");if(y){n.preventDefault(),Ve(w,y.dataset.watch||null);return}if(n.target.closest("[data-prev]")){n.preventDefault(),B(-1);return}if(n.target.closest("[data-next]")){n.preventDefault(),B(1);return}if(n.target.closest("[data-close]")){n.preventDefault(),re();return}let L=n.target.closest("[data-open]");if(L){n.preventDefault(),H(L.dataset.open);return}let T=n.target.closest(".acard");if(T?.dataset.id){H(T.dataset.id);return}n.target.closest("[data-week-jump]")&&(o.tab!=="season"&&le("season"),setTimeout(()=>u("#leisureWeek",e)?.scrollIntoView({behavior:"smooth",block:"start"}),60))}),a?.query?.random&&(Se(),setTimeout(()=>ce(),180)),()=>{clearTimeout(F),document.documentElement.classList.remove("leisure-modal-open")}}};export{et as default};
