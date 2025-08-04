document.addEventListener("DOMContentLoaded", () => {
  const inputChars = document.getElementById("inputChars");
  const inputCodes = document.getElementById("inputCodes");
  const chooseSchemaBtn = document.getElementById("chooseSchemaBtn");
  const modalOverlay = document.getElementById("modalOverlay");
  const schemaList = document.getElementById("schemaList");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const keyInput = document.getElementById("keyInput"); // 新增

  let currentSchema = null; // 当前选择的编码模块
  let encodeFn = null;
  let decodeFn = null;
  let focusedField = null;
  let lastEditedField = null; // 记录最后一次编辑的输入框

  /** 获取焦点状态 */
  inputChars.addEventListener("focus", () => focusedField = "chars");
  inputCodes.addEventListener("focus", () => focusedField = "codes");

  /** 自动检测 schema.txt 并加载列表 */
  fetch("./dict/schema.txt")
    .then(res => res.text())
    .then(text => {
      const lines = text.split("\n").map(line => line.trim()).filter(Boolean);

      // 动态创建列表
      lines.forEach((line, index) => {
        const [name, file] = line.split("|");
        const li = document.createElement("li");
        li.textContent = name;
        li.style.cursor = "pointer";
        li.addEventListener("click", () => loadSchema(name, file));
        schemaList.appendChild(li);

        // 自动选择第一个选项
        if (index === 0) {
          loadSchema(name, file);
        }
      });
    });

  /** 加载对应编码 JS 文件 */
  function loadSchema(name, file) {
    // 清理之前加载的模块
    encodeFn = null;
    decodeFn = null;
    currentSchema = name;

    // 移除旧脚本（防止重复加载）
    document.querySelectorAll(`script[data-schema]`).forEach(s => s.remove());

    // 动态加载新脚本
    const script = document.createElement("script");
    script.src = `./dict/${file}`;
    script.dataset.schema = name;
    script.onload = () => {
      if (typeof encode !== "function" || typeof decode !== "function") {
        alert(`${file} 未定义 encode 或 decode 函数`);
        return;
      }
      encodeFn = encode;
      decodeFn = decode;
      chooseSchemaBtn.textContent = `${name}`;
      modalOverlay.style.display = "none";
    };
    document.body.appendChild(script);
  }

  /** 打开选择框 */
  chooseSchemaBtn.addEventListener("click", () => {
    modalOverlay.style.display = "flex";
  });

  /** 关闭选择框 */
  closeModalBtn.addEventListener("click", () => {
    modalOverlay.style.display = "none";
  });

  /** 输入变化时自动转换 */
  function handleInput() {
    if (!encodeFn || !decodeFn) return; // 未选择编码
    const key = keyInput.value; // 读取密钥
    try {
      if (focusedField === "chars") {
        inputCodes.value = encodeFn.length >= 2 ? encodeFn(inputChars.value, key) : encodeFn(inputChars.value);
      } else if (focusedField === "codes") {
        inputChars.value = decodeFn.length >= 2 ? decodeFn(inputCodes.value, key) : decodeFn(inputCodes.value);
      }
    } catch (err) {
      console.error(err);
    }
  }

  /** 记录最后编辑的输入框，并调用 handleInput */
  inputChars.addEventListener("input", () => {
    focusedField = "chars";
    lastEditedField = "chars";
    handleInput();
  });

  inputCodes.addEventListener("input", () => {
    focusedField = "codes";
    lastEditedField = "codes";
    handleInput();
  });

  /** 密钥变化时，基于最后编辑字段重新转换 */
  keyInput.addEventListener("input", () => {
    if (!lastEditedField) return; // 还没编辑过任何输入框
    focusedField = lastEditedField; // 复用最后编辑的输入框
    handleInput();
  });

  /** 清空/复制/粘贴按钮功能 */
  document.querySelectorAll(".btn-group button").forEach(btn => {
    btn.addEventListener("click", async () => {
      const targetId = btn.dataset.clear || btn.dataset.copy || btn.dataset.paste;
      const target = document.getElementById(targetId);

      if (btn.dataset.clear) {
        target.value = "";
      } else if (btn.dataset.copy) {
        await navigator.clipboard.writeText(target.value);
      } else if (btn.dataset.paste) {
        target.value = await navigator.clipboard.readText();
        target.dispatchEvent(new Event("input"));
      }
    });
  });
});
