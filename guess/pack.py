from pathlib import Path
import re
import json

# 路径配置
base = Path("code")
html_file = base / "index.html"
out_file = Path("index.html")

# 内联文件映射
inline_files = {
    "./zi.tsv": base / "zi.tsv",
    "./chaizi-master/fanjian_suoyin.txt": base / "chaizi-master/fanjian_suoyin.txt",
    "./chaizi-master/chaizi-jt.txt": base / "chaizi-master/chaizi-jt.txt",
    "./chaizi-master/chaizi-ft.txt": base / "chaizi-master/chaizi-ft.txt",
    "./Han-Latin.xml": base / "Han-Latin.xml",
}

def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8").replace("`", "\\`")

# === 读取 HTML
html = html_file.read_text(encoding="utf-8")

# === 内联核心文件 (zi.tsv / chaizi / Han-Latin)
for key, file_path in inline_files.items():
    content = read_text(file_path)
    var_name = re.sub(r"[^a-zA-Z0-9]", "_", key)  # 变量名
    inject = f"const data_{var_name} = `{content}`;"
    html = html.replace(
        f"fetch('{key}').then(r => r.text()).then",
        f"Promise.resolve(data_{var_name}).then"
    )
    html = html.replace("<script>", f"<script>\n{inject}\n", 1)

# === 内联 ck/ 文件夹
ck_dir = base / "ck"
ck_data = {}
for file in ck_dir.glob("*.txt"):
    ck_data[file.stem] = file.read_text(encoding="utf-8")

# 注入 ckData 对象
ck_json = json.dumps(ck_data, ensure_ascii=False).replace("</", "<\\/")  # 防止 </script> 断开
ck_inject = f"const ckData = {ck_json};"

# 替换 fetch('./ck/${r}.txt') 为 Promise.resolve(ckData[r])
html = re.sub(
    r"fetch\(`\./ck/\$\{r\}\.txt`\)\.then\(e => e\.text\(\)\)",
    "Promise.resolve(ckData[r])",
    html
)
html = html.replace("<script>", f"<script>\n{ck_inject}\n", 1)

# === 输出结果
out_file.write_text(html, encoding="utf-8")
print(f"✅ 已生成离线单文件: {out_file}")
import os; [os.remove(os.path.join(r,f)) for r,_,fs in os.walk('.') for f in fs if f.endswith('.bak')]
import subprocess; subprocess.run("git add . && git commit -m 'meow' && git push origin main", shell=True)

