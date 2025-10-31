/* any-image：图片→方块拼贴图（前端版）
 * 需要：
 *   - ./out_all_colours.json：颜色表（key 与 image.css 的类名一致）
 *   - ./image.css：每个方块类里有 background-image: url(data:...)
 * 建议用本地服务器打开（例如：python -m http.server）
 */

(function () {
  const el = (id)=>document.getElementById(id);
  const fileInput   = el('fileInput');
  const scaleInput  = el('scaleInput');
  const runBtn      = el('runBtn');
  const stopBtn     = el('stopBtn');
  const dlBtn       = el('downloadBtn');
  const canvas      = el('outCanvas');
  const pWrap       = el('progressWrap');
  const pBar        = el('progressBar');
  const pText       = el('progressText');
  const origResEl   = el('origRes');
  const outResEl    = el('outRes');

  const SIDE = 'top';
  const COLOR_SET = 'Linear Average';

  let cancelFlag = false;
  let lastInputImage = null;        // Image 对象
  let lastInputFileName = '';       // 原始文件名（用于下载命名）
  let lastComputedOut = { w:0, h:0 };

  function fmtTime(ms){
    const s = Math.max(0, Math.round(ms/1000));
    const hh = Math.floor(s/3600);
    const mm = Math.floor((s%3600)/60);
    const ss = s%60;
    return (hh>0 ? String(hh).padStart(2,'0')+':' : '') +
           String(mm).padStart(2,'0')+':' +
           String(ss).padStart(2,'0');
  }

  function setProgress(colsDone, colsTotal, startTs, rowsDone, rowsTotal){
    const pct = colsTotal ? (colsDone/colsTotal)*100 : 0;
    pBar.style.width = `${Math.min(100, pct)}%`;
    const elapsed = performance.now() - startTs;
    const eta = (colsDone>0) ? elapsed*(colsTotal-colsDone)/colsDone : 0;
    const rowInfo = (rowsDone!=null && rowsTotal!=null)
      ? `｜行 ${rowsDone}/${rowsTotal}` : '';
    pText.textContent =
      `进度 ${Math.floor(pct)}% ｜ 已用 ${fmtTime(elapsed)} ｜ 剩余 ${fmtTime(eta)} ｜ 列 ${colsDone}/${colsTotal}${rowInfo}`;
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

  function colorDiffAbs(pix, col){
    const r=Math.abs((pix[0]|0)-(col[0]|0));
    const g=Math.abs((pix[1]|0)-(col[1]|0));
    const b=Math.abs((pix[2]|0)-(col[2]|0));
    const a=Math.abs(((pix[3]??255)|0)-((col[3]??255)|0));
    return r+g+b+a;
  }

  function getScale(){
    let s = parseFloat(scaleInput.value);
    if(!(s>0)) s = 4;
    return s;
  }

  function tileFromScale(scale){
    return Math.max(1, Math.round(16/scale));
  }

  function updateResLabels(){
    if(!lastInputImage){
      origResEl.textContent = '原图：-';
      outResEl.textContent  = '输出：-';
      return;
    }
    const scale = getScale();
    const tileStep = tileFromScale(scale);
    const gridW = Math.ceil(lastInputImage.width / tileStep);
    const gridH = Math.ceil(lastInputImage.height / tileStep);
    const outW = gridW * 16;
    const outH = gridH * 16;
    lastComputedOut = { w: outW, h: outH };
    origResEl.textContent = `原图：${lastInputImage.width}×${lastInputImage.height}`;
    outResEl .textContent = `输出：${outW}×${outH}`;
  }

  // 选择文件后：读原图并显示分辨率
  fileInput.addEventListener('change', async ()=>{
    const f = fileInput.files && fileInput.files[0];
    if(!f){ lastInputImage=null; lastInputFileName=''; updateResLabels(); return; }
    try{
      lastInputImage = await readFileAsImage(f);
      lastInputFileName = f.name || 'image';
      updateResLabels();
    }catch(e){
      console.error(e);
      lastInputImage=null; lastInputFileName='';
      updateResLabels();
    }
  });

  // 倍数变化时，实时更新“输出分辨率”
  scaleInput.addEventListener('input', updateResLabels);

  function setRunningUI(running){
    fileInput.disabled = running;
    scaleInput.disabled = running;
    runBtn.disabled = running;
    stopBtn.disabled = !running;
    dlBtn.disabled = running; // 运行中不允许下载
    pWrap.style.display = 'block';
  }

  async function run(){
    const f = fileInput.files && fileInput.files[0];
    if(!f){ alert('请选择图片'); return; }

    // 预加载色板与贴图
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

    // 读取输入图
    const srcImg = lastInputImage || await readFileAsImage(f);
    lastInputImage = srcImg;
    lastInputFileName = f.name || 'image';
    updateResLabels();

    // 参数
    const scale = getScale();
    const tileStep = tileFromScale(scale);

    // 生成低分辨率网格像素
    const {w:gridW, h:gridH, data} = downsampleToPixels(srcImg, tileStep);

    // 画布尺寸（输出分辨率）
    const outW = gridW * 16;
    const outH = gridH * 16;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,outW,outH);

    // 进度初始化
    cancelFlag = false;
    setRunningUI(true);
    setProgress(0, gridW, performance.now()); // 列进度（外层循环按列）
    const startTs = performance.now();

    // 颜色匹配函数
    const pickBlock = (r,g,b,a)=>{
      let best=1e15, bestIdx=-1;
      for(let i=0;i<entries.length;i++){
        const d = colorDiffAbs([r,g,b,a], entries[i].color);
        if(d<best){ best=d; bestIdx=i; }
      }
      return entries[bestIdx];
    };

    // ====== 遍历顺序：按列（外层 x，内层 y）======
    // 这样“每完成一列”就刷新一次进度（如需改为“每行”，把两层循环互换）
    let colsDone = 0;
    const colsTotal = gridW;

    // data 的像素索引辅助
    const idx = (x,y)=> (y*gridW + x) * 4;

    outer:
    for(let x=0; x<gridW; x++){
      if(cancelFlag) break outer;
      for(let y=0; y<gridH; y++){
        if(cancelFlag) break outer;
        const p = idx(x,y);
        const r=data[p], g=data[p+1], b=data[p+2], a=data[p+3];
        if(a>10){
          const e = pickBlock(r,g,b,a);
          if(e) ctx.drawImage(e.img, x*16, y*16, 16, 16);
        }
      }
      colsDone++;
      setProgress(colsDone, colsTotal, startTs, null, null); // 列进度显示
      // 小让步给 UI
      if (x % 8 === 0) await new Promise(r=>setTimeout(r,0));
    }

    if(cancelFlag){
      pText.textContent = '已停止';
      setRunningUI(false);
      return;
    }

    setProgress(colsTotal, colsTotal, startTs);
    setRunningUI(false);
    dlBtn.disabled = false;
  }

  function stop(){
    cancelFlag = true;
  }

  function downloadPNG(){
    const base = (lastInputFileName || 'image').replace(/\.[^.]+$/,'');
    const ts = new Date();
    const pad = (n)=>String(n).padStart(2,'0');
    const stamp = `${String(ts.getFullYear()).slice(2)}_${pad(ts.getMonth()+1)}_${pad(ts.getDate())}-${pad(ts.getHours())}_${pad(ts.getMinutes())}_${pad(ts.getSeconds())}`;
    const fname = `${base}_${stamp}.png`;

    canvas.toBlob((blob)=>{
      if(!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  runBtn.addEventListener('click', ()=>run().catch(e=>{
    console.error(e);
    pText.textContent = '出错：' + (e?.message || e);
    setRunningUI(false);
  }));
  stopBtn.addEventListener('click', stop);
  dlBtn.addEventListener('click', downloadPNG);
})();
