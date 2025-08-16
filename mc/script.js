/* 优化版：图片→方块拼贴图（支持大图片处理） */
(function () {
  const el = (id) => document.getElementById(id);
  const fileInput = el('fileInput');
  const scaleInput = el('scaleInput');
  const runBtn = el('runBtn');
  const pauseBtn = el('pauseBtn');
  const dlBtn = el('downloadBtn');
  const previewImg = el('previewImg');
  const previewStatus = el('previewStatus');
  const pWrap = el('progressWrap');
  const pBar = el('progressBar');
  const pText = el('progressText');
  const origResEl = el('origRes');
  const outResEl = el('outRes');
  const statusText = el('statusText');

  const SIDE = 'top';
  const COLOR_SET = 'Linear Average';
  const TILE_SIZE = 256; // 分块大小（像素）
  const MAX_WORKERS = 4; // 最大Web Worker数量

  let cancelFlag = false;
  let lastInputImage = null;
  let lastInputFileName = '';
  let workerPool = [];
  let activeWorkers = 0;
  let completedWorkers = 0;
  
  // 处理状态
  const processingState = {
    scale: 4,
    tileStep: 4,
    gridW: 0,
    gridH: 0,
    outW: 0,
    outH: 0,
    tilesDone: 0,
    totalTiles: 0,
    pixelsDone: 0,
    totalPixels: 0,
    blocks: [],
    textures: new Map(),
    tileMap: new Map(),
    startTs: 0,
    blocksList: []
  };

  // 初始化Web Worker池
  function initWorkerPool() {
    for (let i = 0; i < MAX_WORKERS; i++) {
      const worker = new Worker(workerUrl);
      worker.id = i;
      workerPool.push(worker);
    }
  }

  // 格式化时间
  function fmtTime(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return (hh > 0 ? String(hh).padStart(2, '0') + ':' : '') +
      String(mm).padStart(2, '0') + ':' +
      String(ss).padStart(2, '0');
  }

  // 更新进度
  function setProgress() {
    const pct = processingState.totalPixels ? 
      (processingState.pixelsDone / processingState.totalPixels) * 100 : 0;
    
    pBar.style.width = `${Math.min(100, pct)}%`;
    
    const elapsed = performance.now() - processingState.startTs;
    const eta = (processingState.pixelsDone > 0) ? 
      elapsed * (processingState.totalPixels - processingState.pixelsDone) / processingState.pixelsDone : 0;
    
    const speed = elapsed > 0 ? 
      Math.round(processingState.pixelsDone / (elapsed / 1000)) : 0;
    
    pText.textContent =
      `进度 ${Math.floor(pct)}% ｜ 已用 ${fmtTime(elapsed)} ｜ 剩余 ${fmtTime(eta)} ` +
      `｜ 像素 ${processingState.pixelsDone.toLocaleString()}/${processingState.totalPixels.toLocaleString()} ` +
      `｜ ${speed.toLocaleString()} px/s`;
    
    previewStatus.textContent = `已处理: ${Math.floor(pct)}%`;
  }

  // 加载颜色数据
  async function loadColours() {
    const res = await fetch('./out_all_colours.json');
    if (!res.ok) throw new Error('out_all_colours.json 加载失败');
    return await res.json();
  }

  // 从CSS加载纹理
  function loadTexturesFromCSS() {
    const textures = new Map();
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      if (!rules) continue;
      for (const rule of rules) {
        if (!(rule.selectorText && rule.style && rule.style.backgroundImage)) continue;
        const sel = rule.selectorText.trim();
        if (!sel.startsWith('.')) continue;
        const m = rule.style.backgroundImage.match(/url\(['"]?(data:[^'")]+)['"]?\)/i);
        if (!m) continue;
        const className = sel.slice(1).split(/[ ,:.#\[]/, 1)[0];
        const url = m[1];
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = url;
        textures.set(className, img);
      }
    }
    return textures;
  }

  // 等待图片加载
  function waitImagesReady(images) {
    const tasks = [];
    for (const img of images) {
      if (img.complete && img.naturalWidth) continue;
      tasks.push(new Promise((res, rej) => { 
        img.onload = () => res(); 
        img.onerror = () => rej(new Error('贴图加载失败: ' + img.src)); 
      }));
    }
    return Promise.all(tasks);
  }

  // 读取文件为图片
  function readFileAsImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('图片读取失败'));
      };
      img.src = url;
    });
  }

  // 获取缩放倍数
  function getScale() {
    let s = parseFloat(scaleInput.value);
    if (!(s > 0)) s = 4;
    return Math.min(s, 16);
  }

  // 计算网格步长
  function tileFromScale(scale) {
    return Math.max(1, Math.round(16 / scale));
  }

  // 更新分辨率显示
  function updateResLabels() {
    if (!lastInputImage) {
      origResEl.textContent = '原图：-';
      outResEl.textContent = '输出：-';
      return;
    }
    
    processingState.scale = getScale();
    processingState.tileStep = tileFromScale(processingState.scale);
    
    processingState.gridW = Math.ceil(lastInputImage.width / processingState.tileStep);
    processingState.gridH = Math.ceil(lastInputImage.height / processingState.tileStep);
    
    processingState.outW = processingState.gridW * 16;
    processingState.outH = processingState.gridH * 16;
    
    origResEl.textContent = `原图：${lastInputImage.width}×${lastInputImage.height}`;
    outResEl.textContent = `输出：${processingState.outW}×${processingState.outH}`;
    
    // 计算分块
    const tileCols = Math.ceil(lastInputImage.width / TILE_SIZE);
    const tileRows = Math.ceil(lastInputImage.height / TILE_SIZE);
    processingState.totalTiles = tileCols * tileRows;
    statusText.textContent = `状态：分块 ${tileCols}×${tileRows} (共${processingState.totalTiles}块)`;
  }

  // 文件选择处理
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) {
      lastInputImage = null;
      lastInputFileName = '';
      previewImg.style.display = 'none';
      previewStatus.style.display = 'none';
      updateResLabels();
      return;
    }
    
    try {
      const img = await readFileAsImage(f);
      
      // 创建预览图（限制尺寸）
      const maxSize = 2048;
      let displayWidth = img.width;
      let displayHeight = img.height;
      
      if (img.width > maxSize || img.height > maxSize) {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height);
        displayWidth = Math.floor(img.width * ratio);
        displayHeight = Math.floor(img.height * ratio);
      }
      
      // 创建预览canvas
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = displayWidth;
      previewCanvas.height = displayHeight;
      const ctx = previewCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
      
      // 显示预览图
      previewImg.src = previewCanvas.toDataURL('image/png');
      previewImg.style.display = 'block';
      previewImg.width = displayWidth;
      previewImg.height = displayHeight;
      previewStatus.style.display = 'block';
      previewStatus.textContent = '准备处理';
      
      lastInputImage = img;
      lastInputFileName = f.name.replace(/\.[^.]+$/, '') || 'image';
      updateResLabels();
    } catch (e) {
      console.error(e);
      lastInputImage = null;
      lastInputFileName = '';
      previewImg.style.display = 'none';
      previewStatus.style.display = 'none';
      updateResLabels();
      alert('图片加载失败: ' + e.message);
    }
  });

  // 缩放输入处理
  scaleInput.addEventListener('input', () => {
    let val = parseFloat(scaleInput.value);
    if (!isNaN(val) && val > 16) {
      scaleInput.value = 16;
    }
    updateResLabels();
  });

  // 设置UI状态
  function setRunningUI(running) {
    fileInput.disabled = running;
    scaleInput.disabled = running;
    runBtn.disabled = running;
    pauseBtn.disabled = !running;
    dlBtn.disabled = running;
    pWrap.style.display = running ? 'block' : 'none';
    
    if (running) {
      previewStatus.style.display = 'block';
      previewStatus.textContent = '处理中...';
    }
  }

  // 处理单个分块
  async function processTile(tileX, tileY) {
    return new Promise((resolve) => {
      const worker = workerPool.pop();
      if (!worker) {
        setTimeout(() => processTile(tileX, tileY).then(resolve), 100);
        return;
      }
      
      activeWorkers++;
      
      // 计算当前分块的区域
      const startX = tileX * TILE_SIZE;
      const startY = tileY * TILE_SIZE;
      const width = Math.min(TILE_SIZE, lastInputImage.width - startX);
      const height = Math.min(TILE_SIZE, lastInputImage.height - startY);
      
      // 创建离屏Canvas处理分块
      const tileCanvas = document.createElement('canvas');
      tileCanvas.width = width;
      tileCanvas.height = height;
      const tileCtx = tileCanvas.getContext('2d');
      tileCtx.drawImage(
        lastInputImage, 
        startX, startY, width, height,
        0, 0, width, height
      );
      
      const imageData = tileCtx.getImageData(0, 0, width, height);
      
      // 计算网格区域
      const gridX = Math.floor(startX / processingState.tileStep);
      const gridY = Math.floor(startY / processingState.tileStep);
      const gridW = Math.ceil(width / processingState.tileStep);
      const gridH = Math.ceil(height / processingState.tileStep);
      
      // 发送给Worker处理
      worker.postMessage({
        id: `${tileX}-${tileY}`,
        type: 'process',
        data: {
          imageData,
          gridX,
          gridY,
          gridW,
          gridH,
          tileSize: processingState.tileStep
        }
      }, [imageData.data.buffer]);
      
      worker.onmessage = (e) => {
        if (e.data.type === 'result') {
          const { data, gridX, gridY } = e.data;
          
          // 处理结果（每个网格的颜色索引）
          for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
              const idx = y * gridW + x;
              const colorIdx = data[idx];
              
              if (colorIdx >= 0) {
                const block = processingState.blocks[colorIdx];
                if (block) {
                  // 保存到状态
                  const absX = gridX + x;
                  const absY = gridY + y;
                  processingState.tileMap.set(`${absX},${absY}`, block);
                }
              }
              
              // 更新进度
              processingState.pixelsDone++;
              if (processingState.pixelsDone % 10000 === 0) {
                setProgress();
              }
            }
          }
          
          processingState.tilesDone++;
          setProgress();
          
          workerPool.push(worker);
          activeWorkers--;
          completedWorkers++;
          resolve();
        }
      };
    });
  }

  // 主处理函数
  async function run() {
    if (!lastInputImage) {
      alert('请先选择图片');
      return;
    }
    
    // 初始化Web Worker池
    if (workerPool.length === 0) {
      initWorkerPool();
    }
    
    // 加载颜色数据
    try {
      const colours = await loadColours();
      processingState.blocksList = Object.entries(colours).map(([key, sides]) => ({ key, sides }));
      
      // 加载纹理
      processingState.textures = loadTexturesFromCSS();
      await waitImagesReady([...processingState.textures.values()]);
      
      // 准备颜色数据给Worker
      processingState.blocks = [];
      for (const b of processingState.blocksList) {
        const side = b.sides[SIDE];
        if (!side || !side.color || !side.color[COLOR_SET]) continue;
        processingState.blocks.push(side.color[COLOR_SET]);
      }
      
      // 初始化Worker
      await Promise.all(workerPool.map(worker => {
        return new Promise((resolve) => {
          worker.postMessage({
            type: 'init',
            data: { blocks: processingState.blocks }
          });
          
          worker.onmessage = (e) => {
            if (e.data.type === 'ready') resolve();
          };
        });
      }));
    } catch (e) {
      console.error(e);
      alert('初始化失败: ' + e.message);
      return;
    }
    
    // 重置状态
    cancelFlag = false;
    processingState.tilesDone = 0;
    processingState.pixelsDone = 0;
    processingState.tileMap.clear();
    processingState.startTs = performance.now();
    
    // 更新分辨率
    updateResLabels();
    
    // 计算总像素
    processingState.totalPixels = processingState.gridW * processingState.gridH;
    
    // 计算分块
    const tileCols = Math.ceil(lastInputImage.width / TILE_SIZE);
    const tileRows = Math.ceil(lastInputImage.height / TILE_SIZE);
    processingState.totalTiles = tileCols * tileRows;
    
    setRunningUI(true);
    setProgress();
    
    // 处理所有分块
    const tilePromises = [];
    
    for (let tileY = 0; tileY < tileRows; tileY++) {
      for (let tileX = 0; tileX < tileCols; tileX++) {
        if (cancelFlag) break;
        
        // 控制并发数量
        while (activeWorkers >= MAX_WORKERS) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        tilePromises.push(processTile(tileX, tileY));
      }
    }
    
    try {
      await Promise.all(tilePromises);
      
      if (!cancelFlag) {
        // 所有分块处理完成
        previewStatus.textContent = '处理完成！';
        statusText.textContent = '状态：处理完成';
        dlBtn.disabled = false;
      }
    } catch (e) {
      console.error(e);
      previewStatus.textContent = '处理出错';
      statusText.textContent = '状态：出错 - ' + e.message;
    }
    
    setRunningUI(false);
  }

  // 暂停处理
  function pause() {
    cancelFlag = true;
    previewStatus.textContent = '已暂停';
    statusText.textContent = '状态：已暂停';
    dlBtn.disabled = false; // 暂停时允许下载
  }

  // 下载图片
  async function downloadPNG() {
    previewStatus.textContent = '正在生成图片...';
    statusText.textContent = '状态：生成图片中';
    
    try {
      // 创建离屏Canvas
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = processingState.outW;
      outputCanvas.height = processingState.outH;
      const ctx = outputCanvas.getContext('2d');
      
      // 绘制所有已处理的网格
      const totalPixels = processingState.gridW * processingState.gridH;
      let drawnPixels = 0;
      
      for (let y = 0; y < processingState.gridH; y++) {
        for (let x = 0; x < processingState.gridW; x++) {
          const block = processingState.tileMap.get(`${x},${y}`);
          if (block) {
            const texture = processingState.textures.get(block.key);
            if (texture) {
              ctx.drawImage(texture, x * 16, y * 16, 16, 16);
            }
          }
          
          // 更新进度显示
          drawnPixels++;
          if (drawnPixels % 1000 === 0) {
            const pct = (drawnPixels / totalPixels) * 100;
            previewStatus.textContent = `生成图片中 ${Math.floor(pct)}%`;
            await new Promise(r => setTimeout(r, 0)); // 让UI更新
          }
        }
      }
      
      // 生成文件名
      const base = lastInputFileName;
      const ts = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${String(ts.getFullYear()).slice(2)}_${pad(ts.getMonth() + 1)}_${pad(ts.getDate())}-${pad(ts.getHours())}_${pad(ts.getMinutes())}_${pad(ts.getSeconds())}`;
      const fname = `${base}_${stamp}.png`;
      
      // 下载
      outputCanvas.toBlob((blob) => {
        if (!blob) {
          previewStatus.textContent = '生成图片失败';
          statusText.textContent = '状态：生成图片失败';
          return;
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        
        previewStatus.textContent = cancelFlag ? '已暂停' : '处理完成！';
        statusText.textContent = cancelFlag ? '状态：已暂停' : '状态：处理完成';
      }, 'image/png');
    } catch (e) {
      console.error(e);
      previewStatus.textContent = '生成图片出错';
      statusText.textContent = '状态：生成图片出错 - ' + e.message;
    }
  }

  // 事件监听
  runBtn.addEventListener('click', () => {
    if (pauseBtn.disabled) {
      run().catch(e => {
        console.error(e);
        previewStatus.textContent = '出错: ' + e.message;
        statusText.textContent = '状态：出错 - ' + e.message;
        setRunningUI(false);
      });
    }
  });
  
  pauseBtn.addEventListener('click', pause);
  dlBtn.addEventListener('click', downloadPNG);
})();