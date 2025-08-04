import sys

# 假名字体映射表（可根据需要扩展或调整）
katakana_font = {
    'A': 'ㄙ', 'B': 'ㄯ', 'C': 'ㄈ', 'D': 'ワ', 'E': '⋿', 'F': 'チ', 'G': 'Ᏽ', 'H': 'サ',
    'I': 'エ', 'J': ' 𝙅', 'K': 'ケ', 'L': '㆑', 'M': '巾', 'N': 'ウ', 'O': 'ロ', 'P': 'ア',
    'Q': '∅', 'R': 'Ʀ', 'S': '丂', 'T': 'ナ', 'U': 'ㄩ', 'V': '√', 'W': '山', 'X': 'メ',
    'Y': 'ン', 'Z': 'て', '1':'イ', '2':'ㄹ', '3':'ヨ', '4':'ㄣ', '5': 'ㄎ', '6':'〥', '7':'フ', '8':'ㄖ', '9':'ヌ', '0':'ㇿ'
}

# 小写字母映射（同样风格，可与大写区分或直接复用）
katakana_font_lower = {
    k.lower(): v for k, v in katakana_font.items()
}

# 合并映射
katakana_font.update(katakana_font_lower)

def convert_to_katakana_font(text):
    result = []
    for ch in text:
        if ch in katakana_font:
            result.append(katakana_font[ch])
        else:
            result.append(ch)  # 非字母字符保持原样
    return ''.join(result)

def main():
    if len(sys.argv) < 2:
        print("用法: python xxx.py file")
        return

    file_path = sys.argv[1]
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        converted_content = convert_to_katakana_font(content)
        
        # 覆盖原文件
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(converted_content)
        
        print("转换完成！文件已更新。")
    except FileNotFoundError:
        print("找不到文件:", file_path)
    except Exception as e:
        print("出错:", e)

if __name__ == "__main__":
    main()
