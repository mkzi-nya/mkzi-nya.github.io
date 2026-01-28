import os
import sys
import math
import itertools
from PIL import Image

# ===== 配置 =====

MODEL_POINT = (200, 534)

PAINT_POINTS = {
    1: (120, 779),
    2: (209, 788),
    3: (282, 789),
    4: (369, 788),
    5: (453, 790),
    6: (526, 788),
    7: (613, 787),
}

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")

# ===== 工具函数 =====

def rgb_to_hex(rgb):
    return "#" + "".join(f"{c:02x}" for c in rgb)

def distance(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))

def mix_rgb(colors):
    n = len(colors)
    return tuple(sum(c[i] for c in colors) / n for i in range(3))

# ===== 找最新图片 =====

def find_latest_image():
    images = [
        f for f in os.listdir(".")
        if f.lower().endswith(IMAGE_EXTS)
    ]
    if not images:
        raise RuntimeError("当前目录下没有图片文件")

    images.sort(key=lambda f: os.path.getmtime(f), reverse=True)
    return images[0]

# ===== 主逻辑 =====

def main():
    img_path = find_latest_image()
    img = Image.open(img_path).convert("RGB")

    print(f"使用图片: {img_path}\n")

    # 取模特色
    model_rgb = img.getpixel(MODEL_POINT)
    print(f"模特 @ {MODEL_POINT}: {model_rgb} {rgb_to_hex(model_rgb)}\n")

    # 取颜料色
    paints = {}
    for idx, pt in PAINT_POINTS.items():
        rgb = img.getpixel(pt)
        paints[idx] = rgb
        print(f"颜料 {idx} @ {pt}: {rgb} {rgb_to_hex(rgb)}")

    print("\n开始计算最优三色组合（等权 1/3，允许重复）...\n")

    best = None

    indices = list(paints.keys())
    paint_rgbs = [paints[i] for i in indices]

    for combo in itertools.product(indices, repeat=3):
        colors = [paints[i] for i in combo]
        mixed = mix_rgb(colors)
        d = distance(mixed, model_rgb)

        if best is None or d < best["dist"]:
            best = {
                "combo": combo,
                "mixed": mixed,
                "dist": d
            }

    # ===== 输出结果 =====

    print("====== 最优解 ======")
    print("组合（按序号）:", best["combo"])

    print("对应颜料 HEX:", [
        rgb_to_hex(paints[i]) for i in best["combo"]
    ])

    mixed_rgb_int = tuple(int(round(c)) for c in best["mixed"])
    print("混合结果 RGB :", mixed_rgb_int)
    print("混合结果 HEX :", rgb_to_hex(mixed_rgb_int))
    print("误差（RGB 欧氏距离）:", round(best["dist"], 4))

if __name__ == "__main__":
    main()
