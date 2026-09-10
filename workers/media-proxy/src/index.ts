const PUBLIC_PREFIXES = new Set(["admin-images", "public-videos"]);
const PARENT_ORIGINS = new Set(["https://mathremix.pro.vn", "https://www.mathremix.pro.vn"]);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "Range, If-None-Match, If-Modified-Since",
  "access-control-expose-headers": "Accept-Ranges, Content-Length, Content-Range, ETag",
};

function publicObjectKey(pathname: string) {
  try {
    const parts = pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    if (parts.length < 2 || !PUBLIC_PREFIXES.has(parts[0])) return null;
    if (parts.some((part) => !part || part === "." || part === ".." || /[\\/\0]/.test(part))) return null;
    return parts.join("/");
  } catch {
    return null;
  }
}

function responseHeaders(object: R2Object) {
  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cross-origin-resource-policy", "cross-origin");
  headers.set("referrer-policy", "no-referrer");
  if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=86400");
  return headers;
}

function normalizedRange(range: R2Range | undefined, size: number) {
  if (!range) return null;
  if ("suffix" in range && typeof range.suffix === "number") {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = "offset" in range && typeof range.offset === "number" ? range.offset : 0;
  const length = "length" in range && typeof range.length === "number"
    ? range.length
    : Math.max(0, size - offset);
  return { offset, length };
}

function missingResponse(status = 404) {
  return new Response(status === 404 ? "Media not found" : null, {
    status,
    headers: {
      ...corsHeaders,
      "cache-control": "public, max-age=60",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

function viewerResponse(html: string) {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cross-origin-resource-policy": "cross-origin",
      "content-security-policy": "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline'; img-src data:; media-src https: blob:; frame-src https://www.youtube-nocookie.com; connect-src https://api.mathremix.pro.vn; frame-ancestors https://mathremix.pro.vn https://www.mathremix.pro.vn",
    },
  });
}

const VIDEO_VIEWER = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AECK Video</title><style>html,body,#app{width:100%;height:100%;margin:0;background:#111827;color:#fff;font:14px Lato,Segoe UI,sans-serif}#app{display:grid;place-items:center;position:relative}.state{padding:20px;text-align:center}video,iframe{width:100%;height:100%;border:0}.state.error{color:#fecaca}.watermark{position:absolute;z-index:2;max-width:70%;padding:5px 8px;border-radius:6px;background:#11182780;color:#ffffffa8;pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style><main id="app"><p class="state">Đang chuẩn bị video…</p></main><script type="module">const app=document.querySelector('#app'),mode=new URLSearchParams(location.search).get('mode'),parents=${JSON.stringify([...PARENT_ORIGINS])};let channel='';const tell=(type,extra={})=>parent.postMessage({type,channel,...extra},eventOrigin);let eventOrigin='';function fail(message){app.replaceChildren(Object.assign(document.createElement('p'),{className:'state error',textContent:message}));if(eventOrigin)tell('remix:video-player-error',{message})}function trusted(e){return parents.includes(e.origin)&&e.source===parent&&typeof e.data?.channel==='string'&&e.data.channel.length>=20}function sourceAllowed(src,hls){try{const u=new URL(src);if(u.protocol!=='https:'||u.username||u.password)return false;return hls?u.origin==='https://api.mathremix.pro.vn'&&u.pathname.startsWith('/api/hls/'):true}catch{return false}}function watermark(value){const mark=Object.assign(document.createElement('span'),{className:'watermark',textContent:String(value||'Học viên AECK').slice(0,120)});app.append(mark);setInterval(()=>{mark.style.left=(8+Math.floor(Math.random()*62))+'%';mark.style.top=(8+Math.floor(Math.random()*62))+'%'},6500)}async function mount(data){if(mode==='youtube'){if(!/^[\\w-]{6,20}$/.test(data.videoId||''))return fail('Video không hợp lệ.');const f=document.createElement('iframe');f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';f.src='https://www.youtube-nocookie.com/embed/'+data.videoId+'?autoplay=0&start='+Math.max(0,Number(data.start)||0);app.replaceChildren(f);watermark(data.watermark);return}const hls=mode==='hls',src=typeof data.src==='string'?data.src:'';if(!sourceAllowed(src,hls))return fail('Nguồn phát không hợp lệ.');const video=document.createElement('video');video.controls=true;video.playsInline=true;video.referrerPolicy='no-referrer';video.addEventListener('error',()=>fail('Không thể phát video này.'));app.replaceChildren(video);watermark(data.watermark);if(hls&&!video.canPlayType('application/vnd.apple.mpegurl')){const {default:Hls}=await import('https://cdn.jsdelivr.net/npm/hls.js@1.6.13/+esm');if(!Hls.isSupported())return fail('Trình duyệt không hỗ trợ HLS.');const player=new Hls({enableWorker:true});player.loadSource(src);player.attachMedia(video)}else video.src=src}addEventListener('message',e=>{if(!trusted(e))return;if(e.data.type==='remix:viewer-init'){channel=e.data.channel;eventOrigin=e.origin;tell('remix:video-player-ready');return}if(!channel||e.data.channel!==channel||e.data.type!=='remix:set-video-source')return;void mount(e.data)});</script></html>`;

const PDF_VIEWER = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AECK PDF</title><style>html,body,#app{width:100%;height:100%;margin:0;background:#f3f4f6;color:#1f2937;font:14px Lato,Segoe UI,sans-serif}#app{display:grid;grid-template-rows:auto minmax(0,1fr)}header{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid #d1d5db}button{min-height:36px;padding:6px 10px;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#374151;font:inherit;font-weight:700}#title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#stage{overflow:auto;padding:16px;text-align:center}.page{display:block;max-width:100%;height:auto;margin:0 auto 16px;background:#fff;box-shadow:0 4px 18px #1118272b}.state{margin:auto;padding:20px;text-align:center}.error{color:#b91c1c}</style><main id="app"><header><strong id="title">Tài liệu PDF</strong><button id="download" hidden>Tải xuống</button></header><section id="stage"><p class="state">Đang chờ tài liệu…</p></section></main><script type="module">import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.mjs';pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.mjs';const parents=${JSON.stringify([...PARENT_ORIGINS])},stage=document.querySelector('#stage'),title=document.querySelector('#title'),download=document.querySelector('#download');let channel='',eventOrigin='',downloadAllowed=false;function trusted(e){return parents.includes(e.origin)&&e.source===parent&&typeof e.data?.channel==='string'&&e.data.channel.length>=20}function tell(type,extra={}){parent.postMessage({type,channel,...extra},eventOrigin)}function show(text,error=false){stage.replaceChildren(Object.assign(document.createElement('p'),{className:'state'+(error?' error':''),textContent:text}))}async function render(bytes){try{const doc=await pdfjs.getDocument({data:bytes}).promise,fragment=document.createDocumentFragment();for(let n=1;n<=doc.numPages;n+=1){const page=await doc.getPage(n),base=page.getViewport({scale:1}),scale=Math.max(.25,(stage.clientWidth-32)/base.width),view=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.className='page';canvas.width=Math.floor(view.width);canvas.height=Math.floor(view.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;fragment.append(canvas)}stage.replaceChildren(fragment)}catch{show('Không thể mở tài liệu PDF.',true)}}addEventListener('message',e=>{if(!trusted(e))return;if(e.data.type==='remix:viewer-init'){channel=e.data.channel;eventOrigin=e.origin;tell('remix:pdf-viewer-ready');return}if(!channel||e.data.channel!==channel||e.data.type!=='remix:set-pdf-source'||!(e.data.bytes instanceof ArrayBuffer))return;title.textContent=typeof e.data.title==='string'?e.data.title.slice(0,240):'Tài liệu PDF';downloadAllowed=e.data.allowDownload===true;download.hidden=!downloadAllowed;void render(new Uint8Array(e.data.bytes))});download.addEventListener('click',()=>{if(downloadAllowed)tell('remix:pdf-download-request')});addEventListener('message',e=>{if(e.origin!==eventOrigin||e.source!==parent||e.data?.channel!==channel||e.data?.type!=='remix:pdf-download-result')return;download.textContent=e.data.ok?'Đã tải':'Không thể tải';setTimeout(()=>download.textContent='Tải xuống',1800)});</script></html>`;

async function mediaResponse(request: Request, env: Env, key: string) {
  if (request.method === "HEAD") {
    const object = await env.MEDIA_BUCKET.head(key);
    if (!object) return missingResponse();
    const headers = responseHeaders(object);
    headers.set("content-length", String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const object = await env.MEDIA_BUCKET.get(key, {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (!object) return missingResponse();

  const headers = responseHeaders(object);
  if (!("body" in object)) {
    const notModified = request.headers.has("if-none-match") || request.headers.has("if-modified-since");
    return new Response(null, { status: notModified ? 304 : 412, headers });
  }

  const range = normalizedRange(object.range, object.size);
  if (range && request.headers.has("range")) {
    headers.set("content-length", String(range.length));
    headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...corsHeaders, allow: "GET, HEAD, OPTIONS" },
      });
    }
    if (url.pathname === "/" || url.pathname === "") {
      return new Response("REMIX Education media gateway", {
        status: 200,
        headers: {
          ...corsHeaders,
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      });
    }
    if (request.method === "GET" && url.pathname === "/viewer/video") return viewerResponse(VIDEO_VIEWER);
    if (request.method === "GET" && url.pathname === "/viewer/pdf") return viewerResponse(PDF_VIEWER);

    const key = publicObjectKey(url.pathname);
    if (!key) return missingResponse();

    try {
      return await mediaResponse(request, env, key);
    } catch (error) {
      console.error(JSON.stringify({
        event: "media_fetch_failed",
        method: request.method,
        pathname: url.pathname,
        error: error instanceof Error ? error.message : "unknown_error",
      }));
      return new Response("Unable to load media", {
        status: 500,
        headers: {
          ...corsHeaders,
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      });
    }
  },
} satisfies ExportedHandler<Env>;
