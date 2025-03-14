    (function(){
      // 控制细胞新生时隐藏迭代次数
      const HIDE_ITERATIONS = 1;
      
      const canvas = document.getElementById("lifeCanvas");
      const ctx = canvas.getContext("2d");
      
      const cellSize =5;
      let gridWidth, gridHeight;
      let grid = [], nextGrid = [], inactiveTime = [];
      // 记录每个细胞存活的迭代数，初始或新生时为 0
      let cellAge = [];

      function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gridWidth = Math.floor(canvas.width / cellSize);
        gridHeight = Math.floor(canvas.height / cellSize);
        initGrid();
      }
      window.addEventListener("resize", resizeCanvas);
      resizeCanvas();

      function initGrid() {
        grid = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));
        nextGrid = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));
        inactiveTime = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));
        cellAge = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));

        for (let i = 0; i < gridHeight; i++) {
          for (let j = 0; j < gridWidth; j++) {
            // 随机生成细胞，新生细胞 age 为 0（隐藏前两次）
            grid[i][j] = Math.random() < 0.1 ? 1 : 0;
            cellAge[i][j] = 0;
          }
        }
      }

      function updateSimulation() {
        // 用于保存本次更新后细胞的年龄信息
        let newAge = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));

        for (let i = 0; i < gridHeight; i++) {
          for (let j = 0; j < gridWidth; j++) {
            let neighbors = 0;
            for (let di = -1; di <= 1; di++) {
              for (let dj = -1; dj <= 1; dj++) {
                if (di === 0 && dj === 0) continue;
                let ni = (i + di + gridHeight) % gridHeight;
                let nj = (j + dj + gridWidth) % gridWidth;
                neighbors += grid[ni][nj];
              }
            }

            if (grid[i][j] === 1) {
              // 存活规则
              if (neighbors === 2 || neighbors === 3) {
                nextGrid[i][j] = 1;
                newAge[i][j] = cellAge[i][j] + 1; // 存活则年龄加 1
              } else {
                nextGrid[i][j] = 0;
                newAge[i][j] = 0;
              }
              inactiveTime[i][j] = 0;
            } else {
              // 诞生规则
              if (neighbors === 3) {
                nextGrid[i][j] = 1;
                newAge[i][j] = 0; // 新生细胞 age 为 0（隐藏前两次）
              } else {
                nextGrid[i][j] = 0;
                newAge[i][j] = 0;
                inactiveTime[i][j]++;
                if (inactiveTime[i][j] > 200) {
                  nextGrid[i][j] = Math.random() < 0.05 ? 1 : 0;
                  if (nextGrid[i][j] === 1) {
                    newAge[i][j] = 0; // 重新生成的细胞 age 同样为 0
                  }
                  inactiveTime[i][j] = 0;
                }
              }
            }
          }
        }
        // 交换 grid 与 nextGrid
        [grid, nextGrid] = [nextGrid, grid];
        // 更新细胞年龄
        cellAge = newAge;
      }

function drawSimulation() {
    // 创建渐变背景，模拟星空的深蓝到黑色变化
    let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#000018"); // 顶部深蓝
    gradient.addColorStop(0.5, "#000009"); // 中间黑蓝过渡
    gradient.addColorStop(1, "#000000"); // 底部纯黑

    // 填充渐变背景
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 随机生成一些星云效果
    for (let i = 0; i < 3; i++) {
        let x = Math.random() * canvas.width;
        let y = Math.random() * canvas.height;
        let size = Math.random() * 100 + 50;
        let blur = ctx.createRadialGradient(x, y, 0, x, y, size);
        
        blur.addColorStop(0, "rgba(20, 20, 40, 0.3)");  // 深蓝紫
        blur.addColorStop(1, "rgba(0, 0, 0, 0)"); // 渐变到透明

        ctx.fillStyle = blur;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    }

    // 定义星星的颜色，使它们有不同的色调
    const colors = ["255,255,255", "255,223,186", "170,204,255", "204,221,255"];

    // 绘制星星
    for (let i = 0; i < gridHeight; i++) {
        for (let j = 0; j < gridWidth; j++) {
            if (grid[i][j] && cellAge[i][j] >= HIDE_ITERATIONS) { // **仅绘制存活超过 HIDE_ITERATIONS 的细胞**
                let alpha = Math.random() * 0.5 + 0.5; // 透明度随机变化
                let color = colors[(i + j) % colors.length];
                ctx.fillStyle = `rgba(${color},${alpha})`;
                ctx.beginPath();
                ctx.arc(j * cellSize + cellSize / 2, i * cellSize + cellSize / 2, cellSize / 3, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }
}


      function simulationLoop() {
        updateSimulation();
        drawSimulation();
        requestAnimationFrame(simulationLoop);
      }
      simulationLoop();
    })();