// Version: 1

// ============ 全局变量 ============
let side = 4;
let base = 2;  // 基数，可调范围 2-10
let tiles = [];        // 当前所有方块，每个对象格式：{id, value, n, row, col, oldRow, oldCol, merged, spawned, mergedFrom}
let tileID = 0;        // 用于分配唯一 ID
let currentScore = 0;
let bestScore = 0;
let isGameStarted = false; // 游戏开始后才能操作

const SWIPE_THRESHOLD = 10;

// ============ 页面加载 ============
window.addEventListener("DOMContentLoaded", () => {
  // 从 localStorage 读取当前配置下的最高分数
  const bestScoreKey = "bestScore_" + side + "_" + base;
  if(localStorage.getItem(bestScoreKey)) {
    bestScore = parseInt(localStorage.getItem(bestScoreKey));
  }
  document.getElementById("bestScore").innerText = bestScore;
  
  // 初始化面板显示
  document.getElementById("spanSide").innerText = side;
  document.getElementById("spanBase").innerText = base;

  createGrid(side);

  // 绑定调节按钮
  document.getElementById("btnSideMinus").addEventListener("click", () => changeSide(-1));
  document.getElementById("btnSidePlus").addEventListener("click", () => changeSide(+1));
  document.getElementById("btnBaseMinus").addEventListener("click", () => changeBase(-1));
  document.getElementById("btnBasePlus").addEventListener("click", () => changeBase(+1));

  document.getElementById("btnApply").addEventListener("click", applySettings);
  document.getElementById("btnRestart").addEventListener("click", restartGame);
  document.getElementById("btnDarkMode").addEventListener("click", toggleDarkMode);
  
  // 绑定存档导出/导入按钮
  document.getElementById("btnExport").addEventListener("click", exportSave);
  document.getElementById("btnImport").addEventListener("click", () => {
    document.getElementById("fileInput").click();
  });
  document.getElementById("fileInput").addEventListener("change", importSave);

  // 禁止触摸滚动
  const gridContainer = document.getElementById("gridContainer");
  gridContainer.addEventListener("touchmove", (e)=> e.preventDefault(), {passive:false});

  // 检查暗色模式设置
  if (localStorage.getItem("darkMode") === "true") {
    document.body.classList.add("dark-mode");
  }
});

// ============ 创建背景格子 ============
function createGrid(s) {
  const gridContainer = document.getElementById("gridContainer");
  gridContainer.innerHTML = "";
  gridContainer.style.gridTemplateRows = `repeat(${s}, 1fr)`;
  gridContainer.style.gridTemplateColumns = `repeat(${s}, 1fr)`;
  for(let i = 0; i < s; i++){
    for(let j = 0; j < s; j++){
      const cell = document.createElement("div");
      cell.classList.add("grid-cell");
      gridContainer.appendChild(cell);
    }
  }
}

// ============ 改变棋盘边长 ============
function changeSide(delta) {
  if(isGameStarted) return;
  let newVal = side + delta;
  if(newVal < 2) newVal = 2;
  if(newVal > 10) newVal = 10;
  side = newVal;
  document.getElementById("spanSide").innerText = side;
  // 更新当前配置下的最高分显示
  const bestScoreKey = "bestScore_" + side + "_" + base;
  let stored = localStorage.getItem(bestScoreKey);
  document.getElementById("bestScore").innerText = stored ? stored : "0";
  createGrid(side);
}

// ============ 改变基数 ============
function changeBase(delta) {
  if(isGameStarted) return;
  let newBase = base + delta;
  if(newBase < 2) newBase = 2;
  if(newBase > 10) newBase = 10;
  base = newBase;
  document.getElementById("spanBase").innerText = base;
  // 更新当前配置下的最高分显示
  const bestScoreKey = "bestScore_" + side + "_" + base;
  let stored = localStorage.getItem(bestScoreKey);
  document.getElementById("bestScore").innerText = stored ? stored : "0";
}

