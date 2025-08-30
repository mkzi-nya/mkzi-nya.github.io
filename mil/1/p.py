import re

def parse_css_file(css_file_path):
    """解析CSS文件，提取曲目和难度信息"""
    difficulty_songs = {}
    
    with open(css_file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 使用正则表达式匹配难度类和曲目
    pattern = r'\.(\w+)\s*\{([^}]*)\}'
    matches = re.findall(pattern, content)
    
    for difficulty, songs_content in matches:
        # 提取曲目
        song_pattern = r'--([^:]+):\s*"([^"]*)"'
        song_matches = re.findall(song_pattern, songs_content)
        
        for song_name, value in song_matches:
            # 将2替换为25，3替换为36
            modified_value = value.replace('2', '25').replace('3', '36')
            if modified_value:  # 只处理有值的曲目
                if difficulty not in difficulty_songs:
                    difficulty_songs[difficulty] = {}
                difficulty_songs[difficulty][song_name] = modified_value
    
    return difficulty_songs

def process_3_txt(difficulty_songs, txt_file_path):
    """处理3.txt文件，匹配曲目并修改"""
    output_lines = []
    deleted_count = 0
    matched_count = 0
    
    with open(txt_file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # 处理每一行
    for line in lines:
        line = line.strip()
        if not line or line.startswith('a+b+c') or line.startswith('='):
            output_lines.append(line)
            continue
        
        # 解析行数据
        parts = line.split('\t')
        if len(parts) < 4:
            continue
            
        total_length = int(parts[0])
        c = int(parts[1])
        a = int(parts[2])
        b = int(parts[3])
        
        # 检查前c个字符是否包含不允许的数字
        # 由于前c个是g，我们需要检查曲目值中是否包含1,3,4,5,6
        found_match = False
        
        for difficulty, songs in difficulty_songs.items():
            for song_name, song_value in songs.items():
                if len(song_value) == total_length:
                    # 检查前c个字符是否包含不允许的数字
                    first_c_chars = song_value[:c]
                    if not any(char in first_c_chars for char in ['7']):
                        # 找到匹配的曲目
                        new_line = f"{line}\t{difficulty}_{song_name}"
                        output_lines.append(new_line)
                        found_match = True
                        matched_count += 1
                        break
            if found_match:
                break
        
        if not found_match:
            deleted_count += 1
    
    # 写回文件
    with open(txt_file_path, 'w', encoding='utf-8') as f:
        for line in output_lines:
            f.write(line + '\n')
    
    print(f"处理完成！匹配了 {matched_count} 个曲目，删除了 {deleted_count} 个不匹配的行")

def main():
    css_file_path = './out.css'
    txt_file_path = './3.txt'
    
    print("开始解析CSS文件...")
    difficulty_songs = parse_css_file(css_file_path)
    
    print("解析到的曲目信息:")
    for difficulty, songs in difficulty_songs.items():
        print(f"难度 {difficulty}: {len(songs)} 首曲目")
        # 可以取消注释查看详细曲目信息
        # for song, value in list(songs.items())[:5]:  # 只显示前5个
        #     print(f"  {song}: {value}")
        # if len(songs) > 5:
        #     print("  ...")
    
    print("\n开始处理3.txt文件...")
    process_3_txt(difficulty_songs, txt_file_path)

if __name__ == "__main__":
    main()