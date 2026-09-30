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
  let renderMode = 'png';
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
      target.width = width;
      target.height = height;
    }catch{
      throw new Error('无法分配画布内存');
    }
    const ctx = target.getContext('2d',contextOptions);
    if(!ctx) throw new Error('无法创建画布上下文');
    return ctx;
  }

  async function zip64(entries){
    const encoder = new TextEncoder();
    const crcTable = new Uint32Array(256);
    for(let n=0;n<256;n++){
      let c=n;
      for(let k=0;k<8;k++) c=(c&1) ? 0xedb88320^(c>>>1) : c>>>1;
      crcTable[n]=c>>>0;
    }
    const crcFor = async blob=>{
      let crc=0xffffffff;
      const consume=async bytes=>{
        for(let i=0;i<bytes.length;i++) crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
        await yieldToBrowser();
      };
      if(blob.stream){
        const stream=blob.stream().getReader();
        while(true){
          if(cancelFlag){ stream.cancel(); throw new Error('已停止'); }
          const {done,value}=await stream.read();
          if(done) break;
          await consume(value);
        }
      }else{
        const bytes=new Uint8Array(await blob.arrayBuffer());
        for(let offset=0;offset<bytes.length;offset+=256*1024){
          if(cancelFlag) throw new Error('已停止');
          await consume(bytes.subarray(offset,Math.min(bytes.length,offset+256*1024)));
        }
      }
      return (crc^0xffffffff)>>>0;
    };
    const header=(size)=>new Uint8Array(size);
    const write16=(view,offset,value)=>view.setUint16(offset,value,true);
    const write32=(view,offset,value)=>view.setUint32(offset,value>>>0,true);
    const write64=(view,offset,value)=>{
      const number=Number(value);
      write32(view,offset,number%0x100000000);
      write32(view,offset+4,Math.floor(number/0x100000000));
    };
    const parts=[];
    const central=[];
    let offset=0;
    const now=new Date();
    const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
    const dosDate=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();

    for(const entry of entries){
      if(cancelFlag) throw new Error('已停止');
      const name=encoder.encode(entry.name);
      const size=entry.blob.size;
      const crc=await crcFor(entry.blob);
      const local=header(30+name.length+20);
      const lv=new DataView(local.buffer);
      write32(lv,0,0x04034b50); write16(lv,4,45); write16(lv,6,0x800); write16(lv,8,0);
      write16(lv,10,dosTime); write16(lv,12,dosDate); write32(lv,14,crc);
      write32(lv,18,0xffffffff); write32(lv,22,0xffffffff); write16(lv,26,name.length); write16(lv,28,20);
      local.set(name,30); write16(lv,30+name.length,0x0001); write16(lv,32+name.length,16);
      write64(lv,34+name.length,size); write64(lv,42+name.length,size);
      parts.push(local,entry.blob);

      const record=header(46+name.length+28);
      const cv=new DataView(record.buffer);
      write32(cv,0,0x02014b50); write16(cv,4,45); write16(cv,6,45); write16(cv,8,0x800); write16(cv,10,0);
      write16(cv,12,dosTime); write16(cv,14,dosDate); write32(cv,16,crc);
      write32(cv,20,0xffffffff); write32(cv,24,0xffffffff); write16(cv,28,name.length); write16(cv,30,28);
      write16(cv,32,0); write16(cv,34,0); write16(cv,36,0); write32(cv,38,0); write32(cv,42,0xffffffff);
      record.set(name,46); write16(cv,46+name.length,0x0001); write16(cv,48+name.length,24);
      write64(cv,50+name.length,size); write64(cv,58+name.length,size); write64(cv,66+name.length,offset);
      central.push(record);
      offset+=local.length+size;
      pText.textContent=`正在打包 ZIP：${central.length}/${entries.length} 块`;
    }

    const centralOffset=offset;
    for(const record of central){ parts.push(record); offset+=record.length; }
    const centralSize=offset-centralOffset;
    const zip64End=header(56); const zv=new DataView(zip64End.buffer);
    write32(zv,0,0x06064b50); write64(zv,4,44); write16(zv,12,45); write16(zv,14,45);
    write32(zv,16,0); write32(zv,20,0); write64(zv,24,entries.length); write64(zv,32,entries.length);
    write64(zv,40,centralSize); write64(zv,48,centralOffset); parts.push(zip64End);
    const locator=header(20); const zv2=new DataView(locator.buffer);
    write32(zv2,0,0x07064b50); write32(zv2,4,0); write64(zv2,8,offset); write32(zv2,16,1); parts.push(locator);
    const end=header(22); const ev=new DataView(end.buffer);
    write32(ev,0,0x06054b50); write16(ev,4,0); write16(ev,6,0); write16(ev,8,0xffff); write16(ev,10,0xffff);
    write32(ev,12,0xffffffff); write32(ev,16,0xffffffff); write16(ev,20,0); parts.push(end);
    return new Blob(parts,{type:'application/zip'});
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
      const singlePixelBudget=mobile || memoryGb<=2 ? 2_000_000 : memoryGb<=4 ? 4_000_000 : 8_000_000;
      const singleMaxSide=mobile || memoryGb<=2 ? 4096 : memoryGb<=4 ? 8192 : 16384;
      const singleImage=outW<=singleMaxSide && outH<=singleMaxSide && outW*outH<=singlePixelBudget;
      const preview=singleImage ? null : setPreviewSize(outW,outH);
      if(singleImage){
        const ctx=setCanvasSize(canvas,outW,outH);
        ctx.clearRect(0,0,outW,outH);
      }

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
        renderMode='png';
      }else{
        renderMode='zip';
        const cellsPerChunk=(mobile || memoryGb<=2) ? 64 : 128;
        const chunkCanvas=document.createElement('canvas');
        const inputCanvas=document.createElement('canvas');
        const chunkEntries=[];
        const chunkRows=Math.ceil(gridH/cellsPerChunk), chunkCols=Math.ceil(gridW/cellsPerChunk);
        for(let cy=0;cy<chunkRows && !cancelFlag;cy++){
          for(let cx=0;cx<chunkCols && !cancelFlag;cx++){
            const x0=cx*cellsPerChunk, y0=cy*cellsPerChunk;
            const cw=Math.min(cellsPerChunk,gridW-x0), ch=Math.min(cellsPerChunk,gridH-y0);
            const inCtx=setCanvasSize(inputCanvas,cw,ch,{willReadFrequently:true});
            inCtx.imageSmoothingEnabled=true;
            inCtx.drawImage(srcImg,x0*srcImg.width/gridW,y0*srcImg.height/gridH,cw*srcImg.width/gridW,ch*srcImg.height/gridH,0,0,cw,ch);
            const data=inCtx.getImageData(0,0,cw,ch).data;
            const outCtx=setCanvasSize(chunkCanvas,cw*16,ch*16);
            outCtx.clearRect(0,0,cw*16,ch*16);
            await paintTiles(preview.ctx,preview.scale,data,cw,x0,y0,cw,ch,entries,outCtx,0,0,updateCellProgress);
            if(cancelFlag) break;
            const blob=await canvasBlob(chunkCanvas);
            const suffix=(n)=>String(n).padStart(5,'0');
            chunkEntries.push({name:`tiles/y${suffix(cy)}_x${suffix(cx)}.png`,blob});
            chunkCanvas.width=0; chunkCanvas.height=0;
            inputCanvas.width=0; inputCanvas.height=0;
            await yieldToBrowser();
          }
        }
        if(cancelFlag){ pText.textContent='已停止'; return; }
        const manifest={
          format:'mc-tile-map-chunks-v1',
          output:{width:outW,height:outH},
          tilePixels:16,
          chunkTiles:cellsPerChunk,
          grid:{width:gridW,height:gridH},
          chunks:{rows:chunkRows,columns:chunkCols,pathPattern:'tiles/y{row}_x{column}.png',indexPadding:5}
        };
        chunkEntries.push({name:'manifest.json',blob:new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'})});
        const zip=await zip64(chunkEntries);
        lastOutputBlob=zip;
      }

      if(cancelFlag){ pText.textContent='已停止'; return; }
      setProgress(total,total,startTs,gridW,gridH);
      hasCompletedRender=true;
      dlBtn.textContent=renderMode==='zip'?'重新下载 ZIP':'下载 PNG';
    }finally{
      setRunningUI(false);
    }
  }

  function stop(){
    cancelFlag = true;
  }

  function downloadPNG(){
    const base = (lastInputFileName || 'image').replace(/\.[^.]+$/,'');
    if(renderMode==='zip'){
      if(lastOutputBlob) downloadBlob(lastOutputBlob,`${base}_${makeStamp()}_tiles.zip`);
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