// ============ 点击“开始游戏” ============
function applySettings() {
  if(isGameStarted) return;
  isGameStarted = true;
  // 禁用调节按钮
  document.getElementById("btnSideMinus").disabled = true;
  document.getElementById("btnSidePlus").disabled = true;
  document.getElementById("btnBaseMinus").disabled = true;
  document.getElementById("btnBasePlus").disabled = true;
  document.getElementById("btnApply").disabled = true;

  const bestScoreKey = "bestScore_" + side + "_" + base;
  if(localStorage.getItem(bestScoreKey)) {
    bestScore = parseInt(localStorage.getItem(bestScoreKey));
  } else {
    bestScore = 0;
  }
  document.getElementById("bestScore").innerText = bestScore;
  setupGame();
}

// ============ 初始化/重置游戏 ============
function setupGame() {
  currentScore = 0;
  document.getElementById("currentScore").innerText = "0";
  tiles = [];
  tileID = 0;
  createGrid(side);
  spawnRandomTile();
  spawnRandomTile();
  initInputEvents();
  renderAllTiles(true);
}

// ============ 重新开始 ============
function restartGame() {
  isGameStarted = false;
  document.getElementById("btnSideMinus").disabled = false;
  document.getElementById("btnSidePlus").disabled = false;
  document.getElementById("btnBaseMinus").disabled = false;
  document.getElementById("btnBasePlus").disabled = false;
  document.getElementById("btnApply").disabled = false;
  tiles = [];
  tileID = 0;
  currentScore = 0;
  document.getElementById("currentScore").innerText = "0";
  const oldTiles = document.querySelectorAll(".tile");
  oldTiles.forEach(t => t.remove());
  createGrid(side);
}

// ============ 暗色模式切换 ============
function toggleDarkMode() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
}

// ============ 分数更新 ============
function updateScore(add) {
  currentScore += add;
  document.getElementById("currentScore").innerText = currentScore;
  if(currentScore > bestScore) {
    bestScore = currentScore;
    document.getElementById("bestScore").innerText = bestScore;
    const bestScoreKey = "bestScore_" + side + "_" + base;
    localStorage.setItem(bestScoreKey, bestScore);
  }
}

// ============ 输入事件（键盘+触摸） ============
let inputInited = false;
function initInputEvents() {
  if(inputInited) return;
  inputInited = true;
  document.addEventListener("keydown", (e) => {
    if(!isGameStarted) return;
    let moved = false;
    switch(e.key) {
      case "ArrowUp":    moved = moveUp();    break;
      case "ArrowDown":  moved = moveDown();  break;
      case "ArrowLeft":  moved = moveLeft();  break;
      case "ArrowRight": moved = moveRight(); break;
      default: return;
    }
    if(moved) {
      renderAllTiles();
      setTimeout(() => {
        finalizePositions();
        spawnRandomTile();
        renderAllTiles();
        checkGameOver();
      }, 200);
    }
  });
  const gridContainer = document.getElementById("gridContainer");
  let startX = 0, startY = 0;
  gridContainer.addEventListener("touchstart", (e) => {
    if(!isGameStarted) return;
    if(e.touches.length > 0) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }
  }, {passive:false});
  gridContainer.addEventListener("touchend", (e) => {
    if(!isGameStarted) return;
    if(e.changedTouches.length > 0) {
      let endX = e.changedTouches[0].clientX;
      let endY = e.changedTouches[0].clientY;
      let dx = endX - startX;
      let dy = endY - startY;
      if(Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
      let moved = false;
      if(Math.abs(dx) > Math.abs(dy)) {
        moved = dx > 0 ? moveRight() : moveLeft();
      } else {
        moved = dy > 0 ? moveDown() : moveUp();
      }
      if(moved) {
        renderAllTiles();
        setTimeout(() => {
          finalizePositions();
          spawnRandomTile();
          renderAllTiles();
          checkGameOver();
        }, 200);
      }
    }
  }, {passive:false});
}

// 更新所有方块的状态
function finalizePositions() {
  tiles.forEach(t => {
    t.oldRow = t.row;
    t.oldCol = t.col;
    t.merged = false;
  });
}

// ============ 移动与合并逻辑 ============
function moveLeft(){
  tiles.forEach(t => { t.oldRow = t.row; t.oldCol = t.col; t.merged = false; });
  let moved = false;
  for (let r = 0; r < side; r++) {
    let rowTiles = tiles.filter(t => t.row === r);
    rowTiles.sort((a, b) => a.col - b.col);
    if(compressLine(rowTiles, "left")) moved = true;
  }
  return moved;
}

function moveRight(){
  tiles.forEach(t => { t.oldRow = t.row; t.oldCol = t.col; t.merged = false; });
  let moved = false;
  for (let r = 0; r < side; r++) {
    let rowTiles = tiles.filter(t => t.row === r);
    rowTiles.sort((a, b) => b.col - a.col);
    if(compressLine(rowTiles, "right")) moved = true;
  }
  return moved;
}

function moveUp(){
  tiles.forEach(t => { t.oldRow = t.row; t.oldCol = t.col; t.merged = false; });
  let moved = false;
  for (let c = 0; c < side; c++) {
    let colTiles = tiles.filter(t => t.col === c);
    colTiles.sort((a, b) => a.row - b.row);
    if(compressLine(colTiles, "up")) moved = true;
  }
  return moved;
}

function moveDown(){
  tiles.forEach(t => { t.oldRow = t.row; t.oldCol = t.col; t.merged = false; });
  let moved = false;
  for (let c = 0; c < side; c++) {
    let colTiles = tiles.filter(t => t.col === c);
    colTiles.sort((a, b) => b.row - a.row);
    if(compressLine(colTiles, "down")) moved = true;
  }
  return moved;
}

/**
 * 合并一行或一列的方块  
 * 当两个相邻且数值相同（即等级 n 相同）的方块合并后，新 tile 的等级 n 增加 1，
 * 数值更新为：value = base × 2^(n–1)
 */
function compressLine(lineTiles, direction) {
  if(lineTiles.length === 0) return false;
  let changed = false;
  let newLine = [];
  let skip = false;
  for (let i = 0; i < lineTiles.length; i++) {
    if(skip) { skip = false; continue; }
    if(i < lineTiles.length - 1 && lineTiles[i].value === lineTiles[i+1].value) {
      let targetTile = lineTiles[i];
      let mergingTile = lineTiles[i+1];
      targetTile.n = targetTile.n + 1;
      targetTile.value = base * Math.pow(2, targetTile.n - 1);
      updateScore(targetTile.value);
      targetTile.merged = true;
      targetTile.mergedFrom = { row: mergingTile.row, col: mergingTile.col };
      targetTile.oldRow = mergingTile.row;
      targetTile.oldCol = mergingTile.col;
      newLine.push(targetTile);
      tiles = tiles.filter(x => x.id !== mergingTile.id);
      skip = true;
      changed = true;
    } else {
      newLine.push(lineTiles[i]);
    }
  }
  if(direction === "left") {
    for (let i = 0; i < newLine.length; i++) {
      let tile = newLine[i];
      let oldCol = tile.col;
      tile.col = i;
      if(tile.col !== oldCol) changed = true;
    }
  } else if(direction === "right") {
    for (let i = 0; i < newLine.length; i++) {
      let tile = newLine[i];
      let oldCol = tile.col;
      tile.col = side - 1 - i;
      if(tile.col !== oldCol) changed = true;
    }
  } else if(direction === "up") {
    for (let i = 0; i < newLine.length; i++) {
      let tile = newLine[i];
      let oldRow = tile.row;
      tile.row = i;
      if(tile.row !== oldRow) changed = true;
    }
  } else if(direction === "down") {
    for (let i = 0; i < newLine.length; i++) {
      let tile = newLine[i];
      let oldRow = tile.row;
      tile.row = side - 1 - i;
      if(tile.row !== oldRow) changed = true;
    }
  }
  return changed;
}

// ============ 生成随机方块 ============
function spawnRandomTile() {
  let emptyCells = [];
  for (let r = 0; r < side; r++) {
    for (let c = 0; c < side; c++){
      if(!tiles.some(t => t.row === r && t.col === c)) {
        emptyCells.push({ r, c });
      }
    }
  }
  if(emptyCells.length === 0) return;
  let pos = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  tiles.push({
    id: ++tileID,
    value: base,       // 初始值为 base
    n: 1,              // 初始等级为 1
    row: pos.r,
    col: pos.c,
    oldRow: pos.r,
    oldCol: pos.c,
    merged: false,
    spawned: true
  });
}

// ============ 渲染方块 ============
function renderAllTiles(skipAnimation = false) {
  const container = document.getElementById("gridContainer");
  const bgCells = container.querySelectorAll(".grid-cell");
  const oldDOM = container.querySelectorAll(".tile");
  oldDOM.forEach(d => d.remove());
  tiles.forEach(t => {
    const div = document.createElement("div");
    // 根据 tile 的等级 n 添加对应的配色样式
    div.classList.add("tile", "tile-n" + t.n);
    if(t.spawned) {
      div.classList.add("tile-pop");
      div.style.transitionDuration = "0.1s";
    } else if(t.merged) {
      div.classList.add("tile-merged");
      div.style.transitionDuration = "0.2s";
    } else {
      div.style.transitionDuration = "0.2s";
    }
    div.innerText = t.value;
    let oldRect = getCellRect(bgCells, t.oldRow, t.oldCol);
    div.style.width = oldRect.width + "px";
    div.style.height = oldRect.height + "px";
    div.style.left = oldRect.left + "px";
    div.style.top = oldRect.top + "px";
    div.style.fontSize = Math.floor(oldRect.width * 0.4) + "px";
    container.appendChild(div);
  });
  if(skipAnimation) {
    tiles.forEach(t => { t.oldRow = t.row; t.oldCol = t.col; });
    tiles.forEach((t, idx) => {
      let tileDiv = container.querySelectorAll(".tile")[idx];
      let newRect = getCellRect(bgCells, t.row, t.col);
      tileDiv.style.left = newRect.left + "px";
      tileDiv.style.top = newRect.top + "px";
      tileDiv.style.width = newRect.width + "px";
      tileDiv.style.height = newRect.height + "px";
      tileDiv.style.fontSize = Math.floor(newRect.width * 0.4) + "px";
    });
    return;
  }
  requestAnimationFrame(() => {
    tiles.forEach((t, idx) => {
      let tileDiv = container.querySelectorAll(".tile")[idx];
      let newRect = getCellRect(bgCells, t.row, t.col);
      tileDiv.style.left = newRect.left + "px";
      tileDiv.style.top = newRect.top + "px";
      tileDiv.style.width = newRect.width + "px";
      tileDiv.style.height = newRect.height + "px";
      tileDiv.style.fontSize = Math.floor(newRect.width * 0.4) + "px";
    });
  });
  tiles.forEach(t => { t.spawned = false; });
}

// 辅助：获取格子位置信息
function getCellRect(bgCells, row, col) {
  const index = row * side + col;
  const cellElem = bgCells[index];
  const container = document.getElementById("gridContainer");
  let cellRect = cellElem.getBoundingClientRect();
  let containerRect = container.getBoundingClientRect();
  return {
    left: cellRect.left - containerRect.left,
    top: cellRect.top - containerRect.top,
    width: cellRect.width,
    height: cellRect.height
  };
}

// ============ 检查游戏结束 ============
function checkGameOver() {
  if(tiles.length < side * side) return;
  for(let i = 0; i < tiles.length; i++){
    for(let j = i + 1; j < tiles.length; j++){
      let a = tiles[i], b = tiles[j];
      if(a.value === b.value) {
        if(a.row === b.row && Math.abs(a.col - b.col) === 1) return;
        if(a.col === b.col && Math.abs(a.row - b.row) === 1) return;
      }
    }
  }
  alert("游戏结束！最终分数：" + currentScore);
}

