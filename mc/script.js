/* any-image：图片→方块拼贴图（前端版）
 * 依赖：
 *   - ./out_all_colours.json 颜色表（key 必须与 image.css 中类名一致）
 *   - ./image.css            每个方块类里有 background-image: url(data:...)
 * 建议通过本地服务器打开页面（如 python -m http.server）
 */

(function () {
  const el = (id)=>document.getElementById(id);
  const fileInput   = el('fileInput');
  const scaleInput  = el('scaleInput');
  const runBtn      = el('runBtn');
  const dlBtn       = el('downloadBtn');
  const canvas      = el('outCanvas');
  const pWrap       = el('progressWrap');
  const pBar        = el('progressBar');
  const pText       = el('progressText');

  const SIDE = 'top';
  const COLOR_SET = 'Linear Average';

  function colorDiffAbs(pix, col){
    const r=Math.abs((pix[0]|0)-(col[0]|0));
    const g=Math.abs((pix[1]|0)-(col[1]|0));
    const b=Math.abs((pix[2]|0)-(col[2]|0));
    const a=Math.abs(((pix[3]??255)|0)-((col[3]??255)|0));
    return r+g+b+a;
  }

  async function loadColours(){
    const res = await fetch('./out_all_colours.json');
    if(!res.ok) throw new Error('out_all_colours.json 加载失败');
    const obj = await res.json();
    return Object.entries(obj).map(([key, sides]) => ({key, sides}));
  }

  function loadTexturesFromCSS(){
    const textures = new Map();
    for(const sheet of document.styleSheets){
      let rules; try{ rules=sheet.cssRules; }catch{ continue; }
      if(!rules) continue;
      for(const rule of rules){
        if(!(rule.selectorText && rule.style && rule.style.backgroundImage)) continue;
        const sel = rule.selectorText.trim();
        if(!sel.startsWith('.')) continue;
        const m = rule.style.backgroundImage.match(/url\(['"]?(data:[^'")]+)['"]?\)/i);
        if(!m) continue;
        const className = sel.slice(1).split(/[ ,:.#\[]/,1)[0];
        const url = m[1];
        const img = new Image();
        img.src = url;
        textures.set(className, img);
      }
    }
    return textures;
  }

  function waitImagesReady(images){
    const tasks=[];
    for(const img of images){
      if(img.complete && img.naturalWidth) continue;
      tasks.push(new Promise((res,rej)=>{ img.onload=()=>res(); img.onerror=()=>rej(new Error('贴图解码失败')); }));
    }
    return Promise.all(tasks);
  }

  function readFileAsImage(file){
    return new Promise((resolve,reject)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = ()=>resolve(img);
      img.onerror = ()=>reject(new Error('图片读取失败'));
      img.src = url;
    });
  }

  function downsampleToPixels(img, tileStep){
    const w2 = Math.ceil(img.width / tileStep);
    const h2 = Math.ceil(img.height / tileStep);
    const cnv = document.createElement('canvas');
    cnv.width = w2; cnv.height = h2;
    const ctx = cnv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w2, h2);
    const data = ctx.getImageData(0, 0, w2, h2).data;
    return {w:w2, h:h2, data};
  }

  // 进度条与时间
  function fmtTime(ms){
    const s = Math.max(0, Math.round(ms/1000));
    const mm = String(Math.floor(s/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    return `${mm}:${ss}`;
  }
  function setProgress(done, total, startTs){
    const pct = total? (done/total)*100 : 0;
    pBar.style.width = `${Math.min(100, pct)}%`;
    const elapsed = performance.now() - startTs;
    const eta = (done>0) ? elapsed*(total-done)/done : 0;
    pText.textContent = `进度 ${Math.floor(pct)}% ｜ 已用 ${fmtTime(elapsed)} ｜ 剩余 ${fmtTime(eta)}`;
  }

  async function run(){
    const file = fileInput.files && fileInput.files[0];
    if(!file) return;

    dlBtn.disabled = true;
    pWrap.style.display = 'block';
    setProgress(0,1,performance.now()); // 初始化可见

    const startTs = performance.now();
    const [blocksList, textures] = await Promise.all([loadColours(), Promise.resolve(loadTexturesFromCSS())]);

    const entries = [];
    for(const b of blocksList){
      const side = b.sides[SIDE];
      if(!side || !side.color || !side.color[COLOR_SET]) continue;
      const img = textures.get(b.key);
      if(!img) continue;
      entries.push({ key: b.key, color: side.color[COLOR_SET], img });
    }
    await waitImagesReady(entries.map(e=>e.img));

    let scale = parseFloat(scaleInput.value);
    if(!(scale>0)) scale = 4;
    const tileStep = Math.max(1, Math.round(16/scale));

    const src = await readFileAsImage(file);
    const {w:gridW, h:gridH, data} = downsampleToPixels(src, tileStep);

    canvas.width = gridW*16;
    canvas.height = gridH*16;
    const ctx = canvas.getContext('2d');

    // 逐像素映射
    const total = gridW*gridH;
    let done = 0;
    const pickBlock = (r,g,b,a)=>{
      let best=1e15, bestIdx=-1;
      for(let i=0;i<entries.length;i++){
        const d = colorDiffAbs([r,g,b,a], entries[i].color);
        if(d<best){ best=d; bestIdx=i; }
      }
      return entries[bestIdx];
    };

    ctx.clearRect(0,0,canvas.width,canvas.height);
    let p=0, nextUpdate=0;

    for(let y=0; y<gridH; y++){
      for(let x=0; x<gridW; x++){
        const r=data[p++], g=data[p++], b=data[p++], a=data[p++];
        if(a>10){
          const e = pickBlock(r,g,b,a);
          if(e) ctx.drawImage(e.img, x*16, y*16, 16, 16);
        }
        done++;
        // 每处理一定数量再刷新一次进度，减少重排
        if(done>=nextUpdate){
          setProgress(done, total, startTs);
          nextUpdate = done + Math.max(200, Math.floor(total/200)); // ~200 次更新
        }
      }
    }
    setProgress(total, total, startTs);

    dlBtn.disabled = false;
  }

  function downloadPNG(){
    canvas.toBlob((blob)=>{
      if(!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'any-image.png';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  runBtn.addEventListener('click', ()=>run().catch(console.error));
  dlBtn.addEventListener('click', downloadPNG);
})();
