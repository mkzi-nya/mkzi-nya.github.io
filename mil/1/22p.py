def calculate_running_scores(seq: str) -> list[int]:
    noteAmount = len(seq)
    
    # 参数预计算
    bMax = min(192, max(int(noteAmount * 0.24), 1))
    
    # 使用数组而不是字典
    a_arr = [0] * 256  # ASCII映射
    b_arr = [0] * 256
    score_arr = [0] * 256
    
    # 设置映射
    for char, a_val, b_val, score_val in [
        ('e', 2, bMax, 100),
        ('p', 1, bMax, 99),
        ('g', 0, min(128, max(int(noteAmount * 0.16), 1)), 60),
        ('n', 0, min(96, max(int(noteAmount * 0.12), 1)), 30),
        ('b', 0, min(64, max(int(noteAmount * 0.1), 1)), 15),
        ('m', 0, min(64, max(int(noteAmount * 0.08), 1)), 0)
    ]:
        idx = ord(char)
        a_arr[idx] = a_val
        b_arr[idx] = b_val
        score_arr[idx] = score_val
    
    totalAccScore = totalComboScore = maxCombo = currentCombo = 0
    currentComboScore = bMax
    
    # 预计算break字符的ASCII
    break_b = ord('b')
    break_m = ord('m')
    
    for char in seq:
        idx = ord(char)
        
        totalAccScore += score_arr[idx]
        
        # 连击判断
        if idx != break_b and idx != break_m:
            currentCombo += 1
            if currentCombo > maxCombo:
                maxCombo = currentCombo
        else:
            currentCombo = 0
        
        # 连击分计算
        a = a_arr[idx]
        b = b_arr[idx]
        currentComboScore += a
        if currentComboScore > b:
            currentComboScore = b
        elif currentComboScore < 0:
            currentComboScore = 0
            
        totalComboScore += currentComboScore

    if currentComboScore < bMax:
        diff = bMax - currentComboScore - 1
        totalComboScore = max(totalComboScore + (1 - diff * diff) * 0.25, 0)
    
    # AP判断
    has_ap = True
    for char in seq:
        if char != 'e' and char != 'p':
            has_ap = False
            break
    
    apBonus = 5000 if has_ap else 0
    accScore = totalAccScore * 10000 / noteAmount
    comboMult = totalComboScore / (noteAmount * bMax)
    comboBonus = 5000 * maxCombo / noteAmount
    finalScore = accScore * (0.4 + 0.6 * comboMult) + comboBonus + apBonus
    
    return [int(finalScore)]

def search_for_a_b(c, last_b_dict):
    """对于给定的c值，搜索满足条件的a和b"""
    target_score = 114514
    max_total_length = 1800
    results = []
    
    # 获取上一次的b值，如果没有则从0开始
    last_b = last_b_dict.get(c, 0)
    
    a_start = 1
    a_end = max_total_length - c
    
    for a in range(a_start, a_end + 1):
        # 创建前缀（c个g）
        prefix = 'p' * c
        
        # 二分搜索b值
        left = last_b
        right = max_total_length - c - a
        
        if left > right:
            continue
            
        found = False
        
        while left <= right:
            b = (left + right) // 2
            total_length = c + a + b
            
            if total_length > max_total_length:
                right = b - 1
                continue
                
            # 构建完整序列：c个g + a个e + b个m
            full_sequence = prefix + ('e' * a) + ('m' * b)
            score = calculate_running_scores(full_sequence)[0]
            
            if score > target_score:
                # 分数太高，需要更多m来降低分数
                left = b + 1
            elif score < target_score:
                # 分数太低，需要减少m
                right = b - 1
            else:
                # 找到精确匹配
                results.append((c, a, b))
                last_b_dict[c] = b  # 更新该c值对应的last_b
                found = True
                break
        

    
    return results

def main_search():
    """主搜索函数"""
    max_total_length = 2800
    last_b_dict = {}  # 记录每个c值对应的最后一个b值
    
    # 清空或创建输出文件
    with open('./2.txt', 'w', encoding='utf-8') as f:
        f.write("a+b+c\tc\ta\tb\n")
        f.write("=" * 30 + "\n")
    
    print("开始搜索...")
    print("a+b+c\tc\ta\tb")
    print("=" * 30)
    
    total_found = 0
    
    # c从0开始递增
    c = 25
    while c <= max_total_length:
        # 检查c值是否过大
        if c > max_total_length:
            break
            
        print(f"正在搜索 c={c}...")
        
        # 搜索该c值下的a和b
        results = search_for_a_b(c, last_b_dict)
        
        # 记录结果
        for c_val, a_val, b_val in results:
            total_length = c_val + a_val + b_val
            result_line = f"{total_length}\t{c_val}\t{a_val}\t{b_val}"
            
            print(result_line)
            
            with open('./2.txt', 'a', encoding='utf-8') as f:
                f.write(result_line + "\n")
            
            total_found += 1
        
        c += 1
        
        # 显示进度
        if c % 10 == 0:
            print(f"进度: c={c}, 已找到 {total_found} 个精确解")
    
    print("搜索完成！")
    print(f"总共找到 {total_found} 个精确解")

# 运行搜索
if __name__ == "__main__":
    main_search()