// ============ 存档导出 ============
function exportSave() {
  let bestScores = {};
  for(let key in localStorage) {
    if(key.startsWith("bestScore_")) {
      bestScores[key] = localStorage.getItem(key);
    }
  }
  let saveData = {
    version: 1,
    bestScores: bestScores,
    currentGame: {
      isGameStarted: isGameStarted,
      currentScore: currentScore,
      side: side,
      base: base,
      tileID: tileID,
      tiles: tiles,
      darkMode: document.body.classList.contains("dark-mode")
    }
  };
  let dataStr = JSON.stringify(saveData);
  let blob = new Blob([dataStr], {type: "application/json"});
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "2048_save.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ 存档导入 ============
function importSave(e) {
  let file = e.target.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = function(evt) {
    try {
      let data = JSON.parse(evt.target.result);
      if(data.version !== 1) {
        alert("存档版本不匹配！");
        return;
      }
      for(let key in data.bestScores) {
        localStorage.setItem(key, data.bestScores[key]);
      }
      let game = data.currentGame;
      isGameStarted = game.isGameStarted;
      currentScore = game.currentScore;
      side = game.side;
      base = game.base;
      tileID = game.tileID;
      tiles = game.tiles;
      if(game.darkMode) {
        document.body.classList.add("dark-mode");
      } else {
        document.body.classList.remove("dark-mode");
      }
      document.getElementById("spanSide").innerText = side;
      document.getElementById("spanBase").innerText = base;
      const bestScoreKey = "bestScore_" + side + "_" + base;
      let stored = localStorage.getItem(bestScoreKey);
      document.getElementById("bestScore").innerText = stored ? stored : "0";
      document.getElementById("currentScore").innerText = currentScore;
      createGrid(side);
      renderAllTiles(true);
      if(!inputInited) {
        initInputEvents();
      }
    } catch(err) {
      alert("读取存档失败！");
    }
  };
  reader.readAsText(file);
}

// ======== AI 评分变量（独立于网站显示分数） ========
let aiScore = 0;

// 自动移动函数（AI 评分独立，不影响 currentScore）
function autoMove() {
  if (!autoPlay || !isGameStarted) return;
  
  let bestMove = findBestMove();
  if (bestMove) {
    bestMove(); // 执行最佳移动
    renderAllTiles();
    finalizePositions();
    spawnRandomTile();
    renderAllTiles();
    checkGameOver();
    setTimeout(autoMove, 0);  // 无延时，最快速度继续自动移动
  } else {
    autoPlay = false;
    alert("游戏结束！");
  }
}

// 在不改变全局状态的情况下模拟一次移动
function simulateMoveOnState(moveFunc, state) {
  let backup = tiles;
  tiles = JSON.parse(JSON.stringify(state)); // 备份状态
  let moved = moveFunc();
  let newState = JSON.parse(JSON.stringify(tiles));
  tiles = backup; // 还原状态
  return { moved, newState };
}

// AI 评估某个状态（独立评分，不影响 currentScore）
function evaluateState(state) {
  let score = 0;
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      let tile = state.find(t => t.row === row && t.col === col);
      if (tile) {
        // 计算离左下角的距离：越靠近左下角，评分越高
        let distanceFromBottomLeft = (side - row) * 10 + (side - col);
        score += tile.value * distanceFromBottomLeft;
      }
    }
  }
  // 如果左下角 (side-1, 0) 存在最大数字，则给予额外奖励
  let largestTile = Math.max(...state.map(t => t.value));
  let bottomLeftTile = state.find(t => t.row === side - 1 && t.col === 0);
  if (bottomLeftTile && bottomLeftTile.value === largestTile) {
    score += 5000;
  }
  return score;
}

// 递归搜索函数：预搜索 depth 层后返回最佳评分
function search(depth, state) {
  if (depth === 0) {
    return evaluateState(state);  // AI 评分
  }
  let bestScore = -Infinity;
  let moves = [moveDown, moveLeft, moveRight, moveUp];  // 优先向左下角
  for (let moveFunc of moves) {
    let sim = simulateMoveOnState(moveFunc, state);
    if (!sim.moved) continue;
    let score = search(depth - 1, sim.newState);
    if (score > bestScore) {
      bestScore = score;
    }
  }
  return bestScore;
}

// ======== 模拟与 AI 预搜索相关的全局变量 ========
let simulateMode = false; // 模拟模式标记
let aiSimScore = 0;       // 模拟过程中使用的隐藏得分，不显示在网页积分榜上
let autoPlay = false;     // 自动游玩开关

// ======== 修改 updateScore 函数 ========
// 当 simulateMode 为 true 时，不更新网页显示的分数，而是将得分累加到 aiSimScore 上
function updateScore(add) {
  if (simulateMode) {
    aiSimScore += add;
  } else {
    currentScore += add;
    document.getElementById("currentScore").innerText = currentScore;
    if (currentScore > bestScore) {
      bestScore = currentScore;
      document.getElementById("bestScore").innerText = bestScore;
      const bestScoreKey = "bestScore_" + side + "_" + base;
      localStorage.setItem(bestScoreKey, bestScore);
    }
  }
}

