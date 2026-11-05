import{a as Ve}from"./chunk-L72EZ7PG.js";var hr=Object.defineProperty,mp=Object.getOwnPropertyDescriptor,gp=Object.getOwnPropertyNames,_p=Object.prototype.hasOwnProperty,yp=(e=>typeof Ve<"u"?Ve:typeof Proxy<"u"?new Proxy(e,{get:(t,i)=>(typeof Ve<"u"?Ve:t)[i]}):e)(function(e){if(typeof Ve<"u")return Ve.apply(this,arguments);throw Error('Dynamic require of "'+e+'" is not supported')}),E=(e,t,i)=>()=>{if(i)throw i[0];try{return e&&(t=e(e=0)),t}catch(r){throw i=[r],r}},St=(e,t)=>{for(var i in t)hr(e,i,{get:t[i],enumerable:!0})},$p=(e,t,i,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of gp(t))!_p.call(e,a)&&a!==i&&hr(e,a,{get:()=>t[a],enumerable:!(r=mp(t,a))||r.enumerable});return e},Zt=e=>$p(hr({},"__esModule",{value:!0}),e),lt,De,st,Vr,Eo,Co=E(()=>{"use strict";lt=new Map,De=[],st=(e,t,i)=>{if(t&&typeof t.init=="function"&&typeof t.createInferenceSessionHandler=="function"){let r=lt.get(e);if(r===void 0)lt.set(e,{backend:t,priority:i});else{if(r.priority>i)return;if(r.priority===i&&r.backend!==t)throw new Error(`cannot register backend "${e}" using priority ${i}`)}if(i>=0){let a=De.indexOf(e);a!==-1&&De.splice(a,1);for(let s=0;s<De.length;s++)if(lt.get(De[s]).priority<=i){De.splice(s,0,e);return}De.push(e)}return}throw new TypeError("not a valid backend")},Vr=async e=>{let t=lt.get(e);if(!t)return"backend not found.";if(t.initialized)return t.backend;if(t.aborted)return t.error;{let i=!!t.initPromise;try{return i||(t.initPromise=t.backend.init(e)),await t.initPromise,t.initialized=!0,t.backend}catch(r){return i||(t.error=`${r}`,t.aborted=!0),t.error}finally{delete t.initPromise}}},Eo=async e=>{let t=e.executionProviders||[],i=t.map(u=>typeof u=="string"?u:u.name),r=i.length===0?De:i,a,s=[],n=new Set;for(let u of r){let l=await Vr(u);typeof l=="string"?s.push({name:u,err:l}):(a||(a=l),a===l&&n.add(u))}if(!a)throw new Error(`no available backend found. ERR: ${s.map(u=>`[${u.name}] ${u.err}`).join(", ")}`);for(let{name:u,err:l}of s)i.includes(u)&&console.warn(`removing requested execution provider "${u}" from session options because it is not available: ${l}`);let o=t.filter(u=>n.has(typeof u=="string"?u:u.name));return[a,new Proxy(e,{get:(u,l)=>l==="executionProviders"?o:Reflect.get(u,l)})]}}),wp=E(()=>{"use strict";Co()}),Oo,bp=E(()=>{"use strict";Oo="1.29.0"}),Yt,le,Bo=E(()=>{"use strict";bp(),Yt="warning",le={wasm:{},webgl:{},webgpu:{},versions:{common:Oo},set logLevel(e){if(e!==void 0){if(typeof e!="string"||["verbose","info","warning","error","fatal"].indexOf(e)===-1)throw new Error(`Unsupported logging level: ${e}`);Yt=e}},get logLevel(){return Yt}},Object.defineProperty(le,"logLevel",{enumerable:!0})}),ie,vp=E(()=>{"use strict";Bo(),ie=le}),Ro,Ao,xp=E(()=>{"use strict";Ro=(e,t)=>{let i=typeof document<"u"?document.createElement("canvas"):new OffscreenCanvas(1,1);i.width=e.dims[3],i.height=e.dims[2];let r=i.getContext("2d");if(r!=null){let a,s;t?.tensorLayout!==void 0&&t.tensorLayout==="NHWC"?(a=e.dims[2],s=e.dims[3]):(a=e.dims[3],s=e.dims[2]);let n=t?.format!==void 0?t.format:"RGB",o=t?.norm,u,l;o===void 0||o.mean===void 0?u=[255,255,255,255]:typeof o.mean=="number"?u=[o.mean,o.mean,o.mean,o.mean]:(u=[o.mean[0],o.mean[1],o.mean[2],0],o.mean[3]!==void 0&&(u[3]=o.mean[3])),o===void 0||o.bias===void 0?l=[0,0,0,0]:typeof o.bias=="number"?l=[o.bias,o.bias,o.bias,o.bias]:(l=[o.bias[0],o.bias[1],o.bias[2],0],o.bias[3]!==void 0&&(l[3]=o.bias[3]));let p=s*a,d=0,c=p,f=p*2,h=-1;n==="RGBA"?(d=0,c=p,f=p*2,h=p*3):n==="RGB"?(d=0,c=p,f=p*2):n==="RBG"&&(d=0,f=p,c=p*2);for(let g=0;g<s;g++)for(let y=0;y<a;y++){let _=(e.data[d++]-l[0])*u[0],m=(e.data[c++]-l[1])*u[1],w=(e.data[f++]-l[2])*u[2],$=h===-1?255:(e.data[h++]-l[3])*u[3];r.fillStyle="rgba("+_+","+m+","+w+","+$+")",r.fillRect(y,g,1,1)}if("toDataURL"in i)return i.toDataURL();throw new Error("toDataURL is not supported")}else throw new Error("Can not access image data")},Ao=(e,t)=>{let i=typeof document<"u"?document.createElement("canvas").getContext("2d"):new OffscreenCanvas(1,1).getContext("2d"),r;if(i!=null){let a,s,n;t?.tensorLayout!==void 0&&t.tensorLayout==="NHWC"?(a=e.dims[2],s=e.dims[1],n=e.dims[3]):(a=e.dims[3],s=e.dims[2],n=e.dims[1]);let o=t!==void 0&&t.format!==void 0?t.format:"RGB",u=t?.norm,l,p;u===void 0||u.mean===void 0?l=[255,255,255,255]:typeof u.mean=="number"?l=[u.mean,u.mean,u.mean,u.mean]:(l=[u.mean[0],u.mean[1],u.mean[2],255],u.mean[3]!==void 0&&(l[3]=u.mean[3])),u===void 0||u.bias===void 0?p=[0,0,0,0]:typeof u.bias=="number"?p=[u.bias,u.bias,u.bias,u.bias]:(p=[u.bias[0],u.bias[1],u.bias[2],0],u.bias[3]!==void 0&&(p[3]=u.bias[3]));let d=s*a;if(t!==void 0&&(t.format!==void 0&&n===4&&t.format!=="RGBA"||n===3&&t.format!=="RGB"&&t.format!=="BGR"))throw new Error("Tensor format doesn't match input tensor dims");let c=4,f=0,h=1,g=2,y=3,_=0,m=d,w=d*2,$=-1;o==="RGBA"?(_=0,m=d,w=d*2,$=d*3):o==="RGB"?(_=0,m=d,w=d*2):o==="RBG"&&(_=0,w=d,m=d*2),r=i.createImageData(a,s);for(let b=0;b<s*a;f+=c,h+=c,g+=c,y+=c,b++)r.data[f]=(e.data[_++]-p[0])*l[0],r.data[h]=(e.data[m++]-p[1])*l[1],r.data[g]=(e.data[w++]-p[2])*l[2],r.data[y]=$===-1?255:(e.data[$++]-p[3])*l[3]}else throw new Error("Can not access image data");return r}}),Tt,Do,Mo,Uo,Po,qo,kp=E(()=>{"use strict";fr(),Tt=(e,t)=>{if(e===void 0)throw new Error("Image buffer must be defined");if(t.height===void 0||t.width===void 0)throw new Error("Image height and width must be defined");if(t.tensorLayout==="NHWC")throw new Error("NHWC Tensor layout is not supported yet");let{height:i,width:r}=t,a=t.norm??{mean:255,bias:0},s,n;typeof a.mean=="number"?s=[a.mean,a.mean,a.mean,a.mean]:s=[a.mean[0],a.mean[1],a.mean[2],a.mean[3]??255],typeof a.bias=="number"?n=[a.bias,a.bias,a.bias,a.bias]:n=[a.bias[0],a.bias[1],a.bias[2],a.bias[3]??0];let o=t.format!==void 0?t.format:"RGBA",u=t.tensorFormat!==void 0&&t.tensorFormat!==void 0?t.tensorFormat:"RGB",l=i*r,p=u==="RGBA"?new Float32Array(l*4):new Float32Array(l*3),d=4,c=0,f=1,h=2,g=3,y=0,_=l,m=l*2,w=-1;o==="RGB"&&(d=3,c=0,f=1,h=2,g=-1),u==="RGBA"?w=l*3:u==="RBG"?(y=0,m=l,_=l*2):u==="BGR"&&(m=0,_=l,y=l*2);for(let $=0;$<l;$++,c+=d,h+=d,f+=d,g+=d)p[y++]=(e[c]+n[0])/s[0],p[_++]=(e[f]+n[1])/s[1],p[m++]=(e[h]+n[2])/s[2],w!==-1&&g!==-1&&(p[w++]=(e[g]+n[3])/s[3]);return u==="RGBA"?new ge("float32",p,[1,4,i,r]):new ge("float32",p,[1,3,i,r])},Do=async(e,t)=>{let i=typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement,r=typeof ImageData<"u"&&e instanceof ImageData,a=typeof ImageBitmap<"u"&&e instanceof ImageBitmap,s=typeof e=="string",n,o=t??{},u=()=>{if(typeof document<"u")return document.createElement("canvas");if(typeof OffscreenCanvas<"u")return new OffscreenCanvas(1,1);throw new Error("Canvas is not supported")},l=p=>typeof HTMLCanvasElement<"u"&&p instanceof HTMLCanvasElement||p instanceof OffscreenCanvas?p.getContext("2d"):null;if(i){let p=u();p.width=e.width,p.height=e.height;let d=l(p);if(d!=null){let c=e.height,f=e.width;if(t!==void 0&&t.resizedHeight!==void 0&&t.resizedWidth!==void 0&&(c=t.resizedHeight,f=t.resizedWidth),t!==void 0){if(o=t,t.tensorFormat!==void 0)throw new Error("Image input config format must be RGBA for HTMLImageElement");o.tensorFormat="RGBA",o.height=c,o.width=f}else o.tensorFormat="RGBA",o.height=c,o.width=f;d.drawImage(e,0,0),n=d.getImageData(0,0,f,c).data}else throw new Error("Can not access image data")}else if(r){let p,d;if(t!==void 0&&t.resizedWidth!==void 0&&t.resizedHeight!==void 0?(p=t.resizedHeight,d=t.resizedWidth):(p=e.height,d=e.width),t!==void 0&&(o=t),o.format="RGBA",o.height=p,o.width=d,t!==void 0){let c=u();c.width=d,c.height=p;let f=l(c);if(f!=null)f.putImageData(e,0,0),n=f.getImageData(0,0,d,p).data;else throw new Error("Can not access image data")}else n=e.data}else if(a){if(t===void 0)throw new Error("Please provide image config with format for Imagebitmap");let p=u();p.width=e.width,p.height=e.height;let d=l(p);if(d!=null){let c=e.height,f=e.width;return d.drawImage(e,0,0,f,c),n=d.getImageData(0,0,f,c).data,o.height=c,o.width=f,Tt(n,o)}else throw new Error("Can not access image data")}else{if(s)return new Promise((p,d)=>{let c=u(),f=l(c);if(!e||!f)return d();let h=new Image;h.crossOrigin="Anonymous",h.src=e,h.onload=()=>{c.width=h.width,c.height=h.height,f.drawImage(h,0,0,c.width,c.height);let g=f.getImageData(0,0,c.width,c.height);o.height=c.height,o.width=c.width,p(Tt(g.data,o))}});throw new Error("Input data provided is not supported - aborted tensor creation")}if(n!==void 0)return Tt(n,o);throw new Error("Input data provided is not supported - aborted tensor creation")},Mo=(e,t)=>{let{width:i,height:r,download:a,dispose:s}=t,n=[1,r,i,4];return new ge({location:"texture",type:"float32",texture:e,dims:n,download:a,dispose:s})},Uo=(e,t)=>{let{dataType:i,dims:r,download:a,dispose:s}=t;return new ge({location:"gpu-buffer",type:i??"float32",gpuBuffer:e,dims:r,download:a,dispose:s})},Po=(e,t)=>{let{dataType:i,dims:r,download:a,dispose:s}=t;return new ge({location:"ml-tensor",type:i??"float32",mlTensor:e,dims:r,download:a,dispose:s})},qo=(e,t,i)=>new ge({location:"cpu-pinned",type:e,data:t,dims:i??[t.length]})}),je,wt,Jt,No,Sp=E(()=>{"use strict";je=new Map([["float32",Float32Array],["uint8",Uint8Array],["int8",Int8Array],["uint16",Uint16Array],["int16",Int16Array],["int32",Int32Array],["bool",Uint8Array],["float64",Float64Array],["uint32",Uint32Array],["int4",Uint8Array],["uint4",Uint8Array]]),wt=new Map([[Float32Array,"float32"],[Uint8Array,"uint8"],[Int8Array,"int8"],[Uint16Array,"uint16"],[Int16Array,"int16"],[Int32Array,"int32"],[Float64Array,"float64"],[Uint32Array,"uint32"]]),Jt=!1,No=()=>{if(!Jt){Jt=!0;let e=typeof BigInt64Array<"u"&&BigInt64Array.from,t=typeof BigUint64Array<"u"&&BigUint64Array.from,i=globalThis.Float16Array,r=typeof i<"u"&&i.from;e&&(je.set("int64",BigInt64Array),wt.set(BigInt64Array,"int64")),t&&(je.set("uint64",BigUint64Array),wt.set(BigUint64Array,"uint64")),r?(je.set("float16",i),wt.set(i,"float16")):je.set("float16",Uint16Array)}}}),Lo,Vo,Tp=E(()=>{"use strict";fr(),Lo=e=>{let t=1;for(let i=0;i<e.length;i++){let r=e[i];if(typeof r!="number"||!Number.isSafeInteger(r))throw new TypeError(`dims[${i}] must be an integer, got: ${r}`);if(r<0)throw new RangeError(`dims[${i}] must be a non-negative integer, got: ${r}`);t*=r}return t},Vo=(e,t)=>{switch(e.location){case"cpu":return new ge(e.type,e.data,t);case"cpu-pinned":return new ge({location:"cpu-pinned",data:e.data,type:e.type,dims:t});case"texture":return new ge({location:"texture",texture:e.texture,type:e.type,dims:t});case"gpu-buffer":return new ge({location:"gpu-buffer",gpuBuffer:e.gpuBuffer,type:e.type,dims:t});case"ml-tensor":return new ge({location:"ml-tensor",mlTensor:e.mlTensor,type:e.type,dims:t});default:throw new Error(`tensorReshape: tensor location ${e.location} is not supported`)}}}),ge,fr=E(()=>{"use strict";xp(),kp(),Sp(),Tp(),ge=class{constructor(e,t,i){No();let r,a;if(typeof e=="object"&&"location"in e)switch(this.dataLocation=e.location,r=e.type,a=e.dims,e.location){case"cpu-pinned":{let n=je.get(r);if(!n)throw new TypeError(`unsupported type "${r}" to create tensor from pinned buffer`);if(!(e.data instanceof n))throw new TypeError(`buffer should be of type ${n.name}`);this.cpuData=e.data;break}case"texture":{if(r!=="float32")throw new TypeError(`unsupported type "${r}" to create tensor from texture`);this.gpuTextureData=e.texture,this.downloader=e.download,this.disposer=e.dispose;break}case"gpu-buffer":{if(r!=="float32"&&r!=="float16"&&r!=="int32"&&r!=="int64"&&r!=="uint32"&&r!=="uint8"&&r!=="bool"&&r!=="uint4"&&r!=="int4")throw new TypeError(`unsupported type "${r}" to create tensor from gpu buffer`);this.gpuBufferData=e.gpuBuffer,this.downloader=e.download,this.disposer=e.dispose;break}case"ml-tensor":{if(r!=="float32"&&r!=="float16"&&r!=="int32"&&r!=="int64"&&r!=="uint32"&&r!=="uint64"&&r!=="int8"&&r!=="uint8"&&r!=="bool"&&r!=="uint4"&&r!=="int4")throw new TypeError(`unsupported type "${r}" to create tensor from MLTensor`);this.mlTensorData=e.mlTensor,this.downloader=e.download,this.disposer=e.dispose;break}default:throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`)}else{let n,o;if(typeof e=="string")if(r=e,o=i,e==="string"){if(!Array.isArray(t))throw new TypeError("A string tensor's data must be a string array.");n=t}else{let u=je.get(e);if(u===void 0)throw new TypeError(`Unsupported tensor type: ${e}.`);if(Array.isArray(t)){if(e==="float16"&&u===Uint16Array||e==="uint4"||e==="int4")throw new TypeError(`Creating a ${e} tensor from number array is not supported. Please use ${u.name} as data.`);e==="uint64"||e==="int64"?n=u.from(t,BigInt):n=u.from(t)}else if(t instanceof u)n=t;else if(t instanceof Uint8ClampedArray)if(e==="uint8")n=Uint8Array.from(t);else throw new TypeError("A Uint8ClampedArray tensor's data must be type of uint8");else if(e==="float16"&&t instanceof Uint16Array&&u!==Uint16Array)n=new globalThis.Float16Array(t.buffer,t.byteOffset,t.length);else throw new TypeError(`A ${r} tensor's data must be type of ${u}`)}else if(o=t,Array.isArray(e)){if(e.length===0)throw new TypeError("Tensor type cannot be inferred from an empty array.");let u=typeof e[0];if(u==="string")r="string",n=e;else if(u==="boolean")r="bool",n=Uint8Array.from(e);else throw new TypeError(`Invalid element type of data array: ${u}.`)}else if(e instanceof Uint8ClampedArray)r="uint8",n=Uint8Array.from(e);else{let u=wt.get(e.constructor);if(u===void 0)throw new TypeError(`Unsupported type for tensor data: ${e.constructor}.`);r=u,n=e}if(o===void 0)o=[n.length];else if(!Array.isArray(o))throw new TypeError("A tensor's dims must be a number array");a=o,this.cpuData=n,this.dataLocation="cpu"}let s=Lo(a);if(this.cpuData&&s!==this.cpuData.length&&!((r==="uint4"||r==="int4")&&Math.ceil(s/2)===this.cpuData.length))throw new Error(`Tensor's size(${s}) does not match data length(${this.cpuData.length}).`);this.type=r,this.dims=a,this.size=s}static async fromImage(e,t){return Do(e,t)}static fromTexture(e,t){return Mo(e,t)}static fromGpuBuffer(e,t){return Uo(e,t)}static fromMLTensor(e,t){return Po(e,t)}static fromPinnedBuffer(e,t,i){return qo(e,t,i)}toDataURL(e){return Ro(this,e)}toImageData(e){return Ao(this,e)}get data(){if(this.ensureValid(),!this.cpuData)throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");return this.cpuData}get location(){return this.dataLocation}get texture(){if(this.ensureValid(),!this.gpuTextureData)throw new Error("The data is not stored as a WebGL texture.");return this.gpuTextureData}get gpuBuffer(){if(this.ensureValid(),!this.gpuBufferData)throw new Error("The data is not stored as a WebGPU buffer.");return this.gpuBufferData}get mlTensor(){if(this.ensureValid(),!this.mlTensorData)throw new Error("The data is not stored as a WebNN MLTensor.");return this.mlTensorData}async getData(e){switch(this.ensureValid(),this.dataLocation){case"cpu":case"cpu-pinned":return this.data;case"texture":case"gpu-buffer":case"ml-tensor":{if(!this.downloader)throw new Error("The current tensor is not created with a specified data downloader.");if(this.isDownloading)throw new Error("The current tensor is being downloaded.");try{this.isDownloading=!0;let t=await this.downloader();return this.downloader=void 0,this.dataLocation="cpu",this.cpuData=t,e&&this.disposer&&(this.disposer(),this.disposer=void 0),t}finally{this.isDownloading=!1}}default:throw new Error(`cannot get data from location: ${this.dataLocation}`)}}dispose(){if(this.isDownloading)throw new Error("The current tensor is being downloaded.");this.disposer&&(this.disposer(),this.disposer=void 0),this.cpuData=void 0,this.gpuTextureData=void 0,this.gpuBufferData=void 0,this.mlTensorData=void 0,this.downloader=void 0,this.isDownloading=void 0,this.dataLocation="none"}ensureValid(){if(this.dataLocation==="none")throw new Error("The tensor is disposed.")}reshape(e){if(this.ensureValid(),this.downloader||this.disposer)throw new Error("Cannot reshape a tensor that owns GPU resource.");return Vo(this,e)}}}),ze,Go=E(()=>{"use strict";fr(),ze=ge}),Vt,ei,Ee,Te,Xe,Ye,Wo=E(()=>{"use strict";Bo(),Vt=(e,t)=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.timeStamp(`${e}::ORT::${t}`)},ei=(e,t)=>{let i=new Error().stack?.split(/\r\n|\r|\n/g)||[],r=!1;for(let a=0;a<i.length;a++){if(r&&!i[a].includes("TRACE_FUNC")){let s=`FUNC_${e}::${i[a].trim().split(" ")[1]}`;t&&(s+=`::${t}`),Vt("CPU",s);return}i[a].includes("TRACE_FUNC")&&(r=!0)}},Ee=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||ei("BEGIN",e)},Te=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||ei("END",e)},Xe=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.time(`ORT::${e}`)},Ye=e=>{(typeof le.trace>"u"?!le.wasm.trace:!le.trace)||console.timeEnd(`ORT::${e}`)}}),Fo,Ip=E(()=>{"use strict";Co(),Go(),Wo(),Fo=class Ho{constructor(t){this.handler=t}async run(t,i,r){Ee(),Xe("InferenceSession.run");let a={},s={};if(typeof t!="object"||t===null||t instanceof ze||Array.isArray(t))throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");let n=!0;if(typeof i=="object"){if(i===null)throw new TypeError("Unexpected argument[1]: cannot be null.");if(i instanceof ze)throw new TypeError("'fetches' cannot be a Tensor");if(Array.isArray(i)){if(i.length===0)throw new TypeError("'fetches' cannot be an empty array.");n=!1;for(let l of i){if(typeof l!="string")throw new TypeError("'fetches' must be a string array or an object.");if(this.outputNames.indexOf(l)===-1)throw new RangeError(`'fetches' contains invalid output name: ${l}.`);a[l]=null}if(typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else{let l=!1,p=Object.getOwnPropertyNames(i);for(let d of this.outputNames)if(p.indexOf(d)!==-1){let c=i[d];(c===null||c instanceof ze)&&(l=!0,n=!1,a[d]=c)}if(l){if(typeof r=="object"&&r!==null)s=r;else if(typeof r<"u")throw new TypeError("'options' must be an object.")}else s=i}}else if(typeof i<"u")throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");for(let l of this.inputNames)if(typeof t[l]>"u")throw new Error(`input '${l}' is missing in 'feeds'.`);if(n)for(let l of this.outputNames)a[l]=null;let o=await this.handler.run(t,a,s),u={};for(let l in o)if(Object.hasOwnProperty.call(o,l)){let p=o[l];p instanceof ze?u[l]=p:u[l]=new ze(p.type,p.data,p.dims)}return Ye("InferenceSession.run"),Te(),u}async release(){return this.handler.dispose()}static async create(t,i,r,a){Ee(),Xe("InferenceSession.create");let s,n={};if(typeof t=="string"){if(s=t,typeof i=="object"&&i!==null)n=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof Uint8Array){if(s=t,typeof i=="object"&&i!==null)n=i;else if(typeof i<"u")throw new TypeError("'options' must be an object.")}else if(t instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&t instanceof SharedArrayBuffer){let p=t,d=0,c=t.byteLength;if(typeof i=="object"&&i!==null)n=i;else if(typeof i=="number"){if(d=i,!Number.isSafeInteger(d))throw new RangeError("'byteOffset' must be an integer.");if(d<0||d>=p.byteLength)throw new RangeError(`'byteOffset' is out of range [0, ${p.byteLength}).`);if(c=t.byteLength-d,typeof r=="number"){if(c=r,!Number.isSafeInteger(c))throw new RangeError("'byteLength' must be an integer.");if(c<=0||d+c>p.byteLength)throw new RangeError(`'byteLength' is out of range (0, ${p.byteLength-d}].`);if(typeof a=="object"&&a!==null)n=a;else if(typeof a<"u")throw new TypeError("'options' must be an object.")}else if(typeof r<"u")throw new TypeError("'byteLength' must be a number.")}else if(typeof i<"u")throw new TypeError("'options' must be an object.");s=new Uint8Array(p,d,c)}else throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");let[o,u]=await Eo(n),l=await o.createInferenceSessionHandler(s,u);return Ye("InferenceSession.create"),Te(),new Ho(l)}startProfiling(){this.handler.startProfiling()}endProfiling(){this.handler.endProfiling()}get inputNames(){return this.handler.inputNames}get outputNames(){return this.handler.outputNames}get inputMetadata(){return this.handler.inputMetadata}get outputMetadata(){return this.handler.outputMetadata}}}),Ko,zp=E(()=>{"use strict";Ip(),Ko=Fo}),Ep=E(()=>{"use strict"}),Cp=E(()=>{"use strict"}),Op=E(()=>{"use strict"}),Bp=E(()=>{"use strict"}),jo={};St(jo,{InferenceSession:()=>Ko,TRACE:()=>Vt,TRACE_EVENT_BEGIN:()=>Xe,TRACE_EVENT_END:()=>Ye,TRACE_FUNC_BEGIN:()=>Ee,TRACE_FUNC_END:()=>Te,Tensor:()=>ze,env:()=>ie,registerBackend:()=>st});var $e=E(()=>{"use strict";wp(),vp(),zp(),Go(),Ep(),Cp(),Wo(),Op(),Bp()}),mr=E(()=>{"use strict"}),Qo={};St(Qo,{default:()=>Zo});var ti,ii,Zo,Rp=E(()=>{"use strict";tp(),it(),_r(),ti="ort-wasm-proxy-worker",ii=globalThis.self?.name===ti,ii&&(self.onmessage=e=>{let{type:t,in:i}=e.data;try{switch(t){case"init-wasm":yr(i.wasm).then(()=>{Dr(i).then(()=>{postMessage({type:t})},r=>{postMessage({type:t,err:r})})},r=>{postMessage({type:t,err:r})});break;case"init-ep":{let{epName:r,env:a}=i;Mr(a,r).then(()=>{postMessage({type:t})},s=>{postMessage({type:t,err:s})});break}case"copy-from":{let{buffer:r}=i,a=Qt(r);postMessage({type:t,out:a});break}case"create":{let{model:r,options:a}=i;Ur(r,a).then(s=>{postMessage({type:t,out:s})},s=>{postMessage({type:t,err:s})});break}case"release":Pr(i),postMessage({type:t});break;case"run":{let{sessionId:r,inputIndices:a,inputs:s,outputIndices:n,options:o}=i;qr(r,a,s,n,new Array(n.length).fill(null),o).then(u=>{u.some(l=>l[3]!=="cpu")?postMessage({type:t,err:"Proxy does not support non-cpu tensor location."}):postMessage({type:t,out:u},Lr([...s,...u]))},u=>{postMessage({type:t,err:u})});break}case"end-profiling":Nr(i),postMessage({type:t});break;default:}}catch(r){postMessage({type:t,err:r})}}),Zo=ii?null:e=>new Worker(e??me,{type:"module",name:ti})}),ri,Gr,Wr,me,gr,It,Fr,Hr,ai,Kr,si,Xo,ni,Yo,_r=E(()=>{"use strict";mr(),ri=typeof location>"u"?void 0:location.origin,Gr=import.meta.url>"file:"&&import.meta.url<"file;",Wr=()=>{if(Gr){let e=URL;return new URL(new e("ort.min.mjs",import.meta.url).href,ri).href}return import.meta.url},me=Wr(),gr=()=>{if(me&&!me.startsWith("blob:"))return me.substring(0,me.lastIndexOf("/")+1)},It=(e,t)=>{try{let i=t??me;return(i?new URL(e,i):new URL(e)).origin===ri}catch{return!1}},Fr=(e,t)=>{let i=t??me;try{return(i?new URL(e,i):new URL(e)).href}catch{return}},Hr=(e,t)=>`${t??"./"}${e}`,ai=async e=>{let t=await(await fetch(e,{credentials:"same-origin"})).blob();return URL.createObjectURL(t)},Kr=async e=>(await import(e)).default,si=(Rp(),Zt(Qo)).default,Xo=async()=>{if(!me)throw new Error("Failed to load proxy worker: cannot determine the script source URL.");if(It(me))return[void 0,si()];let e=await ai(me);return[e,si(e)]},ni=void 0,Yo=async(e,t,i,r)=>{let a=ni&&!(e||t);if(a)if(me)a=It(me)||r&&!i;else if(r&&!i)a=!0;else throw new Error("cannot determine the script source URL.");if(a)return[void 0,ni];{let s="ort-wasm-simd-threaded.jsep.mjs",n=e??Fr(s,t),o=i&&n&&!It(n,t),u=o?await ai(n):n??Hr(s,t);return[o?u:void 0,await Kr(u)]}}}),oi,zt,dt,ui,jr,Qr,Zr,yr,te,it=E(()=>{"use strict";_r(),zt=!1,dt=!1,ui=!1,jr=()=>{if(typeof SharedArrayBuffer>"u")return!1;try{return typeof MessageChannel<"u"&&new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)),WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]))}catch{return!1}},Qr=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,30,1,28,0,65,0,253,15,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,253,186,1,26,11]))}catch{return!1}},Zr=()=>{try{return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,19,1,17,0,65,1,253,15,65,2,253,15,65,3,253,15,253,147,2,11]))}catch{return!1}},yr=async e=>{if(zt)return Promise.resolve();if(dt)throw new Error("multiple calls to 'initializeWebAssembly()' detected.");if(ui)throw new Error("previous call to 'initializeWebAssembly()' failed.");dt=!0;let t=e.initTimeout,i=e.numThreads;if(e.simd!==!1){if(e.simd==="relaxed"){if(!Zr())throw new Error("Relaxed WebAssembly SIMD is not supported in the current environment.")}else if(!Qr())throw new Error("WebAssembly SIMD is not supported in the current environment.")}let r=jr();i>1&&!r&&(typeof self<"u"&&!self.crossOriginIsolated&&console.warn("env.wasm.numThreads is set to "+i+", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."),console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."),e.numThreads=i=1);let a=e.wasmPaths,s=typeof a=="string"?a:void 0,n=a?.mjs,o=n?.href??n,u=a?.wasm,l=u?.href??u,p=e.wasmBinary,[d,c]=await Yo(o,s,i>1,!!p||!!l),f=!1,h=[];if(t>0&&h.push(new Promise(g=>{setTimeout(()=>{f=!0,g()},t)})),h.push(new Promise((g,y)=>{let _={numThreads:i};if(p)_.wasmBinary=p,_.locateFile=m=>m;else if(l||s)_.locateFile=m=>l??s+m;else if(o&&o.indexOf("blob:")!==0)_.locateFile=m=>new URL(m,o).href;else if(d){let m=gr();m&&(_.locateFile=w=>m+w)}c(_).then(m=>{dt=!1,zt=!0,oi=m,g(),d&&URL.revokeObjectURL(d)},m=>{dt=!1,ui=!0,y(m)})})),await Promise.race(h),f)throw new Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`)},te=()=>{if(zt&&oi)return oi;throw new Error("WebAssembly is not initialized yet.")}}),Se,Gt,J,$r=E(()=>{"use strict";it(),Se=(e,t)=>{let i=te(),r=i.lengthBytesUTF8(e)+1,a=i._malloc(r);return i.stringToUTF8(e,a,r),t.push(a),a},Gt=(e,t,i,r)=>{if(typeof e=="object"&&e!==null){if(i.has(e))throw new Error("Circular reference in options");i.add(e)}Object.entries(e).forEach(([a,s])=>{let n=t?t+a:a;if(typeof s=="object")Gt(s,n+".",i,r);else if(typeof s=="string"||typeof s=="number")r(n,s.toString());else if(typeof s=="boolean")r(n,s?"1":"0");else throw new Error(`Can't handle extra config type: ${typeof s}`)})},J=e=>{let t=te(),i=t.stackSave();try{let r=t.PTR_SIZE,a=t.stackAlloc(2*r);t._OrtGetLastError(a,a+r);let s=Number(t.getValue(a,r===4?"i32":"i64")),n=t.getValue(a+r,"*"),o=n?t.UTF8ToString(n):"";throw new Error(`${e} ERROR_CODE: ${s}, ERROR_MESSAGE: ${o}`)}finally{t.stackRestore(i)}}}),Jo,Ap=E(()=>{"use strict";it(),$r(),Jo=e=>{let t=te(),i=0,r=[],a=e||{};try{if(e?.logSeverityLevel===void 0)a.logSeverityLevel=2;else if(typeof e.logSeverityLevel!="number"||!Number.isInteger(e.logSeverityLevel)||e.logSeverityLevel<0||e.logSeverityLevel>4)throw new Error(`log severity level is not valid: ${e.logSeverityLevel}`);if(e?.logVerbosityLevel===void 0)a.logVerbosityLevel=0;else if(typeof e.logVerbosityLevel!="number"||!Number.isInteger(e.logVerbosityLevel))throw new Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);e?.terminate===void 0&&(a.terminate=!1);let s=0;return e?.tag!==void 0&&(s=Se(e.tag,r)),i=t._OrtCreateRunOptions(a.logSeverityLevel,a.logVerbosityLevel,!!a.terminate,s),i===0&&J("Can't create run options."),e?.extra!==void 0&&Gt(e.extra,"",new WeakSet,(n,o)=>{let u=Se(n,r),l=Se(o,r);t._OrtAddRunConfigEntry(i,u,l)!==0&&J(`Can't set a run config entry: ${n} - ${o}.`)}),[i,r]}catch(s){throw i!==0&&t._OrtReleaseRunOptions(i),r.forEach(n=>t._free(n)),s}}}),Xr,Yr,Jr,Ge,ea,eu,Dp=E(()=>{"use strict";it(),$r(),Xr=e=>{switch(e){case"disabled":return 0;case"basic":return 1;case"extended":return 2;case"layout":return 3;case"all":return 99;default:throw new Error(`unsupported graph optimization level: ${e}`)}},Yr=e=>{switch(e){case"sequential":return 0;case"parallel":return 1;default:throw new Error(`unsupported execution mode: ${e}`)}},Jr=e=>{e.extra||(e.extra={}),e.extra.session||(e.extra.session={});let t=e.extra.session;t.use_ort_model_bytes_directly||(t.use_ort_model_bytes_directly="1"),e.executionProviders&&e.executionProviders.some(i=>(typeof i=="string"?i:i.name)==="webgpu")&&(e.enableMemPattern=!1)},Ge=(e,t,i,r)=>{let a=Se(t,r),s=Se(i,r);te()._OrtAddSessionConfigEntry(e,a,s)!==0&&J(`Can't set a session config entry: ${t} - ${i}.`)},ea=async(e,t,i)=>{let r=t.executionProviders;for(let a of r){let s=typeof a=="string"?a:a.name,n=[];switch(s){case"webnn":if(s="WEBNN",Ge(e,"session.disable_quant_qdq","1",i),Ge(e,"session.disable_qdq_constant_folding","1",i),typeof a!="string"){let d=a?.deviceType;d&&Ge(e,"deviceType",d,i)}break;case"webgpu":if(s="JS",typeof a!="string"){let d=a;if(d?.preferredLayout){if(d.preferredLayout!=="NCHW"&&d.preferredLayout!=="NHWC")throw new Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${d.preferredLayout}`);Ge(e,"preferredLayout",d.preferredLayout,i)}}break;case"wasm":case"cpu":continue;default:throw new Error(`not supported execution provider: ${s}`)}let o=Se(s,i),u=n.length,l=0,p=0;if(u>0){l=te()._malloc(u*te().PTR_SIZE),i.push(l),p=te()._malloc(u*te().PTR_SIZE),i.push(p);for(let d=0;d<u;d++)te().setValue(l+d*te().PTR_SIZE,n[d][0],"*"),te().setValue(p+d*te().PTR_SIZE,n[d][1],"*")}await te()._OrtAppendExecutionProvider(e,o,l,p,u)!==0&&J(`Can't append execution provider: ${s}.`)}},eu=async e=>{let t=te(),i=0,r=[],a=e||{};Jr(a);try{let s=Xr(a.graphOptimizationLevel??"all"),n=Yr(a.executionMode??"sequential"),o=typeof a.logId=="string"?Se(a.logId,r):0,u=a.logSeverityLevel??2;if(!Number.isInteger(u)||u<0||u>4)throw new Error(`log severity level is not valid: ${u}`);let l=a.logVerbosityLevel??0;if(!Number.isInteger(l)||l<0||l>4)throw new Error(`log verbosity level is not valid: ${l}`);let p=typeof a.optimizedModelFilePath=="string"?Se(a.optimizedModelFilePath,r):0;if(i=t._OrtCreateSessionOptions(s,!!a.enableCpuMemArena,!!a.enableMemPattern,n,!!a.enableProfiling,0,o,u,l,p),i===0&&J("Can't create session options."),a.executionProviders&&await ea(i,a,r),a.enableGraphCapture!==void 0){if(typeof a.enableGraphCapture!="boolean")throw new Error(`enableGraphCapture must be a boolean value: ${a.enableGraphCapture}`);Ge(i,"enableGraphCapture",a.enableGraphCapture.toString(),r)}if(a.freeDimensionOverrides)for(let[d,c]of Object.entries(a.freeDimensionOverrides)){if(typeof d!="string")throw new Error(`free dimension override name must be a string: ${d}`);if(typeof c!="number"||!Number.isInteger(c)||c<0)throw new Error(`free dimension override value must be a non-negative integer: ${c}`);let f=Se(d,r);t._OrtAddFreeDimensionOverride(i,f,c)!==0&&J(`Can't set a free dimension override: ${d} - ${c}.`)}return a.extra!==void 0&&Gt(a.extra,"",new WeakSet,(d,c)=>{Ge(i,d,c,r)}),[i,r]}catch(s){throw i!==0&&t._OrtReleaseSessionOptions(i)!==0&&J("Can't release session options."),r.forEach(n=>t._free(n)),s}}}),Qe,Re,Ze,Xt,Wt,wr,br,Ji,N=E(()=>{"use strict";Qe=e=>{switch(e){case"int8":return 3;case"uint8":return 2;case"bool":return 9;case"int16":return 5;case"uint16":return 4;case"int32":return 6;case"uint32":return 12;case"float16":return 10;case"float32":return 1;case"float64":return 11;case"string":return 8;case"int64":return 7;case"uint64":return 13;case"int4":return 22;case"uint4":return 21;default:throw new Error(`unsupported data type: ${e}`)}},Re=e=>{switch(e){case 3:return"int8";case 2:return"uint8";case 9:return"bool";case 5:return"int16";case 4:return"uint16";case 6:return"int32";case 12:return"uint32";case 10:return"float16";case 1:return"float32";case 11:return"float64";case 8:return"string";case 7:return"int64";case 13:return"uint64";case 22:return"int4";case 21:return"uint4";default:throw new Error(`unsupported data type: ${e}`)}},Ze=(e,t)=>{let i=[-1,4,1,1,2,2,4,8,-1,1,2,8,4,8,-1,-1,-1,-1,-1,-1,-1,.5,.5][e],r=typeof t=="number"?t:t.reduce((a,s)=>a*s,1);return i>0?Math.ceil(r*i):void 0},Xt=e=>{switch(e){case"float16":return typeof Float16Array<"u"?Float16Array:Uint16Array;case"float32":return Float32Array;case"uint8":return Uint8Array;case"int8":return Int8Array;case"uint16":return Uint16Array;case"int16":return Int16Array;case"int32":return Int32Array;case"bool":return Uint8Array;case"float64":return Float64Array;case"uint32":return Uint32Array;case"int64":return BigInt64Array;case"uint64":return BigUint64Array;default:throw new Error(`unsupported type: ${e}`)}},Wt=e=>{switch(e){case"verbose":return 0;case"info":return 1;case"warning":return 2;case"error":return 3;case"fatal":return 4;default:throw new Error(`unsupported logging level: ${e}`)}},wr=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint8"||e==="bool"||e==="uint4"||e==="int4",br=e=>e==="float32"||e==="float16"||e==="int32"||e==="int64"||e==="uint32"||e==="uint64"||e==="int8"||e==="uint8"||e==="bool"||e==="uint4"||e==="int4",Ji=e=>{switch(e){case"none":return 0;case"cpu":return 1;case"cpu-pinned":return 2;case"texture":return 3;case"gpu-buffer":return 4;case"ml-tensor":return 5;default:throw new Error(`unsupported data location: ${e}`)}}}),vr,tu=E(()=>{"use strict";mr(),vr=async e=>{if(typeof e=="string"){let t=await fetch(e);if(!t.ok)throw new Error(`failed to load external data file: ${e}`);let i=t.headers.get("Content-Length"),r=i?parseInt(i,10):0;if(r<1073741824)return new Uint8Array(await t.arrayBuffer());{if(!t.body)throw new Error(`failed to load external data file: ${e}, no response body.`);let a=t.body.getReader(),s;try{s=new ArrayBuffer(r)}catch(o){if(o instanceof RangeError){let u=Math.ceil(r/65536);s=new WebAssembly.Memory({initial:u,maximum:u}).buffer}else throw o}let n=0;for(;;){let{done:o,value:u}=await a.read();if(o)break;let l=u.byteLength;new Uint8Array(s,n,l).set(u),n+=l}return new Uint8Array(s,0,r)}}else return e instanceof Blob?new Uint8Array(await e.arrayBuffer()):e instanceof Uint8Array?e:new Uint8Array(e)}}),ta,ia,ra,aa,xr,sa,Q,Ae=E(()=>{"use strict";N(),ta=["V","I","W","E","F"],ia=(e,t)=>{console.log(`[${ta[e]},${new Date().toISOString()}]${t}`)},xr=(e,t)=>{ra=e,aa=t},sa=(e,t)=>{let i=Wt(e),r=Wt(ra);i>=r&&ia(i,typeof t=="function"?t():t)},Q=(...e)=>{aa&&sa(...e)}}),na,ot,k,Ft,iu,ru,au,W=E(()=>{"use strict";na=class{static calcMatMulShape(e,t){return e[1]!==t[0]?void 0:[e[0],t[1]]}},ot=class{static calcShape(e,t,i=!1){let r=e.length,a=t.length;if(r===0)return t;if(a===0)return e;let s=Math.max(e.length,t.length),n=new Array(s);if(i){if(r<2||a<2)return;let o=na.calcMatMulShape([e[r-2],e[r-1]],[t[a-2],t[a-1]]);if(o===void 0)return;[n[s-2],n[s-1]]=o}for(let o=i?3:1;o<=s;o++){let u=r-o<0?1:e[r-o],l=a-o<0?1:t[a-o];if(u!==l&&u>1&&l>1)return;let p=Math.max(u,l);if(u&&l)n[s-o]=Math.max(u,l);else{if(p>1)return;n[s-o]=0}}return n}static isValidBroadcast(e,t){let i=e.length,r=t.length;if(i>r)return!1;for(let a=1;a<=i;a++)if(e[i-a]!==1&&e[i-a]!==t[r-a])return!1;return!0}},k=class Nt{static size(t){return Nt.getSizeFromDimensionRange(t,0,t.length)}static convertShape(t,i=4){let r=t.length;if(r===0)return[];let a=new Array(r),s=r-1;for(;s>=0;){if(t[s]%i===0){a[s]=t[s]/i;break}if(i%t[s]!==0)throw new Error("cannot convert shape");a[s]=1,i/=t[s],s--}for(s--;s>=0;s--)a[s]=t[s];return a}static sizeFromDimension(t,i){if(i<0||i>t.length)throw new Error(`invalid dimension of ${i} for sizeFromDimension as Tensor has ${t.length} dimensions.`);return Nt.getSizeFromDimensionRange(t,i,t.length)}static sizeToDimension(t,i){if(i<0||i>t.length)throw new Error(`invalid dimension of ${i} for sizeToDimension as Tensor has ${t.length} dimensions.`);return Nt.getSizeFromDimensionRange(t,0,i)}static getSizeFromDimensionRange(t,i,r){let a=1;for(let s=i;s<r;s++){if(t[s]<0)throw new Error("cannot get valid size from specified dimension range. Most likely the range contains negative values in them.");a*=Number(t[s])}return a}static computeStrides(t){let i=t.length;if(i===0)return[];if(i===1)return[1];let r=new Array(i);r[i-1]=1,r[i-2]=t[i-1];for(let a=i-3;a>=0;--a)r[a]=r[a+1]*t[a+1];return r}static normalizeAxis(t,i){if(t<-i&&t>=i)throw new Error("unsupported axis for this operation.");return t<0?t+i:t}static normalizeAxes(t,i){return t.map(r=>this.normalizeAxis(r,i??t.length))}static sortBasedOnPerm(t,i){return i?i.map(r=>t[r]):t.slice().reverse()}static padShape(t,i){let r=t.length;return t.map((a,s)=>a+i[s]+i[s+r])}static areEqual(t,i){return t.length!==i.length?!1:t.every((r,a)=>r===i[a])}},Ft=class qe{static adjustPoolAttributes(t,i,r,a,s,n){if(!t&&r.length!==i.length-2)throw new Error("length of specified kernel shapes should be 2 less than length of input dimensions");if(t)for(let o=0;o<i.length-2;o++)o>=r.length?r.push(i[o+2]):r[o]=i[o+2];for(let o=0;o<r.length;o++)if(o<a.length){if(a[o]<0)throw new Error("strides should be greater than or equal to 1")}else a.push(1);for(let o=0;o<r.length;o++)if(o<s.length){if(s[o]<0)throw new Error("dilations should be greater than or equal to 1")}else s.push(1);for(let o=0;o<r.length*2;o++)if(o<n.length){if(n[o]<0)throw new Error("pad should be greater than or equal to 1")}else n.push(0);for(let o=0;o<r.length;o++){if(r[o]<=0)throw new Error("kernel shapes need to be greater than 0");if(n[o]>=r[o]||n[o+r.length]>=r[o])throw new Error("pads should be smaller than kernel")}}static adjustPadsBasedOnAutoPad(t,i,r,a,s,n,o){if(o){if(s.length!==2*(t.length-2))throw new Error("length of pads should be twice the length of data dimensions");if(i.length!==t.length-2)throw new Error("length of strides should be the length of data dimensions");if(a.length!==t.length-2)throw new Error("length of kernel shapes should be the length of data dimensions");for(let u=0;u<t.length-2;u++)qe.adjustPadAndReturnShape(t[u+(n?1:2)],i[u],r[u],a[u],s,u,u+t.length-2,o)}}static computePoolOutputShape(t,i,r,a,s,n,o,u=0){if(i.length<=0)throw new Error("input shape must be of size greater than 0");let l=[i[0],i[1]];return qe.computeShapeHelper(t,i,l,r,a,s,n,o,u),l}static computeConvOutputShape(t,i,r,a,s,n,o){if(t.length<=0||i.length<=0)throw new Error("invalid input tensor dims or invalid filter tensor dims");let u=[t[0],i[0]];return qe.computeShapeHelper(!1,t,u,r,a,s,n,o),u}static computeShapeHelper(t,i,r,a,s,n,o,u,l=0){if(t)for(let p=0;p<i.length-2;p++)r.push(1);else for(let p=0;p<i.length-2;p++)r.push(qe.adjustPadAndReturnShape(i[p+2],a[p],s[p],n[p],o,p,p+i.length-2,u,l))}static computeOutputSize(t,i,r,a,s){let n=Math.floor(t/i)+1;return s===1&&(n=Math.ceil(t/i)+1,(n-1)*i>=r+a&&(n-=1)),n}static adjustPadAndReturnShape(t,i,r,a,s,n,o,u,l=0){let p=r*(a-1)+1;if(u&&u!=="NOTSET")switch(u){case"VALID":return s[n]=0,s[o]=0,qe.computeOutputSize(t-p,i,t,0,l);case"SAME_LOWER":case"SAME_UPPER":if(r!==1)throw new Error("Dilation not supported for SAME_UPPER or SAME_LOWER");{let d=(Math.floor((t+i-1)/i)-1)*i+a-t;return s[n]=Math.floor(u==="SAME_LOWER"?(d+1)/2:d/2),s[o]=d-s[n],qe.computeOutputSize(t+s[n]+s[o]-p,i,t,s[n],l)}default:throw new Error("Unsupported AutoPad type")}else return qe.computeOutputSize(t+s[n]+s[o]-p,i,t,s[n],l)}},iu=class{static getShapeOfGemmResult(e,t,i,r,a){if(e.length!==2||i.length!==2)throw new Error("shape need to be of size 2");let s,n,o;t?(s=e[1],n=e[0]):(s=e[0],n=e[1]);let u=-1;if(r?(o=i[0],u=1):(o=i[1],u=0),i[u]!==n)throw new Error("dimension mismatch");if(s<=0||o<=0||n<=0)throw new Error("invalid shape specified");if(a&&!ot.isValidBroadcast(a,[s,o]))throw new Error("gemm: invalid bias shape for broadcast");return[s,o,n]}},ru=-34028234663852886e22,au=34028234663852886e22}),kr,su=E(()=>{"use strict";N(),kr=(e,t)=>new(Xt(t))(e)}),li,oa,di,ua,pi,la,ci,hi,fi,da,nu,Mp=E(()=>{"use strict";N(),Ae(),li=new Map([["float32",32],["float16",16],["int32",32],["uint32",32],["int64",64],["uint64",64],["int8",8],["uint8",8],["int4",4],["uint4",4]]),oa=(e,t)=>{if(t==="int32")return e;let i=li.get(t);if(!i)throw new Error(`WebNN backend does not support data type: ${t}`);let r=i/8;if(e.byteLength%r!==0)throw new Error(`Invalid Uint8Array length - must be a multiple of ${r}.`);let a=e.byteLength/r,s=new(Xt(t))(e.buffer,e.byteOffset,a);switch(t){case"int64":case"uint64":{let n=new Int32Array(a);for(let o=0;o<a;o++){let u=s[o];if(u>2147483647n||u<-2147483648n)throw new Error("Can not convert int64 data to int32 - value out of range.");n[o]=Number(u)}return new Uint8Array(n.buffer)}case"int8":case"uint8":case"uint32":{if(t==="uint32"&&s.some(o=>o>2147483647))throw new Error("Can not convert uint32 data to int32 - value out of range.");let n=Int32Array.from(s,Number);return new Uint8Array(n.buffer)}default:throw new Error(`Unsupported data conversion from ${t} to 'int32'`)}},di=(e,t)=>{if(t==="int32")return e;if(e.byteLength%4!==0)throw new Error("Invalid Uint8Array length - must be a multiple of 4 (int32).");let i=e.byteLength/4,r=new Int32Array(e.buffer,e.byteOffset,i);switch(t){case"int64":{let a=BigInt64Array.from(r,BigInt);return new Uint8Array(a.buffer)}case"uint64":{if(r.some(s=>s<0))throw new Error("Can not convert int32 data to uin64 - negative value found.");let a=BigUint64Array.from(r,BigInt);return new Uint8Array(a.buffer)}case"int8":{if(r.some(s=>s<-128||s>127))throw new Error("Can not convert int32 data to int8 - value out of range.");let a=Int8Array.from(r,Number);return new Uint8Array(a.buffer)}case"uint8":{if(r.some(a=>a<0||a>255))throw new Error("Can not convert int32 data to uint8 - value out of range.");return Uint8Array.from(r,Number)}case"uint32":{if(r.some(s=>s<0))throw new Error("Can not convert int32 data to uint32 - negative value found.");let a=Uint32Array.from(r,Number);return new Uint8Array(a.buffer)}default:throw new Error(`Unsupported data conversion from 'int32' to ${t}`)}},ua=1,pi=()=>ua++,la=new Map([["int8","int32"],["uint8","int32"],["uint32","int32"],["int64","int32"]]),ci=(e,t)=>{let i=li.get(e);if(!i)throw new Error(`WebNN backend does not support data type: ${e}`);return t.length>0?Math.ceil(t.reduce((r,a)=>r*a)*i/8):0},hi=class{constructor(e){this.isDataConverted=!1;let{sessionId:t,context:i,tensor:r,dataType:a,shape:s,fallbackDataType:n}=e;this.sessionId=t,this.mlContext=i,this.mlTensor=r,this.dataType=a,this.tensorShape=s,this.fallbackDataType=n}get tensor(){return this.mlTensor}get type(){return this.dataType}get fallbackType(){return this.fallbackDataType}get shape(){return this.tensorShape}get byteLength(){return ci(this.dataType,this.tensorShape)}destroy(){Q("verbose",()=>"[WebNN] TensorWrapper.destroy"),this.mlTensor.destroy()}write(e){this.mlContext.writeTensor(this.mlTensor,e)}async read(e){if(this.fallbackDataType){let t=await this.mlContext.readTensor(this.mlTensor),i=di(new Uint8Array(t),this.dataType);if(e){(e instanceof ArrayBuffer?new Uint8Array(e):new Uint8Array(e.buffer,e.byteOffset,e.byteLength)).set(i);return}else return new Uint8Array(i).buffer}else return e?this.mlContext.readTensor(this.mlTensor,e):this.mlContext.readTensor(this.mlTensor)}canReuseTensor(e,t,i){return this.mlContext===e&&this.dataType===t&&this.tensorShape.length===i.length&&this.tensorShape.every((r,a)=>r===i[a])}setIsDataConverted(e){this.isDataConverted=e}},fi=class{constructor(e,t){this.tensorManager=e,this.wrapper=t}get tensorWrapper(){return this.wrapper}releaseTensor(){this.tensorWrapper&&(this.tensorManager.releaseTensor(this.tensorWrapper),this.wrapper=void 0)}async ensureTensor(e,t,i,r){let a=this.tensorManager.getMLContext(e),s=this.tensorManager.getMLOpSupportLimits(e),n;if(!s?.input.dataTypes.includes(t)){if(n=la.get(t),!n||s?.input.dataTypes.includes(n))throw new Error(`WebNN backend does not support data type: ${t}`);Q("verbose",()=>`[WebNN] TensorIdTracker.ensureTensor: fallback dataType from ${t} to ${n}`)}if(this.wrapper){if(this.wrapper.canReuseTensor(a,t,i))return this.wrapper.tensor;if(r){if(this.wrapper.byteLength!==ci(t,i))throw new Error("Unable to copy data to tensor with different size.");this.activeUpload=new Uint8Array(await this.wrapper.read())}this.tensorManager.releaseTensor(this.wrapper)}let o=typeof MLTensorUsage>"u"?void 0:MLTensorUsage.READ|MLTensorUsage.WRITE;return this.wrapper=await this.tensorManager.getCachedTensor(e,t,i,o,!0,!0,n),r&&this.activeUpload&&(this.wrapper.write(this.activeUpload),this.activeUpload=void 0),this.wrapper.tensor}upload(e){let t=e;if(this.wrapper){if(this.wrapper.fallbackType)if(this.wrapper.fallbackType==="int32")t=oa(e,this.wrapper.type),this.wrapper.setIsDataConverted(!0);else throw new Error(`Unsupported fallback data type: ${this.wrapper.fallbackType}`);if(e.byteLength===this.wrapper.byteLength){this.wrapper.write(t);return}else Q("verbose",()=>"Data size does not match tensor size. Releasing tensor."),this.releaseTensor()}this.activeUpload?this.activeUpload.set(t):this.activeUpload=new Uint8Array(t)}async download(e){if(this.activeUpload){let t=this.wrapper?.isDataConverted?di(this.activeUpload,this.wrapper?.type):this.activeUpload;if(e){e instanceof ArrayBuffer?new Uint8Array(e).set(t):new Uint8Array(e.buffer,e.byteOffset,e.byteLength).set(t);return}else return t.buffer}if(!this.wrapper)throw new Error("Tensor has not been created.");return e?this.wrapper.read(e):this.wrapper.read()}},da=class{constructor(e){this.backend=e,this.tensorTrackersById=new Map,this.freeTensors=[],this.externalTensors=new Set}getMLContext(e){let t=this.backend.getMLContext(e);if(!t)throw new Error("MLContext not found for session.");return t}getMLOpSupportLimits(e){return this.backend.getMLOpSupportLimits(e)}reserveTensorId(){let e=pi();return this.tensorTrackersById.set(e,new fi(this)),e}releaseTensorId(e){let t=this.tensorTrackersById.get(e);t&&(this.tensorTrackersById.delete(e),t.tensorWrapper&&this.releaseTensor(t.tensorWrapper))}async ensureTensor(e,t,i,r,a){Q("verbose",()=>`[WebNN] TensorManager.ensureTensor {tensorId: ${t}, dataType: ${i}, shape: ${r}, copyOld: ${a}}`);let s=this.tensorTrackersById.get(t);if(!s)throw new Error("Tensor not found.");return s.ensureTensor(e,i,r,a)}upload(e,t){let i=this.tensorTrackersById.get(e);if(!i)throw new Error("Tensor not found.");i.upload(t)}async download(e,t){Q("verbose",()=>`[WebNN] TensorManager.download {tensorId: ${e}, dstBuffer: ${t?.byteLength}}`);let i=this.tensorTrackersById.get(e);if(!i)throw new Error("Tensor not found.");return i.download(t)}releaseTensorsForSession(e){for(let t of this.freeTensors)t.sessionId===e&&t.destroy();this.freeTensors=this.freeTensors.filter(t=>t.sessionId!==e)}registerTensor(e,t,i,r){let a=this.getMLContext(e),s=pi(),n=new hi({sessionId:e,context:a,tensor:t,dataType:i,shape:r});return this.tensorTrackersById.set(s,new fi(this,n)),this.externalTensors.add(n),s}async getCachedTensor(e,t,i,r,a,s,n){let o=this.getMLContext(e);for(let[l,p]of this.freeTensors.entries())if(p.canReuseTensor(o,t,i)){Q("verbose",()=>`[WebNN] Reusing tensor {dataType: ${t}, ${n?`fallbackDataType: ${n},`:""} shape: ${i}`);let d=this.freeTensors.splice(l,1)[0];return d.sessionId=e,d}Q("verbose",()=>`[WebNN] MLContext.createTensor {dataType: ${t}, ${n?`fallbackDataType: ${n},`:""} shape: ${i}}`);let u=await o.createTensor({dataType:n??t,shape:i,dimensions:i,usage:r,writable:a,readable:s});return new hi({sessionId:e,context:o,tensor:u,dataType:t,shape:i,fallbackDataType:n})}releaseTensor(e){this.externalTensors.has(e)&&this.externalTensors.delete(e),this.freeTensors.push(e)}},nu=(...e)=>new da(...e)}),pt,pa,ou,Up=E(()=>{"use strict";N(),it(),su(),Mp(),Ae(),pt=new Map([[1,"float32"],[10,"float16"],[6,"int32"],[12,"uint32"],[7,"int64"],[13,"uint64"],[22,"int4"],[21,"uint4"],[3,"int8"],[2,"uint8"],[9,"uint8"]]),pa=(e,t)=>{if(e===t)return!0;if(e===void 0||t===void 0)return!1;let i=Object.keys(e).sort(),r=Object.keys(t).sort();return i.length===r.length&&i.every((a,s)=>a===r[s]&&e[a]===t[a])},ou=class{constructor(e){this.tensorManager=nu(this),this.mlContextBySessionId=new Map,this.sessionIdsByMLContext=new Map,this.mlContextCache=[],this.sessionGraphInputs=new Map,this.sessionGraphOutputs=new Map,this.temporaryGraphInputs=[],this.temporaryGraphOutputs=[],this.temporarySessionTensorIds=new Map,this.mlOpSupportLimitsBySessionId=new Map,xr(e.logLevel,!!e.debug)}get currentSessionId(){if(this.activeSessionId===void 0)throw new Error("No active session");return this.activeSessionId}onRunStart(e){Q("verbose",()=>`[WebNN] onRunStart {sessionId: ${e}}`),this.activeSessionId=e}onRunEnd(e){Q("verbose",()=>`[WebNN] onRunEnd {sessionId: ${e}}`);let t=this.temporarySessionTensorIds.get(e);if(t){for(let i of t)Q("verbose",()=>`[WebNN] releasing temporary tensor {tensorId: ${i}}`),this.tensorManager.releaseTensorId(i);this.temporarySessionTensorIds.delete(e),this.activeSessionId=void 0}}async createMLContext(e){if(e instanceof GPUDevice){let i=this.mlContextCache.findIndex(r=>r.gpuDevice===e);if(i!==-1)return this.mlContextCache[i].mlContext;{let r=await navigator.ml.createContext(e);return this.mlContextCache.push({gpuDevice:e,mlContext:r}),r}}else if(e===void 0){let i=this.mlContextCache.findIndex(r=>r.options===void 0&&r.gpuDevice===void 0);if(i!==-1)return this.mlContextCache[i].mlContext;{let r=await navigator.ml.createContext();return this.mlContextCache.push({mlContext:r}),r}}let t=this.mlContextCache.findIndex(i=>pa(i.options,e));if(t!==-1)return this.mlContextCache[t].mlContext;{let i=await navigator.ml.createContext(e);return this.mlContextCache.push({options:e,mlContext:i}),i}}registerMLContext(e,t){this.mlContextBySessionId.set(e,t);let i=this.sessionIdsByMLContext.get(t);i||(i=new Set,this.sessionIdsByMLContext.set(t,i)),i.add(e),this.mlOpSupportLimitsBySessionId.has(e)||this.mlOpSupportLimitsBySessionId.set(e,t.opSupportLimits()),this.temporaryGraphInputs.length>0&&(this.sessionGraphInputs.set(e,this.temporaryGraphInputs),this.temporaryGraphInputs=[]),this.temporaryGraphOutputs.length>0&&(this.sessionGraphOutputs.set(e,this.temporaryGraphOutputs),this.temporaryGraphOutputs=[])}onReleaseSession(e){this.sessionGraphInputs.delete(e),this.sessionGraphOutputs.delete(e);let t=this.mlContextBySessionId.get(e);if(!t)return;this.tensorManager.releaseTensorsForSession(e),this.mlContextBySessionId.delete(e),this.mlOpSupportLimitsBySessionId.delete(e);let i=this.sessionIdsByMLContext.get(t);if(i.delete(e),i.size===0){this.sessionIdsByMLContext.delete(t);let r=this.mlContextCache.findIndex(a=>a.mlContext===t);r!==-1&&this.mlContextCache.splice(r,1)}}getMLContext(e){return this.mlContextBySessionId.get(e)}getMLOpSupportLimits(e){return this.mlOpSupportLimitsBySessionId.get(e)}reserveTensorId(){return this.tensorManager.reserveTensorId()}releaseTensorId(e){Q("verbose",()=>`[WebNN] releaseTensorId {tensorId: ${e}}`),this.tensorManager.releaseTensorId(e)}async ensureTensor(e,t,i,r,a){let s=pt.get(i);if(!s)throw new Error(`Unsupported ONNX data type: ${i}`);return this.tensorManager.ensureTensor(e??this.currentSessionId,t,s,r,a)}async createTemporaryTensor(e,t,i){Q("verbose",()=>`[WebNN] createTemporaryTensor {onnxDataType: ${t}, shape: ${i}}`);let r=pt.get(t);if(!r)throw new Error(`Unsupported ONNX data type: ${t}`);let a=this.tensorManager.reserveTensorId();await this.tensorManager.ensureTensor(e,a,r,i,!1);let s=this.temporarySessionTensorIds.get(e);return s?s.push(a):this.temporarySessionTensorIds.set(e,[a]),a}uploadTensor(e,t){if(!te().shouldTransferToMLTensor)throw new Error("Trying to upload to a MLTensor while shouldTransferToMLTensor is false");Q("verbose",()=>`[WebNN] uploadTensor {tensorId: ${e}, data: ${t.byteLength}}`),this.tensorManager.upload(e,t)}async downloadTensor(e,t){return this.tensorManager.download(e,t)}createMLTensorDownloader(e,t){return async()=>{let i=await this.tensorManager.download(e);return kr(i,t)}}registerMLTensor(e,t,i,r){let a=pt.get(i);if(!a)throw new Error(`Unsupported ONNX data type: ${i}`);let s=this.tensorManager.registerTensor(e,t,a,r);return Q("verbose",()=>`[WebNN] registerMLTensor {tensor: ${t}, dataType: ${a}, dimensions: ${r}} -> {tensorId: ${s}}`),s}registerGraphInput(e){this.temporaryGraphInputs.push(e)}registerGraphOutput(e){this.temporaryGraphOutputs.push(e)}isGraphInput(e,t){let i=this.sessionGraphInputs.get(e);return i?i.includes(t):!1}isGraphOutput(e,t){let i=this.sessionGraphOutputs.get(e);return i?i.includes(t):!1}isGraphInputOutputTypeSupported(e,t,i=!0){let r=pt.get(Qe(t)),a=this.mlOpSupportLimitsBySessionId.get(e);return typeof r>"u"?!1:i?!!a?.input.dataTypes.includes(r):!!a?.output.dataTypes.includes(r)}flush(){}}}),Sr=E(()=>{"use strict"}),mi,Et,Ct,ca,ha,gi,er,fa,uu,Pp=E(()=>{"use strict";Ae(),Sr(),mi=new Map([[64,250],[128,200],[256,200],[512,200],[2048,230],[4096,200],[8192,50],[16384,50],[32768,50],[65536,50],[131072,50],[262144,50],[524288,50],[1048576,50],[2097152,30],[4194304,20],[8388608,10],[12582912,10],[16777216,10],[26214400,15],[33554432,22],[44236800,2],[58982400,6],[67108864,6],[134217728,6],[167772160,6]]),Et=[],Ct=e=>Math.ceil(Number(e)/16)*16,ca=e=>{for(let t=0;t<Et.length;t++){let i=Et[t];if(e<=i)return i}return Math.ceil(e/16)*16},ha=1,gi=()=>ha++,er=async(e,t,i,r)=>{let a=Ct(i),s=e.device.createBuffer({size:a,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});try{let n=e.getCommandEncoder();e.endComputePass(),n.copyBufferToBuffer(t,0,s,0,a),e.flush(),await s.mapAsync(GPUMapMode.READ);let o=s.getMappedRange();if(r){let u=r();return u.set(new Uint8Array(o,0,i)),u}else return new Uint8Array(o.slice(0,i))}finally{s.destroy()}},fa=class{constructor(e){this.backend=e,this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.buffersPending=[],this.capturedPendingBuffers=new Map;for(let[t]of mi)Et.push(t),this.freeBuffers.set(t,[]),this.freeUniformBuffers.set(t,[]);this.sessionCount=0}upload(e,t){let i=t.buffer,r=t.byteOffset,a=t.byteLength,s=Ct(a),n=this.storageCache.get(e);if(!n)throw new Error("gpu data for uploading does not exist");if(Number(n.originalSize)!==a)throw new Error(`inconsistent data size. gpu data size=${n.originalSize}, data size=${a}`);if(s===a&&r%4===0)this.backend.device.queue.writeBuffer(n.gpuData.buffer,0,i,r,a);else{let o=new Uint8Array(s);o.set(t),this.backend.device.queue.writeBuffer(n.gpuData.buffer,0,o,0,s)}Q("verbose",()=>`[WebGPU] GpuDataManager.upload(id=${e})`)}memcpy(e,t){let i=this.storageCache.get(e);if(!i)throw new Error("source gpu data for memcpy does not exist");let r=this.storageCache.get(t);if(!r)throw new Error("destination gpu data for memcpy does not exist");if(i.originalSize!==r.originalSize)throw new Error("inconsistent source and destination gpu data size");let a=Ct(i.originalSize),s=this.backend.getCommandEncoder();this.backend.endComputePass(),s.copyBufferToBuffer(i.gpuData.buffer,0,r.gpuData.buffer,0,a)}registerExternalBuffer(e,t,i){let r;if(i){if(r=i[0],e===i[1])return Q("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${r}, buffer is the same, skip.`),r;if(this.backend.capturedCommandList.has(this.backend.currentSessionId))throw new Error(`Registering a different external buffer under graph capture mode is not supported yet.
             Please use the previous external buffer!`)}else r=gi();return this.storageCache.set(r,{gpuData:{id:r,type:0,buffer:e},originalSize:t}),Q("verbose",()=>`[WebGPU] GpuDataManager.registerExternalBuffer(size=${t}) => id=${r}, registered.`),r}unregisterExternalBuffer(e){e!==void 0&&(this.storageCache.delete(e),Q("verbose",()=>`[WebGPU] GpuDataManager.unregisterExternalBuffer() => id=${e}`))}create(e,t=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST){let i=ca(e),r,a=(t&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE,s=(t&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM;if(a||s){let o=(a?this.freeBuffers:this.freeUniformBuffers).get(i);o?o.length>0?r=o.pop():r=this.backend.device.createBuffer({size:i,usage:t}):r=this.backend.device.createBuffer({size:i,usage:t})}else r=this.backend.device.createBuffer({size:i,usage:t});let n={id:gi(),type:0,buffer:r};return this.storageCache.set(n.id,{gpuData:n,originalSize:Number(e)}),Q("verbose",()=>`[WebGPU] GpuDataManager.create(size=${e}) => id=${n.id}`),n}get(e){return this.storageCache.get(e)?.gpuData}release(e){let t=typeof e=="bigint"?Number(e):e,i=this.storageCache.get(t);if(!i){if(this.storageCache.size===0)return 0;throw new Error("releasing data does not exist")}return Q("verbose",()=>`[WebGPU] GpuDataManager.release(id=${t}), gpuDataId=${i.gpuData.id}`),this.storageCache.delete(t),this.buffersPending.push(i.gpuData.buffer),i.originalSize}async download(e,t){let i=this.storageCache.get(Number(e));if(!i)throw new Error("data does not exist");await er(this.backend,i.gpuData.buffer,i.originalSize,t)}refreshPendingBuffers(){if(this.buffersPending.length!==0)if(this.backend.sessionStatus==="default"){for(let e of this.buffersPending){let t=mi.get(e.size);if((e.usage&GPUBufferUsage.STORAGE)===GPUBufferUsage.STORAGE){let i=this.freeBuffers.get(e.size)||[];t===void 0||i.length>=t?e.destroy():i.push(e)}else if((e.usage&GPUBufferUsage.UNIFORM)===GPUBufferUsage.UNIFORM){let i=this.freeUniformBuffers.get(e.size)||[];t===void 0||i.length>=t?e.destroy():i.push(e)}else e.destroy()}this.buffersPending=[]}else{let e=this.capturedPendingBuffers.get(this.backend.currentSessionId);e||(e=[],this.capturedPendingBuffers.set(this.backend.currentSessionId,e));for(let t of this.buffersPending)e.push(t);this.buffersPending=[]}}dispose(){this.freeBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.freeUniformBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache.forEach(e=>{e.gpuData.buffer.destroy()}),this.capturedPendingBuffers.forEach(e=>{e.forEach(t=>{t.destroy()})}),this.storageCache=new Map,this.freeBuffers=new Map,this.freeUniformBuffers=new Map,this.capturedPendingBuffers=new Map}onCreateSession(){this.sessionCount+=1}onReleaseSession(e){let t=this.capturedPendingBuffers.get(e);t&&(t.forEach(i=>{i.destroy()}),this.capturedPendingBuffers.delete(e)),this.sessionCount-=1,this.sessionCount===0&&(Q("warning",()=>"[WebGPU] Clearing webgpu buffer cache"),this.storageCache.forEach(i=>{i.gpuData.buffer.destroy()}),this.storageCache=new Map)}},uu=(...e)=>new fa(...e)}),ma,Y,ae=E(()=>{"use strict";ma=class{constructor(e){Object.assign(this,e)}get cacheKey(){return this.key||(this.key=Object.getOwnPropertyNames(this).sort().map(e=>`${this[e]}`).join(";")),this.key}},Y=e=>new ma(e)}),ut,Ot,ue,oe,M,re,tr,nt,Ne,A,ct,T,B,lu,Tr,ga,du,F=E(()=>{"use strict";N(),W(),ut=64,Ot=(e,t)=>{if(t===3)throw new Error("vec3 has same alignment as vec4, use vec4 instead");switch(Number(e)){case 10:return t>1?`vec${t}<f16>`:"f16";case 1:return t>1?`vec${t}<f32>`:"f32";case 6:return t>1?`vec${t}<i32>`:"i32";case 12:return t>1?`vec${t}<u32>`:"u32";case 7:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","i32"];case 13:if(t>1)throw new Error("currently not supported vecX of uint64 yet");return["vec2<u32>","u32"];case 9:if(t!==4)throw new Error("bool must be vec4");return["u32","vec4<bool>"];case 22:return"i32";case 21:return"u32";default:throw new Error(`Unknown data type: ${e}`)}},ue=(e,t=1)=>{let i=Ot(e,t);return typeof i=="string"?i:i[0]},oe=(e,t=1)=>{let i=Ot(e,t);return typeof i=="string"?i:i[1]},M=(...e)=>{let t=[];return e.forEach(i=>{i.length!==0&&t.push({type:12,data:i},{type:12,data:k.computeStrides(i)})}),t},re=e=>e%4===0?4:e%2===0?2:1,tr=(e="f32",t,i="0")=>!t||t===1?`${e}(${i})`:`vec${t}<${e}>(${i})`,nt=(e,t,i)=>e==="f32"?i:t===1?`f32(${i})`:`vec${t}<f32>(${i})`,Ne=(e,t)=>t===4?`(${e}.x + ${e}.y + ${e}.z + ${e}.w)`:t===2?`(${e}.x + ${e}.y)`:t===3?`(${e}.x + ${e}.y + ${e}.z)`:e,A=(e,t,i,r)=>e.startsWith("uniforms.")&&i>4?typeof t=="string"?r==="f16"?`${e}[(${t}) / 8][(${t}) % 8 / 4][(${t}) % 8 % 4]`:`${e}[(${t}) / 4][(${t}) % 4]`:r==="f16"?`${e}[${Math.floor(t/8)}][${Math.floor(t%8/4)}][${t%8%4}]`:`${e}[${Math.floor(t/4)}][${t%4}]`:i>1?`${e}[${t}]`:e,ct=(e,t,i,r,a)=>{let s=typeof i=="number",n=s?i:i.length,o=[...new Array(n).keys()],u=n<2?"u32":n<=4?`vec${n}<u32>`:`array<u32, ${n}>`,l=Ot(t,a),p=typeof l=="string"?l:l[1],d=typeof l=="string"?l:l[0],c={indices:u,value:p,storage:d,tensor:t},f=z=>typeof z=="string"?z:`${z}u`,h={offsetToIndices:!1,indicesToOffset:!1,broadcastedIndicesToOffset:!1,set:!1,setByIndices:!1,get:!1,getByIndices:!1},g=s?"uniforms.":"",y=`${g}${e}_shape`,_=`${g}${e}_strides`,m="";for(let z=0;z<n-1;z++)m+=`
    let dim${z} = current / ${A(_,z,n)};
    let rest${z} = current % ${A(_,z,n)};
    indices[${z}] = dim${z};
    current = rest${z};
    `;m+=`indices[${n-1}] = current;`;let w=n<2?"":`
  fn o2i_${e}(offset: u32) -> ${c.indices} {
    var indices: ${c.indices};
    var current = offset;
    ${m}
    return indices;
  }`,$=z=>(h.offsetToIndices=!0,n<2?z:`o2i_${e}(${z})`),b=[];if(n>=2)for(let z=n-1;z>=0;z--)b.push(`${A(_,z,n)} * (indices[${z}])`);let v=n<2?"":`
  fn i2o_${e}(indices: ${c.indices}) -> u32 {
    return ${b.join("+")};
  }`,x=z=>(h.indicesToOffset=!0,n<2?z:`i2o_${e}(${z})`),S=(...z)=>n===0?"0u":`${c.indices}(${z.map(f).join(",")})`,I=(z,L)=>n<2?`${z}`:`${A(z,L,n)}`,C=(z,L,q)=>n<2?`${z}=${q};`:`${A(z,L,n)}=${q};`,H={},U=(z,L)=>{h.broadcastedIndicesToOffset=!0;let q=`${L.name}broadcastedIndicesTo${e}Offset`;if(q in H)return`${q}(${z})`;let R=[];for(let pe=n-1;pe>=0;pe--){let he=L.indicesGet("outputIndices",pe+L.rank-n);R.push(`${I(_,pe)} * (${he} % ${I(y,pe)})`)}return H[q]=`fn ${q}(outputIndices: ${L.type.indices}) -> u32 {
             return ${R.length>0?R.join("+"):"0u"};
           }`,`${q}(${z})`},P=(z,L)=>(()=>{if(c.storage===c.value)return`${e}[${z}]=${L};`;if(c.storage==="vec2<u32>"&&c.value==="i32")return`${e}[${z}]=vec2<u32>(u32(${L}), select(0u, 0xFFFFFFFFu, ${L} < 0));`;if(c.storage==="vec2<u32>"&&c.value==="u32")return`${e}[${z}]=vec2<u32>(u32(${L}), 0u);`;if(c.storage==="u32"&&c.value==="vec4<bool>")return`${e}[${z}]=dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(${L}));`;throw new Error(`not supported combination of storage type ${c.storage} and value type ${c.value} yet`)})(),Z=z=>(()=>{if(c.storage===c.value)return`${e}[${z}]`;if(c.storage==="vec2<u32>"&&c.value==="i32")return`i32(${e}[${z}].x)`;if(c.storage==="vec2<u32>"&&c.value==="u32")return`u32(${e}[${z}].x)`;if(c.storage==="u32"&&c.value==="vec4<bool>")return`vec4<bool>(bool(${e}[${z}] & 0xFFu), bool(${e}[${z}] & 0xFF00u), bool(${e}[${z}] & 0xFF0000u), bool(${e}[${z}] & 0xFF000000u))`;throw new Error(`not supported combination of storage type ${c.storage} and value type ${c.value} yet`)})(),O=n<2?"":`
  fn get_${e}ByIndices(indices: ${c.indices}) -> ${p} {
    return ${Z(`i2o_${e}(indices)`)};
  }`,D=n<2?"":(()=>{let z=o.map(q=>`d${q}: u32`).join(", "),L=o.map(q=>`d${q}`).join(", ");return`
  fn get_${e}(${z}) -> ${p} {
    return get_${e}ByIndices(${S(L)});
  }`})(),G=(...z)=>{if(z.length!==n)throw new Error(`indices length must be ${n}`);let L=z.map(f).join(",");return n===0?Z("0u"):n===1?Z(L[0]):(h.get=!0,h.getByIndices=!0,h.indicesToOffset=!0,`get_${e}(${L})`)},K=z=>n<2?Z(z):(h.getByIndices=!0,h.indicesToOffset=!0,`get_${e}ByIndices(${z})`),V=n<2?"":`
  fn set_${e}ByIndices(indices: ${c.indices}, value: ${p}) {
    ${P(`i2o_${e}(indices)`,"value")}
  }`,j=n<2?"":(()=>{let z=o.map(q=>`d${q}: u32`).join(", "),L=o.map(q=>`d${q}`).join(", ");return`
  fn set_${e}(${z}, value: ${p}) {
    set_${e}ByIndices(${S(L)}, value);
  }`})();return{impl:()=>{let z=[],L=!1;return h.offsetToIndices&&(z.push(w),L=!0),h.indicesToOffset&&(z.push(v),L=!0),h.broadcastedIndicesToOffset&&(Object.values(H).forEach(q=>z.push(q)),L=!0),h.set&&(z.push(j),L=!0),h.setByIndices&&(z.push(V),L=!0),h.get&&(z.push(D),L=!0),h.getByIndices&&(z.push(O),L=!0),!s&&L&&z.unshift(`const ${y} = ${c.indices}(${i.join(",")});`,`const ${_} = ${c.indices}(${k.computeStrides(i).join(",")});`),z.join(`
`)},type:c,offsetToIndices:$,indicesToOffset:x,broadcastedIndicesToOffset:U,indices:S,indicesGet:I,indicesSet:C,set:(...z)=>{if(z.length!==n+1)throw new Error(`indices length must be ${n}`);let L=z[n];if(typeof L!="string")throw new Error("value must be string");let q=z.slice(0,n).map(f).join(",");return n===0?P("0u",L):n===1?P(q[0],L):(h.set=!0,h.setByIndices=!0,h.indicesToOffset=!0,`set_${e}(${q}, ${L})`)},setByOffset:P,setByIndices:(z,L)=>n<2?P(z,L):(h.setByIndices=!0,h.indicesToOffset=!0,`set_${e}ByIndices(${z}, ${L});`),get:G,getByOffset:Z,getByIndices:K,usage:r,name:e,strides:_,shape:y,rank:n}},T=(e,t,i,r=1)=>ct(e,t,i,"input",r),B=(e,t,i,r=1)=>ct(e,t,i,"output",r),lu=(e,t,i)=>ct(e,t,i,"atomicOutput",1),Tr=(e,t,i,r=1)=>ct(e,t,i,"internal",r),ga=class{constructor(e,t){this.normalizedDispatchGroup=e,this.limits=t,this.internalVariables=[],this.variables=[],this.uniforms=[],this.variableIndex=0}guardAgainstOutOfBoundsWorkgroupSizes(e){return`if (global_idx >= ${typeof e=="number"?`${e}u`:e}) { return; }`}mainStart(e=ut){let t=typeof e=="number"?e:e[0],i=typeof e=="number"?1:e[1],r=typeof e=="number"?1:e[2];if(t>this.limits.maxComputeWorkgroupSizeX||i>this.limits.maxComputeWorkgroupSizeY||r>this.limits.maxComputeWorkgroupSizeZ)throw new Error(`workgroup size [${t}, ${i}, ${r}] exceeds the maximum workgroup size [${this.limits.maxComputeWorkgroupSizeX}, ${this.limits.maxComputeWorkgroupSizeY}, ${this.limits.maxComputeWorkgroupSizeZ}].`);if(t*i*r>this.limits.maxComputeInvocationsPerWorkgroup)throw new Error(`workgroup size [${t}, ${i}, ${r}] exceeds the maximum workgroup invocations ${this.limits.maxComputeInvocationsPerWorkgroup}.`);let a=this.normalizedDispatchGroup[1]===1&&this.normalizedDispatchGroup[2]===1,s=a?`@builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(local_invocation_id) local_id : vec3<u32>`:`@builtin(global_invocation_id) global_id : vec3<u32>,
                                             @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(local_invocation_index) local_idx : u32,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>`,n=a?`let global_idx = global_id.x;
         let workgroup_index = workgroup_id.x;`:`let workgroup_index = workgroup_id.z * num_workgroups[0] * num_workgroups[1] +
             workgroup_id.y * num_workgroups[0] + workgroup_id.x;
         let global_idx = workgroup_index * ${t*i*r}u + local_idx;`;return`@compute @workgroup_size(${t}, ${i}, ${r})
  fn main(${s}) {
    ${n}
  `}appendVariableUniforms(e){e.rank!==0&&(e.shape.startsWith("uniforms.")&&this.uniforms.push({name:e.shape.replace("uniforms.",""),type:"u32",length:e.rank}),e.strides.startsWith("uniforms.")&&this.uniforms.push({name:e.strides.replace("uniforms.",""),type:"u32",length:e.rank}))}declareVariable(e,t){if(e.usage==="internal")throw new Error("cannot use internal variable with declareVariable(). use registerInternalVariables() instead.");this.variables.push(e),this.appendVariableUniforms(e);let i=e.usage==="input"?"read":"read_write",r=e.usage==="atomicOutput"?"atomic<i32>":e.type.storage;return`@group(0) @binding(${t}) var<storage, ${i}> ${e.name}: array<${r}>;`}declareVariables(...e){return e.map(t=>this.declareVariable(t,this.variableIndex++)).join(`
`)}registerInternalVariable(e){if(e.usage!=="internal")throw new Error("cannot use input or output variable with registerInternalVariable(). use declareVariables() instead.");this.internalVariables.push(e),this.appendVariableUniforms(e)}registerInternalVariables(...e){return e.forEach(t=>this.registerInternalVariable(t)),this}registerUniform(e,t,i=1){return this.uniforms.push({name:e,type:t,length:i}),this}registerUniforms(e){return this.uniforms=this.uniforms.concat(e),this}uniformDeclaration(){if(this.uniforms.length===0)return"";let e=[];for(let{name:t,type:i,length:r}of this.uniforms)if(r&&r>4)i==="f16"?e.push(`@align(16) ${t}:array<mat2x4<${i}>, ${Math.ceil(r/8)}>`):e.push(`${t}:array<vec4<${i}>, ${Math.ceil(r/4)}>`);else{let a=r==null||r===1?i:`vec${r}<${i}>`;e.push(`${t}:${a}`)}return`
      struct Uniforms { ${e.join(", ")} };
      @group(0) @binding(${this.variableIndex}) var<uniform> uniforms: Uniforms;`}get additionalImplementations(){return this.uniformDeclaration()+this.variables.map(e=>e.impl()).join(`
`)+this.internalVariables.map(e=>e.impl()).join(`
`)}get variablesInfo(){if(this.uniforms.length===0)return;let e=t=>[12,10,1,6][["u32","f16","f32","i32"].indexOf(t)];return this.uniforms.map(t=>[e(t.type),t.length??1])}},du=(e,t)=>new ga(e,t)}),_a,_i,ya,$a,wa,ba,_e,pu,cu,Le=E(()=>{"use strict";N(),W(),ae(),F(),_a=(e,t)=>{if(!e||e.length!==1)throw new Error("Transpose requires 1 input.");if(t.length!==0&&t.length!==e[0].dims.length)throw new Error(`perm size ${t.length} does not match input rank ${e[0].dims.length}`)},_i=(e,t)=>t.length!==0?t:[...new Array(e).keys()].reverse(),ya=(e,t)=>k.sortBasedOnPerm(e,_i(e.length,t)),$a=(e,t,i,r)=>{let a=`fn perm(i: ${r.type.indices}) -> ${i.type.indices} {
    var a: ${i.type.indices};`;for(let s=0;s<t;++s)a+=`a[${e[s]}]=i[${s}];`;return a+="return a;}"},wa=(e,t)=>{let i=[],r=[];for(let a=0;a<e.length;++a)e[a]!==1&&i.push(e[a]),e[t[a]]!==1&&r.push(t[a]);return{newShape:i,newPerm:r}},ba=(e,t)=>{let i=0;for(let r=0;r<e.length;++r)if(t[e[r]]!==1){if(e[r]<i)return!1;i=e[r]}return!0},_e=(e,t)=>{let i=e.dataType,r=e.dims.length,a=_i(r,t),s=ya(e.dims,a),n=e.dims,o=s,u=r<2||ba(a,e.dims),l;if(u)return l=h=>{let g=T("input",i,n,4),y=B("output",i,o,4);return`
  ${h.registerUniform("output_size","u32").declareVariables(g,y)}
  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    output[global_idx] = input[global_idx];
  }`},{name:"TransposeCopy",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let h=k.size(s);return{outputs:[{dims:s,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(h/64/4)},programUniforms:[{type:12,data:Math.ceil(h/4)}]}},getShaderSource:l};let{newShape:p,newPerm:d}=wa(e.dims,a),c=k.areEqual(d,[2,3,1]),f=k.areEqual(d,[3,1,2]);if(p.length===2||c||f){n=c?[p[0],p[1]*p[2]]:f?[p[0]*p[1],p[2]]:p,o=[n[1],n[0]];let h=16;return l=g=>{let y=T("a",i,n.length),_=B("output",i,o.length);return`
  ${g.registerUniform("output_size","u32").declareVariables(y,_)}
  var<workgroup> tile : array<array<${_.type.value}, ${h+1}>, ${h}>;
  ${g.mainStart([h,h,1])}
    let stride = (uniforms.output_shape[1] - 1) / ${h} + 1;
    let workgroup_id_x = workgroup_index % stride;
    let workgroup_id_y = workgroup_index / stride;
    let input_col = workgroup_id_y * ${h}u + local_id.x;
    let input_row = workgroup_id_x * ${h}u + local_id.y;
    if (input_row < uniforms.a_shape[0] && input_col < uniforms.a_shape[1]) {
      tile[local_id.y][local_id.x] = ${y.getByIndices(`${y.type.indices}(input_row, input_col)`)};
    }
    workgroupBarrier();

    let output_col = workgroup_id_x * ${h}u + local_id.x;
    let output_row = workgroup_id_y * ${h}u + local_id.y;
    if (output_row < uniforms.output_shape[0] && output_col < uniforms.output_shape[1]) {
      ${_.setByIndices(`${_.type.indices}(output_row, output_col)`,"tile[local_id.x][local_id.y]")}
    }
  }`},{name:"TransposeShared",shaderCache:{inputDependencies:["type"]},getRunData:()=>{let g=k.size(s);return{outputs:[{dims:s,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(o[1]/h),y:Math.ceil(o[0]/h)},programUniforms:[{type:12,data:g},...M(n,o)]}},getShaderSource:l}}return l=h=>{let g=T("a",i,n.length),y=B("output",i,o.length);return`
  ${h.registerUniform("output_size","u32").declareVariables(g,y)}

  ${$a(a,r,g,y)}

  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${y.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${y.setByOffset("global_idx",g.getByIndices("aIndices"))}
  }`},{name:"Transpose",shaderCache:{hint:`${t}`,inputDependencies:["rank"]},getRunData:()=>{let h=k.size(s);return{outputs:[{dims:s,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:[{type:12,data:h},...M(n,o)]}},getShaderSource:l}},pu=(e,t)=>{_a(e.inputs,t.perm),e.compute(_e(e.inputs[0],t.perm))},cu=e=>Y({perm:e.perm})}),va,xa,ka,Sa,Ta,Ia,za,Ea,Ca,Oa,we,hu,fu,mu,gu,_u,yu,$u,wu,bu,vu,qp=E(()=>{"use strict";N(),W(),F(),Ir(),Le(),va={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate * candidate",logSumExp:"bestValue + exp(candidate)",l1:"bestValue + abs(candidate)",l2:"bestValue + candidate * candidate",logSum:"bestValue + candidate"},xa={max:"select(bestValue, candidate, candidate > bestValue)",min:"select(bestValue, candidate, candidate < bestValue)",mean:"bestValue + candidate",sum:"bestValue + candidate",prod:"bestValue * candidate",sumSquare:"bestValue + candidate",logSumExp:"bestValue + candidate",l1:"bestValue + candidate",l2:"bestValue + candidate",logSum:"bestValue + candidate"},ka={max:"_A[offset]",min:"_A[offset]",mean:"0",sum:"0",prod:"1",sumSquare:"0",logSumExp:"0",l1:"0",l2:"0",logSum:"0"},Sa={max:"bestValue",min:"bestValue",sum:"bestValue",prod:"bestValue",sumSquare:"bestValue",logSumExp:"log(bestValue)",l1:"bestValue",l2:"sqrt(bestValue)",logSum:"log(bestValue)"},Ta=(e,t)=>{let i=[];for(let r=t-e;r<t;++r)i.push(r);return i},Ia=(e,t)=>{let i=[],r=e.length;for(let s=0;s<r;s++)t.indexOf(s)===-1&&i.push(e[s]);let a=t.map(s=>e[s]);return[i,a]},za=(e,t)=>{let i=e.length+t.length,r=[],a=0;for(let s=0;s<i;s++)t.indexOf(s)===-1?r.push(e[a++]):r.push(1);return r},Ea=(e,t)=>{for(let i=0;i<e.length;++i)if(e[e.length-i-1]!==t-1-i)return!1;return!0},Ca=(e,t)=>{let i=[];if(!Ea(e,t)){for(let r=0;r<t;++r)e.indexOf(r)===-1&&i.push(r);e.forEach(r=>i.push(r))}return i},Oa=(e,t,i,r,a,s,n)=>{let o=i[0].dims,u=k.size(s),l=k.size(n),p=T("_A",i[0].dataType,o),d=B("output",a,s),c=64;u===1&&(c=256);let f=`
          var<workgroup> aBestValues : array<f32, ${c}>;
       `,h=g=>`
        ${g.registerUniform("reduceSize","u32").declareVariables(p,d)}
        ${f}
        fn DIV_CEIL(a : u32, b : u32) -> u32 {
          return ((a - 1u) / b + 1u);
         }
         ${g.mainStart(c)}

          let outputIndex = global_idx / ${c};
          let offset = outputIndex * uniforms.reduceSize;

          var bestValue = f32(${ka[r]});
          let Length = uniforms.reduceSize;
          for (var k = local_idx; k < Length; k = k + ${c}) {
           let candidate = f32(${p.getByOffset("offset + k")});
           bestValue = ${va[r]};
          }
          aBestValues[local_idx] = bestValue;
          workgroupBarrier();

         var reduceSize = min(Length, ${c}u);
         for (var currentSize = reduceSize / 2u; reduceSize > 1u;
             currentSize = reduceSize / 2u) {
           let interval = DIV_CEIL(reduceSize, 2u);
           if (local_idx < currentSize) {
            let candidate = aBestValues[local_idx + interval];
            bestValue = ${xa[r]};
            aBestValues[local_idx] = bestValue;
           }
           reduceSize = interval;
           workgroupBarrier();
         }

         if (local_idx == 0u) {
          ${d.setByOffset("outputIndex",`${r==="mean"?`${d.type.storage}(bestValue / f32(uniforms.reduceSize))`:`${d.type.storage}(${Sa[r]})`}`)};
         }
        }`;return{name:e,shaderCache:{hint:`${t};${c}`,inputDependencies:["type"]},getShaderSource:h,getRunData:()=>({outputs:[{dims:s,dataType:a}],dispatchGroup:{x:u},programUniforms:[{type:12,data:l}]})}},we=(e,t,i,r)=>{let a=e.inputs.length===1?i:ir(e.inputs,i),s=a.axes;s.length===0&&!a.noopWithEmptyAxes&&(s=e.inputs[0].dims.map((f,h)=>h));let n=k.normalizeAxes(s,e.inputs[0].dims.length),o=n,u=e.inputs[0],l=Ca(o,e.inputs[0].dims.length);l.length>0&&(u=e.compute(_e(e.inputs[0],l),{inputs:[0],outputs:[-1]})[0],o=Ta(o.length,u.dims.length));let[p,d]=Ia(u.dims,o),c=p;a.keepDims&&(c=za(p,n)),e.compute(Oa(t,a.cacheKey,[u],r,e.inputs[0].dataType,c,d),{inputs:[u]})},hu=(e,t)=>{we(e,"ReduceMeanShared",t,"mean")},fu=(e,t)=>{we(e,"ReduceL1Shared",t,"l1")},mu=(e,t)=>{we(e,"ReduceL2Shared",t,"l2")},gu=(e,t)=>{we(e,"ReduceLogSumExpShared",t,"logSumExp")},_u=(e,t)=>{we(e,"ReduceMaxShared",t,"max")},yu=(e,t)=>{we(e,"ReduceMinShared",t,"min")},$u=(e,t)=>{we(e,"ReduceProdShared",t,"prod")},wu=(e,t)=>{we(e,"ReduceSumShared",t,"sum")},bu=(e,t)=>{we(e,"ReduceSumSquareShared",t,"sumSquare")},vu=(e,t)=>{we(e,"ReduceLogSumShared",t,"logSum")}}),be,Ba,Ht,ir,ve,Ra,Aa,Da,Ma,Ua,Pa,qa,Na,La,Va,xe,xu,ku,Su,Tu,Iu,zu,Eu,Cu,Ou,Bu,Ir=E(()=>{"use strict";N(),W(),ae(),F(),qp(),be=e=>{if(!e||e.length===0||e.length>2)throw new Error("Reduce op requires 1 or 2 inputs.");if(e.length===2&&e[1].dims.length!==1)throw new Error("Invalid axes input dims.")},Ba=e=>["","",`var value = ${e.getByIndices("input_indices")};`,""],Ht=(e,t,i,r,a,s,n=!1,o=!1)=>{let u=[],l=i[0].dims,p=l.length,d=k.normalizeAxes(a,p),c=!o&&d.length===0;l.forEach((g,y)=>{c||d.indexOf(y)>=0?n&&u.push(1):u.push(g)});let f=u.length,h=k.size(u);return{name:e,shaderCache:t,getShaderSource:g=>{let y=[],_=T("_A",i[0].dataType,p),m=B("output",s,f),w=r(_,m,d),$=w[2];for(let b=0,v=0;b<p;b++)c||d.indexOf(b)>=0?(n&&v++,$=`for(var j${b}: u32 = 0; j${b} < ${l[b]}; j${b}++) {
                  ${w[2].includes("last_index")?`let last_index = j${b};`:""}
                  ${_.indicesSet("input_indices",b,`j${b}`)}
                  ${$}
                }`):(y.push(`${_.indicesSet("input_indices",b,m.indicesGet("output_indices",v))};`),v++);return`

        ${g.registerUniform("output_size","u32").declareVariables(_,m)}

        ${g.mainStart()}
          ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          var input_indices: ${_.type.indices};
          let output_indices = ${m.offsetToIndices("global_idx")};

          ${y.join(`
`)}
          ${w[0]}       // init ops for reduce max/min
          ${w[1]}
          ${$}
          ${w[3]}
          ${w.length===4?m.setByOffset("global_idx","value"):w.slice(4).join(`
`)}
        }`},getRunData:()=>({outputs:[{dims:u,dataType:s}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:[{type:12,data:h},...M(l,u)]})}},ir=(e,t)=>{let i=[];return e[1].dims[0]>0&&e[1].getBigInt64Array().forEach(r=>i.push(Number(r))),Y({axes:i,keepDims:t.keepDims,noopWithEmptyAxes:t.noopWithEmptyAxes})},ve=(e,t,i,r)=>{let a=e.inputs,s=a.length===1?i:ir(a,i);e.compute(Ht(t,{hint:s.cacheKey,inputDependencies:["rank"]},[a[0]],s.noopWithEmptyAxes&&s.axes.length===0?Ba:r,s.axes,a[0].dataType,s.keepDims,s.noopWithEmptyAxes),{inputs:[0]})},Ra=(e,t)=>{be(e.inputs),ve(e,"ReduceLogSum",t,(i,r)=>[`var value = ${r.type.storage}(0);`,"",`value += ${i.getByIndices("input_indices")};`,"value = log(value);"])},Aa=(e,t)=>{be(e.inputs),ve(e,"ReduceL1",t,(i,r)=>[`var value = ${r.type.storage}(0);`,"",`value += abs(${i.getByIndices("input_indices")});`,""])},Da=(e,t)=>{be(e.inputs),ve(e,"ReduceL2",t,(i,r)=>[`var t = ${r.type.value}(0); var value = ${r.type.value}(0);`,"",`t = ${i.getByIndices("input_indices")}; value += (t * t);`,"value = sqrt(value);"])},Ma=(e,t)=>{be(e.inputs),ve(e,"ReduceLogSumExp",t,(i,r)=>[`var value = ${r.type.storage}(0);`,"",`value += exp(${i.getByIndices("input_indices")});`,"value = log(value);"])},Ua=(e,t)=>{be(e.inputs),ve(e,"ReduceMax",t,(i,r,a)=>{let s=[];for(let n=0;n<i.rank;n++)(a.indexOf(n)>=0||a.length===0)&&s.push(i.indicesSet("input_indices",n,0));return[`${s.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};`,`value = max(value, ${i.getByIndices("input_indices")});`,""]})},Pa=(e,t)=>{be(e.inputs),ve(e,"ReduceMean",t,(i,r,a)=>{let s=1;for(let n=0;n<i.rank;n++)(a.indexOf(n)>=0||a.length===0)&&(s*=e.inputs[0].dims[n]);return["var sum = f32(0);","",`sum += f32(${i.getByIndices("input_indices")});`,`let value = ${r.type.value}(sum / ${s});`]})},qa=(e,t)=>{be(e.inputs),ve(e,"ReduceMin",t,(i,r,a)=>{let s=[];for(let n=0;n<i.rank;n++)(a.indexOf(n)>=0||a.length===0)&&s.push(`input_indices[${n}] = 0;`);return[`${s.join(`
`)}`,`var value = ${i.getByIndices("input_indices")};`,`value = min(value, ${i.getByIndices("input_indices")});`,""]})},Na=(e,t)=>{be(e.inputs),ve(e,"ReduceProd",t,(i,r)=>[`var value = ${r.type.storage}(1);`,"",`value *= ${i.getByIndices("input_indices")};`,""])},La=(e,t)=>{be(e.inputs),ve(e,"ReduceSum",t,(i,r)=>[`var value = ${r.type.storage}(0);`,"",`value += ${i.getByIndices("input_indices")};`,""])},Va=(e,t)=>{be(e.inputs),ve(e,"ReduceSumSquare",t,(i,r)=>[`var t = ${r.type.value}(0); var value = ${r.type.value}(0);`,"",`t = ${i.getByIndices("input_indices")}; value += t * t;`,""])},xe=(e,t,i)=>{if(t.length===0)return i;let r=1,a=1;for(let s=0;s<t.length;s++)t.indexOf(s)===-1?r*=e[s]:a*=e[s];return a<32&&r>1024},xu=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Pa(e,t):hu(e,t)},ku=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Aa(e,t):fu(e,t)},Su=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Da(e,t):mu(e,t)},Tu=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ma(e,t):gu(e,t)},Iu=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ua(e,t):_u(e,t)},zu=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?qa(e,t):yu(e,t)},Eu=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Na(e,t):$u(e,t)},Cu=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?La(e,t):wu(e,t)},Ou=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Va(e,t):bu(e,t)},Bu=(e,t)=>{xe(e.inputs[0].dims,t.axes,t.noopWithEmptyAxes)?Ra(e,t):vu(e,t)}}),yi,Ru,Au,rr,Np=E(()=>{"use strict";N(),ae(),Ir(),yi=e=>{if(!e||e.length===0||e.length>2)throw new Error("ArgMinMaxOp op requires 1 or 2 inputs.");if(e[0].dataType!==1)throw new Error("Invalid input type.")},Ru=(e,t)=>{yi(e.inputs);let i=(r,a,s)=>{let n=[];for(let o=0;o<r.rank;o++)(s.indexOf(o)>=0||s.length===0)&&n.push(`input_indices[${o}] = 0;`);return[`${n.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${r.getByIndices("input_indices")} ${t.selectLastIndex>0?"<=":"<"} value) {
         value = ${r.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",a.setByOffset("global_idx","best_index")]};e.compute(Ht("ArgMin",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],i,[t.axis],7,t.keepDims),{inputs:[0]})},Au=(e,t)=>{yi(e.inputs);let i=(r,a,s)=>{let n=[];for(let o=0;o<r.rank;o++)(s.indexOf(o)>=0||s.length===0)&&n.push(`input_indices[${o}] = 0;`);return[`${n.join(`
`)}`,`var value = ${r.getByIndices("input_indices")};
var best_index : i32 = 0;`,`if (${r.getByIndices("input_indices")} ${t.selectLastIndex>0?">=":">"} value) {
         value = ${r.getByIndices("input_indices")};
         best_index = i32(last_index);
       }`,"",a.setByOffset("global_idx","best_index")]};e.compute(Ht("argMax",{hint:t.cacheKey,inputDependencies:["rank"]},[e.inputs[0]],i,[t.axis],7,t.keepDims),{inputs:[0]})},rr=e=>Y(e)}),Ga,Bt,Wa,Fa,Ha,kt,Ka,Du,zr=E(()=>{"use strict";N(),W(),Sr(),F(),Ga=(e,t)=>{let i=e[0],r=e[1],a=e[2],s=e[3],n=e[4],o=e[5];if(n&&o)throw new Error("Attention cannot have both past and attention_bias");if(i.dims.length!==3)throw new Error('Input "input" must have 3 dimensions');let u=i.dims[0],l=i.dims[1],p=i.dims[2];if(a.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimensions');if(r.dims.length!==2)throw new Error('Input "weights" is expected to have 2 dimensions');if(r.dims[0]!==p)throw new Error("Input 1 dimension 0 should have same length as dimension 2 of input 0");if(a.dims[0]!==r.dims[1])throw new Error('Input "bias" dimension 0 should have same length as dimension 1 of input "weights"');let d=a.dims[0]/3,c=d,f=c;if(t.qkvHiddenSizes.length>0){if(t.qkvHiddenSizes.length!==3)throw new Error("qkv_hidden_sizes attribute should have 3 elements");for(let w of t.qkvHiddenSizes)if(w%t.numHeads!==0)throw new Error("qkv_hidden_sizes should be divisible by num_heads");d=t.qkvHiddenSizes[0],c=t.qkvHiddenSizes[1],f=t.qkvHiddenSizes[2]}let h=l;if(d!==c)throw new Error("qkv_hidden_sizes first element should be same as the second");if(a.dims[0]!==d+c+f)throw new Error('Input "bias" dimension 0 should have same length as sum of Q/K/V hidden sizes');let g=0;if(n){if(c!==f)throw new Error('Input "past" expect k_hidden_size == v_hidden_size');if(n.dims.length!==5)throw new Error('Input "past" must have 5 dimensions');if(n.dims[0]!==2)throw new Error('Input "past" first dimension must be 2');if(n.dims[1]!==u)throw new Error('Input "past" second dimension must be batch_size');if(n.dims[2]!==t.numHeads)throw new Error('Input "past" third dimension must be num_heads');if(n.dims[4]!==c/t.numHeads)throw new Error('Input "past" fifth dimension must be k_hidden_size / num_heads');t.pastPresentShareBuffer||(g=n.dims[3])}let y=h+g,_=-1,m=0;if(s)throw new Error("Mask not supported");if(n)throw new Error("past is not supported");if(o){if(o.dims.length!==4)throw new Error('Input "attention_bias" must have 4 dimensions');if(o.dims[0]!==u||o.dims[1]!==t.numHeads||o.dims[2]!==l||o.dims[3]!==y)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:u,sequenceLength:l,pastSequenceLength:g,kvSequenceLength:h,totalSequenceLength:y,maxSequenceLength:_,inputHiddenSize:p,hiddenSize:d,vHiddenSize:f,headSize:Math.floor(d/t.numHeads),vHeadSize:Math.floor(f/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:m,scale:t.scale,broadcastResPosBias:!1,passPastInKv:!1,qkvFormat:1}},Bt=(e,t,i)=>t&&e?`
      let total_sequence_length_input = u32(${t.getByOffset("0")});
      let present_sequence_length = max(total_sequence_length_input, uniforms.past_sequence_length);
      let is_subsequent_prompt: bool = sequence_length > 1 && sequence_length != total_sequence_length_input;
      let is_first_prompt: bool = is_subsequent_prompt == false && sequence_length == total_sequence_length_input;
      total_sequence_length = u32(${e?.getByOffset("batchIdx")}) + 1;
      var past_sequence_length: u32 = 0;
      if (is_first_prompt == false) {
        past_sequence_length = total_sequence_length - sequence_length;
      }
       `:`
    ${i?"let past_sequence_length = uniforms.past_sequence_length":""};
    let present_sequence_length = total_sequence_length;
    `,Wa=(e,t,i,r,a,s,n,o)=>{let u=re(n?1:s),l=64,p=s/u;p<l&&(l=32);let d=Math.ceil(s/u/l),c=[{type:12,data:t},{type:12,data:i},{type:12,data:r},{type:12,data:a},{type:12,data:p},{type:12,data:d}],f=ue(e.dataType,u),h=oe(1,u),g=["type"];n&&g.push("type"),o&&g.push("type");let y=_=>{let m=B("x",e.dataType,e.dims,u),w=[m],$=n?T("seq_lens",n.dataType,n.dims):void 0;$&&w.push($);let b=o?T("total_sequence_length_input",o.dataType,o.dims):void 0;b&&w.push(b);let v=oe(e.dataType),x=[{name:"batch_size",type:"u32"},{name:"num_heads",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"sequence_length",type:"u32"},{name:"total_sequence_length",type:"u32"},{name:"elements_per_thread",type:"u32"}];return`
  var<workgroup> thread_max: array<f32, ${l}>;
  var<workgroup> thread_sum: array<f32, ${l}>;
  ${_.registerUniforms(x).declareVariables(...w)}
  ${_.mainStart([l,1,1])}
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let sequence_length = uniforms.sequence_length;
    var total_sequence_length = uniforms.total_sequence_length;
    ${Bt($,b,!1)}
    let local_offset = local_idx * uniforms.elements_per_thread;
    let offset = (global_idx / ${l}) * uniforms.total_sequence_length + local_offset;
    let seq_causal_length = ${n?"u32(past_sequence_length + workgroup_id.y + 1)":"total_sequence_length"};
    var thread_max_vector = ${h}(-3.4028234663852886e+38f);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      thread_max_vector = max(${h}(x[offset + i]), thread_max_vector);
    }
    thread_max[local_idx] = ${(()=>{switch(u){case 1:return"thread_max_vector";case 2:return"max(thread_max_vector.x, thread_max_vector.y)";case 4:return"max(max(thread_max_vector.x, thread_max_vector.y), max(thread_max_vector.z, thread_max_vector.w))";default:throw new Error(`Unsupported components: ${u}`)}})()};
    workgroupBarrier();

    var max_value =  f32(-3.4028234663852886e+38f);
    for (var i = 0u; i < ${l}; i++) {
      max_value = max(thread_max[i], max_value);
    }

    var sum_vector = ${h}(0);
    for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
      sum_vector += exp(${h}(x[offset + i]) - max_value);
    }
    thread_sum[local_idx] = ${(()=>{switch(u){case 1:return"sum_vector";case 2:return"sum_vector.x + sum_vector.y";case 4:return"sum_vector.x + sum_vector.y + sum_vector.z + sum_vector.w";default:throw new Error(`Unsupported components: ${u}`)}})()};
    workgroupBarrier();

    var sum: f32 = 0;
    for (var i = 0u; i < ${l}; i++) {
      sum += thread_sum[i];
    }

    if (sum == 0) {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        x[offset + i] = ${m.type.value}(${v}(1.0) / ${v}(seq_causal_length));
      }
    } else {
      for (var i: u32 = 0; i < uniforms.elements_per_thread && i + local_offset < seq_causal_length; i++) {
        var f32input = ${h}(x[offset + i]);
        x[offset + i] = ${m.type.value}(exp(f32input - max_value) / sum);
      }
    }
      ${n?`
        for (var total_seq_id: u32 = seq_causal_length; total_seq_id + local_offset < uniforms.total_sequence_length; total_seq_id++) {
          x[offset + total_seq_id] = ${m.type.value}(${v}(0));
        }`:""};
  }`};return{name:"AttentionProbsSoftmax",shaderCache:{hint:`${l};${f};${u}`,inputDependencies:g},getShaderSource:y,getRunData:()=>({outputs:[],dispatchGroup:{x:1,y:a,z:t*i},programUniforms:c})}},Fa=(e,t,i,r,a,s,n,o,u)=>{let l=n+s.kvSequenceLength,p=[s.batchSize,s.numHeads,s.sequenceLength,l],d=e>1&&r,c=s.kvNumHeads?s.kvNumHeads:s.numHeads,f=d?[s.batchSize,c,l,s.headSize]:void 0,h=s.nReps?s.nReps:1,g=s.scale===0?1/Math.sqrt(s.headSize):s.scale,y=re(s.headSize),_=s.headSize/y,m=12,w={x:Math.ceil(l/m),y:Math.ceil(s.sequenceLength/m),z:s.batchSize*s.numHeads},$=[{type:12,data:s.sequenceLength},{type:12,data:_},{type:12,data:l},{type:12,data:s.numHeads},{type:12,data:s.headSize},{type:1,data:g},{type:12,data:n},{type:12,data:s.kvSequenceLength},{type:12,data:h}],b=d&&r&&k.size(r.dims)>0,v=["type","type"];b&&v.push("type"),a&&v.push("type"),o&&v.push("type"),u&&v.push("type");let x=[{dims:p,dataType:t.dataType,gpuDataType:0}];d&&x.push({dims:f,dataType:t.dataType,gpuDataType:0});let S=I=>{let C=T("q",t.dataType,t.dims,y),H=T("key",i.dataType,i.dims,y),U=[C,H];if(b){let V=T("past_key",r.dataType,r.dims,y);U.push(V)}a&&U.push(T("attention_bias",a.dataType,a.dims));let P=o?T("seq_lens",o.dataType,o.dims):void 0;P&&U.push(P);let Z=u?T("total_sequence_length_input",u.dataType,u.dims):void 0;Z&&U.push(Z);let O=B("output",t.dataType,p),D=[O];d&&D.push(B("present_key",t.dataType,f,y));let G=oe(1,y),K=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"alpha",type:"f32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${m}u;

  var<workgroup> tileQ: array<${C.type.storage}, ${m*m}>;
  var<workgroup> tileK: array<${C.type.storage}, ${m*m}>;
  ${I.registerUniforms(K).declareVariables(...U,...D)}
  ${I.mainStart([m,m,1])}
    // x holds the N and y holds the M
    let headIdx = workgroup_id.z % uniforms.num_heads;
    let kvHeadIdx = ${h===1?"headIdx":"headIdx / uniforms.n_reps"};
    let kv_num_heads = ${h===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
    let batchIdx = workgroup_id.z / uniforms.num_heads;
    let m = workgroup_id.y * TILE_SIZE;
    let n = workgroup_id.x * TILE_SIZE;
    let sequence_length = uniforms.M;
    var total_sequence_length = uniforms.N;
    ${Bt(P,Z,!0)}
    let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx;
    let qOffset = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
    ${b&&d?"let pastKeyOffset = absKvHeadIdx * uniforms.past_sequence_length * uniforms.K;":""};
    let kOffset = absKvHeadIdx * uniforms.kv_sequence_length * uniforms.K;
    ${d?"let presentKeyOffset = absKvHeadIdx * uniforms.N * uniforms.K;":""}
    var value = ${G}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (global_id.y < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = q[qOffset + local_id.y * uniforms.K + w + local_id.x];
      }
      if (n + local_id.y < uniforms.N && w + local_id.x < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
      ${b&&d?`
              if (n + local_id.y < past_sequence_length) {
                tileK[idx] = past_key[pastKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
              } else if (n + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
                tileK[idx] = key[kOffset + (n + local_id.y - past_sequence_length) * uniforms.K + w + local_id.x];
              }`:`
          if (n + local_id.y < uniforms.kv_sequence_length) {
            tileK[idx] = key[kOffset + (n + local_id.y) * uniforms.K + w + local_id.x];
          }`}
      ${d?`if (n + local_id.y < present_sequence_length) {
        present_key[presentKeyOffset + (n + local_id.y) * uniforms.K + w + local_id.x] = tileK[idx];
      }`:""}
      }
      workgroupBarrier();

      for (var k: u32 = 0u; k < TILE_SIZE && w+k < uniforms.K; k++) {
          value += ${G}(tileQ[TILE_SIZE * local_id.y + k] * tileK[TILE_SIZE * local_id.x + k]);
      }

      workgroupBarrier();
    }

    if (global_id.y < uniforms.M && global_id.x < total_sequence_length) {
      let headOffset = workgroup_id.z * uniforms.M * uniforms.N;
      let outputIdx = headOffset + global_id.y * uniforms.N + global_id.x;
      var sum: f32 = ${(()=>{switch(y){case 1:return"value";case 2:return"value.x + value.y";case 4:return"value.x + value.y + value.z + value.w";default:throw new Error(`Unsupported components: ${y}`)}})()};
        output[outputIdx] = ${O.type.value} (sum * uniforms.alpha) + ${a?"attention_bias[outputIdx]":"0.0"};
    }
  }`};return{name:"AttentionProbs",shaderCache:{hint:`${y};${a!==void 0};${r!==void 0};${e}`,inputDependencies:v},getRunData:()=>({outputs:x,dispatchGroup:w,programUniforms:$}),getShaderSource:S}},Ha=(e,t,i,r,a,s,n=void 0,o=void 0)=>{let u=s+a.kvSequenceLength,l=a.nReps?a.nReps:1,p=a.vHiddenSize*l,d=e>1&&r,c=a.kvNumHeads?a.kvNumHeads:a.numHeads,f=d?[a.batchSize,c,u,a.headSize]:void 0,h=[a.batchSize,a.sequenceLength,p],g=12,y={x:Math.ceil(a.vHeadSize/g),y:Math.ceil(a.sequenceLength/g),z:a.batchSize*a.numHeads},_=[{type:12,data:a.sequenceLength},{type:12,data:u},{type:12,data:a.vHeadSize},{type:12,data:a.numHeads},{type:12,data:a.headSize},{type:12,data:p},{type:12,data:s},{type:12,data:a.kvSequenceLength},{type:12,data:l}],m=d&&r&&k.size(r.dims)>0,w=["type","type"];m&&w.push("type"),n&&w.push("type"),o&&w.push("type");let $=[{dims:h,dataType:t.dataType,gpuDataType:0}];d&&$.push({dims:f,dataType:t.dataType,gpuDataType:0});let b=v=>{let x=T("probs",t.dataType,t.dims),S=T("v",i.dataType,i.dims),I=[x,S];m&&I.push(T("past_value",r.dataType,r.dims));let C=n?T("seq_lens",n.dataType,n.dims):void 0;n&&I.push(C);let H=o?T("total_sequence_length_input",o.dataType,o.dims):void 0;o&&I.push(H);let U=[B("output",t.dataType,h)];d&&U.push(B("present_value",t.dataType,f));let P=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"v_hidden_size",type:"u32"},{name:"past_sequence_length",type:"u32"},{name:"kv_sequence_length",type:"u32"},{name:"n_reps",type:"u32"}];return`
  const TILE_SIZE = ${g}u;
  var<workgroup> tileQ: array<${x.type.value}, ${g*g}>;
  var<workgroup> tileV: array<${x.type.value}, ${g*g}>;
  ${v.registerUniforms(P).declareVariables(...I,...U)}
  ${v.mainStart([g,g,1])}
   let headIdx = workgroup_id.z % uniforms.num_heads;
   let batchIdx = workgroup_id.z / uniforms.num_heads;
   let kvHeadIdx = ${l===1?"headIdx":"headIdx / uniforms.n_reps"};
   let kv_num_heads = ${l===1?"uniforms.num_heads":"uniforms.num_heads / uniforms.n_reps"};
   let m = global_id.y;
   let n = global_id.x;
   let sequence_length = uniforms.M;
   var total_sequence_length = uniforms.K;
   ${Bt(C,H,!0)}
   let offsetA = workgroup_id.z * uniforms.M * uniforms.K + m * uniforms.K;
   let absKvHeadIdx = batchIdx * kv_num_heads + kvHeadIdx; // kvHeadIdx is relative to the batch
   ${m&&d?"let pastValueOffset = absKvHeadIdx * uniforms.N * uniforms.past_sequence_length + n;":""};
   let vOffset = absKvHeadIdx * uniforms.N * uniforms.kv_sequence_length + n;
   ${d?"let presentValueOffset = absKvHeadIdx * uniforms.N * uniforms.K + n;":""}
   var value = ${x.type.storage}(0);
   for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileQ[TILE_SIZE * local_id.y + local_id.x] = probs[offsetA + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        var idx = TILE_SIZE * local_id.y + local_id.x;
        ${m&&d?`
        if (w + local_id.y < past_sequence_length) {
          tileV[idx] = past_value[pastValueOffset + (w + local_id.y) * uniforms.N];
        } else if (w + local_id.y - past_sequence_length < uniforms.kv_sequence_length) {
          tileV[idx] = v[vOffset + (w + local_id.y - past_sequence_length) * uniforms.N];
        }
      `:`
            if (w + local_id.y < uniforms.kv_sequence_length) {
              tileV[idx] = v[vOffset + (w + local_id.y) * uniforms.N];
            }`}
        ${d?`
            if (w + local_id.y < present_sequence_length) {
          present_value[presentValueOffset + (w + local_id.y) * uniforms.N] = tileV[idx];
        }`:""}
      }
     workgroupBarrier();
     for (var k: u32 = 0u; k < TILE_SIZE && w+k < total_sequence_length; k++) {
       value += tileQ[TILE_SIZE * local_id.y + k] * tileV[TILE_SIZE * k + local_id.x];
     }
     workgroupBarrier();
   }

   // we need to transpose output from BNSH_v to BSND_v
   if (m < uniforms.M && n < uniforms.N) {
     let outputIdx = batchIdx * uniforms.M * uniforms.v_hidden_size + m * uniforms.v_hidden_size
       + headIdx * uniforms.N + n;
     output[outputIdx] = value;
   }
  }`};return{name:"AttentionScore",shaderCache:{hint:`${r!==void 0};${e}`,inputDependencies:w},getRunData:()=>({outputs:$,dispatchGroup:y,programUniforms:_}),getShaderSource:b}},kt=(e,t,i,r,a,s,n,o,u,l,p=void 0,d=void 0)=>{let c=Math.min(e.outputCount,1+(n?1:0)+(o?1:0)),f=c>1?n:void 0,h=c>1?o:void 0,g=c>1?l.pastSequenceLength:0,y=g+l.kvSequenceLength,_=u&&k.size(u.dims)>0?u:void 0,m=[t,i];f&&k.size(f.dims)>0&&m.push(f),_&&m.push(_),p&&m.push(p),d&&m.push(d);let w=e.compute(Fa(c,t,i,f,_,l,g,p,d),{inputs:m,outputs:c>1?[-1,1]:[-1]})[0];e.compute(Wa(w,l.batchSize,l.numHeads,g,l.sequenceLength,y,p,d),{inputs:p&&d?[w,p,d]:[w],outputs:[]});let $=[w,r];h&&k.size(h.dims)>0&&$.push(h),p&&$.push(p),d&&$.push(d),e.compute(Ha(c,w,r,h,l,g,p,d),{inputs:$,outputs:c>1?[0,2]:[0]})},Ka=(e,t)=>{let i=[t.batchSize,t.numHeads,t.sequenceLength,t.headSize],r=t.sequenceLength,a=t.inputHiddenSize,s=t.headSize,n=12,o={x:Math.ceil(t.headSize/n),y:Math.ceil(t.sequenceLength/n),z:t.batchSize*t.numHeads},u=[e.inputs[0],e.inputs[1],e.inputs[2]],l=[{type:12,data:r},{type:12,data:a},{type:12,data:s},{type:12,data:t.numHeads},{type:12,data:t.headSize},{type:12,data:t.hiddenSize},{type:12,data:t.hiddenSize+t.hiddenSize+t.vHiddenSize}],p=d=>{let c=B("output_q",u[0].dataType,i),f=B("output_k",u[0].dataType,i),h=B("output_v",u[0].dataType,i),g=T("input",u[0].dataType,u[0].dims),y=T("weight",u[1].dataType,u[1].dims),_=T("bias",u[2].dataType,u[2].dims),m=g.type.storage,w=[{name:"M",type:"u32"},{name:"K",type:"u32"},{name:"N",type:"u32"},{name:"num_heads",type:"u32"},{name:"head_size",type:"u32"},{name:"hidden_size",type:"u32"},{name:"ldb",type:"u32"}];return`
  const TILE_SIZE = ${n}u;
  var<workgroup> tileInput: array<${m}, ${n*n}>;
  var<workgroup> tileWeightQ: array<${m}, ${n*n}>;
  var<workgroup> tileWeightK: array<${m}, ${n*n}>;
  var<workgroup> tileWeightV: array<${m}, ${n*n}>;
  ${d.registerUniforms(w).declareVariables(g,y,_,c,f,h)}
  ${d.mainStart([n,n,1])}
    let batchIndex = workgroup_id.z / uniforms.num_heads;
    let headNumber = workgroup_id.z % uniforms.num_heads;
    let m = global_id.y;
    let n = global_id.x;

    let inputOffset = batchIndex * (uniforms.M * uniforms.K) + m * uniforms.K;
    let biasOffsetQ = headNumber * uniforms.head_size;
    let biasOffsetK = uniforms.hidden_size + biasOffsetQ;
    let biasOffsetV = uniforms.hidden_size + biasOffsetK;

    var valueQ = ${m}(0);
    var valueK = ${m}(0);
    var valueV = ${m}(0);
    for (var w: u32 = 0u; w < uniforms.K; w += TILE_SIZE) {
      if (m < uniforms.M && w + local_id.x < uniforms.K) {
        tileInput[TILE_SIZE * local_id.y + local_id.x] = input[inputOffset + w + local_id.x];
      }
      if (n < uniforms.N && w + local_id.y < uniforms.K) {
        let offset = n + (w + local_id.y) * uniforms.ldb;
        tileWeightQ[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetQ + offset];
        tileWeightK[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetK + offset];
        tileWeightV[TILE_SIZE * local_id.y + local_id.x] = weight[biasOffsetV + offset];
      }
      workgroupBarrier();
      for (var k: u32 = 0u; k<TILE_SIZE && w+k < uniforms.K; k++) {
        let inputTileOffset = TILE_SIZE * local_id.y + k;
        let weightTileOffset = TILE_SIZE * k + local_id.x;
        valueQ += tileInput[inputTileOffset] * tileWeightQ[weightTileOffset];
        valueK += tileInput[inputTileOffset] * tileWeightK[weightTileOffset];
        valueV += tileInput[inputTileOffset] * tileWeightV[weightTileOffset];
      }

      workgroupBarrier();
    }

    let headOffset = (m * uniforms.N + n) % uniforms.head_size;
    valueQ += bias[headOffset + biasOffsetQ];
    valueK += bias[headOffset + biasOffsetK];
    valueV += bias[headOffset + biasOffsetV];

    let offset = workgroup_id.z * uniforms.M * uniforms.N;
    if (m < uniforms.M && n < uniforms.N) {
      let outputIdx = offset + m * uniforms.N + n;
      output_q[outputIdx] = valueQ;
      output_k[outputIdx] = valueK;
      output_v[outputIdx] = valueV;
    }
  }`};return e.compute({name:"AttentionPrepare",shaderCache:{inputDependencies:["type","type","type"]},getRunData:()=>({outputs:[{dims:i,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:i,dataType:e.inputs[0].dataType,gpuDataType:0},{dims:i,dataType:e.inputs[0].dataType,gpuDataType:0}],dispatchGroup:o,programUniforms:l}),getShaderSource:p},{inputs:u,outputs:[-1,-1,-1]})},Du=(e,t)=>{let i=Ga(e.inputs,t),[r,a,s]=Ka(e,i);return kt(e,r,a,s,e.inputs[4],void 0,void 0,void 0,e.inputs[5],i)}}),ja,Qa,Za,Mu,Lp=E(()=>{"use strict";$e(),N(),W(),ae(),F(),ja=(e,t)=>{if(!e||e.length!==5)throw new Error("BatchNormalization requires 5 inputs");let i=(r,a,s)=>{let n=a.length;if(n!==r.length)throw new Error(`${s}: num dimensions != ${n}`);a.forEach((o,u)=>{if(o!==r[u])throw new Error(`${s}: dim[${u}] do not match`)})};if(e[0].dims.length>1){let r=t.format==="NHWC"?t.spatial?e[0].dims.slice(-1):e[0].dims.slice(-1).concat(e[0].dims.slice(1,e[0].dims.length-1)):e[0].dims.slice(1,t.spatial?2:void 0);i(e[1].dims,r,"Invalid input scale"),i(e[2].dims,r,"Invalid input B"),i(e[3].dims,r,"Invalid input mean"),i(e[4].dims,r,"Invalid input var")}else i(e[1].dims,[1],"Invalid input scale"),i(e[2].dims,[1],"Invalid input B"),i(e[3].dims,[1],"Invalid input mean"),i(e[4].dims,[1],"Invalid input var")},Qa=(e,t)=>{let{epsilon:i,spatial:r,format:a}=t,s=e[0].dims,n=r?re(s[s.length-1]):1,o=a==="NHWC"&&s.length>1?n:1,u=k.size(s)/n,l=r,p=l?s.length:s,d=T("x",e[0].dataType,e[0].dims,n),c=T("scale",e[1].dataType,e[1].dims,o),f=T("bias",e[2].dataType,e[2].dims,o),h=T("inputMean",e[3].dataType,e[3].dims,o),g=T("inputVar",e[4].dataType,e[4].dims,o),y=B("y",e[0].dataType,p,n),_=()=>{let w="";if(r)w=`let cOffset = ${s.length===1?"0u":a==="NHWC"?`outputIndices[${s.length-1}] / ${n}`:"outputIndices[1]"};`;else if(a==="NCHW")w=`
            ${y.indicesSet("outputIndices","0","0")}
            let cOffset = ${y.indicesToOffset("outputIndices")};`;else{w=`var cIndices = ${c.type.indices}(0);
                       cIndices[0] = outputIndices[${s.length-1}];`;for(let $=1;$<c.rank;$++)w+=`cIndices[${$}] = outputIndices[${$}];`;w+=`let cOffset = ${c.indicesToOffset("cIndices")};`}return w},m=w=>`
  const epsilon = ${i};
  ${w.registerUniform("outputSize","u32").declareVariables(d,c,f,h,g,y)}
  ${w.mainStart()}
  ${w.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
    var outputIndices = ${y.offsetToIndices(`global_idx * ${n}`)};
    ${_()}
    let scale = ${c.getByOffset("cOffset")};
    let bias = ${f.getByOffset("cOffset")};
    let inputMean = ${h.getByOffset("cOffset")};
    let inputVar = ${g.getByOffset("cOffset")};
    let x = ${d.getByOffset("global_idx")};
    let value = (x - inputMean) * inverseSqrt(inputVar + epsilon) * scale + bias;
    ${y.setByOffset("global_idx","value")}
  }`;return{name:"BatchNormalization",shaderCache:{hint:`${t.epsilon}_${t.format}_${r}_${n}`,inputDependencies:l?["rank","type","type","type","type"]:void 0},getShaderSource:m,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:l?[{type:12,data:u},...M(s)]:[{type:12,data:u}]})}},Za=e=>Y(e),Mu=(e,t)=>{let{inputs:i,outputCount:r}=e,a=Za({...t,outputCount:r});if(ie.webgpu.validateInputContent&&ja(i,a),t.trainingMode)throw new Error("BatchNormalization trainingMode is not supported yet.");e.compute(Qa(i,a))}}),Xa,Ya,Uu,Vp=E(()=>{"use strict";W(),F(),Xa=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![320,640,1280].includes(e[0].dims[2]))throw new Error("number of channels should be 320, 640 or 1280");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},Ya=e=>{let t=e[0].dims,i=e[0].dims[2],r=k.size(t)/4,a=e[0].dataType,s=T("input",a,t,4),n=T("bias",a,[i],4),o=T("residual",a,t,4),u=B("output",a,t,4);return{name:"BiasAdd",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(r/64)}}),getShaderSource:l=>`
  const channels = ${i}u / 4;
  ${l.declareVariables(s,n,o,u)}

  ${l.mainStart()}
    ${l.guardAgainstOutOfBoundsWorkgroupSizes(r)}
    let value = ${s.getByOffset("global_idx")}
      + ${n.getByOffset("global_idx % channels")} + ${o.getByOffset("global_idx")};
    ${u.setByOffset("global_idx","value")}
  }`}},Uu=e=>{Xa(e.inputs),e.compute(Ya(e.inputs))}}),Ja,X,Pu,qu,Nu,Lu,Vu,Gu,Wu,Fu,Hu,es,Ku,ju,Qu,Zu,bt,Xu,Lt,Yu,Ju,el,tl,il,rl,al,sl,nl,ol,ul,ll,dl,pl,cl,hl,fl,$i,ml,ar,sr,gl,_l,yl,ts,is,$l,Er=E(()=>{"use strict";N(),W(),ae(),F(),Ja=(e,t,i,r,a,s,n)=>{let o=Math.ceil(t/4),u="";typeof a=="string"?u=`${a}(a)`:u=a("a");let l=T("inputData",i,[o],4),p=B("outputData",r,[o],4),d=[{name:"vec_size",type:"u32"}];return n&&d.push(...n),`
      ${e.registerUniforms(d).declareVariables(l,p)}

  ${s??""}

  ${e.mainStart()}
    ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}

    let a = ${l.getByOffset("global_idx")};
    ${p.setByOffset("global_idx",u)}
  }`},X=(e,t,i,r,a,s=e.dataType,n,o)=>{let u=[{type:12,data:Math.ceil(k.size(e.dims)/4)}];return n&&u.push(...n),{name:t,shaderCache:{hint:a,inputDependencies:["type"]},getShaderSource:l=>Ja(l,k.size(e.dims),e.dataType,s,i,r,o),getRunData:l=>({outputs:[{dims:e.dims,dataType:s}],dispatchGroup:{x:Math.ceil(k.size(l[0].dims)/64/4)},programUniforms:u})}},Pu=e=>{e.compute(X(e.inputs[0],"Abs","abs"))},qu=e=>{e.compute(X(e.inputs[0],"Acos","acos"))},Nu=e=>{e.compute(X(e.inputs[0],"Acosh","acosh"))},Lu=e=>{e.compute(X(e.inputs[0],"Asin","asin"))},Vu=e=>{e.compute(X(e.inputs[0],"Asinh","asinh"))},Gu=e=>{e.compute(X(e.inputs[0],"Atan","atan"))},Wu=e=>{e.compute(X(e.inputs[0],"Atanh","atanh"))},Fu=e=>Y(e),Hu=(e,t)=>{let i;switch(t.to){case 10:i="vec4<f16>";break;case 1:i="vec4<f32>";break;case 12:i="vec4<u32>";break;case 6:i="vec4<i32>";break;case 9:i="vec4<bool>";break;default:throw new RangeError(`not supported type (specified in attribute 'to' from 'Cast' operator): ${t.to}`)}e.compute(X(e.inputs[0],"Cast",i,void 0,t.cacheKey,t.to))},es=e=>{let t,i,r=e.length>=2&&e[1].data!==0,a=e.length>=3&&e[2].data!==0;switch(e[0].dataType){case 1:t=r?e[1].getFloat32Array()[0]:-34028234663852886e22,i=a?e[2].getFloat32Array()[0]:34028234663852886e22;break;case 10:t=r?e[1].getUint16Array()[0]:64511,i=a?e[2].getUint16Array()[0]:31743;break;default:throw new Error("Unsupport data type")}return Y({min:t,max:i})},Ku=(e,t)=>{let i=t||es(e.inputs),r=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"Clip",a=>`clamp(${a}, vec4<${r}>(uniforms.min), vec4<${r}>(uniforms.max))`,void 0,i.cacheKey,void 0,[{type:e.inputs[0].dataType,data:i.min},{type:e.inputs[0].dataType,data:i.max}],[{name:"min",type:r},{name:"max",type:r}]),{inputs:[0]})},ju=e=>{e.compute(X(e.inputs[0],"Ceil","ceil"))},Qu=e=>{e.compute(X(e.inputs[0],"Cos","cos"))},Zu=e=>{e.compute(X(e.inputs[0],"Cosh","cosh"))},bt=e=>Y(e),Xu=(e,t)=>{let i=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"Elu",r=>`elu_vf32(${r})`,`
  const elu_alpha_ = ${i}(${t.alpha});

  fn elu_f32(a: ${i}) -> ${i} {
  return select((exp(a) - 1.0) * elu_alpha_, a, a >= 0.0);
  }

  fn elu_vf32(v: vec4<${i}>) -> vec4<${i}> {
  return vec4(elu_f32(v.x), elu_f32(v.y), elu_f32(v.z), elu_f32(v.w));
  }`,t.cacheKey))},Lt=(e="f32")=>`
const r0: ${e} = 0.3275911;
const r1: ${e} = 0.254829592;
const r2: ${e} = -0.284496736;
const r3: ${e} = 1.421413741;
const r4: ${e} = -1.453152027;
const r5: ${e} = 1.061405429;

fn erf_vf32(v: vec4<${e}>) -> vec4<${e}> {
  let absv = abs(v);
  let x = 1.0 / (1.0 + r0 * absv);
  return sign(v) * (1.0 - ((((r5 * x + r4) * x + r3) * x + r2) * x + r1) * x * exp(-absv * absv));
}`,Yu=e=>{let t=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"Erf",i=>`erf_vf32(${i})`,Lt(t)))},Ju=e=>{e.compute(X(e.inputs[0],"Exp","exp"))},el=e=>{e.compute(X(e.inputs[0],"Floor","floor"))},tl=e=>{let t=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"Gelu",i=>`0.5 * ${i} * (1.0 + erf_vf32(${i} * 0.7071067811865475))`,Lt(t)))},il=(e,t)=>{let i=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"LeakyRelu",r=>`select(leaky_relu_alpha_ * ${r}, ${r}, ${r} >= vec4<${i}>(0.0))`,`const leaky_relu_alpha_ = ${i}(${t.alpha});`,t.cacheKey))},rl=e=>{e.compute(X(e.inputs[0],"Not",t=>`!${t}`))},al=e=>{e.compute(X(e.inputs[0],"Neg",t=>`-${t}`))},sl=e=>{e.compute(X(e.inputs[0],"Reciprocal",t=>`1.0/${t}`))},nl=e=>{let t=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"Relu",i=>`select(vec4<${t}>(0.0), ${i}, ${i} > vec4<${t}>(0.0))`))},ol=e=>{e.compute(X(e.inputs[0],"Sigmoid",t=>`(1.0 / (1.0 + exp(-${t})))`))},ul=e=>Y(e),ll=(e,t)=>{let i=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"HardSigmoid",r=>`max(vec4<${i}>(0.0), min(vec4<${i}>(1.0), ${t.alpha} * ${r} + vec4<${i}>(${t.beta})))`,void 0,t.cacheKey))},dl=e=>{let t=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"HardSwish",i=>`${i} * max(vec4<${t}>(0.0), min(vec4<${t}>(1.0), vec4<${t}>(${t}(1.0 / 6.0)) * ${i} + vec4<${t}>(0.5)))`))},pl=e=>{e.compute(X(e.inputs[0],"Sin","sin"))},cl=e=>{e.compute(X(e.inputs[0],"Sinh","sinh"))},hl=e=>{e.compute(X(e.inputs[0],"Sqrt","sqrt"))},fl=e=>{e.compute(X(e.inputs[0],"Tan","tan"))},$i=e=>`sign(${e}) * (1 - exp(-2 * abs(${e}))) / (1 + exp(-2 * abs(${e})))`,ml=e=>{e.compute(X(e.inputs[0],"Tanh",$i))},ar=(e="f32")=>`
const fast_gelu_a: ${e} = 0.5;
const fast_gelu_b: ${e} = 0.7978845608028654;
const fast_gelu_c: ${e} = 0.035677408136300125;

fn tanh_v(v: vec4<${e}>) -> vec4<${e}> {
  return ${$i("v")};
}
`,sr=e=>`(fast_gelu_a + fast_gelu_a * tanh_v(${e} * (fast_gelu_c * ${e} * ${e} + fast_gelu_b))) * ${e}`,gl=e=>{let t=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"FastGelu",sr,ar(t),void 0,e.inputs[0].dataType))},_l=(e,t)=>{let i=oe(e.inputs[0].dataType);return e.compute(X(e.inputs[0],"ThresholdedRelu",r=>`select(vec4<${i}>(0.0), ${r}, ${r} > thresholded_relu_alpha_)`,`const thresholded_relu_alpha_ = vec4<${i}>(${t.alpha});`,t.cacheKey)),0},yl=e=>{e.compute(X(e.inputs[0],"Log","log"))},ts=(e,t)=>`
const alpha = vec4<${e}>(${t});
const one = ${e}(1.0);
const zero = ${e}(0.0);

fn quick_gelu_impl(x: vec4<${e}>) -> vec4<${e}> {
  let v = x *alpha;
  var x1 : vec4<${e}>;
  for (var i = 0; i < 4; i = i + 1) {
    if (v[i] >= zero) {
      x1[i] = one / (one + exp(-v[i]));
    } else {
      x1[i] = one - one / (one + exp(v[i]));
    }
  }
  return x * x1;
}
`,is=e=>`quick_gelu_impl(${e})`,$l=(e,t)=>{let i=oe(e.inputs[0].dataType);e.compute(X(e.inputs[0],"QuickGelu",is,ts(i,t.alpha),t.cacheKey,e.inputs[0].dataType))}}),rs,as,wl,Gp=E(()=>{"use strict";W(),F(),Er(),rs=e=>{if(e[0].dims.length!==3)throw new Error("input should have 3 dimensions");if(![2560,5120,10240].includes(e[0].dims[2]))throw new Error("hidden state should be 2560, 5120 or 10240");if(e[1].dims.length!==1)throw new Error("bias is expected to have 1 dimensions");if(e[0].dims[2]!==e[1].dims[0])throw new Error("last dimension of input and bias are not the same")},as=e=>{let t=e[0].dims.slice();t[2]=t[2]/2;let i=T("input",e[0].dataType,e[0].dims,4),r=T("bias",e[0].dataType,[e[0].dims[2]],4),a=B("output",e[0].dataType,t,4),s=k.size(t)/4,n=ue(e[0].dataType);return{name:"BiasSplitGelu",getRunData:()=>({outputs:[{dims:t,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)}}),getShaderSource:o=>`
  const M_SQRT2 = sqrt(2.0);
  const halfChannels = ${e[0].dims[2]/4/2}u;

  ${o.declareVariables(i,r,a)}

  ${Lt(n)}

  ${o.mainStart()}
    ${o.guardAgainstOutOfBoundsWorkgroupSizes(s)}
    let biasIdx = global_idx % halfChannels;
    let batchIndex = global_idx / halfChannels;
    let inputOffset = biasIdx + batchIndex * halfChannels * 2;
    let valueLeft = input[inputOffset] + bias[biasIdx];
    let valueRight = input[inputOffset + halfChannels] + bias[biasIdx + halfChannels];
    let geluRight = valueRight * 0.5 * (erf_vf32(valueRight / M_SQRT2) + 1);

    ${a.setByOffset("global_idx","valueLeft * geluRight")}
  }`}},wl=e=>{rs(e.inputs),e.compute(as(e.inputs))}}),ss,ns,ke,bl,vl,xl,kl,Sl,Tl,Il,zl,El,Cl,Wp=E(()=>{"use strict";N(),W(),F(),ss=(e,t,i,r,a,s,n,o,u,l,p,d)=>{let c,f;typeof o=="string"?c=f=(m,w)=>`${o}((${m}),(${w}))`:typeof o=="function"?c=f=o:(c=o.scalar,f=o.vector);let h=B("outputData",p,r.length,4),g=T("aData",u,t.length,4),y=T("bData",l,i.length,4),_;if(a)if(s){let m=k.size(t)===1,w=k.size(i)===1,$=t.length>0&&t[t.length-1]%4===0,b=i.length>0&&i[i.length-1]%4===0;m||w?_=h.setByOffset("global_idx",f(m?`${g.type.value}(${g.getByOffset("0")}.x)`:g.getByOffset("global_idx"),w?`${y.type.value}(${y.getByOffset("0")}.x)`:y.getByOffset("global_idx"))):_=`
            let outputIndices = ${h.offsetToIndices("global_idx * 4u")};
            let offsetA = ${g.broadcastedIndicesToOffset("outputIndices",h)};
            let offsetB = ${y.broadcastedIndicesToOffset("outputIndices",h)};
            ${h.setByOffset("global_idx",f(n||$?g.getByOffset("offsetA / 4u"):`${g.type.value}(${g.getByOffset("offsetA / 4u")}[offsetA % 4u])`,n||b?y.getByOffset("offsetB / 4u"):`${y.type.value}(${y.getByOffset("offsetB / 4u")}[offsetB % 4u])`))}
          `}else _=h.setByOffset("global_idx",f(g.getByOffset("global_idx"),y.getByOffset("global_idx")));else{if(!s)throw new Error("no necessary to use scalar implementation for element-wise binary op implementation.");let m=(w,$,b="")=>{let v=`aData[indexA${$}][componentA${$}]`,x=`bData[indexB${$}][componentB${$}]`;return`
            let outputIndices${$} = ${h.offsetToIndices(`global_idx * 4u + ${$}u`)};
            let offsetA${$} = ${g.broadcastedIndicesToOffset(`outputIndices${$}`,h)};
            let offsetB${$} = ${y.broadcastedIndicesToOffset(`outputIndices${$}`,h)};
            let indexA${$} = offsetA${$} / 4u;
            let indexB${$} = offsetB${$} / 4u;
            let componentA${$} = offsetA${$} % 4u;
            let componentB${$} = offsetB${$} % 4u;
            ${w}[${$}] = ${b}(${c(v,x)});
          `};p===9?_=`
            var data = vec4<u32>(0);
            ${m("data",0,"u32")}
            ${m("data",1,"u32")}
            ${m("data",2,"u32")}
            ${m("data",3,"u32")}
            outputData[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:_=`
            ${m("outputData[global_idx]",0)}
            ${m("outputData[global_idx]",1)}
            ${m("outputData[global_idx]",2)}
            ${m("outputData[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(g,y,h)}

        ${d??""}

        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${_}
      }`},ns=(e,t,i,r,a,s,n=i.dataType)=>{let o=i.dims.map(Number),u=r.dims.map(Number),l=!k.areEqual(o,u),p=o,d=k.size(o),c=!1,f=!1,h=[l];if(l){let g=ot.calcShape(o,u,!1);if(!g)throw new Error("Can't perform binary op on the given tensors");p=g.slice(),d=k.size(p);let y=k.size(o)===1,_=k.size(u)===1,m=o.length>0&&o[o.length-1]%4===0,w=u.length>0&&u[u.length-1]%4===0;h.push(y),h.push(_),h.push(m),h.push(w);let $=1;for(let b=1;b<p.length;b++){let v=o[o.length-b],x=u[u.length-b];if(v===x)$*=v;else break}$%4===0?(f=!0,c=!0):(y||_||m||w)&&(c=!0)}else c=!0;return h.push(c),{name:e,shaderCache:{hint:t+h.map(g=>g.toString()).join("_"),inputDependencies:["rank","rank"]},getShaderSource:g=>ss(g,o,u,p,c,l,f,a,i.dataType,r.dataType,n,s),getRunData:()=>({outputs:[{dims:p,dataType:n}],dispatchGroup:{x:Math.ceil(d/64/4)},programUniforms:[{type:12,data:Math.ceil(k.size(p)/4)},...M(o,u,p)]})}},ke=(e,t,i,r,a,s)=>{e.compute(ns(t,a??"",e.inputs[0],e.inputs[1],i,r,s))},bl=e=>{ke(e,"Add",(t,i)=>`${t}+${i}`)},vl=e=>{ke(e,"Div",(t,i)=>`${t}/${i}`)},xl=e=>{ke(e,"Equal",{scalar:(t,i)=>`u32(${t}==${i})`,vector:(t,i)=>`vec4<u32>(${t}==${i})`},void 0,void 0,9)},kl=e=>{ke(e,"Mul",(t,i)=>`${t}*${i}`)},Sl=e=>{let t=T("input",e.inputs[0].dataType,e.inputs[0].dims).type.value;ke(e,"Pow",{scalar:(i,r)=>`pow_custom(${i},${r})`,vector:(i,r)=>`pow_vector_custom(${i},${r})`},`
    fn pow_custom(a : ${t}, b : ${t}) -> ${t} {
      if (b == ${t}(0.0)) {
        return ${t}(1.0);
      } else if (a < ${t}(0.0) && f32(b) != floor(f32(b))) {
        return ${t}(pow(f32(a), f32(b))); // NaN
      }
      return select(sign(a), ${t}(1.0), round(f32(abs(b) % ${t}(2.0))) != 1.0) * ${t}(${t==="i32"?"round":""}(pow(f32(abs(a)), f32(b))));
    }
    fn pow_vector_custom(a : vec4<${t}>, b : vec4<${t}>) -> vec4<${t}> {
      // TODO: implement vectorized pow
      return vec4<${t}>(pow_custom(a.x, b.x), pow_custom(a.y, b.y), pow_custom(a.z, b.z), pow_custom(a.w, b.w));
    }
      `)},Tl=e=>{ke(e,"Sub",(t,i)=>`${t}-${i}`)},Il=e=>{ke(e,"Greater",{scalar:(t,i)=>`u32(${t}>${i})`,vector:(t,i)=>`vec4<u32>(${t}>${i})`},void 0,void 0,9)},zl=e=>{ke(e,"Less",{scalar:(t,i)=>`u32(${t}<${i})`,vector:(t,i)=>`vec4<u32>(${t}<${i})`},void 0,void 0,9)},El=e=>{ke(e,"GreaterOrEqual",{scalar:(t,i)=>`u32(${t}>=${i})`,vector:(t,i)=>`vec4<u32>(${t}>=${i})`},void 0,void 0,9)},Cl=e=>{ke(e,"LessOrEqual",{scalar:(t,i)=>`u32(${t}<=${i})`,vector:(t,i)=>`vec4<u32>(${t}<=${i})`},void 0,void 0,9)}}),os,us,ls,ds,Ol,Bl,Fp=E(()=>{"use strict";N(),W(),ae(),F(),os=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");let i=0,r=e[i],a=r.dataType,s=r.dims.length;e.forEach((n,o)=>{if(o!==i){if(n.dataType!==a)throw new Error("input tensors should be one type");if(n.dims.length!==s)throw new Error("input tensors should have the same shape");n.dims.forEach((u,l)=>{if(l!==t&&u!==r.dims[l])throw new Error("non concat dimensions must match")})}})},us=(e,t)=>`
  fn calculateInputIndex(index: u32) -> u32 {
    let sizeInConcatAxis = array<u32, ${e}u>(${t});
    for (var i: u32 = 0u; i < ${e}; i += 1u ) {
      if (index < sizeInConcatAxis[i]) {
        return i;
      }
    }
    return ${e}u;
  }`,ls=(e,t)=>{let i=e.length,r=[];for(let a=0;a<i;++a){let s=t.setByOffset("global_idx",e[a].getByIndices("indices"));i===1?r.push(s):a===0?r.push(`if (inputIndex == ${a}u) { ${s} }`):a===i-1?r.push(`else { ${s} }`):r.push(`else if (inputIndex == ${a}) { ${s} }`)}return r.join(`
`)},ds=(e,t,i,r)=>{let a=k.size(i),s=new Array(e.length),n=new Array(e.length),o=0,u=[],l=[],p=[{type:12,data:a}];for(let g=0;g<e.length;++g)o+=e[g].dims[t],s[g]=o,l.push(e[g].dims.length),n[g]=T(`input${g}`,r,l[g]),u.push("rank"),p.push({type:12,data:s[g]});for(let g=0;g<e.length;++g)p.push(...M(e[g].dims));p.push(...M(i));let d=B("output",r,i.length),c=d.indicesGet("indices",t),f=Array.from(Array(s.length).keys()).map(g=>`uniforms.sizeInConcatAxis${g}`).join(","),h=g=>`

  ${(()=>{g.registerUniform("outputSize","u32");for(let y=0;y<e.length;y++)g.registerUniform(`sizeInConcatAxis${y}`,"u32");return g.declareVariables(...n,d)})()}

  ${us(s.length,f)}

  ${g.mainStart()}
    ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

    var indices = ${d.offsetToIndices("global_idx")};

    let inputIndex = calculateInputIndex(${c});
    if (inputIndex != 0u) {
      let sizeInConcatAxis = array<u32, ${s.length}u>(${f});
      ${c} -= sizeInConcatAxis[inputIndex - 1u];
    }

    ${ls(n,d)}
  }`;return{name:"Concat",shaderCache:{hint:`${t}`,inputDependencies:u},getRunData:()=>({outputs:[{dims:i,dataType:r}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:p}),getShaderSource:h}},Ol=(e,t)=>{let i=e.inputs,r=i[0].dims,a=k.normalizeAxis(t.axis,r.length);os(i,a);let s=r.slice();s[a]=i.reduce((o,u)=>o+(u.dims.length>a?u.dims[a]:0),0);let n=i.filter(o=>k.size(o.dims)>0);e.compute(ds(n,a,s,i[0].dataType),{inputs:n})},Bl=e=>Y({axis:e.axis})}),Je,et,tt,Cr,rt=E(()=>{"use strict";N(),W(),Je=(e,t,i="f32")=>{switch(e.activation){case"Relu":return`value = max(value, ${t}(0.0));`;case"Sigmoid":return`value = (${t}(1.0) / (${t}(1.0) + exp(-value)));`;case"Clip":return`value = clamp(value, ${t}(${i}(uniforms.clip_min)), ${t}(${i}(uniforms.clip_max)));`;case"HardSigmoid":return`value = max(${t}(0.0), min(${t}(1.0), ${i}(uniforms.alpha) * value + ${i}(uniforms.beta)));`;case"LeakyRelu":return`value = select(${i}(uniforms.alpha) * value, value, value >= ${t}(0.0));`;case"Tanh":return`let e2x = exp(-2.0 * abs(value));
              value = sign(value) * (1.0 - e2x) / (1.0 + e2x);
        `;case"":return"";default:throw new Error(`Unsupported activation ${e.activation}`)}},et=(e,t)=>{e.activation==="Clip"?t.push({type:1,data:e.clipMax},{type:1,data:e.clipMin}):e.activation==="HardSigmoid"?t.push({type:1,data:e.alpha},{type:1,data:e.beta}):e.activation==="LeakyRelu"&&t.push({type:1,data:e.alpha})},tt=(e,t)=>{e.activation==="Clip"?t.push({name:"clip_max",type:"f32"},{name:"clip_min",type:"f32"}):e.activation==="HardSigmoid"?t.push({name:"alpha",type:"f32"},{name:"beta",type:"f32"}):e.activation==="LeakyRelu"&&t.push({name:"alpha",type:"f32"})},Cr=e=>{let t=e?.activation||"";if(t==="HardSigmoid"){let[i,r]=e?.activation_params||[.2,.5];return{activation:t,alpha:i,beta:r}}else if(t==="Clip"){let[i,r]=e?.activation_params||[ru,au];return{activation:t,clipMax:r,clipMin:i}}else if(t==="LeakyRelu"){let[i]=e?.activation_params||[.01];return{activation:t,alpha:i}}return{activation:t}}}),de,Rl,Or=E(()=>{"use strict";de=(e,t)=>{switch(e){case 1:return t;case 2:return`vec2<${t}>`;case 3:return`vec3<${t}>`;case 4:return`vec4<${t}>`;default:throw new Error(`${e}-component is not supported.`)}},Rl=e=>`
      ${e?"value = value + getBiasByOutputCoords(coords);":""}
      `}),Al,Hp=E(()=>{"use strict";Al=e=>`
fn getIndexFromCoords4D(coords : vec4<i32>, shape : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
      shape.y * shape.z * shape.w, shape.z * shape.w, shape.w, 1));
}
fn getOutputIndexFromCoords(coords : vec4<i32>) -> i32 {
  return dot(coords, vec4<i32>(
    i32(${e}.x), i32(${e}.y), i32(${e}.z), 1));
}
`}),xt,Br,Rr=E(()=>{"use strict";N(),W(),F(),rt(),xt=(e,t,i,r,a)=>{let s=r-i;return`
      ${Array.from({length:i}).map((n,o)=>`
      if (${A(t.shape,o,t.rank)} != 1) {
        ${t.indicesSet(e,o,A(a,o+s,r))}
      } else {
        ${t.indicesSet(e,o,0)}
      }`).join("")}
`},Br=(e,t,i,r,a=!1,s)=>{let n=e[0].dims,o=e[1].dims,u=n[n.length-2],l=o[o.length-1],p=n[n.length-1],d=re(l),c=re(p),f=re(u),h=k.size(i)/d/f,g=e.length>2,y=r?r.slice(0,-2):i.slice(0,-2),_=[k.size(y),u,l],m=[{type:12,data:h},{type:12,data:u},{type:12,data:l},{type:12,data:p}];et(t,m),m.push(...M(y,n,o)),g&&m.push(...M(e[2].dims)),m.push(...M(_));let w=$=>{let b=Tr("batch_dims",e[0].dataType,y.length),v=T("a",e[0].dataType,n.length,c),x=T("b",e[1].dataType,o.length,d),S=B("output",e[0].dataType,_.length,d),I=ue(S.type.tensor),C=Je(t,S.type.value,I),H=[v,x],U="";if(g){let O=a?d:1;H.push(T("bias",e[2].dataType,e[2].dims.length,O)),U=`${a?`value += bias[col / ${O}];`:`value += ${S.type.value}(bias[row + i]);`}`}let P=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"}];tt(t,P);let Z=()=>{let O=`var a_data: ${v.type.value};`;for(let D=0;D<c;D++)O+=`
              let b_data${D} = b[(b_offset + (k + ${D}) * uniforms.N + col) / ${d}];`;for(let D=0;D<f;D++){O+=`a_data = a[(a_offset + (row + ${D}) * uniforms.K + k) / ${c}];`;for(let G=0;G<c;G++)O+=`
            values[${D}] = fma(${x.type.value}(a_data${c===1?"":`[${G}]`}), b_data${G}, values[${D}]);
`}return O};return`
  ${$.registerUniforms(P).registerInternalVariables(b).declareVariables(...H,S)}
  ${$.mainStart()}
    ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let col = (global_idx % (uniforms.N / ${d})) * ${d};
    var index1 = global_idx / (uniforms.N / ${d});
    let stride1 = uniforms.M / ${f};
    let row = (index1 % stride1) * ${f};
    let batch = index1 / stride1;

    ${i.length===2?"":`let batch_indices = ${b.offsetToIndices("batch")};`}

    var a_indices: ${v.type.indices};
    ${xt("a_indices",v,v.rank-2,b.rank,"batch_indices")}
    ${v.indicesSet("a_indices",v.rank-2,0)}
    ${v.indicesSet("a_indices",v.rank-1,0)}
    let a_offset = ${v.indicesToOffset("a_indices")};

    var b_indices: ${x.type.indices};
    ${xt("b_indices",x,x.rank-2,b.rank,"batch_indices")}
    ${x.indicesSet("b_indices",x.rank-2,0)}
    ${x.indicesSet("b_indices",x.rank-1,0)}
    let b_offset = ${x.indicesToOffset("b_indices")};
    var values: array<${S.type.value}, ${f}>;
    for (var k: u32 = 0u; k < uniforms.K; k = k + ${c}) {
      ${Z()}
    }
    for (var i = 0u; i < ${f}u; i++) {
      var value = values[i];
      ${U}
      ${C}
      let cur_indices = ${S.type.indices}(batch, row + i, col);
      let offset = ${S.indicesToOffset("cur_indices")};
      ${S.setByOffset(`offset / ${d}`,"value")};
    }
  }
  `};return{name:"MatMulNaive",shaderCache:{hint:`${t.activation};${d};${c};${f};${a}`,inputDependencies:g?["rank","rank","rank"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:s?s(i):i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(h/64)},programUniforms:m}),getShaderSource:w}}}),ps,cs,nr,wi,hs,or,fs,Kt,Ar=E(()=>{"use strict";N(),W(),F(),rt(),Rr(),Or(),ps=(e,t)=>e?`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          kStart + inputRow,
          globalRowStart / innerElementSize + inputCol${t?", batchIndices":""});
        `:`
        mm_Asub[inputRow][inputCol] = mm_readA(batch,
          globalRow + innerRow,
          kStart / innerElementSize + inputCol${t?", batchIndices":""});
        `,cs=(e,t)=>e?`
        let ACached0 = mm_Asub[k * innerElementSize][localRow];
        let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];
        let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];
        ${t===3?"":"let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];"}
        for (var i = 0; i < rowPerThread; i = i + 1) {
          acc[i] = BCached0 * ACached0[i] + acc[i];
          acc[i] = BCached1 * ACached1[i] + acc[i];
          acc[i] = BCached2 * ACached2[i] + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached3[i] + acc[i];"}
        }`:`
        for (var i = 0; i < rowPerThread; i = i + 1) {
          let ACached = mm_Asub[tileRow + i][k];
          acc[i] = BCached0 * ACached.x + acc[i];
          acc[i] = BCached1 * ACached.y + acc[i];
          acc[i] = BCached2 * ACached.z + acc[i];
          ${t===3?"":"acc[i] = BCached3 * ACached.w + acc[i];"}
        }`,nr=(e,t,i="f32",r,a=!1,s=32,n=!1,o=32)=>{let u=t[1]*e[1],l=t[0]*e[0],p=a?u:s,d=a?s:u,c=p/t[0],f=s/t[1];if(!((a&&c===4&&e[1]===4||!a&&(c===3||c===4))&&p%t[0]===0&&s%t[1]===0&&e[0]===4))throw new Error(`If transposeA ${a} is true, innerElementSize ${c} and workPerThread[1] ${e[1]} must be 4.
      Otherwise, innerElementSize ${c} must be 3 or 4.
  tileAWidth ${p} must be divisible by workgroupSize[0]${t[0]}. tileInner ${s} must be divisible by workgroupSize[1] ${t[1]}. colPerThread ${e[0]} must be 4.`);return`
var<workgroup> mm_Asub: array<array<vec${c}<${i}>, ${p/c}>, ${d}>;
var<workgroup> mm_Bsub: array<array<vec4<${i}>, ${l/e[0]}>, ${s}>;

const rowPerThread = ${e[1]};
const colPerThread = ${e[0]};
const innerElementSize = ${c};
const tileInner = ${s};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
  let localRow = i32(localId.y);
  let tileRow = localRow * rowPerThread;
  let tileCol = i32(localId.x);

  let globalRow =i32(globalId.y) * rowPerThread;
  let globalCol = i32(globalId.x);
  let batch = ${n?"0":"i32(globalId.z)"};
  ${r?`let batchIndices = ${r.offsetToIndices("u32(batch)")};`:""}
  let globalRowStart = i32(workgroupId.y) * ${u};

  let num_tiles = ${n?`${Math.ceil(o/s)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
  var kStart = ${n?`i32(globalId.z) * ${o}`:"0"};

  var acc: array<vec4<${i}>, rowPerThread>;

  // Loop over shared dimension.
  let tileRowB = localRow * ${f};
  for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let inputRow = tileRow + innerRow;
          let inputCol = tileCol;
          ${ps(a,r)}
      }

      // Load one tile of B into local memory.
      for (var innerRow = 0; innerRow < ${f}; innerRow = innerRow + 1) {
          let inputRow = tileRowB + innerRow;
          let inputCol = tileCol;
          mm_Bsub[inputRow][inputCol] = mm_readB(batch, kStart + inputRow, globalCol${r?", batchIndices":""});
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      for (var k = 0; k < tileInner / innerElementSize; k = k + 1) {
          let BCached0 = mm_Bsub[k * innerElementSize][tileCol];
          let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];
          let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];
          ${c===3?"":"let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];"}

          ${cs(a,c)}
      }

      workgroupBarrier();
  }

  for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      mm_write(batch, globalRow + innerRow, globalCol, acc[innerRow]);
  }
}`},wi=(e,t)=>e?`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              kStart + inputRow,
              globalRowStart + inputCol${t?", batchIndices":""});
            `:`
            mm_Asub[inputRow][inputCol] = mm_readA(batch,
              globalRowStart + inputRow,
              kStart + inputCol${t?", batchIndices":""});
            `,hs=e=>e?"let ACached = mm_Asub[k][tileRow + innerRow];":"let ACached = mm_Asub[tileRow + innerRow][k];",or=(e,t,i="f32",r,a=!1,s=32,n=!1,o=32,u=!1)=>{let l=e[1]*t[1],p=e[0]*t[0],d=a?l:s,c=a?s:l;if(!(c%t[1]===0&&d%t[0]===0&&s%t[1]===0))throw new Error(`tileAHight ${c} must be divisible by workgroupSize[1]${t[1]}, tileAWidth ${d} must be divisible by workgroupSize[0]${t[0]}, tileInner ${s} must be divisible by workgroupSize[1]${t[1]}`);let f=c/t[1],h=d/t[0],g=s/t[1],y=u?`
    let localRow = i32(localId.y);
    let localCol = i32(localId.x);
    let globalRowStart = i32(workgroupId.y) * ${l};
    let globalColStart = i32(workgroupId.x) * ${p};

    // Loop over shared dimension.
    for (var t = 0; t < num_tiles; t = t + 1) {
      // Load one tile of A into local memory.
      for (var inputRow = localRow; inputRow < ${c}; inputRow = inputRow + ${t[1]}) {
        for (var inputCol = localCol; inputCol < ${d}; inputCol = inputCol + ${t[0]}) {
          ${wi(a,r)}
        }
      }
      // Load one tile of B into local memory.
      for (var inputRow = localRow; inputRow < ${s}; inputRow = inputRow + ${t[1]}) {
            for (var inputCol = localCol; inputCol < ${p}; inputCol = inputCol + ${t[0]}) {
          mm_Bsub[inputRow][inputCol] = mm_readB(batch,
            kStart + inputRow,
            globalColStart + inputCol${r?", batchIndices":""});
        }
      }
      kStart = kStart + tileInner;
      workgroupBarrier();

      // Compute acc values for a single thread.
      var BCached : array<${i}, colPerThread>;
      for (var k = 0; k < tileInner; k = k + 1) {
        for (var inner = 0; inner < colPerThread; inner = inner + 1) {
          BCached[inner] = mm_Bsub[k][localCol + inner * ${t[0]}];
        }
        for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
          let ACached = ${a?`mm_Asub[k][localRow + innerRow * ${t[1]}];`:`mm_Asub[localRow + innerRow * ${t[1]}][k];`}
          for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
            acc[innerRow][innerCol] = acc[innerRow][innerCol] +
                ACached * BCached[innerCol];
          }
        }
      }
      workgroupBarrier();
    }
    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      let gRow = globalRowStart + localRow + innerRow * ${t[1]};
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        let gCol = globalColStart + localCol + innerCol * ${t[0]};
        mm_write(batch, gRow, gCol, acc[innerRow][innerCol]);
      }
    }
    `:`
let tileRow = i32(localId.y) * rowPerThread;
let tileCol = i32(localId.x) * colPerThread;

let globalRow = i32(globalId.y) * rowPerThread;
let globalCol = i32(globalId.x) * colPerThread;
let globalRowStart = i32(workgroupId.y) * ${l};

let tileRowA = i32(localId.y) * ${f};
let tileColA = i32(localId.x) * ${h};
let tileRowB = i32(localId.y) * ${g};
// Loop over shared dimension.
for (var t = 0; t < num_tiles; t = t + 1) {
  // Load one tile of A into local memory.
  for (var innerRow = 0; innerRow < ${f}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < ${h}; innerCol = innerCol + 1) {
      let inputRow = tileRowA + innerRow;
      let inputCol = tileColA + innerCol;
      ${wi(a,r)}
    }
  }

  // Load one tile of B into local memory.
  for (var innerRow = 0; innerRow < ${g}; innerRow = innerRow + 1) {
    for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
      let inputRow = tileRowB + innerRow;
      let inputCol = tileCol + innerCol;
      mm_Bsub[inputRow][inputCol] = mm_readB(batch,
        kStart + inputRow,
        globalCol + innerCol${r?", batchIndices":""});
    }
  }
  kStart = kStart + tileInner;
  workgroupBarrier();

  // Compute acc values for a single thread.
  var BCached : array<${i}, colPerThread>;
  for (var k = 0; k < tileInner; k = k + 1) {
    for (var inner = 0; inner < colPerThread; inner = inner + 1) {
      BCached[inner] = mm_Bsub[k][tileCol + inner];
    }

    for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
      ${hs(a)}
      for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
        acc[innerRow][innerCol] = acc[innerRow][innerCol] + ACached * BCached[innerCol];
      }
    }
  }

  workgroupBarrier();
}

for (var innerRow = 0; innerRow < rowPerThread; innerRow = innerRow + 1) {
  for (var innerCol = 0; innerCol < colPerThread; innerCol = innerCol + 1) {
    mm_write(batch, globalRow + innerRow, globalCol + innerCol,
        acc[innerRow][innerCol]);
  }
}
`;return`
  var<workgroup> mm_Asub : array<array<${i}, ${d}>, ${c}>;
  var<workgroup> mm_Bsub : array<array<${i}, ${p}>, ${s}>;
  const rowPerThread = ${e[1]};
  const colPerThread = ${e[0]};
  const tileInner = ${s};

@compute @workgroup_size(${t[0]}, ${t[1]}, ${t[2]})
fn main(@builtin(local_invocation_id) localId : vec3<u32>,
        @builtin(global_invocation_id) globalId : vec3<u32>,
        @builtin(workgroup_id) workgroupId : vec3<u32>) {
    let batch = ${n?"0":"i32(globalId.z)"};
    ${r?`let batchIndices = ${r.offsetToIndices("u32(batch)")};`:""}
    let num_tiles = ${n?`${Math.ceil(o/s)}`:"(uniforms.dim_inner - 1) / tileInner + 1"};
    var kStart = ${n?`i32(globalId.z) * ${o}`:"0"};

    var acc : array<array<${i}, colPerThread>, rowPerThread>;
    ${y}
  }
`},fs=(e,t,i,r,a=!1)=>{let[s,n,o,u]=r,l=ue(r[0].type.tensor);return`
    fn mm_readA(batch: i32, row: i32, colIn: i32, batchIndices: ${s.type.indices}) -> ${de(e,l)} {
      var value = ${de(e,l)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_a_outer && col < uniforms.dim_inner)
      {
        var aIndices: ${n.type.indices};
        ${xt("aIndices",n,n.rank-2,s.rank,"batchIndices")}
        ${n.indicesSet("aIndices",n.rank-2,"u32(row)")}
        ${n.indicesSet("aIndices",n.rank-1,"u32(colIn)")}
        value = ${n.getByIndices("aIndices")};
      }
      return value;
    }

    fn mm_readB(batch: i32, row: i32, colIn: i32, batchIndices: ${s.type.indices}) -> ${de(e,l)} {
      var value = ${de(e,l)}(0.0);
      let col = colIn * ${e};
      if(row < uniforms.dim_inner && col < uniforms.dim_b_outer)
      {
        var bIndices: ${o.type.indices};
        ${xt("bIndices",o,o.rank-2,s.rank,"batchIndices")}
        ${o.indicesSet("bIndices",o.rank-2,"u32(row)")}
        ${o.indicesSet("bIndices",o.rank-1,"u32(colIn)")}
        value = ${o.getByIndices("bIndices")};
      }
      return value;
    }

    fn mm_write(batch: i32, row: i32, colIn: i32, valueIn: ${de(e,l)}) {
      let col = colIn * ${e};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer) {
        var value = valueIn;
        let coords = vec3<i32>(batch, row, colIn);
        ${t?`value = value + ${a?"bias[colIn]":`${de(e,l)}(bias[row])`};`:""}
        ${i}
        ${u.setByIndices("vec3<u32>(coords)","value")}
      }
    }
    `},Kt=(e,t,i,r,a=!1,s)=>{let n=e[0].dims,o=e[1].dims,u=n.slice(0,-2),l=o.slice(0,-2),p=r?r.slice(0,-2):i.slice(0,-2),d=k.size(p),c=n[n.length-2],f=n[n.length-1],h=o[o.length-1],g=f%4===0&&h%4===0,y=c<=8?[4,1,1]:[4,4,1],_=[8,8,1],m=[Math.ceil(h/_[0]/y[0]),Math.ceil(c/_[1]/y[1]),Math.ceil(d/_[2]/y[2])],w=g?4:1,$=[...u,c,f/w],b=$.length,v=[...l,f,h/w],x=v.length,S=[d,c,h/w],I=[{type:6,data:c},{type:6,data:h},{type:6,data:f}];et(t,I),I.push(...M(p,$,v));let C=["rank","rank"],H=e.length>2;H&&(I.push(...M(e[2].dims)),C.push("rank")),I.push(...M(S));let U=P=>{let Z=p.length,O=Tr("batchDims",e[0].dataType,Z,1),D=ue(e[0].dataType),G=T("a",e[0].dataType,b,w),K=T("b",e[1].dataType,x,w),V=B("result",e[0].dataType,S.length,w),j=[G,K];if(H){let pe=a?w:1;j.push(T("bias",e[2].dataType,e[2].dims.length,pe))}let z=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"}];tt(t,z);let L=ue(V.type.tensor),q=Je(t,V.type.value,L),R=fs(w,H,q,[O,G,K,V],a);return`
  ${P.registerUniforms(z).registerInternalVariables(O).declareVariables(...j,V)}
  ${R}
  ${g?nr(y,_,D,O):or(y,_,D,O)}
                   `};return{name:"MatMul",shaderCache:{hint:`${y};${t.activation};${g};${a}`,inputDependencies:C},getRunData:()=>({outputs:[{dims:s?s(i):i,dataType:e[0].dataType}],dispatchGroup:{x:m[0],y:m[1],z:m[2]},programUniforms:I}),getShaderSource:U}}}),ms,Dl,Kp=E(()=>{"use strict";N(),Ae(),F(),rt(),Or(),Hp(),Ar(),ms=(e,t,i,r,a=!1,s,n=4,o=4,u=4,l="f32")=>{let p=I=>{switch(I){case 1:return"resData = x[xIndex];";case 3:return`resData = vec3<${l}>(x[xIndex], x[xIndex + 1], x[xIndex + 2]);`;case 4:return"resData = x[xIndex / 4];";default:throw new Error(`innerElementSize ${I} is not supported.`)}},d=I=>{switch(I){case 1:return"return w[row * i32(uniforms.w_shape[3]) + colIn];";case 4:return"return w[row * i32(uniforms.w_shape[3]) / 4 + colIn];";default:throw new Error(`innerElementSize ${I} is not supported.`)}},c=e?`
    let coord = vec4<i32>(batch, xRow, xCol, xCh);
    `:`
    let coord = vec4<i32>(batch, xCh, xRow, xCol);
    `,f=e?`
    let coords = vec4<i32>(
      batch,
      row / outWidth,
      row % outWidth,
      col);
    `:`
    let coords = vec4<i32>(
      batch,
      row,
      col / outWidth,
      col % outWidth);
    `,h=e?"i32(uniforms.x_shape[1])":"i32(uniforms.x_shape[2])",g=e?"i32(uniforms.x_shape[2])":"i32(uniforms.x_shape[3])",y=e?"row":"col",_=e?"col":"row",m=`
    let inChannels = i32(uniforms.w_shape[2]);
    let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
    let outRow = ${y} / outWidth;
    let outCol = ${y} % outWidth;

    let WRow = ${_} / (i32(uniforms.w_shape[1]) * inChannels);
    let WCol = ${_} / inChannels % i32(uniforms.w_shape[1]);
    let xRow = outRow * uniforms.stride[0] + uniforms.dilation[0] * WRow - uniforms.pad[0];
    let xCol = outCol * uniforms.stride[1] + uniforms.dilation[1] * WCol - uniforms.pad[1];
    let xCh = ${_} % inChannels;
    var resData = ${de(n,l)}(0.0);
    // The bounds checking is always needed since we use it to pad zero for
    // the 'same' padding type.
    if (xRow >= 0 && xRow < ${h} && xCol >= 0 && xCol < ${g}) {
      ${c}
      let xIndex = getIndexFromCoords4D(coord, vec4<i32>(uniforms.x_shape));
      ${p(n)}
    }
    return resData;`,w=e?t&&r?`
    let col = colIn * ${n};
    ${m}`:`
    let col = colIn * ${n};
    if (row < uniforms.dim_a_outer && col < uniforms.dim_inner) {
      ${m}
    }
    return ${de(n,l)}(0.0);`:r&&i?`
    let col = colIn * ${n};
    ${m}`:`
    let col = colIn * ${n};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${m}
    }
    return ${de(n,l)}(0.0);`,$=e?r&&i?d(o):`
    let col = colIn * ${o};
    if (row < uniforms.dim_inner && col < uniforms.dim_b_outer) {
      ${d(o)}
    }
    return ${de(o,l)}(0.0);`:`
    let col = colIn * ${o};
    if (row < uniforms.dim_inner && col < uniforms.dim_a_outer) {
      ${d(o)}
    }
    return ${de(o,l)}(0.0);`,b=de(u,l),v=de(e?n:o,l),x=de(e?o:n,l),S=Je(s,b,l);return`
    fn mm_readA(batch: i32, row : i32, colIn : i32) -> ${v} {
      ${e?w:$}
    }

    fn mm_readB(batch: i32, row : i32, colIn : i32) -> ${x} {
      ${e?$:w}
    }

    fn mm_write(batch: i32, row : i32, colIn : i32, valueIn : ${b}) {
      let col = colIn * ${u};
      if (row < uniforms.dim_a_outer && col < uniforms.dim_b_outer)
      {
      var value = valueIn;
      let outWidth = ${e?"i32(uniforms.result_shape[2])":"i32(uniforms.result_shape[3])"};
      ${f}
      ${Rl(a)}
      ${S}
      setOutputAtCoords(coords[0], coords[1], coords[2], coords[3], value);
      }
    }`},Dl=(e,t,i,r,a,s,n,o,u)=>{let l=t.format==="NHWC",p=l?e[0].dims[3]:e[0].dims[1],d=i[0],c=l?i[2]:i[3],f=l?i[1]:i[2],h=l?i[3]:i[1],g=l&&(p%4===0||p%3===0)&&h%4===0,y=l?h:c*f,_=l?c*f:h,m=[8,8,1],w=r<=8?[4,1,1]:[4,4,1],$=[Math.ceil(y/m[0]/w[0]),Math.ceil(_/m[1]/w[1]),Math.ceil(d/m[2]/w[2])];Q("verbose",()=>`[conv2d_mm_webgpu] dispatch = ${$}`);let b=g?l&&p%4!==0?3:4:1,v=m[1]*w[1],x=m[0]*w[0],S=Math.max(m[0]*b,m[1]),I=r%v===0,C=a%x===0,H=s%S===0,U=g?[b,4,4]:[1,1,1],P=[{type:6,data:r},{type:6,data:a},{type:6,data:s},{type:6,data:[t.pads[0],t.pads[1]]},{type:6,data:t.strides},{type:6,data:t.dilations}];et(t,P),P.push(...M(e[0].dims,e[1].dims));let Z=["rank","rank"];n&&(P.push(...M(e[2].dims)),Z.push("rank")),P.push(...M(i));let O=D=>{let G=[{name:"dim_a_outer",type:"i32"},{name:"dim_b_outer",type:"i32"},{name:"dim_inner",type:"i32"},{name:"pad",type:"i32",length:2},{name:"stride",type:"i32",length:2},{name:"dilation",type:"i32",length:2}];tt(t,G);let K=g?4:1,V=ue(e[0].dataType),j=`
      fn setOutputAtIndex(flatIndex : i32, value : ${g?`vec4<${V}>`:V}) {
        result[flatIndex] = ${g?`vec4<${V}>`:V}(value);
      }
      fn setOutputAtCoords(d0 : i32, d1 : i32, d2 : i32, d3 : i32, value : ${g?`vec4<${V}>`:V}) {
        let flatIndex = getOutputIndexFromCoords(vec4<i32>(d0, d1, d2, d3));
        setOutputAtIndex(flatIndex ${g?"/ 4":""}, value);
      }`,z=T("x",e[0].dataType,e[0].dims.length,b===3?1:b),L=T("w",e[1].dataType,e[1].dims.length,K),q=[z,L],R=B("result",e[0].dataType,i.length,K);if(n){let pe=T("bias",e[2].dataType,e[2].dims.length,K);q.push(pe),j+=`
        fn getBiasByOutputCoords(coords : vec4<i32>) -> ${g?`vec4<${V}>`:V} {
          return bias[coords.${l?"w":"y"}${g?"/ 4":""}];
        }`}return`
        ${Al("uniforms.result_strides")}
        //struct Uniforms { xShape : vec4<i32>, wShape : vec4<i32>, outShape : vec4<i32>,
        //  outShapeStrides: vec3<i32>, filterDims : vec2<i32>, pad : vec2<i32>, stride : vec2<i32>,
        //  dilation : vec2<i32>, dimAOuter : i32, dimBOuter : i32, dimInner : i32 };
        ${D.registerUniforms(G).declareVariables(...q,R)}
        ${j}
        ${ms(l,I,C,H,n,t,U[0],U[1],U[2],V)}
        ${g?nr(w,m,V,void 0,!l,S):or(w,m,V,void 0,!l,S,!1,void 0,o)}`};return{name:"Conv2DMatMul",shaderCache:{hint:`${t.cacheKey};${b};${g};${I};${C};${H};${v};${x};${S}`,inputDependencies:Z},getRunData:()=>({outputs:[{dims:u?u(i):i,dataType:e[0].dataType}],dispatchGroup:{x:$[0],y:$[1],z:$[2]},programUniforms:P}),getShaderSource:O}}}),gs,bi,ht,_s,vi,ys,Ml,Ul,jp=E(()=>{"use strict";N(),Ae(),W(),F(),rt(),Or(),gs=e=>{let t=1;for(let i=0;i<e.length;i++)t*=e[i];return t},bi=e=>typeof e=="number"?[e,e,e]:e,ht=(e,t)=>t<=1?e:e+(e-1)*(t-1),_s=(e,t,i,r=1)=>{let a=ht(t,r);return Math.floor((e[0]*(i-1)-i+a)/2)},vi=(e,t,i,r,a)=>{a==null&&(a=_s(e,t[0],r[0]));let s=[0,0,0,i];for(let n=0;n<3;n++)e[n]+2*a>=t[n]&&(s[n]=Math.trunc((e[n]-t[n]+2*a)/r[n]+1));return s},ys=(e,t,i,r,a,s,n,o,u,l)=>{let p,d,c,f;if(e==="VALID"&&(e=0),typeof e=="number"){p={top:e,bottom:e,left:e,right:e,front:e,back:e};let h=vi([t,i,r,1],[o,u,l],1,[a,s,n],e);d=h[0],c=h[1],f=h[2]}else if(Array.isArray(e)){if(!e.every((g,y,_)=>g===_[0]))throw Error(`Unsupported padding parameter: ${e}`);p={top:e[0],bottom:e[1],left:e[2],right:e[3],front:e[4],back:e[5]};let h=vi([t,i,r,1],[o,u,l],1,[a,s,n],e[0]);d=h[0],c=h[1],f=h[2]}else if(e==="SAME_UPPER"){d=Math.ceil(t/a),c=Math.ceil(i/s),f=Math.ceil(r/n);let h=(d-1)*a+o-t,g=(c-1)*s+u-i,y=(f-1)*n+l-r,_=Math.floor(h/2),m=h-_,w=Math.floor(g/2),$=g-w,b=Math.floor(y/2),v=y-b;p={top:w,bottom:$,left:b,right:v,front:_,back:m}}else throw Error(`Unknown padding parameter: ${e}`);return{padInfo:p,outDepth:d,outHeight:c,outWidth:f}},Ml=(e,t,i,r,a,s=!1,n="channelsLast")=>{let o,u,l,p,d;if(n==="channelsLast")[o,u,l,p,d]=e;else if(n==="channelsFirst")[o,d,u,l,p]=e;else throw new Error(`Unknown dataFormat ${n}`);let[c,,f,h,g]=t,[y,_,m]=bi(i),[w,$,b]=bi(r),v=ht(f,w),x=ht(h,$),S=ht(g,b),{padInfo:I,outDepth:C,outHeight:H,outWidth:U}=ys(a,u,l,p,y,_,m,v,x,S),P=s?c*d:c,Z=[0,0,0,0,0];return n==="channelsFirst"?Z=[o,P,C,H,U]:n==="channelsLast"&&(Z=[o,C,H,U,P]),{batchSize:o,dataFormat:n,inDepth:u,inHeight:l,inWidth:p,inChannels:d,outDepth:C,outHeight:H,outWidth:U,outChannels:P,padInfo:I,strideDepth:y,strideHeight:_,strideWidth:m,filterDepth:f,filterHeight:h,filterWidth:g,effectiveFilterDepth:v,effectiveFilterHeight:x,effectiveFilterWidth:S,dilationDepth:w,dilationHeight:$,dilationWidth:b,inShape:e,outShape:Z,filterShape:t}},Ul=(e,t,i,r,a,s)=>{let n=s==="channelsLast",o=n?e[0].dims[3]:e[0].dims[1],u=!1,l=[64,1,1],p={x:i.map((m,w)=>w)},d=[Math.ceil(gs(p.x.map(m=>i[m]))/l[0]),1,1];Q("verbose",()=>`[conv3d_naive_webgpu] dispatch = ${d}`);let c=u?n&&o%4!==0?3:4:1,f=k.size(i),h=[{type:12,data:f},{type:12,data:r},{type:12,data:a},{type:12,data:t.strides},{type:12,data:t.dilations}];et(t,h),h.push(...M(e[0].dims,e[1].dims));let g=["rank","rank"],y=e.length===3;y&&(h.push(...M(e[2].dims)),g.push("rank")),h.push(...M(i));let _=m=>{let w=[{name:"output_size",type:"u32"},{name:"filter_dims",type:"u32",length:r.length},{name:"pads",type:"u32",length:a.length},{name:"strides",type:"u32",length:t.strides.length},{name:"dilations",type:"u32",length:t.dilations.length}];tt(t,w);let $=u?4:1,b=ue(e[0].dataType),v=T("x",e[0].dataType,e[0].dims.length,c===3?1:c),x=T("W",e[1].dataType,e[1].dims.length,$),S=[v,x],I=B("result",e[0].dataType,i.length,$),C="";if(y){let P=T("bias",e[2].dataType,e[2].dims.length,$);S.push(P),C+=`
        fn getBiasByOutputCoords(coords : array<u32, 5>) -> ${u?`vec4<${b}>`:b} {
          return bias[${n?A("coords",4,5):A("coords",1,5)}${u?"/ 4":""}];
        }`}let H=de(c,b),U=Je(t,H,b);return`
            ${C}
            fn getX(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${v.getByIndices("aIndices")};
            }
            fn getW(d0 : u32, d1 : u32, d2 : u32, d3 : u32, d4 : u32) -> f32 {
              let aIndices = array<u32, 5>(d0, d1, d2, d3, d4);
              return ${x.getByIndices("aIndices")};
            }
          ${m.registerUniforms(w).declareVariables(...S,I)}
          ${m.mainStart()}
          ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
              let coords = ${I.offsetToIndices("global_idx")};
              let batch = ${A("coords",0,v.rank)};
              let d2 = ${n?A("coords",v.rank-1,v.rank):A("coords",1,v.rank)};
              let xFRCCorner = vec3<u32>(${n?A("coords",1,v.rank):A("coords",2,v.rank)},
              ${n?A("coords",2,v.rank):A("coords",3,v.rank)},
              ${n?A("coords",3,v.rank):A("coords",4,v.rank)}) * uniforms.strides - uniforms.pads;
              let xFCorner = xFRCCorner.x;
              let xRCorner = xFRCCorner.y;
              let xCCorner = xFRCCorner.z;
              let xShapeY = ${n?A("uniforms.x_shape",1,v.rank):A("uniforms.x_shape",2,v.rank)};
              let xShapeZ = ${n?A("uniforms.x_shape",2,v.rank):A("uniforms.x_shape",3,v.rank)};
              let xShapeW = ${n?A("uniforms.x_shape",3,v.rank):A("uniforms.x_shape",4,v.rank)};
              let xShapeU = ${n?A("uniforms.x_shape",4,v.rank):A("uniforms.x_shape",1,v.rank)};
              let inputDepthNearestVec4 = (xShapeU / 4) * 4;
              let inputDepthVec4Remainder = xShapeU % 4;

              var value = 0.0;
              for (var wF = 0u; wF < uniforms.filter_dims[0]; wF++) {
                let xF = xFCorner + wF * uniforms.dilations[0];
                if (xF < 0 || xF >= xShapeY) {
                  continue;
                }

                for (var wR = 0u; wR < uniforms.filter_dims[1]; wR++) {
                  let xR = xRCorner + wR * uniforms.dilations[1];
                  if (xR < 0 || xR >= xShapeZ) {
                    continue;
                  }

                  for (var wC = 0u; wC < uniforms.filter_dims[2]; wC++) {
                    let xC = xCCorner + wC * uniforms.dilations[2];
                    if (xC < 0 || xC >= xShapeW) {
                      continue;
                    }

                    for (var d1 = 0u; d1 < inputDepthNearestVec4; d1 += 4) {
                      ${n?`let xValues = vec4<f32>(
                               getX(batch, xF, xR, xC, d1),
                               getX(batch, xF, xR, xC, d1 + 1),
                               getX(batch, xF, xR, xC, d1 + 2),
                               getX(batch, xF, xR, xC, d1 + 3));
                            `:`let xValues = vec4<f32>(
                               getX(batch, d1, xF, xR, xC),
                               getX(batch, d1 + 1, xF, xR, xC),
                               getX(batch, d1 + 2, xF, xR, xC),
                               getX(batch, d1 + 3, xF, xR, xC));
                            `}
                            let wValues = vec4<f32>(
                              getW(d2, d1, wF, wR, wC),
                              getW(d2, d1 + 1, wF, wR, wC),
                              getW(d2, d1 + 2, wF, wR, wC),
                              getW(d2, d1 + 3, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                    if (inputDepthVec4Remainder == 1) {
                        ${n?`value += getX(batch, xF, xR, xC, inputDepthNearestVec4)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`:`value += getX(batch, inputDepthNearestVec4, xF, xR, xC)
                          * getW(d2, inputDepthNearestVec4, wF, wR, wC);`}
                    } else if (inputDepthVec4Remainder == 2) {
                      ${n?`let xValues = vec2<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1));
                      `:`let xValues = vec2<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC));
                    `}
                    let wValues = vec2<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC));
                      value += dot(xValues, wValues);
                    } else if (inputDepthVec4Remainder == 3) {
                      ${n?`let xValues = vec3<f32>(
                        getX(batch, xF, xR, xC, inputDepthNearestVec4),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 1),
                        getX(batch, xF, xR, xC, inputDepthNearestVec4 + 2));
                      `:`let xValues = vec3<f32>(
                        getX(batch, inputDepthNearestVec4, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 1, xF, xR, xC),
                        getX(batch, inputDepthNearestVec4 + 2, xF, xR, xC));
                    `}
                    let wValues = vec3<f32>(
                      getW(d2, inputDepthNearestVec4, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 1, wF, wR, wC),
                      getW(d2, inputDepthNearestVec4 + 2, wF, wR, wC));
                      value += dot(xValues, wValues);
                    }
                  }
                }
              }
              ${y?"value = value + getBiasByOutputCoords(coords)":""};
              ${U}
              result[global_idx] = f32(value);
          }`};return{name:"Conv3DNaive",shaderCache:{hint:`${t.cacheKey};${n};${c};${y}`,inputDependencies:g},getRunData:()=>({outputs:[{dims:i,dataType:e[0].dataType}],dispatchGroup:{x:d[0],y:d[1],z:d[2]},programUniforms:h}),getShaderSource:_}}}),Pl,ql,Qp=E(()=>{"use strict";N(),W(),F(),rt(),Pl=(e,t,i,r)=>{let a=e.length>2,s=a?"value += b[output_channel];":"",n=e[0].dims,o=e[1].dims,u=t.format==="NHWC",l=u?i[3]:i[1],p=l/t.group,d=u&&p>=4?re(l):1,c=k.size(i)/d,f=[{type:12,data:c},{type:12,data:t.dilations},{type:12,data:[t.strides[0],t.strides[1]]},{type:12,data:[t.pads[0],t.pads[1]]},{type:12,data:p}];et(t,f),f.push(...M(n,[o[0],o[1],o[2],o[3]/d]));let h=a?["rank","rank","rank"]:["rank","rank"];f.push(...M([i[0],i[1],i[2],i[3]/d]));let g=y=>{let _=B("output",e[0].dataType,i.length,d),m=ue(_.type.tensor),w=Je(t,_.type.value,m),$=T("x",e[0].dataType,n.length),b=T("w",e[1].dataType,o.length,d),v=[$,b];a&&v.push(T("b",e[2].dataType,e[2].dims,d));let x=[{name:"output_size",type:"u32"},{name:"dilations",type:"u32",length:t.dilations.length},{name:"strides",type:"u32",length:2},{name:"pads",type:"u32",length:2},{name:"output_channels_per_group",type:"u32"}];tt(t,x);let S=u?`
      for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[0]; wHeight++) {
        let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

        if (xHeight < 0u || xHeight >= uniforms.x_shape[1]) {
          continue;
        }

        for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[1]; wWidth++) {
          let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
          if (xWidth < 0u || xWidth >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[2]; wInChannel++) {
            let input_channel = in_channel_offset + wInChannel;
            let xVal = ${$.get("batch","xHeight","xWidth","input_channel")};
            let wVal = ${b.get("wHeight","wWidth","wInChannel","output_channel")};
            value += xVal * wVal;
          }
        }
      }
      `:`
      for (var wInChannel: u32 = 0u; wInChannel < uniforms.w_shape[1]; wInChannel++) {
        let input_channel = in_channel_offset + wInChannel;
        for (var wHeight: u32 = 0u; wHeight < uniforms.w_shape[2]; wHeight++) {
          let xHeight = xRCCorner.x + wHeight * uniforms.dilations[0];

          if (xHeight < 0u || xHeight >= uniforms.x_shape[2]) {
            continue;
          }

          for (var wWidth: u32 = 0u; wWidth < uniforms.w_shape[3]; wWidth++) {
            let xWidth = xRCCorner.y + wWidth * uniforms.dilations[1];
            if (xWidth < 0u || xWidth >= uniforms.x_shape[3]) {
              continue;
            }

            let xVal = ${$.get("batch","input_channel","xHeight","xWidth")};
            let wVal = ${b.get("output_channel","wInChannel","wHeight","wWidth")};
            value += xVal * wVal;
          }
        }
      }
      `;return`
  ${y.registerUniforms(x).declareVariables(...v,_)}

  ${y.mainStart()}
    ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let outputIndices = ${_.offsetToIndices("global_idx")};
    let batch: u32 = outputIndices[0];
    let output_channel: u32 = outputIndices[${u?3:1}];
    let xRCCorner: vec2<u32> = vec2<u32>(outputIndices[${u?1:2}], outputIndices[${u?2:3}]) * uniforms.strides - uniforms.pads;
    let group_id: u32 = output_channel * ${d} / uniforms.output_channels_per_group;
    var in_channel_offset = group_id * uniforms.w_shape[${u?2:1}];

    var value: ${_.type.value} = ${_.type.value}(0);
    ${S}
    ${s}
    ${w}
    ${_.setByOffset("global_idx","value")}
  }`};return{name:"GroupedConv",shaderCache:{hint:`${t.cacheKey}_${d}`,inputDependencies:h},getRunData:()=>({outputs:[{dims:r?r(i):i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:f}),getShaderSource:g}},ql=(e,t,i,r)=>{let a=e.length>2,s=re(i[3]),n=re(i[2]),o=k.size(i)/s/n,u=[e[0].dims[0],e[0].dims[1],e[0].dims[2],e[0].dims[3]/s],l=[e[1].dims[0],e[1].dims[1],e[1].dims[2],e[1].dims[3]/s],p=[i[0],i[1],i[2],i[3]/s],d=[{type:12,data:o},{type:6,data:[t.strides[0],t.strides[1]]},{type:6,data:[t.pads[0],t.pads[1]]}];et(t,d),d.push(...M(u,l,p));let c=(n-1)*t.strides[1]+l[1],f=h=>{let g=B("output",e[0].dataType,p.length,s),y=ue(g.type.tensor),_=Je(t,g.type.value,y),m=T("x",e[0].dataType,u.length,s),w=T("w",e[1].dataType,l.length,s),$=[m,w];a&&$.push(T("b",e[2].dataType,e[2].dims,s));let b=a?"value += b[output_channel];":"",v=[{name:"output_size",type:"u32"},{name:"strides",type:"i32",length:2},{name:"pads",type:"i32",length:2}];return tt(t,v),`
  ${h.registerUniforms(v).declareVariables(...$,g)}
  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let width0 = uniforms.output_shape[3];
    let output_channel = global_idx % width0;
    var index1 = global_idx / width0;
    let width1 = uniforms.output_shape[2] / ${n}u;
    let col = (index1 % width1) * ${n}u;
    index1 = index1 / width1;
    let row = index1 % uniforms.output_shape[1];
    let batch = index1 / uniforms.output_shape[1];

    let x_corner = vec2<i32>(i32(row), i32(col)) * uniforms.strides - uniforms.pads;

    var x_vals: array<${m.type.value}, ${c}>;
    var values: array<${g.type.value}, ${n}>;
    let input_channel = output_channel;
    // Use constant instead of uniform can give better performance for w's height/width.
    for (var w_height: u32 = 0u; w_height < ${l[0]}; w_height++) {
      let x_height = x_corner.x + i32(w_height);
      if (x_height >= 0 && u32(x_height) < uniforms.x_shape[1]) {
        for (var i = 0; i < ${c}; i++) {
          let x_width = x_corner.y + i;
          if (x_width >= 0 && u32(x_width) < uniforms.x_shape[2]) {
            x_vals[i] = ${m.get("batch","u32(x_height)","u32(x_width)","input_channel")};
          } else {
            x_vals[i] = ${m.type.value}(0);
          }
        }
        for (var w_width: u32 = 0u; w_width < ${l[1]}; w_width++) {
          let w_val = ${w.get("w_height","w_width","0","output_channel")};
          for (var i = 0u; i < ${n}u; i++) {
            values[i] = fma(x_vals[i * u32(uniforms.strides[1]) + w_width], w_val, values[i]);
          }
        }
      }
    }

    for (var i = 0u; i < ${n}u; i++) {
      var value = values[i];
      ${b}
      ${_}
      ${g.set("batch","row","col + i","output_channel","value")};
    }
  }`};return{name:"GroupedConv-Vectorize",shaderCache:{hint:`${t.cacheKey};${s};${n};${c};${l[0]};${l[1]}`,inputDependencies:a?["rank","rank","type"]:["rank","rank"]},getRunData:()=>({outputs:[{dims:r?r(i):i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:d}),getShaderSource:f}}}),$s,Rt,ws,At,ur,xi,bs,vs,lr,Zp=E(()=>{"use strict";W(),Kp(),jp(),Ar(),Qp(),rt(),Rr(),Le(),$s=(e,t,i,r,a,s)=>{let n=e[0],o=e.slice(s?1:2,s?3:4),u=o.length,l=t[0],p=t.slice(2).map((c,f)=>c+(c-1)*(i[f]-1)),d=o.map((c,f)=>c+r[f]+r[f+u]).map((c,f)=>Math.floor((c-p[f]+a[f])/a[f]));return d.splice(0,0,n),d.splice(s?3:1,0,l),d},Rt=[2,3,1,0],ws=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length>5)throw new Error("greater than 5D is not supported");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let i=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],r=e[1].dims[1]*t.group;if(i!==r)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");if(e.length===3&&(e[2].dims.length!==1||e[1].dims[0]!==e[2].dims[0]))throw new Error("invalid bias");let a=e[0].dims.length-2;if(t.dilations.length!==a)throw new Error(`dilations should be ${a}D`);if(t.strides.length!==a)throw new Error(`strides should be ${a}D`);if(t.pads.length!==a*2)throw new Error(`pads should be ${a*2}D`);if(t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape")},At=(e,t)=>{let i=e.kernelShape.slice();i.length<t[1].dims.length-2&&i.push(...Array(t[1].dims.length-2-i.length).fill(0));for(let s=2;s<t[1].dims.length;++s)i[s-2]===0&&(i[s-2]=t[1].dims[s]);let r=e.pads.slice();Ft.adjustPadsBasedOnAutoPad(t[0].dims,e.strides,e.dilations,i,r,e.format==="NHWC",e.autoPad);let a=Object.assign({},e);return Object.assign(a,{kernelShape:i,pads:r}),a},ur=e=>{let t=Cr(e),i=e.format,r=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],a=e.dilations,s=e.group,n=e.kernel_shape,o=e.pads,u=e.strides,l=e.w_is_const();return{autoPad:r,format:i,dilations:a,group:s,kernelShape:n,pads:o,strides:u,wIsConst:l,...t,cacheKey:`${e.format};${t.activation};`}},xi=(e,t,i,r)=>{let a=i.format==="NHWC",s=$s(t[0].dims,t[1].dims,i.dilations,i.pads,i.strides,a);if(i.group!==1){let v=[t[0]];if(a){let x=e.kernelCustomData.wT??e.compute(_e(t[1],Rt),{inputs:[1],outputs:[i.wIsConst?-2:-1]})[0];i.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=x),v.push(x)}else v.push(t[1]);t.length===3&&v.push(t[2]),!e.adapterInfo.isArchitecture("ampere")&&a&&t[1].dims[0]===i.group&&t[1].dims[1]===1&&i.dilations[0]===1&&i.dilations[1]===1?e.compute(ql(v,i,s,r),{inputs:v}):e.compute(Pl(v,i,s,r),{inputs:v});return}let n=t.length===3,o=t[0].dims[a?1:2],u=t[0].dims[a?2:3],l=t[0].dims[a?3:1],p=t[1].dims[2],d=t[1].dims[3],c=s[a?1:2],f=s[a?2:3],h=s[a?3:1],g=a&&p===o&&d===u&&i.pads[0]===0&&i.pads[1]===0;if(g||p===1&&d===1&&i.dilations[0]===1&&i.dilations[1]===1&&i.strides[0]===1&&i.strides[1]===1&&i.pads[0]===0&&i.pads[1]===0){let v=s[0],x,S,I,C=[];if(a){let P=e.kernelCustomData.wT??e.compute(_e(t[1],Rt),{inputs:[1],outputs:[i.wIsConst?-2:-1]})[0];if(i.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=P),g){let Z=o*u*l;x=t[0].reshape([1,v,Z]),S=P.reshape([1,Z,h]),I=[1,v,h]}else x=t[0].reshape([v,o*u,l]),S=P.reshape([1,l,h]),I=[v,c*f,h];C.push(x),C.push(S)}else x=t[0].reshape([v,l,o*u]),S=t[1].reshape([1,h,l]),I=[v,h,c*f],C.push(S),C.push(x);n&&C.push(t[2]);let H=I[2],U=C[0].dims[C[0].dims.length-1];H<8&&U<8?e.compute(Br(C,i,s,I,a,r),{inputs:C}):e.compute(Kt(C,i,s,I,a,r),{inputs:C});return}let y=!0,_=e.kernelCustomData.wT??e.compute(_e(t[1],Rt),{inputs:[1],outputs:[i.wIsConst?-2:-1]})[0];i.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=_);let m=[t[0],_];n&&m.push(t[2]);let w=a?c*f:h,$=a?h:c*f,b=p*d*l;e.compute(Dl(m,i,s,w,$,b,n,y,r),{inputs:m})},bs=(e,t)=>{let i=t.format==="NHWC",r=[e.inputs[0].reshape(i?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&r.push(e.inputs[2]);let a=[0,t.pads[0],0,t.pads[1]],s=[1].concat(t.strides),n=[1].concat(t.dilations),o=[1].concat(t.kernelShape),u=At({...t,pads:a,strides:s,dilations:n,kernelShape:o},r);xi(e,r,u,l=>i?[l[0],l[2],l[3]]:[l[0],l[1],l[3]])},vs=(e,t,i)=>{let r=i.format==="NHWC"?"channelsLast":"channelsFirst",a=At(i,t),s=i.autoPad==="NOTSET"?i.pads:i.autoPad,n=Ml(t[0].dims,t[1].dims,i.strides,i.dilations,s,!1,r);e.compute(Ul(t,a,n.outShape,[n.filterDepth,n.filterHeight,n.filterWidth],[n.padInfo.front,n.padInfo.top,n.padInfo.left],r))},lr=(e,t)=>{if(ws(e.inputs,t),e.inputs[0].dims.length===3)bs(e,t);else if(e.inputs[0].dims.length===5)vs(e,e.inputs,t);else{let i=At(t,e.inputs);xi(e,e.inputs,i)}}}),Nl,Xp=E(()=>{"use strict";N(),Ae(),W(),F(),Nl=(e,t,i)=>{let r=e.length>2,a=t.outputShape,s=t.format==="NHWC",n=t.group,o=e[1].dims,u=o[2]/n,l=o[3],p=s?re(u):1,d=s&&l===1&&u>=4,c=d?Math.floor(u/4)*4:Math.floor(u/p)*p,f=u-c,h=s?re(l):1,g=s?l===1?p:h:1,y=k.size(a)/h,_=[Math.ceil(y/64),1,1];Q("verbose",()=>`[conv2d_backprop_webgpu] dispatch = ${_}`);let m=["rank","rank"],w=[t.strides[0],t.strides[1]],$=[t.kernelShape[s?1:2],t.kernelShape[s?2:3]],b=[t.dilations[0],t.dilations[1]],v=[$[0]+(t.dilations[0]<=1?0:(t.kernelShape[s?1:2]-1)*(t.dilations[0]-1)),$[1]+(t.dilations[1]<=1?0:(t.kernelShape[s?2:3]-1)*(t.dilations[1]-1))],x=[v[0]-1-Math.floor((t.pads[0]+t.pads[2])/2),v[1]-1-Math.floor((t.pads[1]+t.pads[3])/2)],S=[{type:12,data:y},{type:12,data:w},{type:12,data:$},{type:12,data:b},{type:12,data:v},{type:6,data:x},{type:12,data:c},{type:12,data:u},{type:12,data:l},...M(e[0].dims,e[1].dims)];r&&(S.push(...M(e[2].dims)),m.push("rank")),S.push(...M(a));let I=C=>{let H=[{name:"output_size",type:"u32"},{name:"strides",type:"u32",length:w.length},{name:"filter_dims",type:"u32",length:$.length},{name:"dilations",type:"u32",length:$.length},{name:"effective_filter_dims",type:"u32",length:v.length},{name:"pads",type:"i32",length:x.length},{name:"input_channels_per_group_int",type:"u32"},{name:"input_channels_per_group",type:"u32"},{name:"output_channels_per_group",type:"u32"}],U=ue(e[0].dataType),P=s?1:2,Z=s?2:3,O=s?3:1,D=T("W",e[1].dataType,e[1].dims.length,g),G=T("Dy",e[0].dataType,e[0].dims.length,p),K=[G,D];r&&K.push(T("bias",e[2].dataType,[a[O]].length,h));let V=B("result",e[0].dataType,a.length,h),j=()=>{let q="";if(d)p===4?q+=`
        let xValue = ${G.getByOffset("x_offset")};
        let wValue = ${D.getByOffset("w_offset")};
        dotProd = dotProd + dot(xValue, wValue);
        x_offset += 1u;
        w_offset += 1u;`:p===2?q+=`
          dotProd = dotProd + dot(vec4<${U}>(${G.getByOffset("x_offset")}, ${G.getByOffset("x_offset + 1u")}), vec4<${U}>(${D.getByOffset("w_offset")}, ${D.getByOffset("w_offset + 1u")}));
          x_offset += 2u;
          w_offset += 2u;`:p===1&&(q+=`
          dotProd = dotProd + dot(vec4<${U}>(${G.getByOffset("x_offset")}, ${G.getByOffset("x_offset + 1u")}, ${G.getByOffset("x_offset + 2u")}, ${G.getByOffset("x_offset + 3u")}), vec4<${U}>(${D.getByOffset("w_offset")}, ${D.getByOffset("w_offset + 1u")}, ${D.getByOffset("w_offset + 2u")}, ${D.getByOffset("w_offset + 3u")}));
          x_offset += 4u;
          w_offset += 4u;`);else if(q+=`
                  let xValue = ${s?G.getByOffset(`${G.indicesToOffset(`${G.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${p}`):G.get("batch","inputChannel","idyR","idyC")};
        `,p===1)q+=`
          let w_offset = ${D.indicesToOffset(`${D.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel, wOutChannel)`)};
          let wValue = ${D.getByOffset(`w_offset / ${g}`)};
          dotProd = dotProd + xValue * wValue;`;else for(let R=0;R<p;R++)q+=`
            let wValue${R} = ${D.getByOffset(`${D.indicesToOffset(`${D.type.indices}(u32(wRPerm), u32(wCPerm), inputChannel + ${R}, wOutChannel)`)} / ${g}`)};
            dotProd = dotProd + xValue[${R}] * wValue${R};`;return q},z=()=>{if(f===0)return"";if(!d)throw new Error(`packInputAs4 ${d} is not true.`);let q="";if(p===1){q+="dotProd = dotProd";for(let R=0;R<f;R++)q+=`
            + ${G.getByOffset(`x_offset + ${R}`)} * ${D.getByOffset(`w_offset + ${R}`)}`;q+=";"}else if(p===2){if(f!==2)throw new Error(`Invalid inputChannelsRemainder ${f}.`);q+=`
          let xValue = ${G.getByOffset("x_offset")};
          let wValue = ${D.getByOffset("w_offset")};
          dotProd = dotProd + dot(xValue, wValue);`}return q},L=`
            let outputIndices = ${V.offsetToIndices(`global_idx * ${h}`)};
            let batch = ${V.indicesGet("outputIndices",0)};
            let d1 = ${V.indicesGet("outputIndices",O)};
            let r = ${V.indicesGet("outputIndices",P)};
            let c = ${V.indicesGet("outputIndices",Z)};
            let dyCorner = vec2<i32>(i32(r), i32(c)) - uniforms.pads;
            let dyRCorner = dyCorner.x;
            let dyCCorner = dyCorner.y;
            let groupId = d1 / uniforms.output_channels_per_group;
            let wOutChannel = d1 - groupId * uniforms.output_channels_per_group;
            // Convolve dy(?, ?, d2) with w(:, :, d1, d2) to compute dx(xR, xC, d1).
            // ? = to be determined. : = across all values in that axis.
            var dotProd = ${V.type.value}(0.0);
            var wR: u32 = 0;
            if (uniforms.dilations.x == 1) {
              // Minimum wR >= 0 that satisfies (dyRCorner + wR) % (uniforms.strides.x) == 0
              wR = u32(((dyRCorner + i32(uniforms.strides.x) - 1) / i32(uniforms.strides.x)) * i32(uniforms.strides.x) - dyRCorner);
            }
            for (; wR < uniforms.effective_filter_dims.x; wR = wR + 1) {
              if (wR % uniforms.dilations.x != 0) {
                continue;
              }
              let dyR = (${U}(dyRCorner) + ${U}(wR)) / ${U}(uniforms.strides[0]);
              let wRPerm = uniforms.filter_dims.x - 1 - wR / uniforms.dilations.x;
              if (dyR < 0.0 || dyR >= ${U}(uniforms.Dy_shape[${P}]) || fract(dyR) > 0.0 ||
                  wRPerm < 0) {
                continue;
              }
              let idyR: u32 = u32(dyR);
              var wC: u32 = 0;
              if (uniforms.dilations.y == 1) {
                // Minimum wC >= 0 that satisfies (dyCCorner + wC) % (uniforms.strides.y) == 0
                wC = u32(((dyCCorner + i32(uniforms.strides.y) - 1) / i32(uniforms.strides.y)) * i32(uniforms.strides.y) - dyCCorner);
              }
              for (; wC < uniforms.effective_filter_dims.y; wC = wC + 1) {
                if (wC % uniforms.dilations.y != 0) {
                  continue;
                }
                let dyC = (${U}(dyCCorner) + ${U}(wC)) / ${U}(uniforms.strides.y);
                let wCPerm = uniforms.filter_dims.y - 1 - wC / uniforms.dilations.y;
                if (dyC < 0.0 || dyC >= ${U}(uniforms.Dy_shape[${Z}]) ||
                    fract(dyC) > 0.0 || wCPerm < 0) {
                  continue;
                }
                let idyC: u32 = u32(dyC);
                var inputChannel = groupId * uniforms.input_channels_per_group;
                ${d?`
                var x_offset = ${G.indicesToOffset(`${G.type.indices}(batch, idyR, idyC, inputChannel)`)} / ${p};
                var w_offset = ${D.indicesToOffset(`${D.type.indices}(wRPerm, wCPerm, inputChannel, wOutChannel)`)} / ${g};
                  `:""}
                for (var d2: u32 = 0; d2 < uniforms.input_channels_per_group_int; d2 = d2 + ${d?4:p}) {
                  ${j()}
                  inputChannel = inputChannel + ${d?4:p};
                }
                ${z()}
                wC = wC + uniforms.strides.y - 1;
              }
              wR = wR + uniforms.strides[0] - 1;
            }
            let value = dotProd${r?` + bias[d1 / ${h}]`:""};
            ${V.setByOffset("global_idx","value")};
          `;return`
    ${C.registerUniforms(H).declareVariables(...K,V)}
      ${C.mainStart()}
      ${C.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")};
    ${L}}`};return{name:"ConvTranspose2D",shaderCache:{hint:`${t.cacheKey};${p}${g}${h}${d}${f}`,inputDependencies:m},getRunData:()=>({dispatchGroup:{x:_[0],y:_[1],z:_[2]},outputs:[{dims:i?i(a):a,dataType:e[0].dataType}],programUniforms:S}),getShaderSource:I}}}),xs,ks,Ss,ki,Ll,Ts,Si,Is,Vl,Yp=E(()=>{"use strict";Xp(),rt(),Le(),xs=(e,t,i,r,a,s)=>(e-1)*t+i+(r-1)*a+1-s,ks=(e,t,i,r,a)=>{let s=Math.floor(e/2);t==="SAME_UPPER"?(i[r]=s,i[a]=e-s):t==="SAME_LOWER"&&(i[r]=e-s,i[a]=s)},Ss=(e,t,i,r,a,s,n,o,u,l)=>{let p=e.length-2,d=l.length===0;u.length<p&&u.push(...Array(p-u.length).fill(0));let c=e[0],f=t[o?3:1]*a;for(let h=0,g=e.length-p-(o?1:0);h<p;++h,++g){let y=e[g],_=d?y*n[h]:l[h],m=xs(y,n[h],s[h],t[g],i[h],_);ks(m,r,s,h,h+p),d&&l.push(n[h]*(y-1)+u[h]+(t[g]-1)*i[h]+1-s[h]-s[h+p])}l.splice(0,0,c),l.splice(o?3:1,0,f)},ki=(e,t)=>{let i=e.kernelShape.slice();if(e.kernelShape.length===0||e.kernelShape.reduce((d,c)=>d*c,1)===0){i.length=0;for(let d=2;d<t[1].dims.length;++d)i.push(t[1].dims[d])}let r=e.format==="NHWC";i.splice(0,0,t[1].dims[0]),i.splice(r?3:1,0,t[1].dims[1]);let a=e.pads.slice(),s=e.outputShape.slice(),n=e.outputPadding.slice(),o=t[0].dims,u=e.dilations.slice();if(u.reduce((d,c)=>d+c,0)===0){let d=t[0].dims.length-2;u=new Array(d).fill(1)}let l=e.strides.slice();if(l.reduce((d,c)=>d+c,0)===0){let d=t[0].dims.length-2;l=new Array(d).fill(1)}Ss(o,i,u,e.autoPad,e.group,a,l,r,n,s);let p=Object.assign({},e);return Object.assign(p,{kernelShape:i,pads:a,outputPadding:n,outputShape:s,dilations:u,strides:l}),p},Ll=e=>{let t=Cr(e),i=e.format,r=["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][typeof e.autoPad>"u"?0:e.autoPad],a=e.dilations,s=e.group??1,n=e.kernelShape,o=e.pads,u=e.strides,l=e.wIsConst(),p=e.outputPadding,d=e.outputShape;return{autoPad:r,format:i,dilations:a,group:s,kernelShape:n,outputPadding:p,outputShape:d,pads:o,strides:u,wIsConst:l,...t,cacheKey:`${e.format};${t.activation};`}},Ts=(e,t)=>{if(!e||e.length!==2&&e.length!==3)throw new Error("Conv requires 2 or 3 inputs");if(e[0].dims.length!==4&&e[0].dims.length!==3)throw new Error("currently only support 2-dimensional conv");if(e[0].dims.length!==e[1].dims.length)throw new Error("filter does not have same dimension as input");let i=e[0].dims[t.format==="NHWC"?e[0].dims.length-1:1],r=e[1].dims[0];if(i!==r)throw new Error("FILTER_IN_CHANNEL should be equal to DATA_CHANNEL");let a=e[1].dims[1]*t.group;if(e.length===3&&(e[2].dims.length!==1||e[2].dims[0]!==a))throw new Error("invalid bias");let s=e[0].dims.length-2;if(t.dilations.reduce((n,o)=>n+o,0)>0&&t.dilations.length!==s)throw new Error(`dilations should be ${s}D`);if(t.strides.reduce((n,o)=>n+o,0)>0&&t.strides.length!==s)throw new Error(`strides should be ${s}D`);if(t.pads.reduce((n,o)=>n+o,0)>0&&t.pads.length!==s*2)throw new Error(`pads should be ${s*2}D`);if(t.outputPadding.length!==s&&t.outputPadding.length!==0)throw new Error(`output_padding should be ${s}D`);if(t.kernelShape.reduce((n,o)=>n+o,0)>0&&t.kernelShape.length!==0&&t.kernelShape.length!==e[1].dims.length-2)throw new Error("invalid kernel shape");if(t.outputShape.length!==0&&t.outputShape.length!==e[0].dims.length-2)throw new Error("invalid output shape")},Si=(e,t,i,r)=>{let a=e.kernelCustomData.wT??e.compute(_e(t[1],[2,3,0,1]),{inputs:[1],outputs:[i.wIsConst?-2:-1]})[0];i.wIsConst&&!e.kernelCustomData.wT&&(e.kernelCustomData.wT=a);let s=[t[0],a];t.length===3&&s.push(t[2]),e.compute(Nl(s,i,r),{inputs:s})},Is=(e,t)=>{let i=t.format==="NHWC",r=[e.inputs[0].reshape(i?[e.inputs[0].dims[0],1,e.inputs[0].dims[1],e.inputs[0].dims[2]]:[e.inputs[0].dims[0],e.inputs[0].dims[1],1,e.inputs[0].dims[2]]),e.inputs[1].reshape([e.inputs[1].dims[0],e.inputs[1].dims[1],1,e.inputs[1].dims[2]])];e.inputs.length===3&&r.push(e.inputs[2]);let a=t.kernelShape;(a.length===0||a[0]===0)&&(a=[e.inputs[1].dims[2]]);let s=t.dilations;(s.length===0||s[0]===0)&&(s=[1]);let n=t.strides;(n.length===0||n[0]===0)&&(n=[1]);let o=t.pads;o.length===0&&(o=[0,0]),o=[0,o[0],0,o[1]],n=[1].concat(n),s=[1].concat(s),a=[1].concat(a);let u=t.outputPadding;u=[0].concat(u);let l=ki({...t,pads:o,strides:n,dilations:s,kernelShape:a,outputPadding:u},r);Si(e,r,l,p=>i?[p[0],p[2],p[3]]:[p[0],p[1],p[3]])},Vl=(e,t)=>{if(Ts(e.inputs,t),e.inputs[0].dims.length===3)Is(e,t);else{let i=ki(t,e.inputs);Si(e,e.inputs,i)}}}),zs,Gl,Wl,Jp=E(()=>{"use strict";N(),W(),ae(),F(),zs=(e,t,i,r)=>{let a=k.size(t),s=t.length,n=T("input",e,s),o=B("output",e,s),u=i.dataType===6?i.getInt32Array()[0]:Number(i.getBigInt64Array()[0]),l=k.normalizeAxis(u,s),p=d=>{let c=` i32(${n.indicesGet("inputIndices","uniforms.axis")}) `,f=A("uniforms.input_shape","uniforms.axis",s),h=r.reverse?c+(r.exclusive?" + 1":""):"0",g=r.reverse?f:c+(r.exclusive?"":" + 1");return`
                ${d.registerUniform("outputSize","u32").registerUniform("axis","u32").declareVariables(n,o)}
                ${d.mainStart()}
                  ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
                  var inputIndices = ${o.offsetToIndices("global_idx")};
                  var sum = ${o.type.value}(0);
                  let first : i32 = ${h};
                  let last : i32 = ${g};
                  for (var i : i32 = first; i < last; i++) {
                    ${n.indicesSet("inputIndices","uniforms.axis","u32(i)")};
                    sum = sum + ${n.getByIndices("inputIndices")};
                  }
                  ${o.setByOffset("global_idx","sum")};
                }`};return{name:"CumSum",shaderCache:{hint:r.cacheKey,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:t,dataType:e}],dispatchGroup:{x:Math.ceil(a/64)},programUniforms:[{type:12,data:a},{type:12,data:l},...M(t,t)]}),getShaderSource:p}},Gl=(e,t)=>{let i=e.inputs[0].dims,r=e.inputs[0].dataType,a=e.inputs[1];e.compute(zs(r,i,a,t),{inputs:[0]})},Wl=e=>{let t=e.exclusive===1,i=e.reverse===1;return Y({exclusive:t,reverse:i})}}),Es,Cs,Os,Fl,Hl,ec=E(()=>{"use strict";N(),W(),ae(),F(),Es=e=>{if(!e||e.length!==1)throw new Error("DepthToSpace requires 1 input.");if(e[0].dims.length!==4)throw new Error("DepthToSpace requires 4D input.")},Cs=(e,t,i,r)=>{let a=[];a.push(`fn perm(i: ${r.type.indices}) -> ${i.type.indices} {
    var a: ${i.type.indices};`);for(let s=0;s<t;++s)a.push(i.indicesSet("a",e[s],`i[${s}]`));return a.push("return a;}"),a.join(`
`)},Os=(e,t)=>{let i,r,a,s,n,o,u=t.format==="NHWC",l=t.blocksize,p=t.mode==="DCR";u?([i,r,a,s]=e.dims,n=p?[i,r,a,l,l,s/l**2]:[i,r,a,s/l**2,l,l],o=p?[0,1,3,2,4,5]:[0,1,4,2,5,3]):([i,r,a,s]=[e.dims[0],e.dims[2],e.dims[3],e.dims[1]],n=p?[i,l,l,s/l**2,r,a]:[i,s/l**2,l,l,r,a],o=p?[0,3,4,1,5,2]:[0,1,4,2,5,3]);let d=e.reshape(n),c=d.dims.length,f=e.dataType,h=T("a",f,c),g=B("output",f,c),y=_=>`
  ${_.registerUniform("output_size","u32").declareVariables(h,g)}

  ${Cs(o,c,h,g)}

  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let indices = ${g.offsetToIndices("global_idx")};
    let aIndices = perm(indices);

    ${g.setByOffset("global_idx",h.getByIndices("aIndices"))}
  }`;return{name:"DepthToSpace",shaderCache:{hint:`${e.dims};${t.blocksize};${t.mode}`,inputDependencies:["rank"]},getRunData:_=>{let m=u?[i,r*l,a*l,s/l**2]:[i,s/l**2,r*l,a*l],w=k.size(m),$=d.dims,b=k.sortBasedOnPerm($,o);return{outputs:[{dims:m,dataType:_[0].dataType}],dispatchGroup:{x:Math.ceil(w/64)},programUniforms:[{type:12,data:w},...M($,b)]}},getShaderSource:y}},Fl=(e,t)=>{Es(e.inputs),e.compute(Os(e.inputs[0],t))},Hl=e=>Y({blocksize:e.blocksize,mode:e.mode,format:e.format})}),Oe,ft,Dt,Ti,Me,Bs,Rs,As,Ii,zi,Ei,Ds,Ms,Ci,Us,Kl,jl,tc=E(()=>{"use strict";N(),W(),ae(),F(),Oe=256,ft=512,Dt=2*Math.PI,Ti=e=>{let t=[],i=e;for(let r of[4,2,3,5])for(;i%r===0;)t.push(r),i/=r;return i===1?t:void 0},Me=e=>{let t=e.toPrecision(9);return/[.eE]/.test(t)?t:`${t}.0`},Bs=(e,t,i,r,a)=>{let s=i/e,n=ft-r,o=l=>`smem[${n}u + base + ${l*t}u]`,u=`  for (var t = local_idx; t < ${s}u; t += ${Oe}u) {
`;u+=`    let twiddleIndex = t % ${t}u;
    let angleUnit = f32(twiddleIndex);
`,u+=`    var leg: array<vec2<f32>, 5>;
`;for(let l=0;l<e;l++){let p=`${r}u + t + ${l*s}u`;if(l===0)u+=`    leg[0] = smem[${p}];
`;else{let d=a*Dt*l/(e*t);u+=`    { let a = ${Me(d)} * angleUnit; leg[${l}] = cmul(smem[${p}], vec2<f32>(cos(a), sin(a))); }
`}}if(u+=`    let base = (t / ${t}u) * ${t*e}u + twiddleIndex;
`,e===2)u+=`    ${o(0)} = leg[0] + leg[1];
    ${o(1)} = leg[0] - leg[1];
`;else if(e===4){let l=a<0?"vec2<f32>(oddDiff.y, -oddDiff.x)":"vec2<f32>(-oddDiff.y, oddDiff.x)";u+=`    let evenSum = leg[0] + leg[2]; let evenDiff = leg[0] - leg[2];
`,u+=`    let oddSum = leg[1] + leg[3]; let oddDiff = leg[1] - leg[3];
`,u+=`    let oddRot = ${l};
`,u+=`    ${o(0)} = evenSum + oddSum;
    ${o(1)} = evenDiff + oddRot;
`,u+=`    ${o(2)} = evenSum - oddSum;
    ${o(3)} = evenDiff - oddRot;
`}else for(let l=0;l<e;l++){let p=["leg[0]"];for(let d=1;d<e;d++){let c=a*Dt*(d*l)/e,f=Me(Math.cos(c)),h=Me(Math.sin(c));p.push(`vec2<f32>(leg[${d}].x*${f} - leg[${d}].y*${h}, leg[${d}].x*${h} + leg[${d}].y*${f})`)}u+=`    ${o(l)} = ${p.join(" + ")};
`}return`${u}  }
  workgroupBarrier();
`},Rs=(e,t,i)=>{let r="",a=1,s=0;for(let n of e)r+=Bs(n,a,t,s,i),a*=n,s=ft-s;return{code:r,resultOffset:s}},As=(e,t,i,r,a)=>{let s=e.dims,n=s.length,o=s[n-1],u=s[t],l=i&&r?(u-1)*2:u;a!==void 0&&(l=a);let p=i&&r?1:2,d=r&&!i?Math.floor(l/2)+1:l,c=s.slice();c[t]=d,c[n-1]=p;let f=1;for(let g=t+1;g<n-1;g++)f*=s[g];let h=k.size(s)/o/u;return{dataType:e.dataType,outputDims:c,length:l,signalLength:u,inner:f,batch:h,inputComponents:o,outputComponents:p,outputLength:d,inverse:i,onesided:r}},Ii=(e,t)=>[t,e.length,e.inputComponents,e.outputComponents,e.inverse,e.onesided].join(";"),zi=e=>[{type:12,data:e.batch},{type:12,data:e.signalLength},{type:12,data:e.inner},{type:12,data:e.outputLength}],Ei=(e,t,i)=>e.registerUniform("batch","u32").registerUniform("signalLength","u32").registerUniform("inner","u32").registerUniform("outputLength","u32").declareVariables(t,i),Ds=e=>{let{dataType:t,length:i,inputComponents:r,outputComponents:a,inverse:s,onesided:n}=e,o=oe(t),u=s?1:-1,l=s?1/i:1,p=Ti(i),d=c=>{let f=T("x",t,[1]),h=B("y",t,[1]),g=b=>{let v=`inBase + (${b}) * uniforms.inner * ${r}u`,x=`f32(${f.getByOffset(v)})`,S=r===2?`f32(${f.getByOffset(`${v} + 1u`)})`:"0.0";return`vec2<f32>(${x}, ${S})`},y;if(s&&n){let b=Math.floor(i/2)+1,v=i%2===0?`select(provided, provided - 1u, provided == ${b}u)`:"provided";y=`
    let provided = min(uniforms.signalLength, ${b}u);
    for (var i = local_idx; i < ${i}u; i += ${Oe}u) {
      if (i < provided) { smem[i] = ${g("i")}; } else { smem[i] = vec2<f32>(0.0); }
    }
    workgroupBarrier();
    for (var k = local_idx + 1u; k < ${v}; k += ${Oe}u) {
      let h = smem[k];
      smem[${i}u - k] = vec2<f32>(h.x, -h.y);
    }
    workgroupBarrier();`}else y=`
    let loadCount = min(uniforms.signalLength, ${i}u);
    for (var i = local_idx; i < ${i}u; i += ${Oe}u) {
      if (i < loadCount) { smem[i] = ${g("i")}; } else { smem[i] = vec2<f32>(0.0); }
    }
    workgroupBarrier();`;let{code:_,resultOffset:m}=Rs(p,i,u),w=l===1?`smem[${m}u + i]`:`smem[${m}u + i] * ${Me(l)}`,$=a===2?h.setByOffset("off + 1u",`${o}(v.y)`):"";return`
  ${Ei(c,f,h)}
  var<workgroup> smem: array<vec2<f32>, ${2*ft}>;
  fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }
  ${c.mainStart(Oe)}
    let row = workgroup_index;
    if (row >= uniforms.batch) { return; }
    let outer = row / uniforms.inner;
    let within = row % uniforms.inner;
    let inBase = (outer * uniforms.signalLength * uniforms.inner + within) * ${r}u;
    let outBase = (outer * uniforms.outputLength * uniforms.inner + within) * ${a}u;
    ${y}
${_}    for (var i = local_idx; i < uniforms.outputLength; i += ${Oe}u) {
      let v = ${w};
      let off = outBase + i * uniforms.inner * ${a}u;
      ${h.setByOffset("off",`${o}(v.x)`)}
      ${$}
    }
  }`};return{name:"DFT",shaderCache:{hint:Ii(e,"fft"),inputDependencies:["type"]},getShaderSource:d,getRunData:()=>({outputs:[{dims:e.outputDims,dataType:t}],programUniforms:zi(e),dispatchGroup:{x:e.batch}})}},Ms=e=>{let{dataType:t,length:i,inputComponents:r,outputComponents:a,inverse:s,onesided:n}=e,o=oe(t),u=s?1:-1,l=s?1/i:1,p=d=>{let c=T("x",t,[1]),f=B("y",t,[1]),h=w=>{let $=`inBase + (${w}) * uniforms.inner * ${r}u`,b=`f32(${c.getByOffset($)})`,v=r===2?`f32(${c.getByOffset(`${$} + 1u`)})`:"0.0";return`vec2<f32>(${b}, ${v})`},g=s&&n?`fn spectrum(inBase: u32, k: u32) -> vec2<f32> {
    let provided = min(uniforms.signalLength, ${Math.floor(i/2)+1}u);
    if (k < provided) { return ${h("k")}; }
    let m = ${i}u - k;
    if (m < provided) {
      let h = ${h("m")};
      return vec2<f32>(h.x, -h.y);
    }
    return vec2<f32>(0.0, 0.0);
  }`:`fn spectrum(inBase: u32, n: u32) -> vec2<f32> {
    if (n < uniforms.signalLength) { return ${h("n")}; }
    return vec2<f32>(0.0, 0.0);
  }`,y=`
      let angle = ${Me(u*Dt)} * f32(knMod) / ${Me(i)};
      acc += cmul(spectrum(inBase, n), vec2<f32>(cos(angle), sin(angle)));
      knMod += k;
      if (knMod >= ${i}u) { knMod -= ${i}u; }`,_=a===2?f.setByOffset("off + 1u",`${o}(v.y)`):"",m=l===1?"acc":`acc * ${Me(l)}`;return`
  ${Ei(d,c,f)}
  fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }
  ${g}
  ${d.mainStart(Oe)}
    let row = workgroup_index;
    if (row >= uniforms.batch) { return; }
    let outer = row / uniforms.inner;
    let within = row % uniforms.inner;
    let inBase = (outer * uniforms.signalLength * uniforms.inner + within) * ${r}u;
    let outBase = (outer * uniforms.outputLength * uniforms.inner + within) * ${a}u;
    for (var k = local_idx; k < uniforms.outputLength; k += ${Oe}u) {
      var acc = vec2<f32>(0.0, 0.0);
      var knMod = 0u;
      for (var n = 0u; n < ${i}u; n++) {${y}
      }
      let v = ${m};
      let off = outBase + k * uniforms.inner * ${a}u;
      ${f.setByOffset("off",`${o}(v.x)`)}
      ${_}
    }
  }`};return{name:"DFT",shaderCache:{hint:Ii(e,"direct"),inputDependencies:["type"]},getShaderSource:p,getRunData:()=>({outputs:[{dims:e.outputDims,dataType:t}],programUniforms:zi(e),dispatchGroup:{x:e.batch}})}},Ci=e=>{if(!e||e.dataType===0)return;if(k.size(e.dims)!==1)throw new Error("DFT optional scalar inputs must have exactly 1 element.");if(e.dataType===6)return e.getInt32Array()[0];let t=Number(e.getBigInt64Array()[0]);if(!Number.isSafeInteger(t))throw new Error("DFT optional scalar inputs are out of JavaScript safe integer range.");return t},Us=e=>{if(!e||e.length<1)throw new Error("DFT requires at least 1 input.");let t=e[0].dims;if(t.length<2)throw new Error("DFT input must have at least 2 dimensions.");let i=t[t.length-1];if(i!==1&&i!==2)throw new Error("DFT input's innermost dimension must be 1 (real) or 2 (complex).")},Kl=(e,t)=>{Us(e.inputs);let i=e.inputs[0],r=i.dims.length,a=t.inverse!==0,s=t.onesided!==0,n=Ci(e.inputs[1]);if(n!==void 0&&n<=0)throw new Error("dft_length must be greater than zero.");let o=k.normalizeAxis(Ci(e.inputs[2])??t.axis,r);if(o===r-1)throw new Error("DFT axis must refer to a signal dimension, not the innermost (real/imaginary) dimension.");if(a&&s&&i.dims[r-1]!==2)throw new Error("Inverse one-sided DFT (IRFFT) requires complex-valued input (innermost dimension 2).");let u=As(i,o,a,s,n);if(u.length<=0)throw new Error(`Invalid DFT length: ${u.length}`);let l=u.length<=ft&&Ti(u.length)!==void 0?Ds(u):Ms(u);e.compute(l,{inputs:[0]})},jl=e=>Y({axis:e.axis??1,inverse:e.inverse??0,onesided:e.onesided??0})}),Mt,mt,Oi,Ps,qs,Ns,Ls,Bi,Vs,Ql,Zl,ic=E(()=>{"use strict";N(),W(),ae(),F(),Mt="[a-zA-Z]|\\.\\.\\.",mt="("+Mt+")+",Oi="^"+mt+"$",Ps="("+mt+",)*"+mt,qs="^"+Ps+"$",Ns=class{constructor(e=-1){this.symbolToIndices=new Map,this.inputIndex=e}addSymbol(e,t){let i=this.symbolToIndices.get(e);i===void 0?i=[t]:i.push(t),this.symbolToIndices.set(e,i)}},Ls=class{constructor(e,t){this.equation=t,this.hasEllipsis=!1,this.symbolToInfo=new Map,this.lhs=new Array,this.outputDims=[];let[i,r]=t.includes("->")?t.split("->",2):[t,""];if(!i.match(RegExp(qs)))throw new Error("Invalid LHS term");if(i.split(",").forEach((a,s)=>{let n=e[s].dims.slice();if(!a.match(RegExp(Oi)))throw new Error("Invalid LHS term");let o=this.processTerm(a,!0,n,s);this.lhs.push(o)}),r==="")r+=[...this.symbolToInfo.entries()].filter(([a,s])=>s.count===1||a==="...").map(([a])=>a).join("");else if(!r.match(RegExp(mt)))throw new Error("Invalid RHS");r.match(RegExp(Mt,"g"))?.forEach(a=>{if(a==="...")this.outputDims=this.outputDims.concat(this.ellipsisDims);else{let s=this.symbolToInfo.get(a);if(s===void 0)throw new Error("Invalid RHS symbol");this.outputDims.push(s.dimValue)}}),this.rhs=this.processTerm(r,!1,this.outputDims)}addSymbol(e,t,i){let r=this.symbolToInfo.get(e);if(r!==void 0){if(r.dimValue!==t&&r.count!==1)throw new Error("Dimension mismatch");r.count++,r.inputIndices.push(i)}else r={count:1,dimValue:t,inputIndices:[i]};this.symbolToInfo.set(e,r)}processTerm(e,t,i,r=-1){let a=i.length,s=!1,n=[],o=0;if(!e.match(RegExp(Oi))&&!t&&e!=="")throw new Error("Invalid LHS term");let u=e.match(RegExp(Mt,"g")),l=new Ns(r);return u?.forEach((p,d)=>{if(p==="..."){if(s)throw new Error("Only one ellipsis is allowed per input term");s=!0;let c=a-u.length+1;if(c<0)throw new Error("Ellipsis out of bounds");if(n=i.slice(o,o+c),this.hasEllipsis){if(this.ellipsisDims.length!==n.length||this.ellipsisDims.toString()!==n.toString())throw new Error("Ellipsis dimensions mismatch")}else if(t)this.hasEllipsis=!0,this.ellipsisDims=n;else throw new Error("Ellipsis must be specified in the LHS");for(let f=0;f<n.length;f++){let h=String.fromCharCode(48+f);l.addSymbol(h,d+f),this.addSymbol(h,i[o++],r)}}else l.addSymbol(p,d+(this.hasEllipsis?this.ellipsisDims.length-1:0)),this.addSymbol(p,i[o++],r)}),l}},Bi=e=>e+"_max",Vs=(e,t,i,r)=>{let a=e.map(l=>l.length).map((l,p)=>T(`input${p}`,t,l)),s=k.size(r),n=B("output",t,r.length),o=[...i.symbolToInfo.keys()].filter(l=>!i.rhs.symbolToIndices.has(l)),u=l=>{let p=[],d="var prod = 1.0;",c="var sum = 0.0;",f="sum += prod;",h=[],g=[],y=[],_=[],m=i.symbolToInfo.size===i.rhs.symbolToIndices.size;i.symbolToInfo.forEach(($,b)=>{if(i.rhs.symbolToIndices.has(b)){let v=i.rhs.symbolToIndices.get(b)?.[0];v!==void 0&&i.lhs.forEach((x,S)=>{if($.inputIndices.includes(S)){let I=x.symbolToIndices.get(b);if(I===void 0)throw new Error("Invalid symbol error");I.forEach(C=>{p.push(`${a[S].indicesSet(`input${S}Indices`,C,n.indicesGet("outputIndices",v))}`)})}})}else i.lhs.forEach((v,x)=>{if($.inputIndices.includes(x)){let S=v.symbolToIndices.get(b);if(S===void 0)throw new Error("Invalid symbol error");S.forEach(I=>{h.push(`${a[x].indicesSet(`input${x}Indices`,I,`${b}`)}`)}),_.push(`prod *= ${a[x].getByIndices(`input${x}Indices`)};`)}}),g.push(`for(var ${b}: u32 = 0; ${b} < uniforms.${Bi(b)}; ${b}++) {`),y.push("}")});let w=m?[...p,`let sum = ${a.map(($,b)=>$.getByIndices(`input${b}Indices`)).join(" * ")};`]:[...p,c,...g,...h,d,..._,f,...y];return`
            ${l.registerUniforms(o.map($=>({name:`${Bi($)}`,type:"u32"}))).registerUniform("outputSize","u32").declareVariables(...a,n)}

            ${l.mainStart()}
            ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
            var outputIndices = ${n.offsetToIndices("global_idx")};
            ${a.map(($,b)=>`var input${b}Indices: ${a[b].type.indices};`).join(`
`)}
            ${w.join(`
`)};
            ${n.setByOffset("global_idx","sum")};
          }`};return{name:"Einsum",shaderCache:{hint:i.equation,inputDependencies:e.map(()=>"rank")},getRunData:()=>{let l=o.filter(d=>i.symbolToInfo.has(d)).map(d=>({type:12,data:i.symbolToInfo.get(d)?.dimValue||0}));l.push({type:12,data:s});let p=e.map((d,c)=>[...M(d)]).reduce((d,c)=>d.concat(c),l);return p.push(...M(r)),{outputs:[{dims:r,dataType:t}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:p}},getShaderSource:u}},Ql=(e,t)=>{let i=new Ls(e.inputs,t.equation),r=i.outputDims,a=e.inputs.map((s,n)=>s.dims);e.compute(Vs(a,e.inputs[0].dataType,i,r))},Zl=e=>{let t=e.equation.replace(/\s+/g,"");return Y({equation:t})}}),Gs,Ri,Ws,Fs,Xl,rc=E(()=>{"use strict";N(),W(),F(),Gs=e=>{if(!e||e.length!==2)throw new Error("Expand requires 2 input.");let t=e[0].dims,i=Array.from(e[1].getBigInt64Array(),Number),r=i.length<t.length?0:i.length-t.length,a=t.length<i.length?0:t.length-i.length;for(;r<i.length&&a<t.length;++r,++a)if(i[r]!==t[a]&&i[r]!==1&&t[a]!==1)throw new Error("Expand requires shape to be broadcastable to input")},Ri=(e,t)=>{let i=e.length-t.length,r=[];for(let a=0;a<i;++a)r.push(e[a]);for(let a=0;a<t.length;++a)r.push(t[a]===1?e[a+i]:t[a]);return r},Ws=(e,t)=>e.length>t.length?Ri(e,t):Ri(t,e),Fs=e=>{let t=e[0].dims,i=Array.from(e[1].getBigInt64Array(),Number),r=Ws(t,i),a=e[0].dataType,s=a===9||k.size(t)===1,n=a===9||t.length>0&&t[t.length-1]%4===0?4:1,o=s||r.length>0&&r[r.length-1]%4===0?4:1,u=Math.ceil(k.size(r)/o),l=d=>{let c=T("input",a,t.length,n),f=B("output",a,r.length,o),h;if(a===9){let g=(y,_,m="")=>`
          let outputIndices${_} = ${f.offsetToIndices(`outputOffset + ${_}u`)};
          let offset${_} = ${c.broadcastedIndicesToOffset(`outputIndices${_}`,f)};
          let index${_} = offset${_} / 4u;
          let component${_} = offset${_} % 4u;
          ${y}[${_}] = ${m}(${c.getByOffset(`index${_}`)}[component${_}]);
        `;h=`
        let outputOffset = global_idx * ${o};
        var data = vec4<u32>(0);
        ${g("data",0,"u32")}
        ${g("data",1,"u32")}
        ${g("data",2,"u32")}
        ${g("data",3,"u32")}
        ${f.setByOffset("global_idx","data")}
      }`}else h=`
        let outputIndices = ${f.offsetToIndices(`global_idx * ${o}`)};
        let inputOffset = ${c.broadcastedIndicesToOffset("outputIndices",f)};
        let data = ${f.type.value}(${c.getByOffset(`inputOffset / ${n}`)});
        ${f.setByOffset("global_idx","data")}
      }`;return`
    ${d.registerUniform("vec_size","u32").declareVariables(c,f)}
    ${d.mainStart()}
    ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
    ${h}`},p=[{type:12,data:u},...M(t,r)];return{name:"Expand",shaderCache:{hint:`${r.length};${n}${o}`,inputDependencies:["rank"]},getShaderSource:l,getRunData:()=>({outputs:[{dims:r,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:p})}},Xl=e=>{Gs(e.inputs),e.compute(Fs(e.inputs),{inputs:[0]})}}),Hs,Yl,ac=E(()=>{"use strict";N(),W(),F(),Er(),Hs=e=>{let t=e[0].dataType,i=k.size(e[0].dims),r=k.size(e[1].dims),a=r%4===0,s=n=>{let o=T("x",t,[1],4),u=T("bias",t,[1],4),l=B("y",t,[1],4),p=[{name:"output_vec_size",type:"u32"},{name:"bias_size",type:"u32"}],d=f=>`
      let bias${f}_offset: u32 = (global_idx * 4 + ${f}) % uniforms.bias_size;
      let bias${f} = ${u.getByOffset(`bias${f}_offset / 4`)}[bias${f}_offset % 4];`,c=a?`
      let bias = ${u.getByOffset("global_idx % (uniforms.bias_size / 4)")};`:`${d(0)}${d(1)}${d(2)}${d(3)}
      let bias = ${o.type.value}(bias0, bias1, bias2, bias3);`;return`${n.registerUniforms(p).declareVariables(o,u,l)}

    ${ar(oe(t))}

    ${n.mainStart(ut)}
      ${n.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_vec_size")}

      let x = ${o.getByOffset("global_idx")};
      ${c}
      let x_in = x + bias;
      ${l.setByOffset("global_idx",sr("x_in"))}
    }`};return{name:"FastGeluWithBias",shaderCache:{hint:`${a}`,inputDependencies:["type","type"]},getShaderSource:s,getRunData:n=>({outputs:[{dims:n[0].dims,dataType:n[0].dataType}],programUniforms:[{type:12,data:Math.ceil(i/4)},{type:12,data:r}],dispatchGroup:{x:Math.ceil(i/ut/4)}})}},Yl=e=>{e.inputs.length<2||k.size(e.inputs[1].dims)===0?gl(e):e.compute(Hs(e.inputs))}}),Ks,js,Jl,ed,sc=E(()=>{"use strict";N(),W(),ae(),F(),Ks=e=>{if(!e||e.length!==2)throw new Error("Gather requires 2 inputs.")},js=(e,t)=>{let i=e[0].dims,r=e[1].dims,a=i.length,s=k.normalizeAxis(t.axis,a),n=i.slice(0);n.splice(s,1,...r);let o=i[s],u=e[0].dataType===9?4:1,l=Math.ceil(k.size(n)/u),p=[{type:12,data:l},{type:6,data:o},{type:12,data:s},...M(e[0].dims,e[1].dims,n)],d=c=>{let f=T("data",e[0].dataType,e[0].dims.length,u),h=T("inputIndices",e[1].dataType,e[1].dims.length),g=B("output",e[0].dataType,n.length,u),y=m=>{let w=r.length,$=`var indicesIndices${m}  = ${h.type.indices}(0);`;for(let b=0;b<w;b++)$+=`${w>1?`indicesIndices${m}[${b}]`:`indicesIndices${m}`} = ${n.length>1?`outputIndices${m}[uniforms.axis + ${b}]`:`outputIndices${m}`};`;$+=`
          var idx${m} = ${h.getByIndices(`indicesIndices${m}`)};
          if (idx${m} < 0) {
            idx${m} = idx${m} + uniforms.axisDimLimit;
          }
          var dataIndices${m} : ${f.type.indices};
        `;for(let b=0,v=0;b<a;b++)b===s?($+=`${a>1?`dataIndices${m}[${b}]`:`dataIndices${m}`} = u32(idx${m});`,v+=w):($+=`${a>1?`dataIndices${m}[${b}]`:`dataIndices${m}`} = ${n.length>1?`outputIndices${m}[${v}]`:`outputIndices${m}`};`,v++);return $},_;if(e[0].dataType===9){let m=(w,$,b="")=>`
          let outputIndices${$} = ${g.offsetToIndices(`outputOffset + ${$}u`)};
          ${y($)};
          let offset${$} = ${f.indicesToOffset(`dataIndices${$}`)};
          let index${$} = offset${$} / 4u;
          let component${$} = offset${$} % 4u;
          ${w}[${$}] = ${b}(${f.getByOffset(`index${$}`)}[component${$}]);
        `;_=`
        let outputOffset = global_idx * ${u};
        var value = vec4<u32>(0);
        ${m("value",0,"u32")}
        ${m("value",1,"u32")}
        ${m("value",2,"u32")}
        ${m("value",3,"u32")}
        ${g.setByOffset("global_idx","value")}
      `}else _=`
      let outputIndices = ${g.offsetToIndices("global_idx")};
      ${y("")};
      let value = ${f.getByIndices("dataIndices")};
      ${g.setByOffset("global_idx","value")};
      `;return`
      ${c.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(f,h,g)}
      ${c.mainStart()}
        ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        ${_}
      }`};return{name:"Gather",shaderCache:{hint:t.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:n,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:p}),getShaderSource:d}},Jl=e=>Y({axis:e.axis}),ed=(e,t)=>{let i=e.inputs;Ks(i),e.compute(js(e.inputs,t))}}),Qs,td,id,nc=E(()=>{"use strict";N(),W(),F(),Qs=(e,t,i,r,a,s,n,o,u)=>{let l=[{type:12,data:s},{type:12,data:r},{type:12,data:a},{type:12,data:i},{type:12,data:n},{type:12,data:o},{type:12,data:u}],p=[s];l.push(...M(t.dims,p));let d=c=>{let f=T("indices_data",t.dataType,t.dims.length),h=B("input_slice_offsets_data",12,1,1),g=[f,h],y=[{name:"output_size",type:"u32"},{name:"batch_dims",type:"u32"},{name:"input_dims",type:"u32",length:a.length},{name:"sizes_from_slice_dims_data",type:"u32",length:i.length},{name:"num_slices_per_batch",type:"u32"},{name:"input_batch_stride",type:"u32"},{name:"num_slice_dims",type:"u32"}];return`
  ${c.registerUniforms(y).declareVariables(...g)}
  ${c.mainStart()}
    ${c.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let batch_idx = global_idx / uniforms.num_slices_per_batch;
    let base_offset = batch_idx * uniforms.input_batch_stride;

    let slice_indices_base_offset = global_idx * uniforms.num_slice_dims;
    var relative_slice_offset = 0;
    for (var dim_idx = 0u; dim_idx < uniforms.num_slice_dims; dim_idx ++) {
      var index = i32(indices_data[dim_idx + slice_indices_base_offset].x);
      let input_dim_idx = uniforms.batch_dims + dim_idx;
      if (index < 0) {
        ${a.length===1?"index += i32(uniforms.input_dims);":"index += i32(uniforms.input_dims[input_dim_idx]);"}
      }
      ${i.length===1?"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data);":"relative_slice_offset += index * i32(uniforms.sizes_from_slice_dims_data[dim_idx]);"}
    }

    input_slice_offsets_data[global_idx] =  base_offset + u32(relative_slice_offset);
  }`};return e.compute({name:"computeSliceOffsets",shaderCache:{hint:`${a.length}_${i.length}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:p,dataType:e.inputs[1].dataType}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:l}),getShaderSource:d},{inputs:[t],outputs:[-1]})[0]},td=(e,t)=>{let i=e.inputs,r=i[0].dims,a=i[0].dataType,s=i[1].dims,n=s[s.length-1],o=k.sizeToDimension(s,s.length-1),u=k.sizeFromDimension(r,t.batchDims+n),l=k.sizeToDimension(r,t.batchDims),p=k.sizeFromDimension(r,t.batchDims),d=o/l,c=new Array(n),f=u;for(let $=0;$<n;++$)c[n-1-$]=f,f*=r[t.batchDims+n-1-$];let h=Qs(e,i[1],c,t.batchDims,r,o,d,p,n),g=t.batchDims+n;if(g>r.length)throw new Error("last dimension of indices must not be larger than rank of input tensor");let y=s.slice(0,-1).concat(r.slice(g)),_=k.size(y),m=[{type:12,data:_},{type:12,data:u},...M(i[0].dims,h.dims,y)],w=$=>{let b=T("data",i[0].dataType,i[0].dims.length),v=T("slice_offsets",12,h.dims.length),x=B("output",i[0].dataType,y.length);return`
          ${$.registerUniform("output_size","u32").registerUniform("slice_size","u32").declareVariables(b,v,x)}
            ${$.mainStart()}
            ${$.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let slice_offset = slice_offsets[global_idx / uniforms.slice_size];
          output[global_idx] = data[u32(slice_offset) + global_idx % uniforms.slice_size];
        }`};e.compute({name:"GatherND",shaderCache:{hint:t.cacheKey,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:y,dataType:a}],dispatchGroup:{x:Math.ceil(_/64)},programUniforms:m}),getShaderSource:w},{inputs:[i[0],h]})},id=e=>({batchDims:e.batch_dims,cacheKey:""})}),Zs,Xs,rd,ad,oc=E(()=>{"use strict";N(),W(),ae(),F(),Zs=(e,t)=>{if(e.length<3||e.length>4)throw new Error("GatherBlockQuantized requires 3 or 4 inputs.");let i=k.normalizeAxis(t.quantizeAxis,e[0].dims.length),r=t.blockSize,a=e[0],s=e[2],n=e.length===4?e[3]:void 0;if(s.dims.length!==a.dims.length||!a.dims.map((o,u)=>u===i?Math.ceil(o/r)===s.dims[u]:o===s.dims[u]).reduce((o,u)=>o&&u,!0))throw new Error("Scales must have the same rank as the input tensor and the dims should match except on gatherAxis.");if(n){if(n.dataType!==a.dataType)throw new Error("Zero point must have the same data type as the input tensor.");if(n.dims.length!==s.dims.length||!n.dims.map((o,u)=>o===s.dims[u]).reduce((o,u)=>o&&u,!0))throw new Error("Zero point must have the same rank as the input tensor and the dims should match except on quantizeAxis.")}},Xs=(e,t)=>{let i=e[0].dims,r=e[1].dims,a=i.length,s=k.normalizeAxis(t.gatherAxis,a),n=k.normalizeAxis(t.quantizeAxis,a),o=i.slice(0);o.splice(s,1,...r);let u=k.size(o),l=e[2].dataType,p=e[0].dataType===22,d=[{type:12,data:u},{type:12,data:n},{type:12,data:s},{type:12,data:t.blockSize},...M(...e.map((f,h)=>f.dims),o)],c=f=>{let h=T("data",e[0].dataType,e[0].dims.length),g=T("inputIndices",e[1].dataType,e[1].dims.length),y=T("scales",e[2].dataType,e[2].dims.length),_=e.length>3?T("zeroPoint",e[3].dataType,e[3].dims.length):void 0,m=B("output",l,o.length),w=[h,g,y];_&&w.push(_);let $=[{name:"output_size",type:"u32"},{name:"quantize_axis",type:"u32"},{name:"gather_axis",type:"u32"},{name:"block_size",type:"u32"}];return`
        ${f.registerUniforms($).declareVariables(...w,m)}
        ${f.mainStart()}
        let output_indices = ${m.offsetToIndices("global_idx")};
        var indices_indices = ${g.type.indices}(0);
        ${r.length>1?`
          for (var i: u32 = 0; i < ${r.length}; i++) {
            let index = ${m.indicesGet("output_indices","uniforms.gather_axis + i")};
            ${g.indicesSet("indices_indices","i","index")};
          }`:`indices_indices = ${m.indicesGet("output_indices","uniforms.gather_axis")};`};
        var data_indices = ${h.type.indices}(0);
        for (var i: u32 = 0; i < uniforms.gather_axis; i++) {
          let index = ${m.indicesGet("output_indices","i")};
          ${h.indicesSet("data_indices","i","index")};
        }
        var index_from_indices = ${g.getByIndices("indices_indices")};
        if (index_from_indices < 0) {
          index_from_indices += ${i[s]};
        }
        ${h.indicesSet("data_indices","uniforms.gather_axis","u32(index_from_indices)")};
        for (var i = uniforms.gather_axis + 1; i < ${o.length}; i++) {
          let index = ${m.indicesGet("output_indices",`i + ${r.length} - 1`)};
          ${h.indicesSet("data_indices","i","index")};
        }
        let data_offset = ${h.indicesToOffset("data_indices")};
        let data_index = data_offset % 8;
        // Convert 4-bit packed data to 8-bit packed data.
        let packed_4bit_quantized_data = ${h.getByOffset("data_offset / 8")};
        let packed_8bit_quantized_data = (packed_4bit_quantized_data >> (4 * (data_index % 2))) & 0x0f0f0f0f;
        let quantized_data_vec = ${p?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_quantized_data));
        let quantized_data = quantized_data_vec[data_index / 2];
        var scale_indices = data_indices;
        let quantize_axis_index = ${y.indicesGet("data_indices","uniforms.quantize_axis")} / uniforms.block_size;
        ${y.indicesSet("scale_indices","uniforms.quantize_axis","quantize_axis_index")};
        var scale = ${y.getByIndices("scale_indices")};
        ${_?`
              let zero_point_indices = scale_indices;
              let zero_point_offset = ${_.indicesToOffset("zero_point_indices")};
              let zero_point_index = zero_point_offset % 8;
              let packed_4bit_zero_points = ${_.getByOffset("zero_point_offset / 8")};
              let packed_8bit_zero_points = (packed_4bit_zero_points >> (4 * (zero_point_index % 2))) & 0x0f0f0f0f;
              let zero_point_vec = ${p?"unpack4xI8":"unpack4xU8"}(u32(packed_8bit_zero_points));
              let zero_point = zero_point_vec[zero_point_index / 2];`:"var zero_point = 0"};
        let dequantized_data = ${oe(l)}(quantized_data - zero_point) * scale;
        ${m.setByOffset("global_idx","dequantized_data")};
    }`};return{name:"GatherBlockQuantized",shaderCache:{hint:`${t.cacheKey};${e.filter((f,h)=>h!==1).map(f=>f.dims.join("_")).join(";")}`,inputDependencies:Array.from({length:e.length},(f,h)=>"rank")},getRunData:()=>({outputs:[{dims:o,dataType:l}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:d}),getShaderSource:c}},rd=(e,t)=>{let i=e.inputs;Zs(i,t),e.compute(Xs(e.inputs,t))},ad=e=>Y({blockSize:e.blockSize,gatherAxis:e.gatherAxis,quantizeAxis:e.quantizeAxis})}),Ys,Js,sd,nd,uc=E(()=>{"use strict";N(),W(),ae(),F(),Ys=e=>{if(!e||e.length!==2)throw new Error("GatherElements requires 2 inputs.");if(e[0].dims.length<1)throw new Error("GatherElements requires that the data input be rank >= 1.");if(e[0].dims.length!==e[1].dims.length)throw new Error(`GatherElements requires that the data input and
                     indices input tensors be of same rank.`)},Js=(e,t)=>{let i=e[0].dims,r=e[0].dataType,a=i.length,s=e[1].dims,n=e[1].dataType,o=k.normalizeAxis(t.axis,a),u=i[o],l=s.slice(0),p=k.size(l),d=T("input",r,a),c=T("indicesInput",n,s.length),f=B("output",r,l.length),h=[{type:12,data:p},{type:6,data:u},{type:12,data:o}];return h.push(...M(i,s,l)),{name:"GatherElements",shaderCache:{inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:l,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(p/64)},programUniforms:h}),getShaderSource:g=>`
      ${g.registerUniform("outputSize","u32").registerUniform("axisDimLimit","i32").registerUniform("axis","u32").declareVariables(d,c,f)}
      ${g.mainStart()}
      ${g.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

      let outputIndices = ${f.offsetToIndices("global_idx")};

      var idx = ${c.getByOffset("global_idx")};
      if (idx < 0) {
        idx = idx + uniforms.axisDimLimit;
      }
      var inputIndices = ${d.type.indices}(outputIndices);
      ${d.indicesSet("inputIndices","uniforms.axis","u32(idx)")};
      let value = ${d.getByIndices("inputIndices")};

      ${f.setByOffset("global_idx","value")};
  }`}},sd=e=>Y({axis:e.axis}),nd=(e,t)=>{let i=e.inputs;Ys(i),e.compute(Js(e.inputs,t))}}),en,tn,od,ud,lc=E(()=>{"use strict";N(),W(),F(),en=e=>{if(!e)throw new Error("Input is missing");if(e.length<2||e.length>3)throw new Error("Invaid input number.");if(e.length===3&&e[2].dims.length>2)throw new Error("Invalid input shape of C");if(e[0].dataType!==e[1].dataType||e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("Input types are mismatched")},tn=(e,t)=>{let i=e[0].dims.slice(),r=e[1].dims.slice(),[a,s,n]=iu.getShapeOfGemmResult(i,t.transA,r,t.transB,e.length===3?e[2].dims:void 0),o=[a,s];if(!o)throw new Error("Can't use gemm on the given tensors");let u=16,l=Math.ceil(s/u),p=Math.ceil(a/u),d=!0,c=k.size(o),f=[{type:12,data:d?l:c},{type:12,data:a},{type:12,data:s},{type:12,data:n},{type:1,data:t.alpha},{type:1,data:t.beta}],h=["type","type"];e.length===3&&(f.push(...M(e[2].dims)),h.push("rank")),f.push(...M(o));let g=_=>{let m="";t.transA&&t.transB?m="value += a[k * uniforms.M + m] * b[n * uniforms.K + k];":t.transA&&!t.transB?m="value += a[k * uniforms.M + m] * b[k * uniforms.N + n];":!t.transA&&t.transB?m="value += a[m * uniforms.K + k] * b[n * uniforms.K + k];":!t.transA&&!t.transB&&(m="value += a[m * uniforms.K + k] * b[k * uniforms.N + n];");let w=t.alpha===1?"":"value *= uniforms.alpha;",$=T("a",e[0].dataType,e[0].dims),b=T("b",e[1].dataType,e[1].dims),v=$.type.value,x=null,S=[$,b];e.length===3&&(x=T("c",e[2].dataType,e[2].dims.length),S.push(x));let I=B("output",e[0].dataType,o.length);S.push(I);let C=[{name:"output_size",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}];return`
  ${_.registerUniforms(C).declareVariables(...S)}

  ${_.mainStart()}
    ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

    let m = global_idx / uniforms.N;
    let n = global_idx % uniforms.N;

    var value = ${v}(0);
    for (var k: u32 = 0u; k < uniforms.K; k++) {
      ${m}
    }

    ${w}
    ${x!=null?`let cOffset = ${x.broadcastedIndicesToOffset("vec2(m, n)",I)}; value += ${v}(uniforms.beta) * ${x.getByOffset("cOffset")};`:""}
    output[global_idx] = value;
  }`},y=_=>{let m=T("a",e[0].dataType,e[0].dims),w=T("b",e[1].dataType,e[1].dims),$=null,b=[m,w];e.length===3&&($=T("c",e[2].dataType,e[2].dims.length),b.push($));let v=B("output",e[0].dataType,o.length);b.push(v);let x=[{name:"num_tile_n",type:"u32"},{name:"M",type:"u32"},{name:"N",type:"u32"},{name:"K",type:"u32"},{name:"alpha",type:"f32"},{name:"beta",type:"f32"}],S="",I="";t.transA&&t.transB?(I=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${m.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${w.type.value}(0);
      }
      `,S="value += tile_a[k][local_id.y] * tile_b[local_id.x][k];"):t.transA&&!t.transB?(I=`
      var col = tile_row_start + local_id.x;
      var row = k_start + local_id.y;
      if (col < uniforms.M && row < uniforms.K) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.M + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${m.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${w.type.value}(0);
      }
      `,S="value += tile_a[k][local_id.y] * tile_b[k][local_id.x];"):!t.transA&&t.transB?(I=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${m.type.value}(0);
      }

      col = k_start + local_id.x;
      row = tile_col_start + local_id.y;
      if (col < uniforms.K && row < uniforms.N) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.K + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${w.type.value}(0);
      }
      `,S="value += tile_a[local_id.y][k] * tile_b[local_id.x][k];"):!t.transA&&!t.transB&&(I=`
      var col = k_start + local_id.x;
      var row = tile_row_start + local_id.y;
      if (col < uniforms.K && row < uniforms.M) {
        tile_a[local_id.y][local_id.x] = a[row * uniforms.K + col];
      } else {
        tile_a[local_id.y][local_id.x] = ${m.type.value}(0);
      }

      col = tile_col_start + local_id.x;
      row = k_start + local_id.y;
      if (col < uniforms.N && row < uniforms.K) {
        tile_b[local_id.y][local_id.x] = b[row * uniforms.N + col];
      } else {
        tile_b[local_id.y][local_id.x] = ${w.type.value}(0);
      }
      `,S="value += tile_a[local_id.y][k] * tile_b[k][local_id.x];");let C=t.alpha===1?"":"value *= uniforms.alpha;";return`
  ${_.registerUniforms(x).declareVariables(...b)}
  var<workgroup> tile_a: array<array<${m.type.storage}, ${u}>, ${u}>;
  var<workgroup> tile_b: array<array<${w.type.storage}, ${u}>, ${u}>;
  ${_.mainStart([u,u,1])}
    let tile_col_start = (workgroup_index % uniforms.num_tile_n) * ${u};
    let tile_row_start = (workgroup_index / uniforms.num_tile_n) * ${u};
    let num_tiles = (uniforms.K - 1) / ${u} + 1;
    var k_start = 0u;
    var value = ${v.type.value}(0);
    for (var t: u32 = 0u; t < num_tiles; t++) {
      ${I}
      k_start = k_start + ${u};
      workgroupBarrier();

      for (var k: u32 = 0u; k < ${u}; k++) {
        ${S}
      }
      workgroupBarrier();
    }

    ${C}
    let m = tile_row_start + local_id.y;
    let n = tile_col_start + local_id.x;
    ${$!=null?`let cOffset = ${$.broadcastedIndicesToOffset("vec2(m, n)",v)}; value += ${v.type.value}(uniforms.beta) * ${$.getByOffset("cOffset")};`:""}
    if (m < uniforms.M && n < uniforms.N) {
      output[m * uniforms.N + n] = value;
    }
  }`};return d?{name:"GemmShared",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:h},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:l*p},programUniforms:f}),getShaderSource:y}:{name:"Gemm",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:h},getRunData:()=>({outputs:[{dims:o,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:f}),getShaderSource:g}},od=e=>{let t=e.transA,i=e.transB,r=e.alpha,a=e.beta;return{transA:t,transB:i,alpha:r,beta:a,cacheKey:`${e.transA};${e.transB};${e.alpha===1}`}},ud=(e,t)=>{en(e.inputs),e.compute(tn(e.inputs,t))}}),Ie,Be,We,Fe,rn,an,sn,nn,on,un,ln,dn,ld,dd,dc=E(()=>{"use strict";N(),W(),ae(),F(),[Ie,Be,We,Fe]=[0,1,2,3],rn=e=>{if(e[0].dims.length!==4)throw new Error("only 4-D tensor is supported.");if(e[0].dims.length!==e[1].dims.length)throw new Error("input dimensions must be equal to grid dimensions");if(e[0].dims.length-2!==e[1].dims[e[1].dims.length-1])throw new Error(`last dimension of grid must be equal to ${e[0].dims.length-2}`);if(e[0].dims[0]!==e[1].dims[0])throw new Error("grid batch size must match input batch size")},an=`
  fn gs_get_cubic_coeffs(x: f32) -> vec4<f32> {
    let cubic_alpha = -0.75f;
    let x_abs = abs(x);
    var coeffs: vec4<f32>;
    coeffs[0] = (((cubic_alpha * (x_abs + 1) - 5 * cubic_alpha) * (x_abs + 1) + 8 * cubic_alpha) * (x_abs + 1) - 4 * cubic_alpha);
    coeffs[1] = (((cubic_alpha + 2) * x_abs - (cubic_alpha + 3)) * x_abs * x_abs + 1);
    coeffs[2] = (((cubic_alpha + 2) * (1 - x_abs) - (cubic_alpha + 3)) * (1 - x_abs) * (1 - x_abs) + 1);
    coeffs[3] = (((cubic_alpha * (2 - x_abs) - 5 * cubic_alpha) * (2 - x_abs) + 8 * cubic_alpha) * (2 - x_abs) - 4 * cubic_alpha);
    return coeffs;
  }
`,sn=e=>`
  fn gs_bicubic_interpolate(p: mat4x4<${e}>, x: f32, y: f32) -> ${e} {
    var v: vec4<f32>;
    var coeffs = gs_get_cubic_coeffs(x);
    for (var i = 0; i < 4; i++) {
      v[i] = coeffs[0] * p[i][0] + coeffs[1] * p[i][1] + coeffs[2] * p[i][2] + coeffs[3] * p[i][3];
    }
    coeffs = gs_get_cubic_coeffs(y);
    let pixel = ${e}(coeffs[0] * v[0] + coeffs[1] * v[1] + coeffs[2] * v[2] + coeffs[3] * v[3]);
    return pixel;
  }
`,nn=e=>`
  fn gs_denormalize(n: f32, length: i32) -> f32 {
    ${e.alignCorners===0?`
    // alignCorners: false => [-1, 1] to [-0.5, length - 0.5]
    return ((n + 1.0) * f32(length) - 1.0) / 2.0;
    `:`
    // alignCorners: true => [-1, 1] to [0, length - 1]
    return (n + 1.0) / 2.0 * (f32(length - 1));
    `}
  }
`,on=e=>`
  ${e.paddingMode==="reflection"?`
      fn gs_reflect(x: i32, x_min: f32, x_max: f32) -> u32 {
        var dx = 0.0;
        var fx = f32(x);
        let range = x_max - x_min;
        if (fx < x_min) {
          dx = x_min - fx;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_min + r;
          } else {
            fx = x_max - r;
          }
        } else if (fx > x_max) {
          dx = fx - x_max;
          let n = u32(dx / range);
          let r = dx - f32(n) * range;
          if (n % 2 == 0) {
            fx = x_max - r;
          } else {
            fx = x_min + r;
          }
        }
        return u32(fx);
      }`:""}
`,un=(e,t,i)=>`
  fn pixel_at_grid(r: i32, c: i32, H: i32, W: i32, batch: u32, channel: u32, border: vec4<f32>) -> ${t} {
     var pixel = ${t}(0);
     var indices = vec4<u32>(0);
     indices[${Ie}] = batch;
     indices[${Be}] = channel;`+(()=>{switch(i.paddingMode){case"zeros":return`
          if (r >= 0 && r < H && c >=0 && c < W) {
            indices[${We}] = u32(r);
            indices[${Fe}] = u32(c);
          } else {
            return ${t}(0);
          }
        `;case"border":return`
          indices[${We}] = u32(clamp(r, 0, H - 1));
          indices[${Fe}] = u32(clamp(c, 0, W - 1));
        `;case"reflection":return`
          indices[${We}] = gs_reflect(r, border[1], border[3]);
          indices[${Fe}] = gs_reflect(c, border[0], border[2]);
        `;default:throw new Error(`padding mode ${i.paddingMode} is not supported`)}})()+`
    return ${e.getByIndices("indices")};
  }
`,ln=(e,t,i)=>(()=>{switch(i.mode){case"nearest":return`
          let result = pixel_at_grid(i32(round(y)), i32(round(x)), H_in, W_in, indices[${Ie}], indices[${Be}], border);
        `;case"bilinear":return`
          let x1 = i32(floor(x));
          let y1 = i32(floor(y));
          let x2 = x1 + 1;
          let y2 = y1 + 1;

          let p11 = pixel_at_grid(y1, x1, H_in, W_in, indices[${Ie}], indices[${Be}], border);
          let p12 = pixel_at_grid(y1, x2, H_in, W_in, indices[${Ie}], indices[${Be}], border);
          let p21 = pixel_at_grid(y2, x1, H_in, W_in, indices[${Ie}], indices[${Be}], border);
          let p22 = pixel_at_grid(y2, x2, H_in, W_in, indices[${Ie}], indices[${Be}], border);

          let dx2 = ${t}(f32(x2) - x);
          let dx1 = ${t}(x - f32(x1));
          let dy2 = ${t}(f32(y2) - y);
          let dy1 = ${t}(y - f32(y1));
          let result = dy2 * (dx2 * p11 + dx1 * p12) + dy1 * (dx2 * p21 + dx1 * p22);
        `;case"bicubic":return`
          let x0 = i32(floor(x)) - 1;
          let y0 = i32(floor(y)) - 1;
          var p: mat4x4<${t}>;
          for (var h = 0; h < 4; h++) {
            for (var w = 0; w < 4; w++) {
              p[h][w] = pixel_at_grid(h + y0, w + x0, H_in, W_in, indices[${Ie}], indices[${Be}], border);
            }
          }

          let dx = x - f32(x0 + 1);
          let dy = y - f32(y0 + 1);
          let result = gs_bicubic_interpolate(p, dx, dy);
        `;default:throw new Error(`mode ${i.mode} is not supported`)}})()+`${e.setByOffset("global_idx","result")}`,dn=(e,t)=>{let i=T("x",e[0].dataType,e[0].dims.length),r=[e[1].dims[0],e[1].dims[1],e[1].dims[2]],a=T("grid",e[1].dataType,r.length,2),s=[e[0].dims[0],e[0].dims[1],e[1].dims[1],e[1].dims[2]];t.format==="NHWC"&&(s=[e[0].dims[0],e[1].dims[1],e[1].dims[2],e[0].dims[3]],[Ie,Be,We,Fe]=[0,3,1,2]);let n=B("output",e[0].dataType,s.length),o=i.type.value,u=k.size(s),l=[{type:12,data:u},...M(e[0].dims,r,s)],p=d=>`
  ${d.registerUniform("output_size","u32").declareVariables(i,a,n)}
  ${an}
  ${sn(o)}
  ${nn(t)}
  ${on(t)}
  ${un(i,o,t)}

  ${d.mainStart()}
    ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let H_in = i32(uniforms.x_shape[${We}]);
      let W_in = i32(uniforms.x_shape[${Fe}]);

      ${t.alignCorners===0?`
      let x_min = -0.5;
      let x_max = f32(W_in) - 0.5;
      let y_min = -0.5;
      let y_max = f32(H_in) - 0.5;
      `:`
      let x_min = 0.0;
      let x_max = f32(W_in) - 1.0;
      let y_min = 0.0;
      let y_max = f32(H_in) - 1.0;
      `};
      let border = vec4<f32>(x_min, y_min, x_max, y_max);

      let indices = ${n.offsetToIndices("global_idx")};
      var grid_indices = vec3<u32>(indices[${Ie}], indices[${We}], indices[${Fe}]);
      let nxy = ${a.getByIndices("grid_indices")};
      var x = gs_denormalize(f32(nxy[0]), W_in);
      var y = gs_denormalize(f32(nxy[1]), H_in);

      ${ln(n,o,t)}
  }`;return{name:"GridSample",shaderCache:{hint:`${t.cacheKey}`,inputDependencies:["type","type"]},getRunData:d=>{let c=k.size(s);return{outputs:[{dims:s,dataType:d[0].dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:l}},getShaderSource:p}},ld=(e,t)=>{rn(e.inputs),e.compute(dn(e.inputs,t))},dd=e=>Y({alignCorners:e.align_corners,mode:e.mode,paddingMode:e.padding_mode,format:e.format})}),ce,pn,pd,Ai,cn,vt,cd,hd=E(()=>{"use strict";N(),W(),ae(),Sr(),zr(),F(),Le(),ce=(e,t)=>e.length>t&&e[t].dims.length>0?e[t]:void 0,pn=(e,t)=>{let i=e[0],r=ce(e,1),a=ce(e,2),s=ce(e,3),n=ce(e,4),o=ce(e,5),u=ce(e,6),l=ce(e,7);if(i.dims.length!==3&&i.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let p=i.dims[0],d=i.dims[1],c=i.dims.length===3?i.dims[2]:t.numHeads*i.dims[4],f=d,h=0,g=0,y=Math.floor(c/t.numHeads);if(u&&l&&k.size(u.dims)&&k.size(l.dims)){if(u.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(u.dims[0]!==p||u.dims[1]!==t.numHeads||u.dims[3]!==y)throw new Error('Input "past_key" shape (batch_size, num_heads, past_sequence_length, head_size)');if(l.dims[0]!==p||l.dims[1]!==t.numHeads||l.dims[3]!==y)throw new Error('Input "past_value" shape (batch_size, num_heads, past_sequence_length, head_size)');if(u.dims[2]!==l.dims[2])throw new Error('Input "past_key" and "past_value" shall have same dim 2 (past_sequence_length)');if(l.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');h=u.dims[2],g=u.dims[2]}else if(u&&k.size(u.dims)||l&&k.size(l.dims))throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let _;if(r&&k.size(r.dims)>0){if(i.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(r.dims.length<3||r.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(i.dims[0]!==r.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(r.dims.length===3){if(r.dims[2]!==i.dims[2])throw new Error('Input "query" and "key" shall have same dim 2 (hidden_size)');_=2,f=r.dims[1]}else if(r.dims.length===5){if(r.dims[2]!==t.numHeads||r.dims[3]!==2||r.dims[4]!==y)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(a)throw new Error('Expect "value" be none when "key" has packed kv format.');_=5,f=r.dims[1]}else{if(r.dims[1]!==t.numHeads||r.dims[3]!==y)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');_=0,f=r.dims[2]}}else{if(i.dims.length!==5)throw new Error('Input "query" is expected to have 5 dimensions when key is empty');if(i.dims[2]!==t.numHeads||i.dims[3]!==3)throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');_=3}if(s&&k.size(s.dims)>0){if(s.dims.length!==1)throw new Error('Input "bias" is expected to have 1 dimension');if(r&&r.dims.length===5&&r.dims[3]===2)throw new Error("bias is not allowed for packed kv.")}let m=h+f,w=0;if(n&&k.size(n.dims)>0){w=8;let x=n.dims;throw x.length===1?x[0]===p?w=1:x[0]===3*p+2&&(w=3):x.length===2&&x[0]===p&&x[1]===m&&(w=5),w===8?new Error('Input "key_padding_mask" shape shall be (batch_size) or (batch_size, total_sequence_length)'):new Error("Mask not supported")}let $=!1,b=c;if(a&&k.size(a.dims)>0){if(a.dims.length!==3&&a.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(i.dims[0]!==a.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(a.dims.length===3){if(f!==a.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');b=a.dims[2]}else{if(f!==a.dims[2])throw new Error('Input "key" and "value" shall have the same dim 2 (kv_sequence_length)');b=a.dims[1]*a.dims[3],$=!0}}let v=!1;if(n&&k.size(n.dims)>0)throw new Error("Key padding mask is not supported");if(o&&k.size(o.dims)>0){if(o.dims.length!==4)throw new Error('Input "attention_bias" is expected to have 4 dimensions');if(o.dims[0]!==p||o.dims[1]!==t.numHeads||o.dims[2]!==d||o.dims[3]!==m)throw new Error('Expect "attention_bias" shape (batch_size, num_heads, sequence_length, total_sequence_length)')}return{batchSize:p,sequenceLength:d,pastSequenceLength:h,kvSequenceLength:f,totalSequenceLength:m,maxSequenceLength:g,inputHiddenSize:0,hiddenSize:c,vHiddenSize:b,headSize:y,vHeadSize:Math.floor(b/t.numHeads),numHeads:t.numHeads,isUnidirectional:!1,pastPresentShareBuffer:!1,maskFilterValue:t.maskFilterValue,maskType:w,scale:t.scale,broadcastResPosBias:v,passPastInKv:$,qkvFormat:_}},pd=e=>Y({...e}),Ai=Y({perm:[0,2,1,3]}),cn=(e,t,i,r,a,s,n)=>{let o=[r,a,s],u=k.size(o),l=[{type:12,data:u},{type:12,data:n},{type:12,data:s}],p=d=>{let c=B("qkv_with_bias",t.dataType,o),f=T("qkv",t.dataType,o),h=T("bias",i.dataType,o),g=[{name:"output_size",type:"u32"},{name:"bias_offset",type:"u32"},{name:"hidden_size",type:"u32"}];return`
  ${d.registerUniforms(g).declareVariables(f,h,c)}
  ${d.mainStart()}
    ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let bias_offset_idx = (global_idx % uniforms.hidden_size) + uniforms.bias_offset;

    qkv_with_bias[global_idx] = qkv[global_idx] + bias[bias_offset_idx];
  }`};return e.compute({name:"MultiHeadAttentionAddBias",shaderCache:{inputDependencies:["type","type"]},getRunData:()=>({outputs:[{dims:o,dataType:t.dataType,gpuDataType:0}],dispatchGroup:{x:Math.ceil(u/64)},programUniforms:l}),getShaderSource:p},{inputs:[t,i],outputs:[-1]})[0]},vt=(e,t,i,r,a,s,n,o)=>{let u=s;if(n&&k.size(n.dims)>0){if(r===1)throw new Error("AddBiasReshape is not implemented. Please export your model with packed QKV or KV");return u=cn(e,s,n,t,r,i*a,o),u=u.reshape([t,r,i,a]),i===1||r===1?u:e.compute(_e(u,Ai.perm),{inputs:[u],outputs:[-1]})[0]}else return s.dims.length===3&&(u=s.reshape([t,r,i,a])),i===1||r===1?u:e.compute(_e(u,Ai.perm),{inputs:[u],outputs:[-1]})[0]},cd=(e,t)=>{let i=pn(e.inputs,t),r=e.inputs[0],a=ce(e.inputs,1),s=ce(e.inputs,2),n=ce(e.inputs,3),o=ce(e.inputs,4),u=ce(e.inputs,5),l=ce(e.inputs,6),p=ce(e.inputs,7);if(r.dims.length===5)throw new Error("Packed QKV is not implemented");if(a?.dims.length===5)throw new Error("Packed KV is not implemented");let d=a&&s&&a.dims.length===4&&s.dims.length===4,c=vt(e,i.batchSize,i.numHeads,i.sequenceLength,i.headSize,r,n,0);if(d)return kt(e,c,a,s,o,void 0,l,p,u,i);if(!a||!s)throw new Error("key and value must be provided");let f=vt(e,i.batchSize,i.numHeads,i.kvSequenceLength,i.headSize,a,n,i.hiddenSize),h=vt(e,i.batchSize,i.numHeads,i.kvSequenceLength,i.vHeadSize,s,n,2*i.hiddenSize);kt(e,c,f,h,o,void 0,l,p,u,i)}}),hn,fn,mn,gn,dr,fd,md,gd=E(()=>{"use strict";N(),W(),ae(),F(),hn=e=>{if(!e||e.length<1)throw new Error("too few inputs")},fn=(e,t)=>{let i=[],r=t.numOutputs;return e[1].dims[0]>0&&(e[1].getBigInt64Array().forEach(a=>i.push(Number(a))),r=i.length),Y({numOutputs:r,axis:t.axis,splitSizes:i})},mn=e=>`
fn calculateOutputIndex(index: u32) -> u32 {
    for (var i: u32 = 0u; i < ${e}u; i += 1u ) {
    if (index < ${A("uniforms.size_in_split_axis","i",e)}) {
        return i;
    }
    }
    return ${e}u;
}`,gn=e=>{let t=e.length,i=[];for(let r=0;r<t;++r){let a=e[r].setByIndices("indices","input[global_idx]");t===1?i.push(a):r===0?i.push(`if (output_number == ${r}u) { ${a} }`):r===t-1?i.push(`else { ${a} }`):i.push(`else if (output_number == ${r}) { ${a} }`)}return`
      fn writeBufferData(output_number: u32, indices: ${e[0].type.indices}, global_idx: u32) {
        ${i.join(`
`)}
      }`},dr=(e,t)=>{let i=e[0].dims,r=k.size(i),a=e[0].dataType,s=k.normalizeAxis(t.axis,i.length),n=new Array(t.numOutputs),o=T("input",a,i.length),u=new Array(t.numOutputs),l=[],p=[],d=0,c=[{type:12,data:r}];for(let h=0;h<t.numOutputs;h++){d+=t.splitSizes[h],u[h]=d;let g=i.slice();g[s]=t.splitSizes[h],p.push(g),n[h]=B(`output${h}`,a,g.length),l.push({dims:p[h],dataType:e[0].dataType})}c.push({type:12,data:u},...M(i,...p));let f=h=>`
  ${h.registerUniform("input_size","u32").registerUniform("size_in_split_axis","u32",u.length).declareVariables(o,...n)}
  ${mn(u.length)}
  ${gn(n)}

  ${h.mainStart()}
    ${h.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.input_size")}

    var indices = ${o.offsetToIndices("global_idx")};
    var index = ${o.indicesGet("indices",s)};
    let output_number = calculateOutputIndex(index);
    if (output_number != 0) {
      index -= ${A("uniforms.size_in_split_axis","output_number - 1u",u.length)};
      ${o.indicesSet("indices",s,"index")};
    }
    writeBufferData(output_number, indices, global_idx);
  }`;return{name:"Split",shaderCache:{hint:t.cacheKey,inputDependencies:["rank"]},getShaderSource:f,getRunData:()=>({outputs:l,dispatchGroup:{x:Math.ceil(r/64)},programUniforms:c})}},fd=(e,t)=>{hn(e.inputs);let i=e.inputs.length===1?t:fn(e.inputs,t);e.compute(dr(e.inputs,i),{inputs:[0]})},md=e=>{let t=e.axis,i=e.splitSizes,r=e.numOutputs<0?i.length:e.numOutputs;if(r!==i.length)throw new Error("numOutputs and splitSizes length must be equal");return Y({axis:t,numOutputs:r,splitSizes:i})}}),_n,jt,_d,yd=E(()=>{"use strict";N(),W(),ae(),F(),_n=(e,t)=>{let[i,r,a,s]=e,{numHeads:n,rotaryEmbeddingDim:o}=t;if(i.dims.length!==3&&i.dims.length!==4)throw new Error(`Input 'x' is expected to have 3 or 4 dimensions, got ${i.dims.length}`);if(!k.areEqual(r.dims,[])&&!k.areEqual(r.dims,[1])&&r.dims.length!==2)throw new Error(`Input 'position_ids' is expected to have 0, 1, or 2 dimensions, got ${r.dims.length}`);if(a.dims.length!==2)throw new Error(`Input 'cos_cache' is expected to have 2 dimensions, got ${a.dims.length}`);if(s.dims.length!==2)throw new Error(`Input 'sin_cache' is expected to have 2 dimensions, got ${s.dims.length}`);if(!k.areEqual(a.dims,s.dims))throw new Error("Inputs 'cos_cache' and 'sin_cache' are expected to have the same shape");if(o>0&&n===0)throw new Error("num_heads must be provided if rotary_embedding_dim is specified");let u=i.dims[0],l=i.dims[i.dims.length-2],p=a.dims[0],d=k.sizeFromDimension(i.dims,1)/l,c=o===0?a.dims[1]*2:d/n;if(o>c)throw new Error("rotary_embedding_dim must be less than or equal to head_size");if(r.dims.length===2){if(u!==r.dims[0])throw new Error(`Input 'position_ids' dimension 0 should be of size batch_size, got ${r.dims[0]}`);if(l!==r.dims[1])throw new Error(`Input 'position_ids' dimension 1 should be of size sequence_length, got ${r.dims[1]}`)}if(l>p)throw new Error("Updating cos_cache and sin_cache in RotaryEmbedding is not currently supported");if(c/2!==a.dims[1]&&o/2!==a.dims[1])throw new Error(`Input 'cos_cache' dimension 1 should be same as head_size / 2 or rotary_embedding_dim / 2, got ${a.dims[1]}`)},jt=(e,t)=>{let{interleaved:i,numHeads:r,rotaryEmbeddingDim:a,scale:s}=t,n=e[0].dims[0],o=k.sizeFromDimension(e[0].dims,1),u=e[0].dims[e[0].dims.length-2],l=o/u,p=e[2].dims[1],d=a===0?p*2:l/r,c=new Array(n,u,l/d,d-p),f=k.computeStrides(c),h=[{type:1,data:s},{type:12,data:c},{type:12,data:f},...e[0].dims.length===3?new Array({type:12,data:[o,l,d,1]}):[],...e[0].dims.length===4?new Array({type:12,data:[o,d,u*d,1]}):[],...M(e[0].dims,e[1].dims,e[2].dims,e[3].dims,e[0].dims)],g=y=>{let _=T("input",e[0].dataType,e[0].dims.length),m=T("position_ids",e[1].dataType,e[1].dims.length),w=T("cos_cache",e[2].dataType,e[2].dims.length),$=T("sin_cache",e[3].dataType,e[3].dims.length),b=B("output",e[0].dataType,e[0].dims.length);return y.registerUniforms([{name:"scale",type:"f32"},{name:"global_shape",type:"u32",length:c.length},{name:"global_strides",type:"u32",length:f.length},{name:"input_output_strides",type:"u32",length:f.length}]),`
        ${y.declareVariables(_,m,w,$,b)}

        ${y.mainStart(ut)}
          let half_rotary_emb_dim = uniforms.${w.name}_shape[1];
          let bsnh = global_idx / uniforms.global_strides % uniforms.global_shape;
          let size = uniforms.global_shape[0] * uniforms.global_strides[0];
          ${y.guardAgainstOutOfBoundsWorkgroupSizes("size")}

          if (bsnh[3] < half_rotary_emb_dim) {
            let position_ids_idx =
                ${m.broadcastedIndicesToOffset("bsnh.xy",B("",m.type.tensor,2))};
            let position_id =
                u32(${m.getByOffset("position_ids_idx")}) + select(0, bsnh[1], position_ids_idx == 0);
            let i = dot(bsnh, uniforms.input_output_strides) + select(0, bsnh[3], ${i});
            let j = i + select(half_rotary_emb_dim, 1, ${i});
            let re = ${_.getByOffset("i")} * ${w.get("position_id","bsnh[3]")} -
                ${_.getByOffset("j")} * ${$.get("position_id","bsnh[3]")};
            ${b.setByOffset("i","re")}
            let im = ${_.getByOffset("i")} * ${$.get("position_id","bsnh[3]")} +
                ${_.getByOffset("j")} * ${w.get("position_id","bsnh[3]")};
            ${b.setByOffset("j","im")}
          } else {
            let k = dot(bsnh, uniforms.input_output_strides) + half_rotary_emb_dim;
            ${b.setByOffset("k",_.getByOffset("k"))}
          }
        }`};return{name:"RotaryEmbedding",shaderCache:{hint:Y({interleaved:i}).cacheKey,inputDependencies:["rank","rank","rank","rank"]},getShaderSource:g,getRunData:()=>({outputs:[{dims:e[0].dims,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(k.size(c)/ut)},programUniforms:h})}},_d=(e,t)=>{_n(e.inputs,t),e.compute(jt(e.inputs,t))}}),yn,$n,Di,wn,$d,pc=E(()=>{"use strict";ae(),N(),zr(),hd(),gd(),Le(),yd(),F(),yn=(e,t)=>{if(t.doRotary&&e.length<=7)throw new Error("cos_cache and sin_cache inputs are required if do_rotary is specified");let i=e[0],r=e[1],a=e[2],s=e[3],n=e[4];if(t.doRotary!==0&&e.length<=7)throw new Error("cos_cast and sin_cache are expected if do_rotary attribute is non-zero");if(t.localWindowSize!==-1)throw new Error("Local attention is not supported");if(t.softcap!==0)throw new Error("Softcap is not supported");if(t.rotaryInterleaved!==0)throw new Error("Rotary interleaved is not supported");if(t.smoothSoftmax)throw new Error("Smooth softmax is not supported");if(i.dims.length!==3&&i.dims.length!==5)throw new Error("Input query is expected to have 3 or 5 dimensions");let o=!1,u=i.dims[0],l=i.dims[1],p=i.dims.length===3?o?i.dims[2]/3:i.dims[2]:t.numHeads*i.dims[4],d=l,c=0,f=!r||r.dims.length===0,h=Math.floor(f?p/(t.numHeads+2*t.kvNumHeads):p/t.numHeads);f&&(p=h*t.numHeads);let g=s&&s.dims.length!==0,y=n&&n.dims.length!==0;if(g&&s.dims.length===4&&s.dims[0]===u&&s.dims[1]!==t.kvNumHeads&&s.dims[2]===t.kvNumHeads&&s.dims[3]===h)throw new Error("BSNH pastKey/pastValue is not supported");if(g&&y){if(s.dims.length!==4)throw new Error('Input "past_key" is expected to have 4 dimensions');if(n.dims.length!==4)throw new Error('Input "past_value" is expected to have 4 dimensions');c=s.dims[2]}else if(g||y)throw new Error('Input "past_key" and "past_value" shall be both present or both absent');let _=1;if(r&&r.dims.length>0){if(i.dims.length!==3)throw new Error('Input "query" is expected to have 3 dimensions when key is given');if(r.dims.length<3||r.dims.length>5)throw new Error('Input "key" is expected to have 3, 4, or 5 dimensions');if(i.dims[0]!==r.dims[0])throw new Error('Input "query" and "key" shall have same dim 0 (batch size)');if(r.dims.length===3){if(i.dims[2]%r.dims[2]!==0)throw new Error('Dimension 2 of "query" should be a multiple of "key"');d=r.dims[1]}else if(r.dims.length===5){if(r.dims[2]!==t.numHeads||r.dims[3]!==2||r.dims[4]!==h)throw new Error('Expect "key" shape (batch_size, kv_sequence_length, num_heads, 2, head_size) for packed kv');if(a)throw new Error('Expect "value" be none when "key" has packed kv format.');d=r.dims[1]}else{if(r.dims[1]!==t.numHeads||r.dims[3]!==h)throw new Error('Expect "key" shape (batch_size, num_heads, kv_sequence_length, head_size) for past_key');d=r.dims[2]}}else{if(i.dims.length!==3&&i.dims.length!==5)throw new Error('Input "query" is expected to have 3 or 5 dimensions when key is empty');if(i.dims.length===5&&(i.dims[2]!==t.numHeads||i.dims[3]!==3))throw new Error('Expect "query" shape (batch_size, kv_sequence_length, num_heads, 3, head_size) for packed kv');_=3}let m=0,w=!1,$=t.kvNumHeads?h*t.kvNumHeads:p;if(a&&a.dims.length>0){if(a.dims.length!==3&&a.dims.length!==4)throw new Error('Input "value" is expected to have 3 or 4 dimensions');if(i.dims[0]!==a.dims[0])throw new Error('Input "query" and "value" shall have same dim 0 (batch_size)');if(a.dims.length===3){if(d!==a.dims[1])throw new Error('Input "key" and "value" shall have the same dim 1 (kv_sequence_length)');$=a.dims[2]}else{if(d!==a.dims[2])throw new Error('Input "past_key" and "past_value" shall have the same dim 2 (kv_sequence_length)');$=a.dims[1]*a.dims[3],w=!0}}let b=e.length>4?e[5]:void 0;if(b){if(b.dims.length===0)throw new Error("seqlens_k must be at least 1D, got scalar.");let v=b.dims.reduce((x,S)=>x*S,1);if(v!==u)throw new Error(`seqlens_k must have batch_size (${u}) elements, got ${v}.`);for(let x=0;x<b.dims.length;x++)if(b.dims[x]!==1&&b.dims[x]!==u)throw new Error(`seqlens_k has unexpected shape. Each dimension must be 1 or batch_size (${u}), got dims[${x}] = ${b.dims[x]}.`)}return{batchSize:u,sequenceLength:l,pastSequenceLength:c,kvSequenceLength:d,totalSequenceLength:-1,maxSequenceLength:-1,inputHiddenSize:0,hiddenSize:p,vHiddenSize:$,headSize:h,vHeadSize:Math.floor($/t.kvNumHeads),numHeads:t.numHeads,kvNumHeads:t.kvNumHeads,nReps:t.numHeads/t.kvNumHeads,pastPresentShareBuffer:!1,maskType:m,scale:t.scale,broadcastResPosBias:!1,passPastInKv:w,qkvFormat:_}},$n=Y({perm:[0,2,1,3]}),Di=(e,t,i)=>{let r=t,a=i.kvNumHeads;return t.dims.length===3&&i.kvSequenceLength!==0&&(r=t.reshape([i.batchSize,i.kvSequenceLength,a,i.headSize]),r=e.compute(_e(r,$n.perm),{inputs:[r],outputs:[-1]})[0]),r},wn=(e,t,i,r)=>{let a=7,s=["type","type"],n=[e*t],o=e*t,u=[{type:12,data:o},{type:12,data:t},{type:12,data:e}],l=p=>{let d=T("seq_lens",i.dataType,i.dims),c=T("total_seq_lens",r.dataType,r.dims),f=B("pos_ids",a,n),h=[{name:"output_size",type:"u32"},{name:"sequence_length",type:"u32"},{name:"batch_size",type:"u32"}];return`
  ${p.registerUniforms(h).declareVariables(d,c,f)}
  ${p.mainStart()}
    ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
    let total_sequence_length = u32(${c.getByOffset("0")});
    let is_subsequent_prompt = uniforms.sequence_length > 1 && uniforms.sequence_length != total_sequence_length;
    let is_first_prompt = !is_subsequent_prompt && uniforms.sequence_length == total_sequence_length;
    let batch_idx = global_idx / uniforms.sequence_length;
    let sequence_idx = i32(global_idx % uniforms.sequence_length);
    var pos_id: i32 = 0;
    let seqlen = ${d.getByOffset("batch_idx")};
    let total_seqlen = seqlen + 1;
    if (is_first_prompt) {
      if (sequence_idx < total_seqlen) {
        pos_id = sequence_idx;
      } else {
        pos_id = 1;
      }
      ${f.setByOffset("global_idx","pos_id")}
    } else if (is_subsequent_prompt) {
      let past_seqlen = total_seqlen - i32(uniforms.sequence_length);
      if (past_seqlen + sequence_idx < total_seqlen) {
        pos_id = past_seqlen + sequence_idx;
      } else {
        pos_id = 1;
      }
      ${f.setByOffset("global_idx","pos_id")}
    } else if (global_idx < uniforms.batch_size) {
      ${f.setByOffset("global_idx","seqlen")}
    };
  }
  `};return{name:"GeneratePositionIds",shaderCache:{hint:`${e};${t}`,inputDependencies:s},getRunData:()=>({outputs:[{dims:n,dataType:a}],dispatchGroup:{x:Math.ceil(o/64)},programUniforms:u}),getShaderSource:l}},$d=(e,t)=>{if(e.inputs.length>14&&e.inputs[14]||e.inputs.length>15&&e.inputs[15])throw new Error("GroupQueryAttention (JSEP): q_norm_weight / k_norm_weight inputs are not supported. The per-head Q/K RMS normalization prologue is implemented only on the CUDA and native WebGPU EPs.");let i=yn(e.inputs,t);if(e.inputs[0].dims.length===5)throw new Error("Packed QKV is not implemented");if(e.inputs[1]?.dims.length===5)throw new Error("Packed KV is not implemented");let r=e.inputs[0],a=e.inputs[1]&&e.inputs[1].dims.length>0?e.inputs[1]:void 0,s=e.inputs[2]&&e.inputs[2].dims.length>0?e.inputs[2]:void 0,n=e.inputs[3]&&e.inputs[3].dims.length!==0?e.inputs[3]:void 0,o=e.inputs[4]&&e.inputs[4].dims.length!==0?e.inputs[4]:void 0,u=e.inputs.length>4?e.inputs[5]:void 0,l=e.inputs.length>5?e.inputs[6]:void 0,p=i.kvNumHeads?i.kvNumHeads:i.numHeads,d=Y({axis:2,numOutputs:3,splitSizes:[i.numHeads*i.headSize,p*i.headSize,p*i.headSize]}),[c,f,h]=!a&&!s?e.compute(dr([r],d),{inputs:[r],outputs:[-1,-1,-1]}):[r,a,s],g,y;if(t.doRotary){let $=e.compute(wn(i.batchSize,i.sequenceLength,u,l),{inputs:[u,l],outputs:[-1]})[0],b=e.inputs[7],v=e.inputs[8],x=Y({interleaved:t.rotaryInterleaved!==0,numHeads:i.numHeads,rotaryEmbeddingDim:0,scale:t.scale}),S=[c,$,b,v],I=[-1];g=e.compute(jt(S,x),{inputs:S,outputs:I})[0],S.splice(0,1,f);let C=Y({interleaved:t.rotaryInterleaved!==0,numHeads:i.kvNumHeads,rotaryEmbeddingDim:0,scale:t.scale});y=e.compute(jt(S,C),{inputs:S,outputs:I})[0]}let _=vt(e,i.batchSize,i.numHeads,i.sequenceLength,i.headSize,t.doRotary?g:c,void 0,0),m=Di(e,t.doRotary?y:f,i),w=Di(e,h,i);kt(e,_,m,w,void 0,void 0,n,o,void 0,i,u,l)}}),Mi,bn,vn,wd,cc=E(()=>{"use strict";N(),W(),Le(),F(),Mi=(e,t,i,r,a,s,n,o)=>{let u=re(s),l=u===1?"f32":`vec${u}f`,p=u===1?"vec2f":`mat2x${u}f`,d=a*n,c=64;d===1&&(c=256);let f=[a,n,s/u],h=[a,n,2],g=["rank","type","type"],y=[];y.push(...M(f,h));let _=m=>{let w=T("x",t.dataType,3,u),$=T("scale",i.dataType,i.dims),b=T("bias",r.dataType,r.dims),v=B("output",1,3,2),x=[w,$,b,v];return`
  var<workgroup> workgroup_shared : array<${p}, ${c}>;
  const workgroup_size = ${c}u;
  ${m.declareVariables(...x)}
  ${m.mainStart(c)}
    let batch = workgroup_index / uniforms.x_shape[1];
    let channel = workgroup_index % uniforms.x_shape[1];
    let hight = uniforms.x_shape[2];
    // initialize workgroup memory
    var sum = ${l}(0);
    var squared_sum = ${l}(0);
    for (var h = local_idx; h < hight; h += workgroup_size) {
      let value = ${l}(${w.get("batch","channel","h")});
      sum += value;
      squared_sum += value * value;
    }
    workgroup_shared[local_idx] = ${p}(sum, squared_sum);
    workgroupBarrier();

    for (var currSize = workgroup_size >> 1;  currSize > 0; currSize = currSize >> 1) {
      if (local_idx < currSize) {
        workgroup_shared[local_idx] = workgroup_shared[local_idx] + workgroup_shared[local_idx + currSize];
      }
      workgroupBarrier();
    }
    if (local_idx == 0) {
      let sum_final = ${Ne("workgroup_shared[0][0]",u)} / f32(hight * ${u});
      let squared_sum_final = ${Ne("workgroup_shared[0][1]",u)} / f32(hight * ${u});

      let inv_std_dev = inverseSqrt(squared_sum_final - sum_final * sum_final + f32(${o}));
      let channel_scale = inv_std_dev * f32(scale[channel]);
      let channel_shift = f32(bias[channel]) - sum_final * channel_scale;
      output[workgroup_index] = vec2f(channel_scale, channel_shift);
    }
  }`};return e.compute({name:"InstanceNormComputeChannelScaleShift",shaderCache:{hint:`${u};${o};${c}`,inputDependencies:g},getRunData:()=>({outputs:[{dims:h,dataType:1}],dispatchGroup:{x:d},programUniforms:y}),getShaderSource:_},{inputs:[t,i,r],outputs:[-1]})[0]},bn=(e,t,i)=>{let r=t[0].dims,a=r,s=2,n=r[0],o=r[1],u=k.sizeFromDimension(r,s),l=re(u),p=k.size(a)/l,d=Mi(e,t[0],t[1],t[2],n,u,o,i.epsilon),c=[n,o,u/l],f=[n,o],h=["type","none"],g=y=>{let _=T("x",t[0].dataType,c.length,l),m=T("scale_shift",1,f.length,2),w=B("output",t[0].dataType,c.length,l),$=[_,m,w];return`
  ${y.registerUniform("output_size","u32").declareVariables(...$)}
  ${y.mainStart()}
  ${y.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let outputIndices = ${w.offsetToIndices("global_idx")};
      let batch = outputIndices[0];
      let channel = outputIndices[1];
      let scale_shift = ${m.getByIndices("vec2<u32>(batch, channel)")};
      let value = ${_.getByOffset("global_idx")} * ${w.type.value}(scale_shift.x) + ${w.type.value}(scale_shift.y);
      ${w.setByOffset("global_idx","value")};
  }`};e.compute({name:"InstanceNormalization",shaderCache:{hint:`${l}`,inputDependencies:h},getRunData:()=>({outputs:[{dims:a,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(p/64)},programUniforms:[{type:12,data:p},...M(c,f,c)]}),getShaderSource:g},{inputs:[t[0],d]})},vn=(e,t,i)=>{let r=t[0].dims,a=r,s=r[0],n=r[r.length-1],o=k.sizeFromDimension(r,1)/n,u=re(n),l=k.size(a)/u,p=[{type:12,data:o},{type:12,data:Math.floor(n/u)}],d=["type","type"],c=!1,f=[0,r.length-1];for(let _=0;_<r.length-2;_++)c=c||r[_+1]!==1,f.push(_+1);c=c&&r[r.length-1]!==1;let h=c?e.compute(_e(e.inputs[0],f),{inputs:[e.inputs[0]],outputs:[-1]})[0]:e.inputs[0].reshape(Array.from({length:r.length},(_,m)=>r[f[m]])),g=Mi(e,h,t[1],t[2],s,o,n,i.epsilon),y=_=>{let m=ue(t[0].dataType),w=u===1?"vec2f":`mat${u}x2f`,$=x=>{let S=x===0?"x":"y",I=u===1?"f32":`vec${u}f`;switch(u){case 1:return`${m}(${I}(scale.${S}))`;case 2:return`vec2<${m}>(${I}(scale[0].${S}, scale[1].${S}))`;case 4:return`vec4<${m}>(${I}(scale[0].${S}, scale[1].${S}, scale[2].${S}, scale[3].${S}))`;default:throw new Error(`Not supported compoents ${u}`)}},b=T("input",t[0].dataType,t[0].dims,u),v=B("output",t[0].dataType,a,u);return`
  @group(0) @binding(0) var<storage, read> input : array<${b.type.storage}>;
  @group(0) @binding(1) var<storage, read> scale_input : array<${w}>;
  @group(0) @binding(2) var<storage, read_write> output : array<${v.type.storage}>;
  struct Uniforms {H: u32, C : u32};
  @group(0) @binding(3) var<uniform> uniforms: Uniforms;

  ${_.mainStart()}
    let current_image_number = global_idx / (uniforms.C * uniforms.H);
    let current_channel_number = global_idx % uniforms.C;

    let scale_offset = current_image_number * uniforms.C + current_channel_number;
    let scale = scale_input[scale_offset];
    output[global_idx] = fma(input[global_idx], ${$(0)}, ${$(1)});
  }`};e.compute({name:"InstanceNormalizationNHWC",shaderCache:{hint:`${u}`,inputDependencies:d},getRunData:()=>({outputs:[{dims:a,dataType:t[0].dataType}],dispatchGroup:{x:Math.ceil(l/64)},programUniforms:p}),getShaderSource:y},{inputs:[t[0],g]})},wd=(e,t)=>{t.format==="NHWC"?vn(e,e.inputs,t):bn(e,e.inputs,t)}}),xn,kn,bd,hc=E(()=>{"use strict";N(),W(),F(),xn=e=>{if(!e||e.length<2)throw new Error("layerNorm requires at least 2 inputs.")},kn=(e,t,i)=>{let r=t.simplified,a=e[0].dims,s=e[1],n=!r&&e[2],o=a,u=k.normalizeAxis(t.axis,a.length),l=k.sizeToDimension(a,u),p=k.sizeFromDimension(a,u),d=k.size(s.dims),c=n?k.size(n.dims):0;if(d!==p||n&&c!==p)throw new Error(`Size of X.shape()[axis:] == ${p}.
       Size of scale and bias (if provided) must match this.
       Got scale size of ${d} and bias size of ${c}`);let f=[];for(let b=0;b<a.length;++b)b<u?f.push(a[b]):f.push(1);let h=re(p),g=["type","type"],y=[{type:12,data:l},{type:1,data:p},{type:12,data:Math.floor(p/h)},{type:1,data:t.epsilon}];n&&g.push("type");let _=i>1,m=i>2,w=b=>{let v=ue(e[0].dataType),x=[T("x",e[0].dataType,e[0].dims,h),T("scale",s.dataType,s.dims,h)];n&&x.push(T("bias",n.dataType,n.dims,h)),x.push(B("output",e[0].dataType,o,h)),_&&x.push(B("mean_data_output",1,f)),m&&x.push(B("inv_std_output",1,f));let S=[{name:"norm_count",type:"u32"},{name:"norm_size",type:"f32"},{name:"norm_size_vectorized",type:"u32"},{name:"epsilon",type:"f32"}];return`
  ${b.registerUniforms(S).declareVariables(...x)}
  ${b.mainStart()}
    ${b.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.norm_count")}
    let offset = global_idx * uniforms.norm_size_vectorized;
    var mean_vector = ${tr("f32",h)};
    var mean_square_vector = ${tr("f32",h)};

    for (var h: u32 = 0u; h < uniforms.norm_size_vectorized; h++) {
      let value = ${nt(v,h,"x[h + offset]")};
      mean_vector += value;
      mean_square_vector += value * value;
    }
    let mean = ${Ne("mean_vector",h)} / uniforms.norm_size;
    let inv_std_dev = inverseSqrt(${Ne("mean_square_vector",h)} / uniforms.norm_size ${r?"":"- mean * mean"} + uniforms.epsilon);

    for (var j: u32 = 0; j < uniforms.norm_size_vectorized; j++) {
      let f32input = ${nt(v,h,"x[j + offset]")};
      let f32scale = ${nt(v,h,"scale[j]")};
      output[j + offset] = ${x[0].type.value}((f32input ${r?"":"- mean"}) * inv_std_dev * f32scale
        ${n?`+ ${nt(v,h,"bias[j]")}`:""}
      );
    }

    ${_?"mean_data_output[global_idx] = mean":""};
    ${m?"inv_std_output[global_idx] = inv_std_dev":""};
  }`},$=[{dims:o,dataType:e[0].dataType}];return _&&$.push({dims:f,dataType:1}),m&&$.push({dims:f,dataType:1}),{name:"LayerNormalization",shaderCache:{hint:`${h};${i};${r}`,inputDependencies:g},getRunData:()=>({outputs:$,dispatchGroup:{x:Math.ceil(l/64)},programUniforms:y}),getShaderSource:w}},bd=(e,t)=>{xn(e.inputs),e.compute(kn(e.inputs,t,e.outputCount))}}),Sn,vd,fc=E(()=>{"use strict";W(),Rr(),Ar(),Sn=e=>{if(!e||e.length!==2)throw new Error("MatMul requires 2 inputs.");if(e[0].dims[e[0].dims.length-1]!==e[1].dims[e[1].dims.length-2])throw new Error("shared dimension does not match.")},vd=e=>{Sn(e.inputs);let t=ot.calcShape(e.inputs[0].dims,e.inputs[1].dims,!0);if(!t)throw new Error("Can't use matmul on the given tensors");let i=t[t.length-1],r=e.inputs[0].dims[e.inputs[0].dims.length-1];if(i<8&&r<8)e.compute(Br(e.inputs,{activation:""},t));else{let a=t[t.length-2],s=k.size(e.inputs[0].dims.slice(0,-2)),n=k.size(e.inputs[1].dims.slice(0,-2));if(s!==1&&a===1&&n===1){let o=e.inputs[0].reshape([1,s,r]),u=e.inputs[1].reshape([1,r,i]),l=[1,s,i],p=[o,u];e.compute(Kt(p,{activation:""},t,l),{inputs:p})}else e.compute(Kt(e.inputs,{activation:""},t))}}}),Tn,In,zn,xd,kd,mc=E(()=>{"use strict";N(),W(),ae(),F(),Tn=(e,t)=>{if(e.length<3||e.length>4)throw new Error("MatMulNBits requires 3 or 4 inputs");let i=e[0],r=i.dims.length;if(i.dims[r-1]!==t.k)throw new Error("The last dim of input shape does not match the k value");let a=Math.floor((t.k+t.blockSize-1)/t.blockSize),s=t.blockSize/8*t.bits,n=e[1];if(!k.areEqual(n.dims,[t.n,a,s]))throw new Error("The second inputs must be 3D tensor with shape N X nBlocksPerCol X blobSize");let o=e[2].dims;if(k.size(o)!==t.n*a)throw new Error("scales input size error.");if(e.length===4){let u=e[3].dims,l=t.n*(t.bits===8?a:Math.floor((a*t.bits+7)/8));if(k.size(u)!==l)throw new Error("zeroPoints input size error.")}},In=(e,t)=>{let i=e[0].dims,r=i.length,a=i[r-2],s=t.k,n=t.n,o=i.slice(0,r-2),u=k.size(o),l=e[1].dims[2]/4,p=e[0].dataType,d=re(t.k),c=re(l),f=re(n),h=o.concat([a,n]),g=a>1&&n/f%2===0?2:1,y=k.size(h)/f/g,_=64,m=[],w=[u,a,s/d],$=k.convertShape(e[1].dims).slice();$.splice(-1,1,l/c),m.push(...M(w)),m.push(...M($)),m.push(...M(e[2].dims)),e.length===4&&m.push(...M(k.convertShape(e[3].dims)));let b=[u,a,n/f];m.push(...M(b));let v=x=>{let S=w.length,I=T("a",e[0].dataType,S,d),C=T("b",12,$.length,c),H=T("scales",e[2].dataType,e[2].dims.length),U=[I,C,H],P=e.length===4?T("zero_points",12,e[3].dims.length):void 0;P&&U.push(P);let Z=b.length,O=B("output",e[0].dataType,Z,f),D=ue(e[0].dataType),G=(()=>{switch(d){case 1:return`array<${D}, 8>`;case 2:return`mat4x2<${D}>`;case 4:return`mat2x4<${D}>`;default:throw new Error(`${d}-component is not supported.`)}})(),K=Math.floor(32/t.bits),V=Math.floor(K/8),j=()=>{let q="";for(let R=0;R<V;R++){let pe=R*t.bits*4,he=pe+t.bits;q+=`
          // reuse a data (pass ${R})
            var input_offset${R>0?R:""} = ${R===0?I.indicesToOffset(`${I.type.indices}(batch, row, word_offset)`):"input_offset"};
            var a_data${R>0?R:""}: ${G};
            for (var j${R>0?R:""}: u32 = 0; j${R>0?R:""} < ${8/d}; j${R>0?R:""}++) {
              a_data${R>0?R:""}[j${R>0?R:""}] = ${I.getByOffset(`input_offset${R>0?R:""}`)};
              input_offset${R>0?R:""}++;
            }
          `;for(let se=0;se<f*g;se++)q+=`
            b_value = ${c===1?`b${se}_data`:`b${se}_data[i]`};
            ${t.bits===2?`{
              let half_word = b_value >> ${R*16}u;
              let byte_lo = half_word & 0xFFu;
              let byte_hi = (half_word >> 8u) & 0xFFu;
              let spread_word = (byte_lo & 0xFu) | ((byte_lo >> 4u) << 8u) | ((byte_hi & 0xFu) << 16u) | ((byte_hi >> 4u) << 24u);
              b_value_lower = unpack4xU8(spread_word & b_mask);
              b_value_upper = unpack4xU8((spread_word >> 2u) & b_mask);
            }`:`b_value_lower = unpack4xU8((b_value >> ${pe}u) & b_mask);
            b_value_upper = unpack4xU8((b_value >> ${he}u) & b_mask);`}
            b_quantized_values = ${G}(${Array.from({length:4},(fe,ee)=>`${D}(b_value_lower[${ee}]), ${D}(b_value_upper[${ee}])`).join(", ")});
            b_dequantized_values = ${d===1?`${G}(${Array.from({length:8},(fe,ee)=>`(b_quantized_values[${ee}] - ${P?`zero_point${se}`:"zero_point"}) * scale${se}`).join(", ")});`:`(b_quantized_values - ${G}(${Array(8).fill(`${P?`zero_point${se}`:"zero_point"}`).join(",")})) * scale${se};`};
            workgroup_shared[local_id.x * ${g} + ${Math.floor(se/f)}]${f>1?`[${se%f}]`:""} += ${Array.from({length:8/d},(fe,ee)=>`${d===1?`a_data${R>0?R:""}[${ee}] * b_dequantized_values[${ee}]`:`dot(a_data${R>0?R:""}[${ee}], b_dequantized_values[${ee}])`}`).join(" + ")};
          `}return q},z=()=>{let q=`
            var col_index = col * ${f};
            ${P?`
            let zero_point_values_per_byte: u32 = ${Math.floor(8/t.bits)}u;
            let zero_point_bytes_per_col = (nBlocksPerCol + zero_point_values_per_byte - 1u) / zero_point_values_per_byte;
            var zero_point_byte_count: u32;
            var zero_point_word_index: u32;
            var zero_point_byte_offset: u32;
            let zero_point_sub_offset: u32 = block % zero_point_values_per_byte;
            var zero_point_bits_offset: u32;
            var zero_point_word: u32;`:`
            // The default zero point is ${Math.pow(2,t.bits-1)} for unsigned ${t.bits}-bit quantization.
            let zero_point = ${D}(${Math.pow(2,t.bits-1).toFixed(1)});`}
            `;for(let R=0;R<f*g;R++)q+=`
            let scale${R} = ${H.getByOffset("col_index * nBlocksPerCol + block")};
            ${P?`
            zero_point_byte_count = col_index * zero_point_bytes_per_col + (block / zero_point_values_per_byte);
            zero_point_word_index = zero_point_byte_count >> 0x2u;
            zero_point_byte_offset = zero_point_byte_count & 0x3u;
            zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_sub_offset * ${t.bits}u);
            zero_point_word = ${P.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point${R} = ${D}((zero_point_word) & ${t.bits===2?"0x3u":"0xFu"});`:""}
            col_index += 1;`;return q},L=()=>{let q=`col_index = col * ${f};`;for(let R=0;R<f*g;R++)q+=`
            let b${R}_data = ${C.getByIndices(`${C.type.indices}(col_index, block, word)`)};
            col_index += 1;`;return q+=`
            var b_value: u32;
            let b_mask: u32 = ${t.bits===2?"0x03030303u":"0x0F0F0F0Fu"};
            var b_value_lower: vec4<u32>;
            var b_value_upper: vec4<u32>;
            var b_quantized_values: ${G};
            var b_dequantized_values: ${G};`,q};return`
        var<workgroup> workgroup_shared: array<${O.type.value}, ${g*_}>;
        ${x.declareVariables(...U,O)}
        ${x.mainStart([_,1,1])}
          let output_indices = ${O.offsetToIndices(`(global_idx / ${_}) * ${g}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let nBlocksPerCol = uniforms.b_shape[1];

          for (var block = local_id.x; block < nBlocksPerCol; block += ${_}) {
            //process one block
            var word_offset: u32 = block * ${t.blockSize/d};
            ${z()}
            for (var word: u32 = 0; word < ${l}; word += ${c}) {
              ${L()}
              for (var i: u32 = 0; i < ${c}; i++) {
                ${j()}
                word_offset += ${K/d};
              }
            }
          }
          workgroupBarrier();

          if (local_id.x < ${g}) {
            var output_value: ${O.type.value} = ${O.type.value}(0);
            var workgroup_shared_offset: u32 = local_id.x;
            for (var b: u32 = 0u; b < ${_}u; b++) {
              output_value += workgroup_shared[workgroup_shared_offset];
              workgroup_shared_offset += ${g};
            }
            ${O.setByIndices(`${O.type.indices}(batch, row, col + local_id.x)`,"output_value")};
          }
        }`};return{name:"MatMulNBits",shaderCache:{hint:`${t.blockSize};${t.bits};${d};${c};${f};${g};${_}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:h,dataType:p}],dispatchGroup:{x:y},programUniforms:m}),getShaderSource:v}},zn=(e,t)=>{let i=e[0].dims,r=i.length,a=i[r-2],s=t.k,n=t.n,o=i.slice(0,r-2),u=k.size(o),l=e[1].dims[2]/4,p=e[0].dataType,d=re(t.k),c=re(l),f=o.concat([a,n]),h=128,g=n%8===0?8:n%4===0?4:1,y=h/g,_=Math.floor(32/t.bits),m=y*c*_,w=m/d,$=m/t.blockSize,b=k.size(f)/g,v=[],x=[u,a,s/d],S=k.convertShape(e[1].dims).slice();S.splice(-1,1,l/c),v.push(...M(x)),v.push(...M(S)),v.push(...M(e[2].dims)),e.length===4&&v.push(...M(k.convertShape(e[3].dims)));let I=[u,a,n];v.push(...M(I));let C=H=>{let U=x.length,P=T("a",e[0].dataType,U,d),Z=T("b",12,S.length,c),O=T("scales",e[2].dataType,e[2].dims.length),D=[P,Z,O],G=e.length===4?T("zero_points",12,e[3].dims.length):void 0;G&&D.push(G);let K=I.length,V=B("output",e[0].dataType,K),j=ue(e[0].dataType),z=()=>{switch(d){case 1:return`
          let a_data0 = vec4<${j}>(sub_a[word_offset], sub_a[word_offset + 1], sub_a[word_offset + 2], sub_a[word_offset + 3]);
          let a_data1 = vec4<${j}>(sub_a[word_offset + 4], sub_a[word_offset + 5], sub_a[word_offset + 6], sub_a[word_offset + 7]);`;case 2:return`
          let a_data0 = vec4<${j}>(sub_a[word_offset], sub_a[word_offset + 1]);
          let a_data1 = vec4<${j}>(sub_a[word_offset + 2], sub_a[word_offset + 3]);`;case 4:return`
          let a_data0 = sub_a[word_offset];
          let a_data1 = sub_a[word_offset + 1];`;default:throw new Error(`${d}-component is not supported.`)}};return`
        var<workgroup> sub_a: array<${P.type.value}, ${w}>;
        var<workgroup> inter_results: array<array<${V.type.value}, ${y}>, ${g}>;
        ${H.declareVariables(...D,V)}
        ${H.mainStart([y,g,1])}
          let output_indices = ${V.offsetToIndices(`workgroup_index * ${g}`)};
          let col = output_indices[2];
          let row = output_indices[1];
          let batch = output_indices[0];
          let n_blocks_per_col = uniforms.b_shape[1];
          let num_tiles =  (n_blocks_per_col - 1) / ${$} + 1;

          // Loop over shared dimension.
          for (var tile: u32 = 0; tile < num_tiles; tile += 1) {
            let a_col_start = tile * ${w};
            // load one tile A data into shared memory.
            for (var a_offset = local_idx; a_offset < ${w}; a_offset += ${h})
            {
              let a_col = a_col_start + a_offset;
              if (a_col < uniforms.a_shape[2])
              {
                sub_a[a_offset] = ${P.getByIndices(`${P.type.indices}(batch, row, a_col)`)};
              } else {
                sub_a[a_offset] = ${P.type.value}(0);
              }
            }
            workgroupBarrier();

            // each thread process one block
            let b_row = col + local_id.y;
            let block = tile * ${$} + local_id.x;
            ${G?`
            let zero_point_values_per_byte: u32 = ${Math.floor(8/t.bits)}u;
            let zero_point_bytes_per_col = (n_blocks_per_col + zero_point_values_per_byte - 1u) / zero_point_values_per_byte;
            let zero_point_byte_count = b_row * zero_point_bytes_per_col + (block / zero_point_values_per_byte);
            let zero_point_word_index = zero_point_byte_count >> 0x2u;
            let zero_point_byte_offset = zero_point_byte_count & 0x3u;
            let zero_point_sub_offset: u32 = block % zero_point_values_per_byte;
            let zero_point_bits_offset = (zero_point_byte_offset << 3) + (zero_point_sub_offset * ${t.bits}u);
            let zero_point_word = ${G.getByOffset("zero_point_word_index")} >> zero_point_bits_offset;
            let zero_point = ${j}((zero_point_word) & ${t.bits===2?"0x3u":"0xFu"});`:`
            // The default zero point is ${Math.pow(2,t.bits-1)} for unsigned ${t.bits}-bit quantization.
            let zero_point = ${j}(${Math.pow(2,t.bits-1).toFixed(1)});`}
            let scale = ${O.getByOffset("b_row * n_blocks_per_col + block")};
            let b_data = ${Z.getByIndices(`${Z.type.indices}(b_row, block, 0)`)};
            var word_offset = local_id.x * ${t.blockSize/d};
            for (var i: u32 = 0; i < ${c}; i++) {
              let b_value = ${c===1?"b_data":"b_data[i]"};
              ${(()=>{let L=Math.floor(_/8),q="";for(let R=0;R<L;R++){let pe=R*t.bits*4,he=pe+t.bits;q+=`
              ${z()}
              {${t.bits===2?`
                let half_word = b_value >> ${R*16}u;
                let byte_lo = half_word & 0xFFu;
                let byte_hi = (half_word >> 8u) & 0xFFu;
                let spread_word = (byte_lo & 0xFu) | ((byte_lo >> 4u) << 8u) | ((byte_hi & 0xFu) << 16u) | ((byte_hi >> 4u) << 24u);
                let b_value_lower = unpack4xU8(spread_word & 0x03030303u);
                let b_value_upper = unpack4xU8((spread_word >> 2u) & 0x03030303u);`:`
                let b_value_lower = unpack4xU8((b_value >> ${pe}u) & 0x0F0F0F0Fu);
                let b_value_upper = unpack4xU8((b_value >> ${he}u) & 0x0F0F0F0Fu);`}
                let b_quantized_values = mat2x4<${j}>(${Array.from({length:4},(se,fe)=>`${j}(b_value_lower[${fe}]), ${j}(b_value_upper[${fe}])`).join(", ")});
                let b_dequantized_values = (b_quantized_values - mat2x4<${j}>(${Array(8).fill("zero_point").join(",")})) * scale;
                inter_results[local_id.y][local_id.x] += ${Array.from({length:2},(se,fe)=>`${`dot(a_data${fe}, b_dequantized_values[${fe}])`}`).join(" + ")};
              }
              word_offset += ${8/d};`}return q})()}
            }
            workgroupBarrier();
          }

          if (local_idx < ${g}) {
            var output_value: ${V.type.value} = ${V.type.value}(0);
            for (var b = 0u; b < ${y}; b++) {
              output_value += inter_results[local_idx][b];
            }
            if (col + local_idx < uniforms.output_shape[2])
            {
              ${V.setByIndices(`${V.type.indices}(batch, row, col + local_idx)`,"output_value")}
            }
          }
        }`};return{name:"BlockwiseMatMulNBits32",shaderCache:{hint:`${t.blockSize};${d};${c};${y};${g}`,inputDependencies:Array(e.length).fill("rank")},getRunData:()=>({outputs:[{dims:f,dataType:p}],dispatchGroup:{x:b},programUniforms:v}),getShaderSource:C}},xd=(e,t)=>{Tn(e.inputs,t),t.blockSize===32&&e.adapterInfo.isVendor("intel")&&e.adapterInfo.isArchitecture("gen-12lp")?e.compute(zn(e.inputs,t)):e.compute(In(e.inputs,t))},kd=e=>Y(e)}),En,Cn,On,Bn,Rn,An,Dn,Mn,Sd,gc=E(()=>{"use strict";N(),W(),F(),En=e=>{if(!e||e.length<1)throw new Error("Too few inputs");if(e[0].dataType!==1&&e[0].dataType!==10)throw new Error("Input type must be float or float16.");if(e.length>=2){let t=e[0].dims.length*2===e[1].dims[0];if(e.length===4&&(t=e[3].dims[0]*2===e[1].dims[0]),!t)throw new Error("The pads should be a 1D tensor of shape [2 * input_rank] or [2 * num_axes].")}},Cn=(e,t,i)=>{let r="";for(let a=t-1;a>=0;--a)r+=`
            k = i32(${e.indicesGet("indices",a)}) - ${A("uniforms.pads",a,i)};
            if (k < 0) {
              break;
            }
            if (k >= i32(${A("uniforms.x_shape",a,t)})) {
              break;
            }
            offset += k * i32(${A("uniforms.x_strides",a,t)});
        `;return`
          value = ${e.type.value}(uniforms.constant_value);
          for (var i = 0; i < 1; i++) {
            var offset = 0;
            var k = 0;
            ${r}
            value = x[offset];
          }
      `},On=(e,t,i)=>{let r="";for(let a=t-1;a>=0;--a)r+=`
                k = i32(${e.indicesGet("indices",a)}) - ${A("uniforms.pads",a,i)};
                if (k < 0) {
                  k = -k;
                }
                {
                  let _2n_1 = 2 * (i32(${A("uniforms.x_shape",a,t)}) - 1);
                  k = k % _2n_1;
                  if(k >= i32(${A("uniforms.x_shape",a,t)})) {
                    k = _2n_1 - k;
                  }
                }
                offset += k * i32(${A("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `},Bn=(e,t,i)=>{let r="";for(let a=t-1;a>=0;--a)r+=`
                k = i32(${e.indicesGet("indices",a)}) - ${A("uniforms.pads",a,i)};
                if (k < 0) {
                  k = 0;
                }
                if (k >= i32(${A("uniforms.x_shape",a,t)})) {
                  k = i32(${A("uniforms.x_shape",a,t)}) - 1;
                }
                offset += k * i32(${A("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `},Rn=(e,t,i)=>{let r="";for(let a=t-1;a>=0;--a)r+=`
                k = i32(${e.indicesGet("indices",a)}) - ${A("uniforms.pads",a,i)};
                if (k < 0)  {
                  k += i32(${A("uniforms.x_shape",a,t)}]);
                }
                if (k >= i32(${A("uniforms.x_shape",a,t)})) {
                  k -= i32(${A("uniforms.x_shape",a,t)});
                }
                offset += k * i32(${A("uniforms.x_strides",a,t)});
            `;return`
              var offset = 0;
              var k = 0;
              ${r}
              value = x[offset];
          `},An=(e,t,i)=>{switch(i.mode){case 0:return Cn(e,t,i.pads.length);case 1:return On(e,t,i.pads.length);case 2:return Bn(e,t,i.pads.length);case 3:return Rn(e,t,i.pads.length);default:throw new Error("Invalid mode")}},Dn=(e,t)=>{let i=k.padShape(e[0].dims.slice(),t.pads),r=e[0].dims,a=k.size(i),s=[{type:12,data:a},{type:6,data:t.pads}],n=e.length>=3&&e[2].data;t.mode===0&&s.push({type:n?e[2].dataType:1,data:t.value}),s.push(...M(e[0].dims,i));let o=["rank"],u=l=>{let p=B("output",e[0].dataType,i.length),d=T("x",e[0].dataType,r.length),c=d.type.value,f=An(p,r.length,t),h=[{name:"output_size",type:"u32"},{name:"pads",type:"i32",length:t.pads.length}];return t.mode===0&&h.push({name:"constant_value",type:n?c:"f32"}),`
            ${l.registerUniforms(h).declareVariables(d,p)}
            ${l.mainStart()}
            ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}

            let indices = ${p.offsetToIndices("global_idx")};

            var value = ${c}(0);
            ${f}
            output[global_idx] = value;
        }`};return{name:"Pad",shaderCache:{hint:`${t.mode}${n}`,inputDependencies:o},getRunData:()=>({outputs:[{dims:i,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(k.size(i)/64)},programUniforms:s}),getShaderSource:u}},Mn=(e,t)=>{if(e.length>1){let i=e[1].getBigInt64Array(),r=e.length>=3&&e[2].data?e[2].dataType===10?e[2].getUint16Array()[0]:e[2].getFloat32Array()[0]:0,a=e[0].dims.length,s=new Int32Array(2*a).fill(0);if(e.length>=4){let o=e[3].getBigInt64Array();for(let u=0;u<o.length;u++)s[Number(o[u])]=Number(i[u]),s[Number(o[u])+a]=Number(i[u+o.length])}else i.forEach((o,u)=>s[Number(u)]=Number(o));let n=[];return s.forEach(o=>n.push(o)),{mode:t.mode,value:r,pads:n}}else return t},Sd=(e,t)=>{En(e.inputs);let i=Mn(e.inputs,t);e.compute(Dn(e.inputs,i),{inputs:[0]})}}),gt,Ui,Pi,qi,Ni,Un,Pn,Li,Vi,Td,Id,Gi,zd,Ed,Wi,Cd,Od,Bd,Rd,_c=E(()=>{"use strict";$e(),N(),W(),F(),gt=e=>{if(ie.webgpu.validateInputContent&&(!e||e.length!==1))throw new Error("Pool ops requires 1 input.")},Ui=(e,t,i)=>{let r=t.format==="NHWC",a=e.dims.slice();r&&a.splice(1,0,a.pop());let s=Object.hasOwnProperty.call(t,"dilations"),n=t.kernelShape.slice(),o=t.strides.slice(),u=s?t.dilations.slice():[],l=t.pads.slice();Ft.adjustPoolAttributes(i,a,n,o,u,l);let p=Ft.computePoolOutputShape(i,a,o,u,n,l,t.autoPad,t.ceilMode),d=Object.assign({},t);s?Object.assign(d,{kernelShape:n,strides:o,pads:l,dilations:u,cacheKey:t.cacheKey}):Object.assign(d,{kernelShape:n,strides:o,pads:l,cacheKey:t.cacheKey});let c=p.slice();return c.push(c.splice(1,1)[0]),[d,r?c:p]},Pi=(e,t)=>{let i=t.format==="NHWC",r=k.size(e),a=k.size(t.kernelShape),s=[{type:12,data:r},{type:12,data:a}],n=[{name:"outputSize",type:"u32"},{name:"kernelSize",type:"u32"}];if(t.kernelShape.length<=2){let o=t.kernelShape[t.kernelShape.length-1],u=t.strides[t.strides.length-1],l=t.pads[t.pads.length/2-1],p=t.pads[t.pads.length-1],d=!!(l+p);s.push({type:12,data:o},{type:12,data:u},{type:12,data:l},{type:12,data:p}),n.push({name:"kw",type:"u32"},{name:"sw",type:"u32"},{name:"pwStart",type:"u32"},{name:"pwEnd",type:"u32"});let c=!1;if(t.kernelShape.length===2){let f=t.kernelShape[t.kernelShape.length-2],h=t.strides[t.strides.length-2],g=t.pads[t.pads.length/2-2],y=t.pads[t.pads.length-2];c=!!(g+y),s.push({type:12,data:f},{type:12,data:h},{type:12,data:g},{type:12,data:y}),n.push({name:"kh",type:"u32"},{name:"sh",type:"u32"},{name:"phStart",type:"u32"},{name:"phEnd",type:"u32"})}return[s,n,!0,d,c]}else{if(i)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let o=k.computeStrides(t.kernelShape);s.push({type:12,data:o},{type:12,data:t.pads},{type:12,data:t.strides}),n.push({name:"kernelStrides",type:"u32",length:o.length},{name:"pads",type:"u32",length:t.pads.length},{name:"strides",type:"u32",length:t.strides.length});let u=t.pads.reduce((l,p)=>l+p);return[s,n,!!u,!1,!1]}},qi=(e,t,i,r,a,s,n,o,u,l,p,d)=>{let c=a.format==="NHWC",f=t.type.value,h=B("output",t.type.tensor,r);if(a.kernelShape.length<=2){let g="",y="",_="",m=i-(c?2:1);if(p?g=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${m}] = indices[${m}] * uniforms.sw - uniforms.pwStart + i;
                  if (xIndices[${m}] < 0 || xIndices[${m}]
                      >= uniforms.x_shape[${m}]) {
                    pad++;
                    continue;
                  }
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${s}
                }`:g=`
                for (var i: u32 = 0u; i < uniforms.kw; i++) {
                  xIndices[${m}] = indices[${m}] * uniforms.sw - uniforms.pwStart + i;
                  let x_val = x[${t.indicesToOffset("xIndices")}];
                  ${s}
                }`,a.kernelShape.length===2){let w=i-(c?3:2);d?y=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${w}] = indices[${w}] * uniforms.sh - uniforms.phStart + j;
                  if (xIndices[${w}] < 0 || xIndices[${w}] >= uniforms.x_shape[${w}]) {
                    pad += i32(uniforms.kw);
                    continue;
                  }
              `:y=`
                for (var j: u32 = 0u; j < uniforms.kh; j++) {
                  xIndices[${w}] = indices[${w}] * uniforms.sh - uniforms.phStart + j;
                `,_=`
              }
            `}return`
            ${e.registerUniforms(u).declareVariables(t,h)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}

              let indices = ${h.offsetToIndices("global_idx")};
              var xIndices = ${h.offsetToIndices("global_idx")};

              var value = ${f}(${o});
              var pad = 0;
              ${y}
              ${g}
              ${_}
              ${n}

              output[global_idx] = value;
            }`}else{if(c)throw new Error("Pooling with kernelShape.length > 2 is not supported for NHWC format.");let g=a.kernelShape.length,y=a.pads.length,_="";return l?_=`
                if (xIndices[j] >= uniforms.x_shape[j]) {
                  pad++;
                  isPad = true;
                  break;
                }
              }
              if (!isPad) {
                let x_val = x[${t.indicesToOffset("xIndices")}];
                ${s}
              }`:_=`
              }
              let x_val = x[${t.indicesToOffset("xIndices")}];
              ${s}
            `,`
            ${e.registerUniforms(u).declareVariables(t,h)}

            ${e.mainStart()}
              ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
              let indices = ${h.offsetToIndices("global_idx")};
              var xIndices = ${h.offsetToIndices("global_idx")};

              var offsets: array<u32, ${g}>;

              var value = ${f}(${o});
              var pad = 0;
              var isPad = false;

              for (var i: u32 = 0u; i < uniforms.kernelSize; i++) {
                var offset = i;
                for (var j = 0u; j < ${g-1}u; j++) {
                  offsets[j] = offset / ${A("uniforms.kernelStrides","j",g)};
                  offset -= offsets[j] * ${A("uniforms.kernelStrides","j",g)};
                }
                offsets[${g-1}] = offset;

                isPad = false;
                for (var j = ${i-g}u; j < ${i}u; j++) {
                  xIndices[j] = indices[j] * ${A("uniforms.strides",`j - ${i-g}u`,g)}
                    + offsets[j - ${i-g}u] - ${A("uniforms.pads","j - 2u",y)};
                  ${_}
              }
              ${n}

              output[global_idx] = value;
            }`}},Ni=e=>`${e.format};${e.ceilMode};${e.autoPad};${e.kernelShape.length}`,Un=e=>`${Ni(e)};${e.countIncludePad}`,Pn=e=>`${Ni(e)};${e.storageOrder};${e.dilations}`,Li=e=>({format:e.format,autoPad:["NOTSET","VALID","SAME_UPPER","SAME_LOWER"][e.auto_pad],ceilMode:e.ceil_mode,kernelShape:e.kernel_shape,strides:e.strides,pads:e.pads}),Vi=(e,t,i,r)=>{let[a,s]=Ui(t,r,i),n=T("x",t.dataType,t.dims.length),o=n.type.value,u="value += x_val;",l="";a.countIncludePad?l+=`value /= ${o}(uniforms.kernelSize);`:l+=`value /= ${o}(i32(uniforms.kernelSize) - pad);`;let[p,d,c,f,h]=Pi(s,a);p.push(...M(t.dims,s));let g=["rank"];return{name:e,shaderCache:{hint:`${r.cacheKey};${c};${f};${h}`,inputDependencies:g},getRunData:()=>({outputs:[{dims:s,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(k.size(s)/64)},programUniforms:p}),getShaderSource:y=>qi(y,n,t.dims.length,s.length,a,u,l,0,d,c,f,h)}},Td=e=>{let t=e.count_include_pad!==0,i=Li(e);if(i.ceilMode!==0)throw new Error("ceil_mode output-shape is computed, but ceil_mode kernel execution (padding/divisor) is not yet implemented in the WebGPU AveragePool kernel");let r={countIncludePad:t,...i,cacheKey:""};return{...r,cacheKey:Un(r)}},Id=(e,t)=>{gt(e.inputs),e.compute(Vi("AveragePool",e.inputs[0],!1,t))},Gi={autoPad:"",ceilMode:0,countIncludePad:!1,kernelShape:[],strides:[],pads:[],storageOrder:0,dilations:[]},zd=e=>{let t=e.format;return{format:t,...Gi,cacheKey:t}},Ed=(e,t)=>{gt(e.inputs),e.compute(Vi("GlobalAveragePool",e.inputs[0],!0,t))},Wi=(e,t,i,r)=>{let[a,s]=Ui(t,r,i),n=`
      value = max(x_val, value);
    `,o="",u=T("x",t.dataType,t.dims.length),l=["rank"],[p,d,c,f,h]=Pi(s,a);return p.push(...M(t.dims,s)),{name:e,shaderCache:{hint:`${r.cacheKey};${c};${f};${h}`,inputDependencies:l},getRunData:()=>({outputs:[{dims:s,dataType:t.dataType}],dispatchGroup:{x:Math.ceil(k.size(s)/64)},programUniforms:p}),getShaderSource:g=>qi(g,u,t.dims.length,s.length,a,n,o,t.dataType===10?-65504:-1e5,d,c,f,h)}},Cd=(e,t)=>{gt(e.inputs),e.compute(Wi("MaxPool",e.inputs[0],!1,t))},Od=e=>{let t=e.storage_order,i=e.dilations,r=Li(e);if(t!==0)throw new Error("column major storage order is not yet supported for MaxPool");if(r.ceilMode!==0)throw new Error("ceil_mode output-shape is computed, but ceil_mode kernel execution (padding) is not yet implemented in the WebGPU MaxPool kernel");let a={storageOrder:t,dilations:i,...r,cacheKey:""};return{...a,cacheKey:Pn(a)}},Bd=e=>{let t=e.format;return{format:t,...Gi,cacheKey:t}},Rd=(e,t)=>{gt(e.inputs),e.compute(Wi("GlobalMaxPool",e.inputs[0],!0,t))}}),qn,Nn,Ad,Dd,yc=E(()=>{"use strict";N(),W(),ae(),F(),qn=(e,t)=>{if(e.length<2||e.length>3)throw new Error("DequantizeLinear requires 2 or 3 inputs.");if(e.length===3&&e[1].dims===e[2].dims)throw new Error("x-scale and x-zero-point must have the same shape.");if(e.length===3&&e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[1].dims.length!==0&&e[1].dims.length!==1&&e[1].dims.length!==e[0].dims.length)throw new Error("scale input must be a scalar, a 1D tensor, or have the same rank as the input tensor.");if(e.length>2){if(e[0].dataType!==e[2].dataType)throw new Error("x and x-zero-point must have the same data type.");if(e[1].dims.length!==e[2].dims.length)throw new Error("scale and zero-point inputs must have the same rank.");if(!e[1].dims.map((i,r)=>i===e[2].dims[r]).reduce((i,r)=>i&&r,!0))throw new Error("scale and zero-point inputs must have the same shape.")}if(t.blockSize>0){if(e[1].dims.length===0||e[1].dims.length===1&&e[1].dims[0]===1)throw new Error("blockSize must be set only for block quantization.");if(!e[1].dims.map((a,s)=>s===t.axis||a===e[0].dims[s]).reduce((a,s)=>a&&s,!0))throw new Error("For block qunatization, scale input shape to match the input shape except for the axis");if(e[1].dims.length!==e[0].dims.length)throw new Error("For block qunatization the scale input rank must be the same as the x rank.");let i=e[0].dims[t.axis],r=e[1].dims[t.axis];if(t.blockSize<Math.ceil(i/r)||t.blockSize>Math.ceil(i/(r-1)-1))throw new Error("blockSize must be with in the range [ceil(dI / Si), ceil(dI / (Si - 1) - 1)].")}},Nn=(e,t)=>{let i=k.normalizeAxis(t.axis,e[0].dims.length),r=e[0].dataType,a=r===3,s=e[0].dims,n=e[1].dataType,o=k.size(s),u=r===3||r===2,l=u?[Math.ceil(k.size(e[0].dims)/4)]:e[0].dims,p=e[1].dims,d=e.length>2?e[2]:void 0,c=d?u?[Math.ceil(k.size(d.dims)/4)]:d.dims:void 0,f=p.length===0||p.length===1&&p[0]===1,h=f===!1&&p.length===1,g=re(o),y=f&&(!u||g===4),_=y?g:1,m=y&&!u?g:1,w=T("input",u?12:r,l.length,m),$=T("scale",n,p.length),b=d?T("zero_point",u?12:r,c.length):void 0,v=B("output",n,s.length,_),x=[w,$];b&&x.push(b);let S=[l,p];d&&S.push(c);let I=[{type:12,data:o/_},{type:12,data:i},{type:12,data:t.blockSize},...M(...S,s)],C=H=>{let U=[{name:"output_size",type:"u32"},{name:"axis",type:"u32"},{name:"block_size",type:"u32"}];return`
      ${H.registerUniforms(U).declareVariables(...x,v)}
      ${H.mainStart()}
          ${H.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
          let output_indices = ${v.offsetToIndices("global_idx")};

          // Set input x
          ${u?`
            let input = ${w.getByOffset("global_idx / 4")};
            let x_vec = ${a?"unpack4xI8(input)":"unpack4xU8(input)"};
            let x_value = ${_===1?"x_vec[global_idx % 4]":"x_vec"};`:`let x_value = ${w.getByOffset("global_idx")};`};

          // Set scale input
          ${f?`let scale_value= ${$.getByOffset("0")}`:h?`
            let scale_index = ${v.indicesGet("output_indices","uniforms.axis")};
            let scale_value= ${$.getByOffset("scale_index")};`:`
            var scale_indices: ${$.type.indices} = output_indices;
            let index = ${$.indicesGet("scale_indices","uniforms.axis")} / uniforms.block_size;
            ${$.indicesSet("scale_indices","uniforms.axis","index")};
            let scale_value= ${$.getByIndices("scale_indices")};`};

          // Set zero-point input
          ${b?f?u?`
                let zero_point_input = ${b.getByOffset("0")};
                let zero_point_vec =  ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value= zero_point_vec[0]`:`let zero_point_value = ${b.getByOffset("0")}`:h?u?`
                let zero_point_index = ${v.indicesGet("output_indices","uniforms.axis")};
                let zero_point_input = ${b.getByOffset("zero_point_index / 4")};
                let zero_point_vec =  ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_index % 4]`:`
                let zero_point_index = ${v.indicesGet("output_indices","uniforms.axis")};
                let zero_point_value = ${b.getByOffset("zero_point_index")};`:u?`
                let zero_point_offset = ${$.indicesToOffset("scale_indices")};
                let zero_point_input = ${b.getByOffset("zero_point_offset / 4")};
                let zero_point_vec = ${a?"unpack4xI8(zero_point_input)":"unpack4xU8(zero_point_input)"};
                let zero_point_value = zero_point_vec[zero_point_offset % 4];`:`let zero_point_value = ${b.getByIndices("scale_indices")};`:`let zero_point_value = ${u?a?"i32":"u32":w.type.value}(0);`};
      // Compute and write output
      ${v.setByOffset("global_idx",`${v.type.value}(x_value - zero_point_value) * scale_value`)};
      }`};return{name:"DequantizeLinear",shaderCache:{hint:t.cacheKey,inputDependencies:b?["rank","rank","rank"]:["rank","rank"]},getShaderSource:C,getRunData:()=>({outputs:[{dims:s,dataType:n}],dispatchGroup:{x:Math.ceil(o/_/64),y:1,z:1},programUniforms:I})}},Ad=(e,t)=>{qn(e.inputs,t),e.compute(Nn(e.inputs,t))},Dd=e=>Y({axis:e.axis,blockSize:e.blockSize})}),Ln,Vn,Md,$c=E(()=>{"use strict";$e(),N(),F(),Ln=(e,t,i)=>{let r=e===t,a=e<t&&i<0,s=e>t&&i>0;if(r||a||s)throw new Error("Range these inputs' contents are invalid.")},Vn=(e,t,i,r)=>{let a=Math.abs(Math.ceil((t-e)/i)),s=[a],n=a,o=[{type:12,data:n},{type:r,data:e},{type:r,data:i},...M(s)],u=l=>{let p=B("output",r,s.length),d=p.type.value,c=[{name:"outputSize",type:"u32"},{name:"start",type:d},{name:"delta",type:d}];return`
        ${l.registerUniforms(c).declareVariables(p)}
        ${l.mainStart()}
        ${l.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
        output[global_idx] = uniforms.start + ${d}(global_idx) * uniforms.delta;
      }`};return{name:"Range",shaderCache:{hint:`${r}`},getShaderSource:u,getRunData:()=>({outputs:[{dims:s,dataType:r}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:o})}},Md=e=>{let t=0,i=0,r=0;e.inputs[0].dataType===6?(t=e.inputs[0].getInt32Array()[0],i=e.inputs[1].getInt32Array()[0],r=e.inputs[2].getInt32Array()[0]):e.inputs[0].dataType===1&&(t=e.inputs[0].getFloat32Array()[0],i=e.inputs[1].getFloat32Array()[0],r=e.inputs[2].getFloat32Array()[0]),ie.webgpu.validateInputContent&&Ln(t,i,r),e.compute(Vn(t,i,r,e.inputs[0].dataType),{inputs:[]})}}),Gn,Wn,Ud,Pd,wc=E(()=>{"use strict";N(),W(),ae(),F(),Gn=(e,t,i,r)=>{if(e!=="none"&&r!=="i32"&&r!=="u32"&&r!=="f32")throw new Error(`Input ${r} is not supported with reduction ${e}.`);let a=`{
                var oldValue = 0;
                loop {
                  let newValueF32 =`,s=`;
                  let newValue = bitcast<i32>(newValueF32);
                  let res = atomicCompareExchangeWeak(&${t}, oldValue, newValue);
                  if res.exchanged {
                    break;
                  }
                  oldValue = res.old_value;
                }
              }`;switch(e){case"none":return`${t}=${i};`;case"add":return r==="i32"||r==="u32"?`atomicAdd(&${t}, bitcast<${r}>(${i}));`:`
              ${a}bitcast<${r}>(oldValue) + (${i})${s}`;case"max":return r==="i32"||r==="u32"?`atomicMax(&${t}, bitcast<${r}>(${i}));`:`
                ${a}max(bitcast<f32>(oldValue), (${i}))${s}`;case"min":return r==="i32"||r==="u32"?`atomicMin(&${t}, bitcast<${r}>(${i}));`:`${a}min(bitcast<${r}>(oldValue), (${i}))${s}`;case"mul":return`${a}(bitcast<${r}>(oldValue) * (${i}))${s}`;default:throw new Error(`Reduction ${e} is not supported.`)}},Wn=(e,t)=>{let i=e[0].dims,r=e[1].dims,a=i,s=1,n=Math.ceil(k.sizeToDimension(r,r.length-1)/s),o=r[r.length-1],u=k.sizeFromDimension(i,o),l=[{type:12,data:n},{type:12,data:o},{type:12,data:u},...M(e[1].dims,e[2].dims,a)],p=d=>{let c=T("indices",e[1].dataType,e[1].dims.length),f=T("updates",e[2].dataType,e[2].dims.length,s),h=t.reduction!=="none"&&t.reduction!==""?lu("output",e[0].dataType,a.length):B("output",e[0].dataType,a.length,s);return`
      ${d.registerUniform("output_size","u32").registerUniform("last_index_dimension","u32").registerUniform("num_updates_elements","u32").declareVariables(c,f,h)}
      ${d.mainStart()}
        ${d.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
  var data_offset = 0u;
  let indices_start = uniforms.last_index_dimension * global_idx;
  let indices_end = indices_start + uniforms.last_index_dimension;
  for (var i = indices_start; i < indices_end; i++) {
    var index = i32(indices[i].x);
    ${e[0].dims.length===1?`
    let element_count_dim = uniforms.output_strides;
    let dim_value = uniforms.output_shape;`:`
    let element_count_dim = uniforms.output_strides[i - indices_start];
    let dim_value = uniforms.output_shape[i - indices_start];`}
    if (index >= 0) {
      if (index >= i32(dim_value)) {
        index = i32(dim_value - 1);
      }
    } else {
      if (index < -i32(dim_value)) {
        index = 0;
      } else {
        index += i32(dim_value);
      }
    }
    data_offset += u32((u32(index) * element_count_dim));
  }

  for (var i = 0u; i < uniforms.num_updates_elements; i++) {
    let value = updates[uniforms.num_updates_elements * global_idx + i];
    ${Gn(t.reduction,"output[data_offset + i]","value",h.type.value)}
  }

      }`};return{name:"ScatterND",shaderCache:{hint:`${t.cacheKey}_${t.reduction}`,inputDependencies:["rank","rank"]},getRunData:()=>({outputs:[{dims:a,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(n/64)},programUniforms:l}),getShaderSource:p}},Ud=e=>Y({reduction:e.reduction}),Pd=(e,t)=>{e.compute(Wn(e.inputs,t),{inputs:[e.inputs[1],e.inputs[2]],outputs:[]})}}),Fn,Hn,Kn,Fi,jn,Qn,Zn,Xn,Yn,Jn,eo,to,Hi,io,ro,ao,so,no,qd,Nd,bc=E(()=>{"use strict";N(),W(),ae(),F(),Fn=(e,t)=>{if(e.every(i=>i>0||(()=>{throw new Error("Resize requires scales input values to be positive")})),e.length>0){if(t.mode==="linear"){if(!(e.length===2||e.length===3||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1||e.length===5&&e[0]===1&&e[1]===1))throw new Error(`For linear mode, Resize requires scales to be 2D, 3D, 4D with either two outermost or one innermost and
            one outermost scale values equal to 1, or 5D with two outermost scale values equal to 1`)}else if(t.mode==="cubic"&&!(e.length===2||e.length===4&&e[0]===1&&e[1]===1||e.length===4&&e[0]===1&&e[3]===1))throw new Error("Resize requires scales input size to be 2 or 4 for cubic mode")}},Hn=(e,t,i)=>{t.every(a=>a>=0&&a<i||(()=>{throw new Error("Resize requires axes input values to be positive and less than rank")}));let r=new Array(i).fill(1);return t.forEach((a,s)=>r[a]=e[s]),r},Kn=(e,t,i,r,a,s)=>{let[n,o,u]=i>10?[1,2,3]:[-1,e.length>1?1:-1,-1],l=e[0].dims.length;if(n>0&&e.length>n&&e[n].dims.length>0)e[n].getFloat32Array().forEach(p=>s.push(p));else if(t.coordinateTransformMode==="tf_crop_and_resize")throw new Error("Resize requires RoI input to be specified when coordinateTransformMode is tfCropAndResize");if(o>0&&e.length>o&&e[o].dims.length===1&&e[o].dims[0]>0){if(e[o].getFloat32Array().forEach(p=>r.push(p)),r.length!==0&&r.length!==l&&i>=18&&r.length!==t.axes.length)throw new Error("Resize requires scales input size to be same as input rank or axes size for opset 18 and up");Fn(r,t),t.axes.length>0&&Hn(r,t.axes,l).forEach((p,d)=>r[d]=p)}if(u>0&&e.length>u&&e[u].dims.length===1&&e[u].dims[0]>0&&(e[u].getBigInt64Array().forEach(p=>a.push(Number(p))),a.length!==0&&a.length!==l&&i>=18&&a.length!==t.axes.length))throw new Error("Resize requires sizes input size to be same as input rank or axes size for opset 18 and up");if(t.axes.length>0){if(r.length!==0&&r.length!==t.axes.length)throw new Error('Resize requires "scales" input size to be of axes rank when axes attributes is specified');if(a.length!==0&&a.length!==t.axes.length)throw new Error('Resize requires "sizes" input size to be of rank axes rank when axes attributes is specified')}if(typeof r<"u"&&typeof a<"u"&&r.length>0&&a.length>l)throw new Error("Resize requires only of scales or sizes to be specified")},Fi=(e,t,i,r)=>`
  // The whole part and the fractional part are calculated separately due to inaccuracy of floating
  // point division. As an example, f32(21) / f32(7) may evaluate to 2.99... instead of 3, causing an
  // offset-by-one error later in floor().
  let big = (${e}) * (${t});
  let whole = ${r}(big / (${i}));
  let fract = ${r}(big % (${i})) / ${r}(${i});
  return whole + fract;
`,jn=(e,t)=>`fn getOriginalCoordinateFromResizedCoordinate(xResized: u32, xScale: f32, lengthResized: u32,
     lengthOriginal: u32, roiStart: f32, roiEnd: f32) -> ${t} { `+(()=>{switch(e){case"asymmetric":return`
          if (xScale < 1.0 || floor(xScale) != xScale) {
            return ${t}(xResized) / ${t}(xScale);
          } else {
            ${Fi("xResized","lengthOriginal","lengthResized",t)}
          }
        `;case"pytorch_half_pixel":return`if (lengthResized > 1) {
                    return (${t}(xResized) + 0.5) / ${t}(xScale) - 0.5;
                  } else {
                    return 0.0;
                  }`;case"tf_half_pixel_for_nn":return`return (${t}(xResized) + 0.5) / ${t}(xScale);`;case"align_corners":return`if (lengthResized == 1) {
                    return 0.0;
                  } else {
                    ${Fi("xResized","lengthOriginal - 1","lengthResized - 1",t)}
                  }`;case"tf_crop_and_resize":return`if (lengthResized > 1) {
                    return ${t}(roiStart) * ${t}(lengthOriginal - 1) +
                        (${t}(xResized) * ${t}(roiEnd - roiStart) * ${t}(lengthOriginal - 1)) /
                        ${t}(lengthResized - 1);
                  } else {
                    return 0.5 * ${t}(roiStart + roiEnd) * ${t}(lengthOriginal - 1);
                  }`;case"half_pixel_symmetric":return`const outputWidth = ${t}xScale * ${t}(lengthResized);
                  const adjustment = ${t}(lengthResized) / outputWidth;
                  const center = ${t}(lengthOriginal) / 2;
                  const offset = center * (1 - adjustment);
                  return offset + ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;case"half_pixel":return`return ((${t}(xResized) + 0.5) / ${t}(xScale)) - 0.5;`;default:throw new Error(`Coordinate transform mode ${e} is not supported`)}})()+"}",Qn=(e,t,i)=>`fn getNearestPixelFromOriginal(xOriginal: ${i}, isDownSample: bool) -> ${i} {`+(()=>{switch(e){case"round_prefer_ceil":return"if (fract(xOriginal) == 0.5) {             return ceil(xOriginal);           } else {             return round(xOriginal);           }";case"floor":return"return floor(xOriginal);";case"ceil":return"return ceil(xOriginal);";case"round_prefer_floor":return"if (fract(xOriginal) == 0.5) {                     return floor(xOriginal);                   } else {                     return round(xOriginal);                   }";default:if(t<11)return"if (isDownSample)                     {                       return ceil(xOriginal);                     } else {                       return xOriginal;                     }";throw new Error(`Nearest mode ${e} is not supported`)}})()+"}",Zn=(e,t,i)=>{let r=new Array(i).fill(0).concat(new Array(i).fill(1)),a=e.length===0?r:e.slice();return t.length>0?(t.forEach((s,n)=>{r[s]=a[n],r[n+i]=a[t.length+n]}),r):a},Xn=(e,t,i,r)=>{let a=[];if(i.length>0)if(r.length>0){if(e.forEach(s=>a.push(s)),Math.max(...r)>e.length)throw new Error("axes is out of bound");r.forEach((s,n)=>a[s]=i[n])}else i.forEach(s=>a.push(s));else{if(t.length===0)throw new Error("Resize requires either scales or sizes.");a=e.map((s,n)=>Math.round(s*t[n]))}return a},Yn=(e,t,i)=>{let r=(()=>{switch(i.keepAspectRatioPolicy){case"not_larger":return i.axes.length>0?Math.min(...i.axes.map(s=>t[s]),Number.MAX_VALUE):Math.min(...t,Number.MAX_VALUE);case"not_smaller":return i.axes.length>0?Math.max(...i.axes.map(s=>t[s]),Number.MIN_VALUE):Math.max(...t,Number.MIN_VALUE);default:throw new Error(`Keep aspect ratio policy ${i.keepAspectRatioPolicy} is not supported`)}})();t.fill(1,0,t.length);let a=e.slice();return i.axes.length>0?(i.axes.forEach(s=>t[s]=r),i.axes.forEach(s=>a[s]=Math.round(e[s]*t[s]))):(t.fill(r,0,t.length),a.forEach((s,n)=>a[n]=Math.round(s*t[n]))),a},Jn=(e,t,i,r,a)=>`
    fn calculateOriginalIndicesFromOutputIndices(output_indices: ${e.type.indices}) -> array<${e.type.value}, ${i.length}> {
      var original_indices: array<${e.type.value}, ${i.length}>;
      for (var i:u32 = 0; i < ${i.length}; i++) {
        var output_index = ${e.indicesGet("output_indices","i")};
        var scale = ${A("uniforms.scales","i",r)};
        var roi_low = ${A("uniforms.roi","i",a)};
        var roi_hi = ${A("uniforms.roi",`i + ${t.length}`,a)};
        if (scale == 1.0) {
          original_indices[i] = ${e.type.value}(output_index);
        } else {
          var input_shape_i = ${A("uniforms.input_shape","i",t.length)};
          var output_shape_i = ${A("uniforms.output_shape","i",i.length)};
          original_indices[i] = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                           input_shape_i, roi_low, roi_hi);
        }
      }
      return original_indices;
    }`,eo=(e,t,i,r,a,s,n)=>`
    fn calculateInputIndicesFromOutputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
      var input_indices: ${e.type.indices};
      for (var i:u32 = 0; i < ${r.length}; i++) {
        var output_index = ${t.indicesGet("output_indices","i")};
        var input_index: u32;
        var scale = ${A("uniforms.scales","i",a)};
        if (scale == 1.0) {
          input_index = output_index;
        } else {
          var roi_low = ${A("uniforms.roi","i",s)};
          var roi_hi = ${A("uniforms.roi",`i + ${i.length}`,s)};
          var input_shape_i = ${A("uniforms.input_shape","i",i.length)};
          var output_shape_i = ${A("uniforms.output_shape","i",r.length)};
          var original_idx = getOriginalCoordinateFromResizedCoordinate(output_index, scale, output_shape_i,
                                                                        input_shape_i, roi_low, roi_hi);
          if (!${n} || (original_idx >= 0 && original_idx < ${t.type.value}(input_shape_i))) {
            if (original_idx < 0) {
              input_index = 0;
            } else if (original_idx > ${t.type.value}(input_shape_i - 1)) {
              input_index = input_shape_i - 1;
            } else {
              input_index = u32(getNearestPixelFromOriginal(original_idx, scale < 1));
            }
          } else {
            input_index = u32(original_idx);
          }
        }
        ${e.indicesSet("input_indices","i","input_index")}
      }
      return input_indices;
    }`,to=(e,t)=>`
    fn checkInputIndices(input_indices: ${e.type.indices}) -> bool {
      for (var i:u32 = 0; i < ${t.length}; i++) {
        var input_index = ${e.indicesGet("input_indices","i")};
        if (input_index < 0 || input_index >= ${A("uniforms.input_shape","i",t.length)}) {
          return false;
        }
      }
      return true;
    }`,Hi=(e,t,i,r)=>e.rank>r?`
    ${e.indicesSet("input_indices",t,"channel")};
    ${e.indicesSet("input_indices",i,"batch")};
`:"",io=(e,t,i,r,a)=>{let[s,n,o,u]=i.length===2?[-1,0,1,-1]:[0,2,3,1],l=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, row: u32, col: u32) -> ${l} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",n,`max(0, min(row, ${i[n]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(col, ${i[o]} - 1))`)};
      ${Hi(e,u,s,2)}
      return ${e.getByIndices("input_indices")};
    }

    fn bilinearInterpolation(output_indices: ${t.type.indices}) -> ${l} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var row:${l} = originalIndices[${n}];
      var col:${l} = originalIndices[${o}];
      ${r?`if (row < 0 || row > (${i[n]} - 1) || col < 0 || col > (${i[o]} - 1)) {
        return ${a};
      }`:""};
      row = max(0, min(row, ${i[n]} - 1));
      col = max(0, min(col, ${i[o]} - 1));
      var row1: u32 = u32(row);
      var col1: u32 = u32(col);
      var row2: u32 = u32(row + 1);
      var col2: u32 = u32(col + 1);
      var channel: u32 = ${i.length>2?`u32(originalIndices[${u}])`:"0"};
      var batch: u32 =  ${i.length>2?`u32(originalIndices[${s}])`:"0"};
      var x11: ${l} = getInputValue(batch, channel, row1, col1);
      var x12: ${l} = getInputValue(batch, channel, row1, col2);
      var x21: ${l} = getInputValue(batch, channel, row2, col1);
      var x22: ${l} = getInputValue(batch, channel, row2, col2);
      var dx1: ${l} = abs(row - ${l}(row1));
      var dx2: ${l} = abs(${l}(row2) - row);
      var dy1: ${l} = abs(col - ${l}(col1));
      var dy2: ${l} = abs(${l}(col2) - col);
      if (row1 == row2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (col1 == col2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      return (x11 * dx2 * dy2 + x12 * dx2 * dy1 + x21 * dx1 * dy2 + x22 * dx1 * dy1);
    }`},ro=(e,t,i,r,a,s,n,o,u,l)=>{let p=i.length===2,d=!0,[c,f]=p?[0,1]:d?[2,3]:[1,2],h=e.type.value,g=y=>{let _=y===c?"row":"col";return`
      fn ${_}CubicInterpolation(input_indices: ${e.type.indices}, output_indices: ${t.type.indices}) -> ${h} {
        var output_index = ${t.indicesGet("output_indices",y)};
        var originalIdx: ${h} = getOriginalCoordinateFromResizedCoordinate(output_index, ${a[y]},
        ${r[y]}, ${i[y]}, ${s[y]}, ${s[y]} + ${i.length});
        var fractOriginalIdx: ${h} = originalIdx - floor(originalIdx);
        var coefs = getCubicInterpolationCoefs(fractOriginalIdx);

        if (${o} && (originalIdx < 0 || originalIdx > (${i[y]} - 1))) {
          return ${u};
        }
        var data: array<${h}, 4> = array<${h}, 4>(0.0, 0.0, 0.0, 0.0);
        for (var i: i32 = -1; i < 3; i++) {
          var ${_}: ${h} = originalIdx + ${h}(i);
          if (${_} < 0 || ${_} >= ${i[y]}) {
            ${l?`coefs[i + 1] = 0.0;
                        continue;`:o?`return ${u};`:`${_} = max(0, min(${_}, ${i[y]} - 1));`};
          }
        var input_indices_copy: ${e.type.indices} = input_indices;
          ${e.indicesSet("input_indices_copy",y,`u32(${_})`)};
          data[i + 1] = ${y===c?e.getByIndices("input_indices_copy"):"rowCubicInterpolation(input_indices_copy, output_indices)"};
        }
        return cubicInterpolation1D(data, coefs);
      }`};return`
    ${g(c)};
    ${g(f)};
  fn getCubicInterpolationCoefs(s: ${h}) -> array<${h}, 4> {
    var absS = abs(s);
    var coeffs: array<${h}, 4> = array<${h}, 4>(0.0, 0.0, 0.0, 0.0);
    var oneMinusAbsS: ${h} = 1.0 - absS;
    var twoMinusAbsS: ${h} = 2.0 - absS;
    var onePlusAbsS: ${h} = 1.0 + absS;
    coeffs[0] = ((${n} * onePlusAbsS - 5 * ${n}) * onePlusAbsS + 8 * ${n}) * onePlusAbsS - 4 * ${n};
    coeffs[1] = ((${n} + 2) * absS - (${n} + 3)) * absS * absS + 1;
    coeffs[2] = ((${n} + 2) * oneMinusAbsS - (${n} + 3)) * oneMinusAbsS * oneMinusAbsS + 1;
    coeffs[3] = ((${n} * twoMinusAbsS - 5 * ${n}) * twoMinusAbsS + 8 * ${n}) * twoMinusAbsS - 4 * ${n};
    return coeffs;
  }

  fn cubicInterpolation1D(x: array<${h}, 4>, coefs: array<${h}, 4>) -> ${h} {
    var coefsSum: ${h} = coefs[0] + coefs[1] + coefs[2] + coefs[3];
    return (x[0] * coefs[0] + x[1] * coefs[1]+ x[2] * coefs[2]+ x[3] * coefs[3]) / coefsSum;
  }

  fn bicubicInterpolation(output_indices: ${t.type.indices}) -> ${h} {
    var input_indices: ${e.type.indices} = output_indices;
    return colCubicInterpolation(input_indices, output_indices);
  }
    `},ao=(e,t,i,r,a)=>{let[s,n,o,u,l]=i.length===3?[-1,0,1,2,-1]:[0,2,3,4,1],p=e.type.value;return`
    fn getInputValue(batch: u32, channel: u32, depth:u32, height: u32, width: u32) -> ${p} {
      var input_indices: ${e.type.indices};
      ${e.indicesSet("input_indices",n,`max(0, min(depth, ${i[n]} - 1))`)};
      ${e.indicesSet("input_indices",o,`max(0, min(height, ${i[o]} - 1))`)};
      ${e.indicesSet("input_indices",u,`max(0, min(width, ${i[u]} - 1))`)};
      ${Hi(e,l,s,3)}
      return ${e.getByIndices("input_indices")};
    }

    fn trilinearInterpolation(output_indices: ${t.type.indices}) -> ${p} {
      var originalIndices = calculateOriginalIndicesFromOutputIndices(output_indices);
      var depth:${p} = originalIndices[${n}];
      var height:${p} = originalIndices[${o}];
      var width:${p} = originalIndices[${u}];
      ${r?`if (depth < 0 || depth > (${i[n]} - 1) || height < 0 || height > (${i[o]} - 1) || width < 0 || (width > ${i[u]} - 1)) {
      return ${a};
        }`:""};

    depth = max(0, min(depth, ${i[n]} - 1));
      height = max(0, min(height, ${i[o]} - 1));
      width = max(0, min(width, ${i[u]} - 1));
      var depth1: u32 = u32(depth);
      var height1: u32 = u32(height);
      var width1: u32 = u32(width);
      var depth2: u32 = u32(depth + 1);
      var height2: u32 = u32(height + 1);
      var width2: u32 = u32(width + 1);
      var channel: u32 = ${i.length>3?`u32(originalIndices[${l}])`:"0"};
      var batch: u32 =  ${i.length>3?`u32(originalIndices[${s}])`:"0"};

      var x111: ${p} = getInputValue(batch, channel, depth1, height1, width1);
      var x112: ${p} = getInputValue(batch, channel, depth1, height1, width2);
      var x121: ${p} = getInputValue(batch, channel, depth1, height2, width1);
      var x122: ${p} = getInputValue(batch, channel, depth1, height2, width2);
      var x211: ${p} = getInputValue(batch, channel, depth2, height1, width1);
      var x212: ${p} = getInputValue(batch, channel, depth2, height1, width2);
      var x221: ${p} = getInputValue(batch, channel, depth2, height2, width1);
      var x222: ${p} = getInputValue(batch, channel, depth2, height2, width2);
      var dx1: ${p} = abs(depth - ${p}(depth1));
      var dx2: ${p} = abs(${p}(depth2) - depth);
      var dy1: ${p} = abs(height - ${p}(height1));
      var dy2: ${p} = abs(${p}(height2) - height);
      var dz1: ${p} = abs(width - ${p}(width1));
      var dz2: ${p} = abs(${p}(width2) - width);
      if (depth1 == depth2) {
        dx1 = 0.5;
        dx2 = 0.5;
      }
      if (height1 == height2) {
        dy1 = 0.5;
        dy2 = 0.5;
      }
      if (width1 == width2) {
        dz1 = 0.5;
        dz2 = 0.5;
      }
      return (x111 * dx2 * dy2 * dz2 + x112 * dx2 * dy2 * dz1 + x121 * dx2 * dy1 *dz2 + x122 * dx2 * dy1 * dz1 +
              x211 * dx1 * dy2 * dz2 + x212 * dx1 * dy2 * dz1 + x221 * dx1 * dy1 *dz2 + x222 * dx1 * dy1 * dz1);
    }`},so=(e,t,i,r,a,s)=>{let n=e.dims,o=Zn(s,t.axes,n.length),u=Xn(n,r,a,t.axes),l=r.slice();r.length===0&&(l=n.map((m,w)=>m===0?1:u[w]/m),t.keepAspectRatioPolicy!=="stretch"&&(u=Yn(n,l,t)));let p=B("output",e.dataType,u.length),d=T("input",e.dataType,n.length),c=k.size(u),f=n.length===u.length&&n.every((m,w)=>m===u[w]),h=t.coordinateTransformMode==="tf_crop_and_resize",g=t.extrapolationValue,y=d.type.value,_=m=>`
      ${f?"":`
      ${jn(t.coordinateTransformMode,y)};
      ${(()=>{switch(t.mode){case"nearest":return`
              ${to(d,n)};
              ${Qn(t.nearestMode,i,y)};
              ${eo(d,p,n,u,l.length,o.length,h)};
              `;case"linear":return`
              ${Jn(p,n,u,l.length,o.length)};
              ${(()=>{if(n.length===2||n.length===4)return`${io(d,p,n,h,g)}`;if(n.length===3||n.length===5)return`${ao(d,p,n,h,g)}`;throw Error("Linear mode only supports input dims 2, 3, 4 and 5 are supported in linear mode.")})()};
            `;case"cubic":return`
            ${(()=>{if(n.length===2||n.length===4)return`${ro(d,p,n,u,l,o,t.cubicCoeffA,h,t.extrapolationValue,t.excludeOutside)}`;throw Error("Cubic mode only supports input dims 2 and 4 are supported in linear mode.")})()};
            `;default:throw Error("Invalid resize mode")}})()};
      `}
      ${m.registerUniform("output_size","u32").registerUniform("scales","f32",l.length).registerUniform("roi","f32",o.length).declareVariables(d,p)}
      ${m.mainStart()}
        ${m.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
        ${f?"output[global_idx] = input[global_idx];":`
        let output_indices = ${p.offsetToIndices("global_idx")};
        var input_indices: ${d.type.indices};
        ${(()=>{switch(t.mode){case"nearest":return`input_indices = calculateInputIndicesFromOutputIndices(output_indices);
                if (checkInputIndices(input_indices)) {
                  output[global_idx] = ${d.getByIndices("input_indices")};
                } else {
                  output[global_idx] = ${t.extrapolationValue};
                }`;case"linear":return`output[global_idx] = ${n.length===2||n.length===4?"bilinearInterpolation":"trilinearInterpolation"}(output_indices);`;case"cubic":return"output[global_idx] = bicubicInterpolation(output_indices);";default:throw Error(`Unsupported resize mode: ${t.mode}`)}})()};
`}
      }`;return{name:"Resize",shaderCache:{hint:`${t.cacheKey}|${i}|${l.length>0?t.mode==="cubic"?l:l.length:""}|${a.length>0?a:""}|${o.length>0?o:""}|${f}|${t.mode==="nearest"?n.length:n}`,inputDependencies:["rank"]},getShaderSource:_,getRunData:()=>({outputs:[{dims:u,dataType:e.dataType}],dispatchGroup:{x:Math.ceil(c/64)},programUniforms:[{type:12,data:c},{type:1,data:l},{type:1,data:o},...M(n,u)]})}},no=e=>{let t=e.customDataBuffer;return new Uint32Array(t.buffer,t.byteOffset,1)[0]},qd=(e,t)=>{let i=[],r=[],a=[],s=no(e);if(t.antialias!==0)throw Error("Only default value (0) for Antialias attribute is supported");Kn(e.inputs,t,s,i,r,a),e.compute(so(e.inputs[0],t,s,i,r,a),{inputs:[0]})},Nd=e=>{let t=e.antialias,i=e.axes,r=e.coordinateTransformMode,a=e.cubicCoeffA,s=e.excludeOutside!==0,n=e.extrapolationValue,o=e.keepAspectRatioPolicy,u=e.mode,l=e.nearestMode===""?"simple":e.nearestMode;return Y({antialias:t,axes:i,coordinateTransformMode:r,cubicCoeffA:a,excludeOutside:s,extrapolationValue:n,keepAspectRatioPolicy:o,mode:u,nearestMode:l})}}),oo,uo,Ld,vc=E(()=>{"use strict";N(),W(),F(),oo=e=>{if(!e||e.length<3)throw new Error("layerNorm requires at least 3 inputs.");let t=e[0],i=e[1],r=e[2];if(t.dataType!==i.dataType||t.dataType!==r.dataType)throw new Error("All inputs must have the same data type");if(t.dims.length!==3&&t.dims.length!==2)throw new Error("Input must be 2D or 3D");if(i.dims.length!==3&&i.dims.length!==2)throw new Error("Skip must be 2D or 3D");let a=t.dims[t.dims.length-1],s=t.dims[t.dims.length-2];if(i.dims[i.dims.length-1]!==a)throw new Error("Skip must have the same hidden size as input");if(i.dims[i.dims.length-2]!==s)throw new Error("Skip must have the same sequence length as input");if(r.dims.length!==1)throw new Error("Gamma must be 1D");if(r.dims[r.dims.length-1]!==a)throw new Error("Gamma must have the same hidden size as input");if(e.length>3){let n=e[3];if(n.dims.length!==1)throw new Error("Beta must be 1D");if(n.dims[n.dims.length-1]!==a)throw new Error("Beta must have the same hidden size as input")}if(e.length>4){let n=e[4];if(n.dims.length!==1)throw new Error("Bias must be 1D");if(n.dims[n.dims.length-1]!==a)throw new Error("Bias must have the same hidden size as input")}},uo=(e,t,i,r)=>{let a=t.simplified,s=e[0].dims,n=k.size(s),o=s,u=n,l=s.slice(-1)[0],p=r?s.slice(0,-1).concat(1):[],d=!a&&e.length>3,c=e.length>4,f=r&&i>1,h=r&&i>2,g=i>3,y=64,_=re(l),m=[{type:12,data:u},{type:12,data:_},{type:12,data:l},{type:1,data:t.epsilon}],w=b=>{let v=[{name:"output_size",type:"u32"},{name:"components",type:"u32"},{name:"hidden_size",type:"u32"},{name:"epsilon",type:"f32"}],x=[T("x",e[0].dataType,e[0].dims,_),T("skip",e[1].dataType,e[1].dims,_),T("gamma",e[2].dataType,e[2].dims,_)];d&&x.push(T("beta",e[3].dataType,e[3].dims,_)),c&&x.push(T("bias",e[4].dataType,e[4].dims,_)),x.push(B("output",e[0].dataType,o,_)),f&&x.push(B("mean_output",1,p)),h&&x.push(B("inv_std_output",1,p)),g&&x.push(B("input_skip_bias_sum",e[0].dataType,o,_));let S=ue(e[0].dataType),I=ue(1,_);return`

      ${b.registerUniforms(v).declareVariables(...x)}
      var<workgroup> sum_shared : array<${I}, ${y}>;
      var<workgroup> sum_squared_shared : array<${I}, ${y}>;

      ${b.mainStart([y,1,1])}
        let ix = local_id.x;
        let iy = global_id.x / ${y};

        let hidden_size_vectorized: u32 = uniforms.hidden_size / uniforms.components;
        var stride = hidden_size_vectorized / ${y};
        let offset = ix * stride + iy * hidden_size_vectorized;
        let offset1d = stride * ix;
        if (ix == ${y-1}) {
          stride = hidden_size_vectorized - stride * ix;
        }
        for (var i: u32 = 0; i < stride; i++) {
          let skip_value = skip[offset + i];
          let bias_value = ${c?"bias[offset1d + i]":S+"(0.0)"};
          let input_value = x[offset + i];
          let value = input_value + skip_value + bias_value;
          ${g?"input_skip_bias_sum[offset + i] = value;":""}
          output[offset + i] = value;
          let f32_value = ${nt(S,_,"value")};
          sum_shared[ix] += f32_value;
          sum_squared_shared[ix] += f32_value * f32_value;
        }
        workgroupBarrier();

        var reduce_size : u32 = ${y};
        for (var curr_size = reduce_size >> 1;  curr_size > 0; curr_size = reduce_size >> 1) {
          reduce_size = curr_size + (reduce_size & 1);
          if (ix < curr_size) {
            sum_shared[ix] += sum_shared[ix + reduce_size];
            sum_squared_shared[ix] += sum_squared_shared[ix + reduce_size];
          }
          workgroupBarrier();
        }

        let sum = sum_shared[0];
        let square_sum = sum_squared_shared[0];
        let mean = ${Ne("sum",_)} / f32(uniforms.hidden_size);
        let inv_std_dev = inverseSqrt(${Ne("square_sum",_)} / f32(uniforms.hidden_size) ${a?"":"- mean * mean"} + uniforms.epsilon);
        ${f?"mean_output[global_idx] = mean;":""}
        ${h?"inv_std_output[global_idx] = inv_std_dev;":""}

        for (var i: u32 = 0; i < stride; i++) {
          output[offset + i] = (output[offset + i] ${a?"":`- ${S}(mean)`}) *
            ${S}(inv_std_dev) * gamma[offset1d + i]
            ${d?"+ beta[offset1d + i]":""};
        }
      }`},$=[{dims:o,dataType:e[0].dataType}];return i>1&&$.push({dims:p,dataType:1}),i>2&&$.push({dims:p,dataType:1}),i>3&&$.push({dims:s,dataType:e[0].dataType}),{name:"SkipLayerNormalization",shaderCache:{hint:`${_};${f};${h};${g}`,inputDependencies:e.map((b,v)=>"type")},getShaderSource:w,getRunData:()=>({outputs:$,dispatchGroup:{x:Math.ceil(u/l)},programUniforms:m})}},Ld=(e,t)=>{oo(e.inputs);let i=[0];e.outputCount>1&&i.push(-3),e.outputCount>2&&i.push(-3),e.outputCount>3&&i.push(3),e.compute(uo(e.inputs,t,e.outputCount,!1),{outputs:i})}}),lo,_t,po,Ki,co,ho,Vd,Gd,xc=E(()=>{"use strict";N(),W(),ae(),F(),lo=(e,t)=>{if(!e||e.length<1)throw new Error("too few inputs");if(t.axes.length!==0){if(t.axes.length!==t.starts.length||t.axes.length!==t.ends.length)throw new Error("axes, starts and ends must have the same length")}else if(t.starts.length!==t.ends.length)throw new Error("starts and ends must have the same length");e.slice(1).forEach((i,r)=>{if(e[r+1].dataType!==6&&e[r+1].dataType!==7)throw new Error(`Input ${r} must be an array of int32 or int64`)})},_t=(e,t)=>{let i=[];if(e.length>t)if(e[t].dataType===7)e[t].getBigInt64Array().forEach(r=>i.push(Number(r)));else if(e[t].dataType===6)e[t].getInt32Array().forEach(r=>i.push(Number(r)));else throw new Error(`Input ${t} must be an array of int32 or int64`);return i},po=(e,t)=>{if(e.length>1){let i=_t(e,1),r=_t(e,2),a=_t(e,3);return a.length===0&&(a=[...Array(e[0].dims.length).keys()]),Y({starts:i,ends:r,axes:a})}else return t},Ki=(e,t,i,r,a)=>{let s=e;return e<0&&(s+=i[r[t]]),a[t]<0?Math.max(0,Math.min(s,i[r[t]]-1)):Math.max(0,Math.min(s,i[r[t]]))},co=(e,t,i)=>`fn calculateInputIndices(output_indices: ${t.type.indices}) -> ${e.type.indices} {
          var input_indices: ${e.type.indices};
          var carry = 0u;
          for (var i = ${i.length-1}; i >= 0; i--) {
            let input_shape_i = ${A("uniforms.input_shape","i",i.length)};
            let steps_i = ${A("uniforms.steps","i",i.length)};
            let signs_i = ${A("uniforms.signs","i",i.length)};
            let starts_i = ${A("uniforms.starts","i",i.length)};
            var output_index = ${t.indicesGet("output_indices","i")};
            var input_index = output_index * steps_i + starts_i + carry;
            carry = input_index / input_shape_i;
            input_index = input_index % input_shape_i;
            if (signs_i < 0) {
              input_index = input_shape_i - input_index - 1u + starts_i;
            }
            ${e.indicesSet("input_indices","i","input_index")};
          }
          return input_indices;
      }`,ho=(e,t)=>{let i=e[0].dims,r=k.size(i),a=t.axes.length>0?k.normalizeAxes(t.axes,i.length):[...Array(i.length).keys()],s=_t(e,4);s.forEach(_=>_!==0||(()=>{throw new Error("step cannot be 0")})),s.length===0&&(s=Array(a.length).fill(1));let n=t.starts.map((_,m)=>Ki(_,m,i,a,s)),o=t.ends.map((_,m)=>Ki(_,m,i,a,s));if(a.length!==n.length||a.length!==o.length)throw new Error("start, ends and axes should have the same number of elements");if(a.length!==i.length)for(let _=0;_<i.length;++_)a.includes(_)||(n.splice(_,0,0),o.splice(_,0,i[_]),s.splice(_,0,1));let u=s.map(_=>Math.sign(_));s.forEach((_,m,w)=>{if(_<0){let $=(o[m]-n[m])/_,b=n[m],v=b+$*s[m];n[m]=v,o[m]=b,w[m]=-_}});let l=i.slice(0);a.forEach((_,m)=>{l[_]=Math.ceil((o[_]-n[_])/s[_])});let p={dims:l,dataType:e[0].dataType},d=B("output",e[0].dataType,l.length),c=T("input",e[0].dataType,e[0].dims.length),f=k.size(l),h=[{name:"outputSize",type:"u32"},{name:"starts",type:"u32",length:n.length},{name:"signs",type:"i32",length:u.length},{name:"steps",type:"u32",length:s.length}],g=[{type:12,data:f},{type:12,data:n},{type:6,data:u},{type:12,data:s},...M(e[0].dims,l)],y=_=>`
      ${_.registerUniforms(h).declareVariables(c,d)}
        ${co(c,d,i)}
        ${_.mainStart()}
          ${_.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.outputSize")}
          let output_indices = ${d.offsetToIndices("global_idx")};
          let input_indices = calculateInputIndices(output_indices);
          ${d.setByOffset("global_idx",c.getByIndices("input_indices"))}
      }`;return{name:"Slice",shaderCache:{hint:`${u.length}_${n.length}_${s.length}`,inputDependencies:["rank"]},getShaderSource:y,getRunData:()=>({outputs:[p],dispatchGroup:{x:Math.ceil(r/64)},programUniforms:g})}},Vd=(e,t)=>{lo(e.inputs,t);let i=po(e.inputs,t);e.compute(ho(e.inputs,i),{inputs:[0]})},Gd=e=>{let t=e.starts,i=e.ends,r=e.axes;return Y({starts:t,ends:i,axes:r})}}),fo,mo,Wd,Fd,kc=E(()=>{"use strict";N(),W(),ae(),Le(),F(),fo=e=>{if(!e||e.length!==1)throw new Error("Softmax op requires 1 input.")},mo=(e,t)=>{let i=e.inputs[0],r=i.dims,a=k.size(r),s=r.length,n=k.normalizeAxis(t.axis,s),o=n<r.length-1,u,l=[];o?(l=Array.from({length:s},(x,S)=>S),l[n]=s-1,l[s-1]=n,u=e.compute(_e(i,l),{inputs:[i],outputs:[-1]})[0]):u=i;let p=u.dims,d=p[s-1],c=a/d,f=re(d),h=d/f,g=64;c===1&&(g=256);let y=(x,S)=>S===4?`max(max(${x}.x, ${x}.y), max(${x}.z, ${x}.w))`:S===2?`max(${x}.x, ${x}.y)`:S===3?`max(max(${x}.x, ${x}.y), ${x}.z)`:x,_=T("x",u.dataType,u.dims,f),m=B("result",u.dataType,u.dims,f),w=_.type.value,$=ue(u.dataType)==="f32"?`var threadMax = ${w}(-3.4028234663852886e+38f);`:`var threadMax = ${w}(-65504.0h);`,b=x=>`
      var<workgroup> rowMaxShared : ${w};
      var<workgroup> rowSumShared : ${w};
      var<workgroup> threadShared : array<${w}, ${g}>;

      fn getValue(row: i32, col: i32, row_stride: i32) -> ${w} {
        let index = row * row_stride + col;
        return x[index];
      }

      fn setValue(row: i32, col: i32, row_stride: i32, value: ${w}) {
        let index = row * row_stride + col;
        result[index] = value;
      }
      ${x.registerUniform("packedCols","i32").declareVariables(_,m)}
      ${x.mainStart(g)}
        let gindex = i32(global_idx);
        let lindex = i32(local_idx);
        const wg = ${g};
        let row = gindex / wg;
        let cols = uniforms.packedCols;
        let row_stride : i32 = uniforms.packedCols;

        // find the rows max
        ${$}
        for (var col = lindex; col < cols; col += wg) {
          let value = getValue(row, col, row_stride);
          threadMax = max(threadMax, value);
        }
        if (lindex < cols) {
          threadShared[lindex] = threadMax;
        }
        workgroupBarrier();

        var reduceSize = min(cols, wg);
        for (var currSize = reduceSize >> 1;  currSize > 0; currSize = reduceSize >> 1) {
          reduceSize = currSize + (reduceSize & 1);
          if (lindex < currSize) {
            threadShared[lindex] = max(threadShared[lindex], threadShared[lindex + reduceSize]);
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowMaxShared = ${w}(${y("threadShared[0]",f)});
        }
        workgroupBarrier();

        // find the rows sum
        var threadSum = ${w}(0.0);
        for (var col = lindex; col < cols; col += wg) {
          let subExp = exp(getValue(row, col, row_stride) - rowMaxShared);
          threadSum += subExp;
        }
        threadShared[lindex] = threadSum;
        workgroupBarrier();

        for (var currSize = wg >> 1;  currSize > 0; currSize = currSize >> 1) {
          if (lindex < currSize) {
            threadShared[lindex] = threadShared[lindex] + threadShared[lindex + currSize];
          }
          workgroupBarrier();
        }
        if (lindex == 0) {
          rowSumShared = ${w}(${Ne("threadShared[0]",f)});
        }
        workgroupBarrier();

        // calculate final value for each element in the row
        for (var col = lindex; col < cols; col += wg) {
          var value = exp(getValue(row, col, row_stride) - rowMaxShared) / rowSumShared;
          // max operation protects against NaN since all values should be >=0
          value = max(value, ${w}(0.0));
          setValue(row, col, row_stride, value);
        }
      }`,v=e.compute({name:"Softmax",shaderCache:{hint:`${f};${g}`,inputDependencies:["type"]},getRunData:()=>({outputs:[{dims:p,dataType:u.dataType}],dispatchGroup:{x:c},programUniforms:[{type:6,data:h}]}),getShaderSource:b},{inputs:[u],outputs:[o?-1:0]})[0];o&&e.compute(_e(v,l),{inputs:[v]})},Wd=(e,t)=>{fo(e.inputs),mo(e,t)},Fd=e=>Y({axis:e.axis})}),ji,go,_o,yo,Hd,Sc=E(()=>{"use strict";N(),W(),F(),ji=e=>Array.from(e.getBigInt64Array(),Number),go=e=>{if(!e||e.length!==2)throw new Error("Tile requires 2 inputs.");if(e[0].dataType!==1&&e[0].dataType!==10&&e[0].dataType!==6&&e[0].dataType!==12)throw new Error("Tile only support float, float16, int32, and uint32 data types");if(e[1].dataType!==7)throw new Error("Tile `repeats` input should be of int64 data type");if(e[1].dims.length!==1)throw new Error("Tile `repeats` input should be 1-D");if(ji(e[1]).length!==e[0].dims.length)throw new Error("Tile `repeats` input should have same number of elements as rank of input data tensor")},_o=(e,t)=>{let i=[];for(let r=0;r<e.length;++r)i.push(e[r]*t[r]);return i},yo=(e,t)=>{let i=e[0].dims,r=t??ji(e[1]),a=_o(i,r),s=k.size(a),n=e[0].dataType,o=T("input",n,i.length),u=B("output",n,a.length),l=p=>`
      const inputShape = ${o.indices(...i)};
      ${p.registerUniform("output_size","u32").declareVariables(o,u)}
      ${p.mainStart()}
      ${p.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.output_size")}
      let output_indices = ${u.offsetToIndices("global_idx")};
      var input_indices: ${o.type.indices};
      for (var i = 0; i < ${i.length}; i++) {
        let input_dim_i = ${o.indicesGet("uniforms.input_shape","i")};
        let input_dim_value = ${u.indicesGet("output_indices","i")}  % input_dim_i;

        ${o.indicesSet("input_indices","i","input_dim_value")}
      }
      ${u.setByOffset("global_idx",o.getByIndices("input_indices"))}
    }`;return{name:"Tile",shaderCache:{hint:`${r}`,inputDependencies:["rank"]},getRunData:()=>({outputs:[{dims:a,dataType:e[0].dataType}],dispatchGroup:{x:Math.ceil(s/64)},programUniforms:[{type:12,data:s},...M(e[0].dims,a)]}),getShaderSource:l}},Hd=e=>{go(e.inputs),e.compute(yo(e.inputs),{inputs:[0]})}}),$o,wo,Kd,Tc=E(()=>{"use strict";N(),W(),F(),$o=(e,t,i,r,a)=>{let s=B("output_data",a,i.length,4),n=T("a_data",t[1].dataType,t[1].dims.length,4),o=T("b_data",t[2].dataType,t[2].dims.length,4),u=T("c_data",t[0].dataType,t[0].dims.length,4),l,p=(d,c,f)=>`select(${c}, ${d}, ${f})`;if(!r)l=s.setByOffset("global_idx",p(n.getByOffset("global_idx"),o.getByOffset("global_idx"),u.getByOffset("global_idx")));else{let d=(c,f,h="")=>{let g=`a_data[index_a${f}][component_a${f}]`,y=`b_data[index_b${f}][component_b${f}]`,_=`bool(c_data[index_c${f}] & (0xffu << (component_c${f} * 8)))`;return`
            let output_indices${f} = ${s.offsetToIndices(`global_idx * 4u + ${f}u`)};
            let offset_a${f} = ${n.broadcastedIndicesToOffset(`output_indices${f}`,s)};
            let offset_b${f} = ${o.broadcastedIndicesToOffset(`output_indices${f}`,s)};
            let offset_c${f} = ${u.broadcastedIndicesToOffset(`output_indices${f}`,s)};
            let index_a${f} = offset_a${f} / 4u;
            let index_b${f} = offset_b${f} / 4u;
            let index_c${f} = offset_c${f} / 4u;
            let component_a${f} = offset_a${f} % 4u;
            let component_b${f} = offset_b${f} % 4u;
            let component_c${f} = offset_c${f} % 4u;
            ${c}[${f}] = ${h}(${p(g,y,_)});
          `};a===9?l=`
            var data = vec4<u32>(0);
            ${d("data",0,"u32")}
            ${d("data",1,"u32")}
            ${d("data",2,"u32")}
            ${d("data",3,"u32")}
            output_data[global_idx] = dot(vec4<u32>(0x1, 0x100, 0x10000, 0x1000000), vec4<u32>(data));`:l=`
            ${d("output_data[global_idx]",0)}
            ${d("output_data[global_idx]",1)}
            ${d("output_data[global_idx]",2)}
            ${d("output_data[global_idx]",3)}
          `}return`
        ${e.registerUniform("vec_size","u32").declareVariables(u,n,o,s)}
        ${e.mainStart()}
        ${e.guardAgainstOutOfBoundsWorkgroupSizes("uniforms.vec_size")}
        ${l}
      }`},wo=e=>{let t=e[1].dims,i=e[2].dims,r=e[0].dims,a=e[1].dataType,s=!(k.areEqual(t,i)&&k.areEqual(i,r)),n=t,o=k.size(t);if(s){let l=ot.calcShape(ot.calcShape(t,i,!1),r,!1);if(!l)throw new Error("Can't perform where op on the given tensors");n=l,o=k.size(n)}let u=Math.ceil(o/4);return{name:"Where",shaderCache:{inputDependencies:["rank","rank","rank"]},getShaderSource:l=>$o(l,e,n,s,a),getRunData:()=>({outputs:[{dims:n,dataType:a}],dispatchGroup:{x:Math.ceil(o/64/4)},programUniforms:[{type:12,data:u},...M(r,t,i,n)]})}},Kd=e=>{e.compute(wo(e.inputs))}}),jd,Ic=E(()=>{"use strict";Np(),zr(),Lp(),Vp(),Gp(),Wp(),Fp(),Zp(),Yp(),Jp(),ec(),tc(),ic(),rc(),ac(),sc(),nc(),oc(),uc(),lc(),dc(),pc(),cc(),hc(),fc(),mc(),hd(),gc(),_c(),yc(),$c(),wc(),Ir(),bc(),yd(),vc(),xc(),kc(),gd(),Sc(),Le(),Er(),Tc(),jd=new Map([["Abs",[Pu]],["Acos",[qu]],["Acosh",[Nu]],["Add",[bl]],["ArgMax",[Au,rr]],["ArgMin",[Ru,rr]],["Asin",[Lu]],["Asinh",[Vu]],["Atan",[Gu]],["Atanh",[Wu]],["Attention",[Du]],["AveragePool",[Id,Td]],["BatchNormalization",[Mu]],["BiasAdd",[Uu]],["BiasSplitGelu",[wl]],["Cast",[Hu,Fu]],["Ceil",[ju]],["Clip",[Ku]],["Concat",[Ol,Bl]],["Conv",[lr,ur]],["ConvTranspose",[Vl,Ll]],["Cos",[Qu]],["Cosh",[Zu]],["CumSum",[Gl,Wl]],["DepthToSpace",[Fl,Hl]],["DequantizeLinear",[Ad,Dd]],["DFT",[Kl,jl]],["Div",[vl]],["Einsum",[Ql,Zl]],["Elu",[Xu,bt]],["Equal",[xl]],["Erf",[Yu]],["Exp",[Ju]],["Expand",[Xl]],["FastGelu",[Yl]],["Floor",[el]],["FusedConv",[lr,ur]],["Gather",[ed,Jl]],["GatherElements",[nd,sd]],["GatherBlockQuantized",[rd,ad]],["GatherND",[td,id]],["Gelu",[tl]],["Gemm",[ud,od]],["GlobalAveragePool",[Ed,zd]],["GlobalMaxPool",[Rd,Bd]],["Greater",[Il]],["GreaterOrEqual",[El]],["GridSample",[ld,dd]],["GroupQueryAttention",[$d]],["HardSigmoid",[ll,ul]],["HardSwish",[dl]],["InstanceNormalization",[wd]],["LayerNormalization",[bd]],["LeakyRelu",[il,bt]],["Less",[zl]],["LessOrEqual",[Cl]],["Log",[yl]],["MatMul",[vd]],["MatMulNBits",[xd,kd]],["MaxPool",[Cd,Od]],["Mul",[kl]],["MultiHeadAttention",[cd,pd]],["Neg",[al]],["Not",[rl]],["Pad",[Sd]],["Pow",[Sl]],["QuickGelu",[$l,bt]],["Range",[Md]],["Reciprocal",[sl]],["ReduceMin",[zu]],["ReduceMean",[xu]],["ReduceMax",[Iu]],["ReduceSum",[Cu]],["ReduceProd",[Eu]],["ReduceL1",[ku]],["ReduceL2",[Su]],["ReduceLogSum",[Bu]],["ReduceLogSumExp",[Tu]],["ReduceSumSquare",[Ou]],["Relu",[nl]],["Resize",[qd,Nd]],["RotaryEmbedding",[_d]],["ScatterND",[Pd,Ud]],["Sigmoid",[ol]],["Sin",[pl]],["Sinh",[cl]],["Slice",[Vd,Gd]],["SkipLayerNormalization",[Ld]],["Split",[fd,md]],["Sqrt",[hl]],["Softmax",[Wd,Fd]],["Sub",[Tl]],["Tan",[fl]],["Tanh",[ml]],["ThresholdedRelu",[_l,bt]],["Tile",[Hd]],["Transpose",[pu,cu]],["Where",[Kd]]])}),Qd,zc=E(()=>{"use strict";$e(),Ae(),F(),Qd=class{constructor(e){this.backend=e,this.repo=new Map,this.attributesBound=!1}getArtifact(e){return this.repo.get(e)}setArtifact(e,t){this.repo.set(e,t)}run(e,t,i,r,a){Ee(e.programInfo.name);let s=this.backend.device,n=this.backend.getComputePassEncoder();this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2);let o=[];for(let l of t)o.push({binding:o.length,resource:{buffer:l.buffer}});for(let l of i)o.push({binding:o.length,resource:{buffer:l.buffer}});a&&o.push({binding:o.length,resource:a});let u=s.createBindGroup({layout:e.computePipeline.getBindGroupLayout(0),entries:o,label:e.programInfo.name});if(this.backend.sessionStatus==="capturing"){let l={kernelId:this.backend.currentKernelId,computePipeline:e.computePipeline,bindGroup:u,dispatchGroup:r};this.backend.capturedCommandList.get(this.backend.currentSessionId).push(l)}n.setPipeline(e.computePipeline),n.setBindGroup(0,u),n.dispatchWorkgroups(...r),this.backend.writeTimestamp(this.backend.pendingDispatchNumber*2+1),this.backend.pendingDispatchNumber++,(this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber||this.backend.queryType==="at-passes")&&this.backend.endComputePass(),this.backend.pendingDispatchNumber>=this.backend.maxDispatchNumber&&this.backend.flush(),Te(e.programInfo.name)}dispose(){}build(e,t){Ee(e.name);let i=this.backend.device,r=[];[{feature:"shader-f16",extension:"f16"},{feature:"subgroups",extension:"subgroups"}].forEach(l=>{i.features.has(l.feature)&&r.push(`enable ${l.extension};`)});let a=du(t,this.backend.device.limits),s=e.getShaderSource(a),n=`${r.join(`
`)}
${a.additionalImplementations}
${s}`,o=i.createShaderModule({code:n,label:e.name});Q("verbose",()=>`[WebGPU] ${e.name} shader code: ${n}`);let u=i.createComputePipeline({compute:{module:o,entryPoint:"main"},layout:"auto",label:e.name});return Te(e.name),{programInfo:e,computePipeline:u,uniformVariablesInfo:a.variablesInfo}}normalizeDispatchGroupSize(e){let t=typeof e=="number"?e:e.x,i=typeof e=="number"?1:e.y||1,r=typeof e=="number"?1:e.z||1,a=this.backend.device.limits.maxComputeWorkgroupsPerDimension;if(t<=a&&i<=a&&r<=a)return[t,i,r];let s=t*i*r,n=Math.ceil(Math.sqrt(s));if(n>a){if(n=Math.ceil(Math.cbrt(s)),n>a)throw new Error("Total dispatch size exceeds WebGPU maximum.");return[n,n,n]}else return[n,n,1]}}}),Zd={};St(Zd,{WebGpuBackend:()=>Xd});var bo,vo,xo,Xd,Ec=E(()=>{"use strict";$e(),N(),Ae(),su(),Pp(),Ic(),zc(),bo=(e,t)=>{if(t.length!==e.length)throw new Error(`inputDependencies length ${t.length} is not equal to inputTensors length ${e.length}.`);let i=[];for(let r=0;r<e.length;++r){let a=e[r].dataType;switch(t[r]){case"none":{i.push("");break}case"type":{i.push(`${a}`);break}case"rank":{let s=e[r].dims.length;i.push(`${a};${s}`);break}case"dims":{let s=e[r].dims.join(",");i.push(`${a};${s}`);break}default:throw new Error(`unsupported input dependency: ${t[r]}`)}}return i.join("|")},vo=(e,t,i)=>{let r=e.name;return e.shaderCache?.hint&&(r+="["+e.shaderCache.hint+"]"),r+=":"+i+`:${bo(t,e.shaderCache?.inputDependencies??new Array(t.length).fill("dims"))}`,r},xo=class{constructor(e){e&&(this.architecture=e.architecture,this.vendor=e.vendor)}isArchitecture(e){return this.architecture===e}isVendor(e){return this.vendor===e}},Xd=class{constructor(){this.currentSessionId=null,this.currentKernelId=null,this.commandEncoder=null,this.computePassEncoder=null,this.maxDispatchNumber=16,this.pendingDispatchNumber=0,this.pendingKernels=[],this.pendingQueries=new Map,this.sessionStatus="default",this.capturedCommandList=new Map,this.capturedPendingKernels=new Map,this.sessionExternalDataMapping=new Map}get currentKernelCustomData(){if(this.currentKernelId===null)throw new Error("currentKernelCustomData(): currentKernelId is null. (should not happen)");let e=this.kernelCustomData.get(this.currentKernelId);return e||(e={},this.kernelCustomData.set(this.currentKernelId,e)),e}async initialize(e,t){this.env=e;let i=[],r={requiredLimits:{maxComputeWorkgroupStorageSize:t.limits.maxComputeWorkgroupStorageSize,maxComputeWorkgroupsPerDimension:t.limits.maxComputeWorkgroupsPerDimension,maxStorageBufferBindingSize:t.limits.maxStorageBufferBindingSize,maxBufferSize:t.limits.maxBufferSize,maxComputeInvocationsPerWorkgroup:t.limits.maxComputeInvocationsPerWorkgroup,maxComputeWorkgroupSizeX:t.limits.maxComputeWorkgroupSizeX,maxComputeWorkgroupSizeY:t.limits.maxComputeWorkgroupSizeY,maxComputeWorkgroupSizeZ:t.limits.maxComputeWorkgroupSizeZ},requiredFeatures:i},a=o=>t.features.has(o)&&i.push(o)&&!0;a("chromium-experimental-timestamp-query-inside-passes")||a("timestamp-query"),a("shader-f16"),a("subgroups"),this.device=await t.requestDevice(r);let s=t,n=t.info??(typeof s.requestAdapterInfo=="function"?await s.requestAdapterInfo():void 0);this.adapterInfo=new xo(n),this.gpuDataManager=uu(this),this.programManager=new Qd(this),this.kernels=new Map,this.kernelPersistentData=new Map,this.kernelCustomData=new Map,xr(e.logLevel,!!e.debug),this.device.onuncapturederror=o=>{o.error instanceof GPUValidationError&&console.error(`An uncaught WebGPU validation error was raised: ${o.error.message}`)},Object.defineProperty(this.env.webgpu,"device",{value:this.device,writable:!1,enumerable:!0,configurable:!0}),Object.defineProperty(this.env.webgpu,"adapter",{value:t,writable:!1,enumerable:!0,configurable:!1}),this.setQueryType()}dispose(){typeof this.querySet<"u"&&this.querySet.destroy(),this.gpuDataManager.dispose(),this.device&&this.env?.webgpu&&this.device.lost.then(()=>{delete this.env.webgpu.device})}getCommandEncoder(){return this.commandEncoder||(this.commandEncoder=this.device.createCommandEncoder()),this.commandEncoder}getComputePassEncoder(){if(!this.computePassEncoder){let e=this.getCommandEncoder(),t={};this.queryType==="at-passes"&&(t.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:this.pendingDispatchNumber*2,endOfPassWriteIndex:this.pendingDispatchNumber*2+1}),this.computePassEncoder=e.beginComputePass(t)}return this.computePassEncoder}endComputePass(){this.computePassEncoder&&(this.computePassEncoder.end(),this.computePassEncoder=null)}flush(){if(!this.commandEncoder)return;Ee(),this.endComputePass();let e;this.queryType!=="none"&&(this.commandEncoder.resolveQuerySet(this.querySet,0,this.pendingDispatchNumber*2,this.queryResolveBuffer,0),e=this.device.createBuffer({size:this.pendingDispatchNumber*2*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),this.pendingQueries.set(e,this.pendingKernels),this.pendingKernels=[],this.commandEncoder.copyBufferToBuffer(this.queryResolveBuffer,0,e,0,this.pendingDispatchNumber*2*8)),this.device.queue.submit([this.commandEncoder.finish()]),this.gpuDataManager.refreshPendingBuffers(),this.commandEncoder=null,this.pendingDispatchNumber=0,this.queryType!=="none"&&e.mapAsync(GPUMapMode.READ).then(()=>{let t=new BigUint64Array(e.getMappedRange()),i=this.pendingQueries.get(e);for(let r=0;r<t.length/2;r++){let a=i[r],s=a.kernelId,n=this.kernels.get(s),o=n.kernelType,u=n.kernelName,l=a.programName,p=a.inputTensorViews,d=a.outputTensorViews,c=t[r*2],f=t[r*2+1];typeof this.queryTimeBase>"u"&&(this.queryTimeBase=c);let h=Number(c-this.queryTimeBase),g=Number(f-this.queryTimeBase);if(!Number.isSafeInteger(h)||!Number.isSafeInteger(g))throw new RangeError("incorrect timestamp range");if(this.env.webgpu.profiling?.ondata)this.env.webgpu.profiling.ondata({version:1,inputsMetadata:p.map(y=>({dims:y.dims,dataType:Re(y.dataType)})),outputsMetadata:d.map(y=>({dims:y.dims,dataType:Re(y.dataType)})),kernelId:s,kernelType:o,kernelName:u,programName:l,startTime:h,endTime:g});else{let y="";p.forEach((m,w)=>{y+=`input[${w}]: [${m.dims}] | ${Re(m.dataType)}, `});let _="";d.forEach((m,w)=>{_+=`output[${w}]: [${m.dims}] | ${Re(m.dataType)}, `}),console.log(`[profiling] kernel "${s}|${o}|${u}|${l}" ${y}${_}start time: ${h} ns, execution time: ${g-h} ns`)}Vt("GPU",`${l}::${c}::${f}`)}e.unmap(),this.pendingQueries.delete(e)}),Te()}run(e,t,i,r,a,s){Ee(e.name);let n=[];for(let m=0;m<t.length;++m){let w=t[m].data;if(w===0)continue;let $=this.gpuDataManager.get(w);if(!$)throw new Error(`no GPU data for input: ${w}`);n.push($)}let{outputs:o,dispatchGroup:u,programUniforms:l}=e.getRunData(t),p=i.length===0?o.map((m,w)=>w):i;if(p.length!==o.length)throw new Error(`Output size ${p.length} must be equal to ${o.length}.`);let d=[],c=[];for(let m=0;m<o.length;++m){if(!Number.isInteger(p[m])||p[m]<-3||p[m]>=s)throw new Error(`Invalid output index: ${p[m]}`);if(p[m]===-3)continue;let w=p[m]===-1,$=p[m]===-2,b=w||$?a(o[m].dataType,o[m].dims):r(p[m],o[m].dataType,o[m].dims);if(d.push(b),b.data===0)continue;let v=this.gpuDataManager.get(b.data);if(!v)throw new Error(`no GPU data for output: ${b.data}`);if(w&&this.temporaryData.push(v),$){let x=this.kernelPersistentData.get(this.currentKernelId);x||(x=[],this.kernelPersistentData.set(this.currentKernelId,x)),x.push(v)}c.push(v)}if(n.length!==t.length||c.length!==d.length){if(c.length===0)return Te(e.name),d;throw new Error(`Program ${e.name} has zero-sized tensor(s) in inputs or outputs. This is not supported now.`)}let f;if(l){let m=0,w=[];l.forEach(x=>{let S=typeof x.data=="number"?[x.data]:x.data;if(S.length===0)return;let I=x.type===10?2:4,C,H;x.type===10?(H=S.length>4?16:S.length>2?8:S.length*I,C=S.length>4?16:I*S.length):(H=S.length<=2?S.length*I:16,C=16),m=Math.ceil(m/H)*H,w.push(m);let U=x.type===10?8:4;m+=S.length>4?Math.ceil(S.length/U)*C:S.length*I});let $=16;m=Math.ceil(m/$)*$;let b=new ArrayBuffer(m);l.forEach((x,S)=>{let I=w[S],C=typeof x.data=="number"?[x.data]:x.data;if(x.type===6)new Int32Array(b,I,C.length).set(C);else if(x.type===12)new Uint32Array(b,I,C.length).set(C);else if(x.type===10)new Uint16Array(b,I,C.length).set(C);else if(x.type===1)new Float32Array(b,I,C.length).set(C);else throw new Error(`Unsupported uniform type: ${Re(x.type)}`)});let v=this.gpuDataManager.create(m,GPUBufferUsage.COPY_DST|GPUBufferUsage.UNIFORM);this.device.queue.writeBuffer(v.buffer,0,b,0,m),this.gpuDataManager.release(v.id),f={offset:0,size:m,buffer:v.buffer}}let h=this.programManager.normalizeDispatchGroupSize(u),g=h[1]===1&&h[2]===1,y=vo(e,t,g),_=this.programManager.getArtifact(y);if(_||(_=this.programManager.build(e,h),this.programManager.setArtifact(y,_),Q("info",()=>`[artifact] key: ${y}, programName: ${e.name}`)),l&&_.uniformVariablesInfo){if(l.length!==_.uniformVariablesInfo.length)throw new Error(`Uniform variables count mismatch: expect ${_.uniformVariablesInfo.length}, got ${l.length} in program "${_.programInfo.name}".`);for(let m=0;m<l.length;m++){let w=l[m],$=w.type,b=typeof w.data=="number"?1:w.data.length,[v,x]=_.uniformVariablesInfo[m];if($!==v||b!==x)throw new Error(`Uniform variable ${m} mismatch: expect type ${v} with size ${x}, got type ${$} with size ${b} in program "${_.programInfo.name}".`)}}if(Q("info",()=>`[ProgramManager] run "${e.name}" (key=${y}) with ${h[0]}x${h[1]}x${h[2]}`),this.queryType!=="none"||this.sessionStatus==="capturing"){let m={kernelId:this.currentKernelId,programName:_.programInfo.name,inputTensorViews:t,outputTensorViews:d};this.pendingKernels.push(m),this.sessionStatus==="capturing"&&this.capturedPendingKernels.get(this.currentSessionId).push(m)}return this.programManager.run(_,n,c,h,f),Te(e.name),d}upload(e,t){this.gpuDataManager.upload(e,t)}memcpy(e,t){this.gpuDataManager.memcpy(e,t)}async download(e,t){await this.gpuDataManager.download(e,t)}alloc(e){return this.gpuDataManager.create(e).id}free(e){return this.gpuDataManager.release(e)}createKernel(e,t,i,r){let a=jd.get(e);if(!a)throw new Error(`kernel not implemented: ${e}`);let s={kernelType:e,kernelName:r,kernelEntry:a[0],attributes:[a[1],i]};this.kernels.set(t,s)}releaseKernel(e){let t=this.kernelPersistentData.get(e);if(t){for(let i of t)this.gpuDataManager.release(i.id);this.kernelPersistentData.delete(e)}this.kernelCustomData.delete(e),this.kernels.delete(e)}computeKernel(e,t,i){let r=this.kernels.get(e);if(!r)throw new Error(`kernel not created: ${e}`);let a=r.kernelType,s=r.kernelName,n=r.kernelEntry,o=r.attributes;if(this.currentKernelId!==null)throw new Error(`kernel "[${a}] ${s}" is not allowed to be called recursively`);this.currentKernelId=e,o[0]&&(o[1]=o[0](o[1]),o[0]=void 0),Q("info",()=>`[WebGPU] Start to run kernel "[${a}] ${s}"...`);let u=this.env.debug;this.temporaryData=[];try{return u&&this.device.pushErrorScope("validation"),n(t,o[1]),0}catch(l){return i.push(Promise.resolve(`[WebGPU] Kernel "[${a}] ${s}" failed. ${l}`)),1}finally{u&&i.push(this.device.popErrorScope().then(l=>l?`GPU validation error for kernel "[${a}] ${s}": ${l.message}`:null));for(let l of this.temporaryData)this.gpuDataManager.release(l.id);this.temporaryData=[],this.currentKernelId=null}}registerBuffer(e,t,i,r){let a=this.sessionExternalDataMapping.get(e);a||(a=new Map,this.sessionExternalDataMapping.set(e,a));let s=a.get(t),n=this.gpuDataManager.registerExternalBuffer(i,r,s);return a.set(t,[n,i]),n}unregisterBuffers(e){let t=this.sessionExternalDataMapping.get(e);t&&(t.forEach(i=>this.gpuDataManager.unregisterExternalBuffer(i[0])),this.sessionExternalDataMapping.delete(e))}getBuffer(e){let t=this.gpuDataManager.get(e);if(!t)throw new Error(`no GPU data for buffer: ${e}`);return t.buffer}createDownloader(e,t,i){return async()=>{let r=await er(this,e,t);return kr(r.buffer,i)}}writeTimestamp(e){this.queryType==="inside-passes"&&this.computePassEncoder.writeTimestamp(this.querySet,e)}setQueryType(){this.queryType="none",(this.env.webgpu.profiling?.mode==="default"||(typeof this.env.trace>"u"?this.env.wasm.trace:this.env.trace))&&(this.device.features.has("chromium-experimental-timestamp-query-inside-passes")?this.queryType="inside-passes":this.device.features.has("timestamp-query")&&(this.queryType="at-passes"),this.queryType!=="none"&&typeof this.querySet>"u"&&(this.querySet=this.device.createQuerySet({type:"timestamp",count:this.maxDispatchNumber*2}),this.queryResolveBuffer=this.device.createBuffer({size:this.maxDispatchNumber*2*8,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.QUERY_RESOLVE})))}captureBegin(){Q("info","captureBegin"),this.capturedCommandList.get(this.currentSessionId)||this.capturedCommandList.set(this.currentSessionId,[]),this.capturedPendingKernels.get(this.currentSessionId)||this.capturedPendingKernels.set(this.currentSessionId,[]),this.flush(),this.sessionStatus="capturing"}captureEnd(){Q("info","captureEnd"),this.flush(),this.sessionStatus="default"}replay(){Q("info","replay"),this.sessionStatus="replaying";let e=this.capturedCommandList.get(this.currentSessionId),t=this.capturedPendingKernels.get(this.currentSessionId),i=e.length;this.pendingKernels=[];for(let r=0;r<i;r++){let a=this.getComputePassEncoder(),s=e[r];this.writeTimestamp(this.pendingDispatchNumber*2),a.setPipeline(s.computePipeline),a.setBindGroup(0,s.bindGroup),a.dispatchWorkgroups(...s.dispatchGroup),this.writeTimestamp(this.pendingDispatchNumber*2+1),this.pendingDispatchNumber++,this.queryType!=="none"&&this.pendingKernels.push(t[r]),(this.pendingDispatchNumber>=this.maxDispatchNumber||this.queryType==="at-passes")&&this.endComputePass(),this.pendingDispatchNumber>=this.maxDispatchNumber&&this.flush()}this.flush(),this.sessionStatus="default"}onCreateSession(){this.gpuDataManager.onCreateSession()}onReleaseSession(e){this.unregisterBuffers(e),this.capturedCommandList.has(e)&&this.capturedCommandList.delete(e),this.capturedPendingKernels.has(e)&&this.capturedPendingKernels.delete(e),this.gpuDataManager.onReleaseSession(e)}onRunStart(e){this.currentSessionId=e,this.setQueryType()}}}),Yd={};St(Yd,{init:()=>Jd});var Ut,ko,Jd,Cc=E(()=>{"use strict";N(),Ae(),W(),Up(),Ut=class ep{constructor(t,i,r,a){this.module=t,this.dataType=i,this.data=r,this.dims=a}getFloat32Array(){if(this.dataType!==1)throw new Error("Invalid data type");let t=k.size(this.dims);return t===0?new Float32Array:new Float32Array(this.module.HEAP8.buffer,this.data,t)}getBigInt64Array(){if(this.dataType!==7)throw new Error("Invalid data type");let t=k.size(this.dims);return t===0?new BigInt64Array:new BigInt64Array(this.module.HEAP8.buffer,this.data,t)}getInt32Array(){if(this.dataType!==6)throw new Error("Invalid data type");let t=k.size(this.dims);return t===0?new Int32Array:new Int32Array(this.module.HEAP8.buffer,this.data,t)}getUint16Array(){if(this.dataType!==10&&this.dataType!==4)throw new Error("Invalid data type");let t=k.size(this.dims);return t===0?new Uint16Array:new Uint16Array(this.module.HEAP8.buffer,this.data,t)}reshape(t){if(k.size(t)!==k.size(this.dims))throw new Error("Invalid new shape");return new ep(this.module,this.dataType,this.data,t)}},ko=class{constructor(e,t,i){this.module=e,this.backend=t,this.customDataOffset=0,this.customDataSize=0,this.adapterInfo=t.adapterInfo;let r=e.PTR_SIZE,a=i/e.PTR_SIZE,s=r===4?"i32":"i64";this.opKernelContext=Number(e.getValue(r*a++,s));let n=Number(e.getValue(r*a++,s));this.outputCount=Number(e.getValue(r*a++,s)),this.customDataOffset=Number(e.getValue(r*a++,"*")),this.customDataSize=Number(e.getValue(r*a++,s));let o=[];for(let u=0;u<n;u++){let l=Number(e.getValue(r*a++,s)),p=Number(e.getValue(r*a++,"*")),d=Number(e.getValue(r*a++,s)),c=[];for(let f=0;f<d;f++)c.push(Number(e.getValue(r*a++,s)));o.push(new Ut(e,l,p,c))}this.inputs=o}get kernelCustomData(){return this.backend.currentKernelCustomData}get customDataBuffer(){return this.module.HEAPU8.subarray(this.customDataOffset,this.customDataOffset+this.customDataSize)}compute(e,t){let i=t?.inputs?.map(n=>typeof n=="number"?this.inputs[n]:n)??this.inputs,r=t?.outputs??[],a=(n,o,u)=>new Ut(this.module,o,this.output(n,u),u),s=(n,o)=>{let u=Ze(n,o);if(!u)throw new Error(`Unsupported data type: ${n}`);let l=u>0?this.backend.gpuDataManager.create(u).id:0;return new Ut(this.module,n,l,o)};return this.backend.run(e,i,r,a,s,this.outputCount)}output(e,t){let i=this.module.stackSave();try{let r=this.module.PTR_SIZE,a=r===4?"i32":"i64",s=this.module.stackAlloc((1+t.length)*r);this.module.setValue(s,t.length,a);for(let n=0;n<t.length;n++)this.module.setValue(s+r*(n+1),t[n],a);return this.module._JsepOutput(this.opKernelContext,e,s)}catch(r){throw new Error(`Failed to generate kernel's output[${e}] with dims [${t}]. If you are running with pre-allocated output, please make sure the output type/dims are correct. Error: ${r}`)}finally{this.module.stackRestore(i)}}},Jd=async(e,t,i,r)=>{let a=t.jsepInit;if(!a)throw new Error("Failed to initialize JSEP. The WebAssembly module is not built with JSEP support.");if(e==="webgpu"){let s=(Ec(),Zt(Zd)).WebGpuBackend,n=new s;await n.initialize(i,r),a("webgpu",[n,o=>n.alloc(Number(o)),o=>n.free(o),(o,u,l,p=!1)=>{if(p)Q("verbose",()=>`[WebGPU] jsepCopyGpuToGpu: src=${Number(o)}, dst=${Number(u)}, size=${Number(l)}`),n.memcpy(Number(o),Number(u));else{Q("verbose",()=>`[WebGPU] jsepCopyCpuToGpu: dataOffset=${Number(o)}, gpuDataId=${Number(u)}, size=${Number(l)}`);let d=t.HEAPU8.subarray(Number(o>>>0),Number(o>>>0)+Number(l));n.upload(Number(u),d)}},async(o,u,l)=>{Q("verbose",()=>`[WebGPU] jsepCopyGpuToCpu: gpuDataId=${o}, dataOffset=${u}, size=${l}`),await n.download(Number(o),()=>t.HEAPU8.subarray(Number(u)>>>0,Number(u+l)>>>0))},(o,u,l)=>n.createKernel(o,Number(u),l,t.UTF8ToString(t._JsepGetNodeName(Number(u)))),o=>n.releaseKernel(o),(o,u,l,p)=>{Q("verbose",()=>`[WebGPU] jsepRun: sessionHandle=${l}, kernel=${o}, contextDataOffset=${u}`);let d=new ko(t,n,Number(u));return n.computeKernel(Number(o),d,p)},()=>n.captureBegin(),()=>n.captureEnd(),()=>n.replay()])}else{let s=new ou(i);a("webnn",[s,()=>s.reserveTensorId(),n=>s.releaseTensorId(n),async(n,o,u,l,p)=>s.ensureTensor(n,o,u,l,p),(n,o)=>{s.uploadTensor(n,o)},async(n,o)=>s.downloadTensor(n,o),(n,o)=>s.registerMLContext(n,o),!!i.trace])}}}),So,Dr,Mr,Ue,To,Qi,Qt,Ur,Pr,Zi,qr,Nr,Lr,tp=E(()=>{"use strict";$e(),Ap(),Dp(),N(),it(),$r(),tu(),So=(e,t)=>{te()._OrtInit(e,t)!==0&&J("Can't initialize onnxruntime.")},Dr=async e=>{So(e.wasm.numThreads,Wt(e.logLevel))},Mr=async(e,t)=>{te().asyncInit?.();let i=e.webgpu.adapter;if(t==="webgpu"){if(typeof navigator>"u"||!navigator.gpu)throw new Error("WebGPU is not supported in current environment");if(i){if(typeof i.limits!="object"||typeof i.features!="object"||typeof i.requestDevice!="function")throw new Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.")}else{let r=e.webgpu.powerPreference;if(r!==void 0&&r!=="low-power"&&r!=="high-performance")throw new Error(`Invalid powerPreference setting: "${r}"`);let a=e.webgpu.forceFallbackAdapter;if(a!==void 0&&typeof a!="boolean")throw new Error(`Invalid forceFallbackAdapter setting: "${a}"`);if(i=await navigator.gpu.requestAdapter({powerPreference:r,forceFallbackAdapter:a}),!i)throw new Error('Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.')}}if(t==="webnn"&&(typeof navigator>"u"||!navigator.ml))throw new Error("WebNN is not supported in current environment");{let r=(Cc(),Zt(Yd)).init;t==="webgpu"&&await r("webgpu",te(),e,i),t==="webnn"&&await r("webnn",te(),e)}},Ue=new Map,To=e=>{let t=te(),i=t.stackSave();try{let r=t.PTR_SIZE,a=t.stackAlloc(2*r);t._OrtGetInputOutputCount(e,a,a+r)!==0&&J("Can't get session input/output count.");let s=r===4?"i32":"i64";return[Number(t.getValue(a,s)),Number(t.getValue(a+r,s))]}finally{t.stackRestore(i)}},Qi=(e,t)=>{let i=te(),r=i.stackSave(),a=0;try{let s=i.PTR_SIZE,n=i.stackAlloc(2*s);i._OrtGetInputOutputMetadata(e,t,n,n+s)!==0&&J("Can't get session input/output metadata.");let o=Number(i.getValue(n,"*"));a=Number(i.getValue(n+s,"*"));let u=i.HEAP32[a/4];if(u===0)return[o,0];let l=i.HEAPU32[a/4+1],p=[];for(let d=0;d<l;d++){let c=Number(i.getValue(a+8+d*s,"*"));p.push(c!==0?i.UTF8ToString(c):Number(i.getValue(a+8+(d+l)*s,"*")))}return[o,u,p]}finally{i.stackRestore(r),a!==0&&i._OrtFree(a)}},Qt=e=>{let t=te(),i=t._malloc(e.byteLength);if(i===0)throw new Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);return t.HEAPU8.set(e,i),[i,e.byteLength]},Ur=async(e,t)=>{let i,r,a=te();Array.isArray(e)?[i,r]=e:e.buffer===a.HEAPU8.buffer?[i,r]=[e.byteOffset,e.byteLength]:[i,r]=Qt(e);let s=0,n=0,o=0,u=[],l=[],p=[];try{if([n,u]=await eu(t),t?.externalData&&a.mountExternalData){let $=[];for(let b of t.externalData){let v=typeof b=="string"?b:b.path,x=typeof b=="string"?b:b.data;$.push(vr(x).then(S=>{a.mountExternalData(v,S)}))}await Promise.all($)}for(let $ of t?.executionProviders??[])if((typeof $=="string"?$:$.name)==="webnn"){if(a.shouldTransferToMLTensor=!1,typeof $!="string"){let b=$,v=b?.context,x=b?.gpuDevice,S=b?.deviceType,I=b?.powerPreference;v?a.currentContext=v:x?a.currentContext=await a.webnnCreateMLContext(x):a.currentContext=await a.webnnCreateMLContext({deviceType:S,powerPreference:I})}else a.currentContext=await a.webnnCreateMLContext();break}s=await a._OrtCreateSession(i,r,n),a.webgpuOnCreateSession?.(s),s===0&&J("Can't create a session."),a.jsepOnCreateSession?.(),a.currentContext&&(a.webnnRegisterMLContext(s,a.currentContext),a.currentContext=void 0,a.shouldTransferToMLTensor=!0);let[d,c]=To(s),f=!!t?.enableGraphCapture,h=[],g=[],y=[],_=[],m=[];for(let $=0;$<d;$++){let[b,v,x]=Qi(s,$);b===0&&J("Can't get an input name."),l.push(b);let S=a.UTF8ToString(b);h.push(S),y.push(v===0?{name:S,isTensor:!1}:{name:S,isTensor:!0,type:Re(v),shape:x})}for(let $=0;$<c;$++){let[b,v,x]=Qi(s,$+d);b===0&&J("Can't get an output name."),p.push(b);let S=a.UTF8ToString(b);g.push(S),_.push(v===0?{name:S,isTensor:!1}:{name:S,isTensor:!0,type:Re(v),shape:x});{if(f&&t?.preferredOutputLocation===void 0){m.push("gpu-buffer");continue}let I=typeof t?.preferredOutputLocation=="string"?t.preferredOutputLocation:t?.preferredOutputLocation?.[S]??"cpu",C=a.webnnIsGraphOutput;if(I==="cpu"&&C&&C(s,S)){m.push("ml-tensor-cpu-output");continue}if(I!=="cpu"&&I!=="cpu-pinned"&&I!=="gpu-buffer"&&I!=="ml-tensor")throw new Error(`Not supported preferred output location: ${I}.`);if(f&&I!=="gpu-buffer")throw new Error(`Not supported preferred output location: ${I}. Only 'gpu-buffer' location is supported when enableGraphCapture is true.`);m.push(I)}}let w=null;return m.some($=>$==="gpu-buffer"||$==="ml-tensor"||$==="ml-tensor-cpu-output")&&(o=a._OrtCreateBinding(s),o===0&&J("Can't create IO binding."),w={handle:o,outputPreferredLocations:m,outputPreferredLocationsEncoded:m.map($=>$==="ml-tensor-cpu-output"?"ml-tensor":$).map($=>Ji($))}),Ue.set(s,[s,l,p,w,f,!1]),[s,h,g,y,_]}catch(d){throw l.forEach(c=>a._OrtFree(c)),p.forEach(c=>a._OrtFree(c)),o!==0&&a._OrtReleaseBinding(o)!==0&&J("Can't release IO binding."),s!==0&&a._OrtReleaseSession(s)!==0&&J("Can't release session."),d}finally{a._free(i),n!==0&&a._OrtReleaseSessionOptions(n)!==0&&J("Can't release session options."),u.forEach(d=>a._free(d)),a.unmountExternalData?.()}},Pr=e=>{let t=te(),i=Ue.get(e);if(!i)throw new Error(`cannot release session. invalid session id: ${e}`);let[r,a,s,n,o]=i;n&&(o&&t._OrtClearBoundOutputs(n.handle)!==0&&J("Can't clear bound outputs."),t._OrtReleaseBinding(n.handle)!==0&&J("Can't release IO binding.")),t.jsepOnReleaseSession?.(e),t.webnnOnReleaseSession?.(e),t.webgpuOnReleaseSession?.(e),a.forEach(u=>t._OrtFree(u)),s.forEach(u=>t._OrtFree(u)),t._OrtReleaseSession(r)!==0&&J("Can't release session."),Ue.delete(e)},Zi=async(e,t,i,r,a,s,n=!1)=>{if(!e){t.push(0);return}let o=te(),u=o.PTR_SIZE,l=e[0],p=e[1],d=e[3],c=d,f,h;if(l==="string"&&(d==="gpu-buffer"||d==="ml-tensor"))throw new Error("String tensor is not supported on GPU.");if(n&&d!=="gpu-buffer")throw new Error(`External buffer must be provided for input/output index ${s} when enableGraphCapture is true.`);if(d==="gpu-buffer"){let _=e[2].gpuBuffer;h=Ze(Qe(l),p);{let m=o.jsepRegisterBuffer;if(!m)throw new Error('Tensor location "gpu-buffer" is not supported without using WebGPU.');f=m(r,s,_,h)}}else if(d==="ml-tensor"){let _=e[2].mlTensor;h=Ze(Qe(l),p);let m=o.webnnRegisterMLTensor;if(!m)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');f=m(r,_,Qe(l),p)}else{let _=e[2];if(Array.isArray(_)){h=u*_.length,f=o._malloc(h),i.push(f);for(let m=0;m<_.length;m++){if(typeof _[m]!="string")throw new TypeError(`tensor data at index ${m} is not a string`);o.setValue(f+m*u,Se(_[m],i),"*")}}else{let m=o.webnnIsGraphInput,w=o.webnnIsGraphOutput;if(l!=="string"&&m&&w){let $=o.UTF8ToString(a);if(m(r,$)||w(r,$)){let b=Qe(l);h=Ze(b,p),c="ml-tensor";let v=o.webnnCreateTemporaryTensor,x=o.webnnUploadTensor;if(!v||!x)throw new Error('Tensor location "ml-tensor" is not supported without using WebNN.');let S=await v(r,b,p);x(S,new Uint8Array(_.buffer,_.byteOffset,_.byteLength)),f=S}else h=_.byteLength,f=o._malloc(h),i.push(f),o.HEAPU8.set(new Uint8Array(_.buffer,_.byteOffset,h),f)}else h=_.byteLength,f=o._malloc(h),i.push(f),o.HEAPU8.set(new Uint8Array(_.buffer,_.byteOffset,h),f)}}let g=o.stackSave(),y=o.stackAlloc(4*p.length);try{p.forEach((m,w)=>o.setValue(y+w*u,m,u===4?"i32":"i64"));let _=o._OrtCreateTensor(Qe(l),f,h,y,p.length,Ji(c));_===0&&J(`Can't create tensor for input/output. session=${r}, index=${s}.`),t.push(_)}finally{o.stackRestore(g)}},qr=async(e,t,i,r,a,s)=>{let n=te(),o=n.PTR_SIZE,u=Ue.get(e);if(!u)throw new Error(`cannot run inference. invalid session id: ${e}`);let l=u[0],p=u[1],d=u[2],c=u[3],f=u[4],h=u[5],g=t.length,y=r.length,_=0,m=[],w=[],$=[],b=[],v=[],x=n.stackSave(),S=n.stackAlloc(g*o),I=n.stackAlloc(g*o),C=n.stackAlloc(y*o),H=n.stackAlloc(y*o);try{[_,m]=Jo(s),Xe("wasm prepareInputOutputTensor");for(let O=0;O<g;O++)await Zi(i[O],w,b,e,p[t[O]],t[O],f);for(let O=0;O<y;O++)await Zi(a[O],$,b,e,d[r[O]],g+r[O],f);Ye("wasm prepareInputOutputTensor");for(let O=0;O<g;O++)n.setValue(S+O*o,w[O],"*"),n.setValue(I+O*o,p[t[O]],"*");for(let O=0;O<y;O++)n.setValue(C+O*o,$[O],"*"),n.setValue(H+O*o,d[r[O]],"*");if(c&&!h){let{handle:O,outputPreferredLocations:D,outputPreferredLocationsEncoded:G}=c;if(p.length!==g)throw new Error(`input count from feeds (${g}) is expected to be always equal to model's input count (${p.length}).`);Xe("wasm bindInputsOutputs");for(let K=0;K<g;K++){let V=t[K];await n._OrtBindInput(O,p[V],w[K])!==0&&J(`Can't bind input[${K}] for session=${e}.`)}for(let K=0;K<y;K++){let V=r[K];a[K]?.[3]?(v.push($[K]),n._OrtBindOutput(O,d[V],$[K],0)!==0&&J(`Can't bind pre-allocated output[${K}] for session=${e}.`)):n._OrtBindOutput(O,d[V],0,G[V])!==0&&J(`Can't bind output[${K}] to ${D[K]} for session=${e}.`)}Ye("wasm bindInputsOutputs"),Ue.set(e,[l,p,d,c,f,!0])}n.jsepOnRunStart?.(l),n.webnnOnRunStart?.(l);let U;c?U=await n._OrtRunWithBinding(l,c.handle,y,C,_):U=await n._OrtRun(l,I,S,g,H,y,C,_),U!==0&&J("failed to call OrtRun().");let P=[],Z=[];Xe("wasm ProcessOutputTensor");for(let O=0;O<y;O++){let D=Number(n.getValue(C+O*o,"*"));if(D===$[O]||v.includes($[O])){P.push(a[O]),D!==$[O]&&n._OrtReleaseTensor(D)!==0&&J("Can't release tensor.");continue}let G=n.stackSave(),K=n.stackAlloc(4*o),V=!1,j,z=0;try{n._OrtGetTensorData(D,K,K+o,K+2*o,K+3*o)!==0&&J(`Can't access output tensor data on index ${O}.`);let L=o===4?"i32":"i64",q=Number(n.getValue(K,L));z=n.getValue(K+o,"*");let R=n.getValue(K+o*2,"*"),pe=Number(n.getValue(K+o*3,L)),he=[];for(let ee=0;ee<pe;ee++)he.push(Number(n.getValue(R+ee*o,L)));n._OrtFree(R)!==0&&J("Can't free memory for tensor dims.");let se=he.reduce((ee,ne)=>ee*ne,1);j=Re(q);let fe=c?.outputPreferredLocations[r[O]];if(j==="string"){if(fe==="gpu-buffer"||fe==="ml-tensor")throw new Error("String tensor is not supported on GPU.");let ee=[];for(let ne=0;ne<se;ne++){let Ce=n.getValue(z+ne*o,"*"),hp=n.getValue(z+(ne+1)*o,"*"),fp=ne===se-1?void 0:hp-Ce;ee.push(n.UTF8ToString(Ce,fp))}P.push([j,he,ee,"cpu"])}else if(fe==="gpu-buffer"&&se>0){let ee=n.jsepGetBuffer;if(!ee)throw new Error('preferredLocation "gpu-buffer" is not supported without using WebGPU.');let ne=ee(z),Ce=Ze(q,se);if(Ce===void 0||!wr(j))throw new Error(`Unsupported data type: ${j}`);V=!0,P.push([j,he,{gpuBuffer:ne,download:n.jsepCreateDownloader(ne,Ce,j),dispose:()=>{n._OrtReleaseTensor(D)!==0&&J("Can't release tensor.")}},"gpu-buffer"])}else if(fe==="ml-tensor"&&se>0){let ee=n.webnnEnsureTensor,ne=n.webnnIsGraphInputOutputTypeSupported;if(!ee||!ne)throw new Error('preferredLocation "ml-tensor" is not supported without using WebNN.');if(Ze(q,se)===void 0||!br(j))throw new Error(`Unsupported data type: ${j}`);if(!ne(e,j,!1))throw new Error(`preferredLocation "ml-tensor" for ${j} output is not supported by current WebNN Context.`);let Ce=await ee(e,z,q,he,!1);V=!0,P.push([j,he,{mlTensor:Ce,download:n.webnnCreateMLTensorDownloader(z,j),dispose:()=>{n.webnnReleaseTensorId(z),n._OrtReleaseTensor(D)}},"ml-tensor"])}else if(fe==="ml-tensor-cpu-output"&&se>0){let ee=n.webnnCreateMLTensorDownloader(z,j)(),ne=P.length;V=!0,Z.push((async()=>{let Ce=[ne,await ee];return n.webnnReleaseTensorId(z),n._OrtReleaseTensor(D),Ce})()),P.push([j,he,[],"cpu"])}else{let ee=Xt(j),ne=new ee(se);new Uint8Array(ne.buffer,ne.byteOffset,ne.byteLength).set(n.HEAPU8.subarray(z,z+ne.byteLength)),P.push([j,he,ne,"cpu"])}}finally{n.stackRestore(G),j==="string"&&z&&n._free(z),V||n._OrtReleaseTensor(D)}}c&&!f&&(n._OrtClearBoundOutputs(c.handle)!==0&&J("Can't clear bound outputs."),Ue.set(e,[l,p,d,c,f,!1]));for(let[O,D]of await Promise.all(Z))P[O][2]=D;return Ye("wasm ProcessOutputTensor"),P}finally{n.webnnOnRunEnd?.(l),n.stackRestore(x),w.forEach(U=>n._OrtReleaseTensor(U)),$.forEach(U=>n._OrtReleaseTensor(U)),b.forEach(U=>n._free(U)),_!==0&&n._OrtReleaseRunOptions(_),m.forEach(U=>n._free(U))}},Nr=e=>{let t=te(),i=Ue.get(e);if(!i)throw new Error("invalid session id");let r=i[0],a=t._OrtEndProfiling(r);a===0&&J("Can't get an profile file name."),t._OrtFree(a)},Lr=e=>{let t=[];for(let i of e){let r=i[2];!Array.isArray(r)&&"buffer"in r&&t.push(r.buffer)}return t}}),Pe,ye,at,yt,$t,Pt,Xi,qt,He,Ke,Io,ip,rp,ap,sp,np,op,up,lp=E(()=>{"use strict";$e(),tp(),it(),_r(),Pe=()=>!!ie.wasm.proxy&&typeof document<"u",at=!1,yt=!1,$t=!1,qt=new Map,He=(e,t)=>{let i=qt.get(e);i?i.push(t):qt.set(e,[t])},Ke=()=>{if(at||!yt||$t||!ye)throw new Error("worker not ready")},Io=e=>{switch(e.data.type){case"init-wasm":at=!1,e.data.err?($t=!0,Xi[1](e.data.err)):(yt=!0,Xi[0]()),Pt&&(URL.revokeObjectURL(Pt),Pt=void 0);break;case"init-ep":case"copy-from":case"create":case"release":case"run":case"end-profiling":{let t=qt.get(e.data.type);e.data.err?t.shift()[1](e.data.err):t.shift()[0](e.data.out);break}default:}},ip=async()=>{if(!yt){if(at)throw new Error("multiple calls to 'initWasm()' detected.");if($t)throw new Error("previous call to 'initWasm()' failed.");if(at=!0,Pe())return new Promise((e,t)=>{ye?.terminate(),Xo().then(([i,r])=>{try{ye=r,ye.onerror=s=>t(s),ye.onmessage=Io,Xi=[e,t];let a={type:"init-wasm",in:ie};if(!a.in.wasm.wasmPaths&&i){let s=gr();s&&(a.in.wasm.wasmPaths=s)}ye.postMessage(a),Pt=i}catch(a){t(a)}},t)});try{await yr(ie.wasm),await Dr(ie),yt=!0}catch(e){throw $t=!0,e}finally{at=!1}}},rp=async e=>{if(Pe())return Ke(),new Promise((t,i)=>{He("init-ep",[t,i]);let r={type:"init-ep",in:{epName:e,env:ie}};ye.postMessage(r)});await Mr(ie,e)},ap=async e=>Pe()?(Ke(),new Promise((t,i)=>{He("copy-from",[t,i]);let r={type:"copy-from",in:{buffer:e}};ye.postMessage(r,[e.buffer])})):Qt(e),sp=async(e,t)=>{if(Pe()){if(t?.preferredOutputLocation)throw new Error('session option "preferredOutputLocation" is not supported for proxy.');return Ke(),new Promise((i,r)=>{He("create",[i,r]);let a={type:"create",in:{model:e,options:{...t}}},s=[];e instanceof Uint8Array&&s.push(e.buffer),ye.postMessage(a,s)})}else return Ur(e,t)},np=async e=>{if(Pe())return Ke(),new Promise((t,i)=>{He("release",[t,i]);let r={type:"release",in:e};ye.postMessage(r)});Pr(e)},op=async(e,t,i,r,a,s)=>{if(Pe()){if(i.some(n=>n[3]!=="cpu"))throw new Error("input tensor on GPU is not supported for proxy.");if(a.some(n=>n))throw new Error("pre-allocated output tensor is not supported for proxy.");return Ke(),new Promise((n,o)=>{He("run",[n,o]);let u=i,l={type:"run",in:{sessionId:e,inputIndices:t,inputs:u,outputIndices:r,options:s}};ye.postMessage(l,Lr(u))})}else return qr(e,t,i,r,a,s)},up=async e=>{if(Pe())return Ke(),new Promise((t,i)=>{He("end-profiling",[t,i]);let r={type:"end-profiling",in:e};ye.postMessage(r)});Nr(e)}}),Yi,zo,dp,Oc=E(()=>{"use strict";$e(),lp(),N(),mr(),tu(),Yi=(e,t)=>{switch(e.location){case"cpu":return[e.type,e.dims,e.data,"cpu"];case"gpu-buffer":return[e.type,e.dims,{gpuBuffer:e.gpuBuffer},"gpu-buffer"];case"ml-tensor":return[e.type,e.dims,{mlTensor:e.mlTensor},"ml-tensor"];default:throw new Error(`invalid data location: ${e.location} for ${t()}`)}},zo=e=>{switch(e[3]){case"cpu":return new ze(e[0],e[2],e[1]);case"gpu-buffer":{let t=e[0];if(!wr(t))throw new Error(`not supported data type: ${t} for deserializing GPU tensor`);let{gpuBuffer:i,download:r,dispose:a}=e[2];return ze.fromGpuBuffer(i,{dataType:t,dims:e[1],download:r,dispose:a})}case"ml-tensor":{let t=e[0];if(!br(t))throw new Error(`not supported data type: ${t} for deserializing MLTensor tensor`);let{mlTensor:i,download:r,dispose:a}=e[2];return ze.fromMLTensor(i,{dataType:t,dims:e[1],download:r,dispose:a})}default:throw new Error(`invalid data location: ${e[3]}`)}},dp=class{async fetchModelAndCopyToWasmMemory(e){return ap(await vr(e))}async loadModel(e,t){Ee();let i;typeof e=="string"?i=await this.fetchModelAndCopyToWasmMemory(e):i=e,[this.sessionId,this.inputNames,this.outputNames,this.inputMetadata,this.outputMetadata]=await sp(i,t),Te()}async dispose(){return np(this.sessionId)}async run(e,t,i){Ee();let r=[],a=[];Object.entries(e).forEach(d=>{let c=d[0],f=d[1],h=this.inputNames.indexOf(c);if(h===-1)throw new Error(`invalid input '${c}'`);r.push(f),a.push(h)});let s=[],n=[];Object.entries(t).forEach(d=>{let c=d[0],f=d[1],h=this.outputNames.indexOf(c);if(h===-1)throw new Error(`invalid output '${c}'`);s.push(f),n.push(h)});let o=r.map((d,c)=>Yi(d,()=>`input "${this.inputNames[a[c]]}"`)),u=s.map((d,c)=>d?Yi(d,()=>`output "${this.outputNames[n[c]]}"`):null),l=await op(this.sessionId,a,o,n,u,i),p={};for(let d=0;d<l.length;d++)p[this.outputNames[n[d]]]=s[d]??zo(l[d]);return Te(),p}startProfiling(){}endProfiling(){up(this.sessionId)}}}),pp={};St(pp,{OnnxruntimeWebAssemblyBackend:()=>cr,initializeFlags:()=>pr,wasmBackend:()=>cp});var pr,cr,cp,Bc=E(()=>{"use strict";$e(),lp(),Oc(),pr=()=>{(typeof ie.wasm.initTimeout!="number"||ie.wasm.initTimeout<0)&&(ie.wasm.initTimeout=0);let e=ie.wasm.simd;if(typeof e!="boolean"&&e!==void 0&&e!=="fixed"&&e!=="relaxed"&&(console.warn(`Property "env.wasm.simd" is set to unknown value "${e}". Reset it to \`false\` and ignore SIMD feature checking.`),ie.wasm.simd=!1),typeof ie.wasm.proxy!="boolean"&&(ie.wasm.proxy=!1),typeof ie.wasm.trace!="boolean"&&(ie.wasm.trace=!1),typeof ie.wasm.numThreads!="number"||!Number.isInteger(ie.wasm.numThreads)||ie.wasm.numThreads<=0)if(typeof self<"u"&&!self.crossOriginIsolated)ie.wasm.numThreads=1;else{let t=typeof navigator>"u"?yp("node:os").cpus().length:navigator.hardwareConcurrency;ie.wasm.numThreads=Math.min(4,Math.ceil((t||1)/2))}},cr=class{async init(e){pr(),await ip(),await rp(e)}async createInferenceSessionHandler(e,t){let i=new dp;return await i.loadModel(e,t),i}},cp=new cr});$e();$e();$e();var Rc="1.29.0",Ac=jo;{let e=(Bc(),Zt(pp)).wasmBackend;st("webgpu",e,5),st("webnn",e,5),st("cpu",e,10),st("wasm",e,10)}Object.defineProperty(ie.versions,"web",{value:Rc,enumerable:!0});export{Ko as InferenceSession,Vt as TRACE,Xe as TRACE_EVENT_BEGIN,Ye as TRACE_EVENT_END,Ee as TRACE_FUNC_BEGIN,Te as TRACE_FUNC_END,ze as Tensor,Ac as default,ie as env,st as registerBackend};
/*!
 * ONNX Runtime Web v1.29.0
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @license
 * Copyright 2021 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
/**
 * @license
 * Copyright 2020 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
/**
 * @license
 * Copyright 2019 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */
