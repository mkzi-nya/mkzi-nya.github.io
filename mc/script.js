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
  const MAX_PREVIEW_SIDE = 1024;

  const SIDE = 'top';
  const COLOR_SET = 'Linear Average';

  let cancelFlag = false;
  let lastInputImage = null;        // Image 对象
  let lastInputFileName = '';       // 原始文件名（用于下载命名）
  let lastComputedOut = { w:0, h:0 };
  let hasCompletedRender = false;
  let lastOutputBlob = null;

  function fmtTime(ms){
    const s = Math.max(0, Math.round(ms/1000));
    const hh = Math.floor(s/3600);
    const mm = Math.floor((s%3600)/60);
    const ss = s%60;
    return (hh>0 ? String(hh).padStart(2,'0')+':' : '') +
           String(mm).padStart(2,'0')+':' +
           String(ss).padStart(2,'0');
  }

  function setProgress(done, total, startTs, gridW, gridH){
    const pct = total ? (done/total)*100 : 0;
    pBar.style.width = `${Math.min(100, pct)}%`;
    const elapsed = performance.now() - startTs;
    const eta = done > 0 ? elapsed*(total-done)/done : 0;
    const rowsDone = gridW ? Math.min(gridH, Math.floor(done/gridW)) : 0;
    pText.textContent =
      `进度 ${Math.floor(pct)}% ｜ 已用 ${fmtTime(elapsed)} ｜ 剩余 ${fmtTime(eta)} ｜ 方块 ${done}/${total} ｜ 行 ${rowsDone}/${gridH}`;
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
      if(img.complete){
        if(!img.naturalWidth) return Promise.reject(new Error('贴图解码失败'));
        continue;
      }
      tasks.push(new Promise((res,rej)=>{ img.onload=()=>res(); img.onerror=()=>rej(new Error('贴图解码失败')); }));
    }
    return Promise.all(tasks);
  }

  function readFileAsImage(file){
    return new Promise((resolve,reject)=>{
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = ()=>{ URL.revokeObjectURL(url); resolve(img); };
      img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
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

  function invalidateOutput(){
    hasCompletedRender=false;
    lastOutputBlob=null;
    dlBtn.disabled=true;
    dlBtn.textContent='下载';
  }

  // 选择文件后：读原图并显示分辨率
  fileInput.addEventListener('change', async ()=>{
    invalidateOutput();
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
  scaleInput.addEventListener('input', ()=>{
    invalidateOutput();
    updateResLabels();
  });

  function setRunningUI(running){
    fileInput.disabled = running;
    scaleInput.disabled = running;
    runBtn.disabled = running;
    stopBtn.disabled = !running;
    dlBtn.disabled = running || !hasCompletedRender;
    pWrap.style.display = 'block';
  }

  function pickBlock(r, g, b, a, entries){
    let best = Infinity;
    let bestEntry = null;
    for(let i=0; i<entries.length; i++){
      const c = entries[i].color;
      const d = Math.abs(r-c[0]) + Math.abs(g-c[1]) + Math.abs(b-c[2]) + Math.abs(a-(c[3] ?? 255));
      if(d < best){ best = d; bestEntry = entries[i]; }
    }
    return bestEntry;
  }

  function yieldToBrowser(){
    return new Promise(resolve=>setTimeout(resolve, 0));
  }

  function canvasBlob(target){
    return new Promise((resolve, reject)=>target.toBlob(blob=>blob ? resolve(blob) : reject(new Error('PNG 编码失败，可能是设备内存不足')),'image/png'));
  }

  function makeStamp(){
    const ts = new Date();
    const pad = n=>String(n).padStart(2,'0');
    return `${String(ts.getFullYear()).slice(2)}_${pad(ts.getMonth()+1)}_${pad(ts.getDate())}-${pad(ts.getHours())}_${pad(ts.getMinutes())}_${pad(ts.getSeconds())}`;
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 60_000);
  }

  function setCanvasSize(target, width, height, contextOptions){
    try{
      if(target.width!==width) target.width=width;
      if(target.height!==height) target.height=height;
    }catch{
      throw new Error('无法分配画布内存');
    }
    const ctx = target.getContext('2d',contextOptions);
    if(!ctx) throw new Error('无法创建画布上下文');
    return ctx;
  }

  function createPngEncoder(width, height){
    const crcTable = new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++) c=(c&1) ? 0xedb88320^(c>>>1) : c>>>1;
      crcTable[n]=c>>>0;
    }
    const crcFor = (first,second)=>{
      let crc=0xffffffff;
      for(const bytes of [first,second]){
        for(let i=0;i<bytes.length;i++) crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
      }
      return (crc^0xffffffff)>>>0;
    };
    const chunk=(type,data)=>{
      const name=new TextEncoder().encode(type);
      const header=new Uint8Array(8);
      new DataView(header.buffer).setUint32(0,data.length);
      header.set(name,4);
      const footer=new Uint8Array(4);
      new DataView(footer.buffer).setUint32(0,crcFor(name,data));
      return [header,data,footer];
    };
    const ihdr=new Uint8Array(13);
    const view=new DataView(ihdr.buffer);
    view.setUint32(0,width); view.setUint32(4,height);
    ihdr[8]=8; ihdr[9]=6;
    const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),...chunk('IHDR',ihdr)];
    let writeCompressed, finishCompressed, abortCompressed;
    if(typeof CompressionStream !== 'undefined'){
      const stream=new CompressionStream('deflate');
      const writer=stream.writable.getWriter();
      const pump=(async()=>{
        const reader=stream.readable.getReader();
        while(true){
          const {done,value}=await reader.read();
          if(done) break;
          parts.push(...chunk('IDAT',value));
        }
      })();
      writeCompressed=bytes=>writer.write(bytes);
      finishCompressed=async()=>{ await writer.close(); await pump; };
      abortCompressed=async()=>{ await writer.abort(new Error('已停止')).catch(()=>{}); await pump.catch(()=>{}); };
    }else{
      // 老浏览器没有 CompressionStream 时，使用 zlib 的无压缩块保持单张 PNG 可用。
      parts.push(...chunk('IDAT',new Uint8Array([0x78,0x01])));
      let adlerA=1, adlerB=0;
      writeCompressed=async bytes=>{
        for(let pos=0;pos<bytes.length;pos+=65535){
          const data=bytes.subarray(pos,Math.min(pos+65535,bytes.length));
          const block=new Uint8Array(5+data.length);
          const length=data.length;
          block[1]=length&255; block[2]=length>>>8;
          block[3]=~length&255; block[4]=(~length>>>8)&255;
          block.set(data,5);
          for(let i=0;i<length;i++){
            adlerA+=data[i];
            adlerB+=adlerA;
          }
          adlerA%=65521;
          adlerB%=65521;
          parts.push(...chunk('IDAT',block));
        }
      };
      finishCompressed=async()=>{
        const end=new Uint8Array([1,0,0,255,255,adlerB>>>8,adlerB&255,adlerA>>>8,adlerA&255]);
        parts.push(...chunk('IDAT',end));
      };
      abortCompressed=async()=>{};
    }
    let buffer=new Uint8Array(256*1024), used=0;
    async function append(bytes){
      for(let pos=0;pos<bytes.length;){
        const count=Math.min(buffer.length-used,bytes.length-pos);
        buffer.set(bytes.subarray(pos,pos+count),used);
        used+=count; pos+=count;
        if(used===buffer.length){
          await writeCompressed(buffer);
          buffer=new Uint8Array(256*1024); used=0;
        }
      }
    }
    return {
      append,
      async finish(){
        if(used) await writeCompressed(buffer.subarray(0,used));
        await finishCompressed();
        parts.push(...chunk('IEND',new Uint8Array(0)));
        return new Blob(parts,{type:'image/png'});
      },
      async abort(){
        await abortCompressed();
      }
    };
  }

  function setPreviewSize(outW,outH){
    const factor=Math.min(1,MAX_PREVIEW_SIDE/outW,MAX_PREVIEW_SIDE/outH);
    const w=Math.max(1,Math.round(outW*factor));
    const h=Math.max(1,Math.round(outH*factor));
    const ctx=setCanvasSize(canvas,w,h);
    ctx.clearRect(0,0,w,h);
    ctx.imageSmoothingEnabled=false;
    return {ctx,scale:factor};
  }

  async function paintTiles(ctx, scale, data, gridW, startX, startY, width, height, entries, target, targetX, targetY, onCell){
    let sliceStart=performance.now();
    for(let y=0;y<height;y++){
      for(let x=0;x<width;x++){
        if(cancelFlag) return;
        const globalX=startX+x, globalY=startY+y;
        const p=(y*gridW+x)*4;
        const a=data[p+3];
        if(a>10){
          const entry=pickBlock(data[p],data[p+1],data[p+2],a,entries);
          if(entry){
            target.drawImage(entry.img,targetX+x*16,targetY+y*16,16,16);
            if(ctx) ctx.drawImage(entry.img,globalX*16*scale,globalY*16*scale,16*scale,16*scale);
          }
        }
        onCell();
        if(((y*width+x)&31)===31 && performance.now()-sliceStart>=6){
          await yieldToBrowser();
          sliceStart=performance.now();
        }
      }
    }
  }

  async function run(){
    const f = fileInput.files && fileInput.files[0];
    if(!f){ alert('请选择图片'); return; }
    cancelFlag=false;
    hasCompletedRender=false;
    lastOutputBlob=null;
    dlBtn.textContent='下载';
    setRunningUI(true);
    const startTs=performance.now();
    let done=0, lastProgressAt=0;
    try{
      const [blocksList,textures]=await Promise.all([loadColours(),Promise.resolve(loadTexturesFromCSS())]);
      const entries=[];
      for(const b of blocksList){
        const side=b.sides[SIDE];
        if(!side || !side.color || !side.color[COLOR_SET]) continue;
        const img=textures.get(b.key);
        if(img) entries.push({key:b.key,color:side.color[COLOR_SET],img});
      }
      if(!entries.length) throw new Error('没有可用的方块贴图');
      await waitImagesReady(entries.map(e=>e.img));

      const srcImg=lastInputImage || await readFileAsImage(f);
      lastInputImage=srcImg;
      lastInputFileName=f.name || 'image';
      updateResLabels();
      const tileStep=tileFromScale(getScale());
      const gridW=Math.ceil(srcImg.width/tileStep), gridH=Math.ceil(srcImg.height/tileStep);
      const outW=gridW*16, outH=gridH*16, total=gridW*gridH;
      if(!Number.isSafeInteger(total) || !Number.isSafeInteger(outW*outH)) throw new Error('输入图尺寸超出浏览器可表示范围');
      const mobile=navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const memoryGb=navigator.deviceMemory || 2;
      const singlePixelBudget=mobile || memoryGb<=2 ? 3_000_000 : memoryGb<=4 ? 4_000_000 : 8_000_000;
      const singleMaxSide=mobile || memoryGb<=2 ? 4096 : memoryGb<=4 ? 8192 : 16384;
      let singleImage=outW<=singleMaxSide && outH<=singleMaxSide && outW*outH<=singlePixelBudget;
      if(singleImage){
        try{
          const ctx=setCanvasSize(canvas,outW,outH);
          ctx.clearRect(0,0,outW,outH);
        }catch{
          singleImage=false;
        }
      }
      const preview=singleImage ? null : setPreviewSize(outW,outH);

      setProgress(0,total,startTs,gridW,gridH);
      const updateCellProgress=()=>{
        done++;
        const now=performance.now();
        if(now-lastProgressAt>=120 || done===total){
          setProgress(done,total,startTs,gridW,gridH);
          lastProgressAt=now;
        }
      };

      if(singleImage){
        const {data}=downsampleToPixels(srcImg,tileStep);
        const ctx=canvas.getContext('2d');
        await paintTiles(null,1,data,gridW,0,0,gridW,gridH,entries,ctx,0,0,updateCellProgress);
      }else{
        const cellsPerChunk=(mobile || memoryGb<=2) ? 64 : 128;
        const inputCanvas=document.createElement('canvas');
        const textureCanvas=document.createElement('canvas');
        const textureCtx=setCanvasSize(textureCanvas,16,16,{willReadFrequently:true});
        for(const entry of entries){
          textureCtx.clearRect(0,0,16,16);
          textureCtx.drawImage(entry.img,0,0,16,16);
          entry.pixels=textureCtx.getImageData(0,0,16,16).data;
        }
        textureCanvas.width=0;
        const encoder=createPngEncoder(outW,outH);
        try{
          let lastYieldAt=performance.now();
          for(let y=0;y<gridH;y++){
            const selected=new Array(gridW);
            for(let x0=0;x0<gridW;x0+=cellsPerChunk){
              if(cancelFlag) throw new Error('已停止');
              const cw=Math.min(cellsPerChunk,gridW-x0);
              const inCtx=setCanvasSize(inputCanvas,cw,1,{willReadFrequently:true});
              inCtx.clearRect(0,0,cw,1);
              inCtx.imageSmoothingEnabled=true;
              inCtx.drawImage(srcImg,x0*srcImg.width/gridW,y*srcImg.height/gridH,cw*srcImg.width/gridW,srcImg.height/gridH,0,0,cw,1);
              const data=inCtx.getImageData(0,0,cw,1).data;
              for(let x=0;x<cw;x++){
                const p=x*4, a=data[p+3];
                const entry=a>10 ? pickBlock(data[p],data[p+1],data[p+2],a,entries) : null;
                selected[x0+x]=entry;
                if(entry) preview.ctx.drawImage(entry.img,(x0+x)*16*preview.scale,y*16*preview.scale,16*preview.scale,16*preview.scale);
                updateCellProgress();
              }
              if(performance.now()-lastYieldAt>=12){
                await yieldToBrowser();
                lastYieldAt=performance.now();
              }
            }
            for(let py=0;py<16;py++){
              if(cancelFlag) throw new Error('已停止');
              await encoder.append(new Uint8Array([0])); // PNG 滤镜 0：每一行的首字节
              for(let x0=0;x0<gridW;x0+=cellsPerChunk){
                const cw=Math.min(cellsPerChunk,gridW-x0);
                const pixels=new Uint8Array(cw*16*4);
                for(let x=0;x<cw;x++){
                  const entry=selected[x0+x];
                  if(entry) pixels.set(entry.pixels.subarray(py*64,py*64+64),x*64);
                }
                await encoder.append(pixels);
              }
            }
            if((y&7)===7) await yieldToBrowser();
          }
          inputCanvas.width=0;
          pText.textContent='正在完成单张 PNG 编码…';
          lastOutputBlob=await encoder.finish();
        }catch(e){
          await encoder.abort();
          throw e;
        }
      }

      if(cancelFlag){ pText.textContent='已停止'; return; }
      setProgress(total,total,startTs,gridW,gridH);
      hasCompletedRender=true;
      dlBtn.textContent='下载 PNG';
    }finally{
      setRunningUI(false);
    }
  }

  function stop(){
    cancelFlag = true;
  }

  function downloadPNG(){
    const base = (lastInputFileName || 'image').replace(/\.[^.]+$/,'');
    if(lastOutputBlob){
      downloadBlob(lastOutputBlob,`${base}_${makeStamp()}.png`);
      return;
    }
    canvasBlob(canvas).then(blob=>downloadBlob(blob,`${base}_${makeStamp()}.png`)).catch(e=>{
      pText.textContent='下载失败：'+e.message;
    });
  }

  runBtn.addEventListener('click', ()=>run().catch(e=>{
    console.error(e);
    pText.textContent = cancelFlag ? '已停止' : '出错：' + (e?.message || e);
    setRunningUI(false);
  }));
  stopBtn.addEventListener('click', stop);
  dlBtn.addEventListener('click', downloadPNG);
})();