// ======== 模拟移动与预搜索 ========

// 在不改变全局状态的情况下模拟一次移动
function simulateMoveOnState(moveFunc, state) {
  // 备份当前全局状态
  let backupTiles = tiles;
  let backupScore = currentScore;
  let backupSimulateMode = simulateMode;
  let backupAiSimScore = aiSimScore;
  
  // 启用模拟模式，清空隐藏得分
  simulateMode = true;
  aiSimScore = 0;
  
  // 用深拷贝设置模拟状态（不改变实际游戏状态）
  tiles = JSON.parse(JSON.stringify(state));
  let moved = moveFunc();
  let newState = JSON.parse(JSON.stringify(tiles));
  
  // 获取本次移动产生的隐藏得分
  let simScore = aiSimScore;
  
  // 恢复全局状态
  tiles = backupTiles;
  currentScore = backupScore;
  simulateMode = backupSimulateMode;
  aiSimScore = backupAiSimScore;
  
  return { moved, newState, simScore };
}

// 评价状态函数：对当前状态进行打分，越靠近左下角得分越高，同时左下角如果存放了最大数，额外奖励
function evaluateState(state) {
  let score = 0;
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      let tile = state.find(t => t.row === row && t.col === col);
      if (tile) {
        // 计算离左下角 (side-1,0) 的距离，越近得分越高
        let distanceFromBottomLeft = (side - row) * 10 + (side - col);
        score += tile.value * distanceFromBottomLeft;
      }
    }
  }
  // 如果左下角存在最大数字，则额外奖励 5000 分
  let largestTile = Math.max(...state.map(t => t.value));
  let bottomLeftTile = state.find(t => t.row === side - 1 && t.col === 0);
  if (bottomLeftTile && bottomLeftTile.value === largestTile) {
    score += 5000;
  }
  return score;
}

// 递归搜索函数：预搜索 depth 层后返回最佳评分（包含模拟中累计的隐藏得分）
function search(depth, state) {
  if (depth === 0) {
    return evaluateState(state);
  }
  let bestScore = -Infinity;
  // 按照优先顺序：向下和向左比较容易保持左下角稳定
  let moves = [moveDown, moveLeft, moveRight, moveUp];
  for (let moveFunc of moves) {
    let sim = simulateMoveOnState(moveFunc, state);
    if (!sim.moved) continue;
    // 当前这一步的隐藏得分加上后续搜索得到的分数
    let score = sim.simScore + search(depth - 1, sim.newState);
    if (score > bestScore) {
      bestScore = score;
    }
  }
  return bestScore;
}

// 根据预搜索选择最佳移动方向，预搜索层数可以设置为 2 或 3
function findBestMove() {
  let bestMove = null;
  let bestScore = -Infinity;
  let moves = [
    { move: moveDown },
    { move: moveLeft },
    { move: moveRight },
    { move: moveUp },
  ];
  const depth = 5; // 预搜索层数，可调为 3
  for (let candidate of moves) {
    let sim = simulateMoveOnState(candidate.move, tiles);
    if (!sim.moved) continue;
    let score = sim.simScore + search(depth - 1, sim.newState);
    if (score > bestScore) {
      bestScore = score;
      bestMove = candidate.move;
    }
  }
  return bestMove;
}

// ======== 自动游玩函数 ========

// 自动移动函数：没有延时，快速连续执行
function autoMove() {
  if (!autoPlay || !isGameStarted) return;
  
  let bestMove = findBestMove();
  if (bestMove) {
    bestMove(); // 执行最佳移动
    renderAllTiles();
    finalizePositions();
    spawnRandomTile();
    renderAllTiles();
    checkGameOver();
    setTimeout(autoMove, 0);  // 无延时，最快速度继续自动移动
  } else {
    autoPlay = false;
    alert("游戏结束！");
  }
}

// ======== 绑定自动模式按钮 ========
// 请确保 index.html 中有一个 id 为 btnAutoPlay 的按钮
document.getElementById("btnAutoPlay").addEventListener("click", () => {
  autoPlay = !autoPlay;
  if (autoPlay) {
    autoMove();
  }
});
