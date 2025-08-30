#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import math
import re
from pathlib import Path
from itertools import combinations

# --- 与 JS 一致的计分核心 ---
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

def calculate_final_score(seq: str) -> int:
    """计算最终得分"""
    scores = calculate_running_scores(seq)
    return scores[-1] if scores else 0

def parse_css_file(css_path: Path) -> dict:
    """解析CSS文件，提取所有难度和谱面数据"""
    content = css_path.read_text(encoding="utf-8")
    
    # 使用正则表达式匹配所有难度类
    class_pattern = r'\.(\w+)\s*\{([^}]+)\}'
    class_matches = re.findall(class_pattern, content, re.DOTALL)
    
    charts = {}
    for difficulty, class_content in class_matches:
        # 提取该类中的所有谱面
        chart_pattern = r'--([^:]+):\s*"([^"]*)"'
        chart_matches = re.findall(chart_pattern, class_content)
        
        charts[difficulty] = {}
        for chart_name, sequence in chart_matches:
            charts[difficulty][chart_name] = sequence
    
    return charts

def convert_sequence(original_seq: str) -> str:
    """转换序列：0,1->m; 2,3->mm; 4->e"""
    converted = []
    for char in original_seq:
        if char in "01":
            converted.append("m")
        elif char in "23":
            converted.append("mm")
        elif char == "4":
            converted.append("e")
        else:
            # 处理意外字符
            converted.append(char)
    return "".join(converted)

def find_e_positions(seq: str) -> list[int]:
    """找到所有e的位置（从1开始计数）"""
    return [i+1 for i, char in enumerate(seq) if char == "e"]

def replace_e_at_positions(seq: str, positions: list[int]) -> str:
    """将指定位置的e替换为m"""
    seq_list = list(seq)
    for pos in positions:
        if 0 < pos <= len(seq_list) and seq_list[pos-1] == "e":
            seq_list[pos-1] = "m"
    return "".join(seq_list)

def get_e_index_in_all_e(e_positions: list[int], absolute_positions: list[int]) -> list[int]:
    """将绝对位置转换为在所有e中的序号（第几个e）"""
    e_indexes = []
    for pos in absolute_positions:
        if pos in e_positions:
            e_indexes.append(e_positions.index(pos) + 1)  # 从1开始计数
    return e_indexes

from functools import lru_cache
import bisect

def find_optimal_replacement(converted_seq: str, e_positions: list[int]) -> tuple[list[int], str]:
    """寻找最优替换方案"""
    if not e_positions:
        return [], converted_seq
    
    
    # 第一步：尝试替换前n个e
    n = 1
    optimal_n = 0
    found_optimal = False
    
    while n <= len(e_positions):
        # 替换前n个e
        positions_to_replace = e_positions[:n]
        modified_seq = replace_e_at_positions(converted_seq, positions_to_replace)
        score = calculate_final_score(modified_seq)
        
        if score > 114514:
            n += 1
            if n > 200:
                return [], converted_seq
        elif score < 114514:
            optimal_n = n - 1
            found_optimal = True
            break
        else:  # score == 114514
            return positions_to_replace, modified_seq
    
    if not found_optimal and n > len(e_positions):
        optimal_n = len(e_positions)

    # 第二步：在前10+optimal_n和后10+optimal_n个e中寻找optimal_n个替换
    front_limit = min(10 + optimal_n, len(e_positions))
    back_limit = min(10 + optimal_n, len(e_positions))
    
    front_e = e_positions[:front_limit]
    back_e = e_positions[-back_limit:] if len(e_positions) > back_limit else []
    candidate_positions = list(set(front_e + back_e))
    candidate_positions.sort()
    
    # 尝试所有组合
    for combo in combinations(candidate_positions, optimal_n):
        modified_seq = replace_e_at_positions(converted_seq, list(combo))
        score = calculate_final_score(modified_seq)
        
        if score == 114514:
            return list(combo), modified_seq
    
    return [], converted_seq
def write_result_to_file(result: dict):
    """将单个结果写入文件"""
    with open("1.txt", "a", encoding="utf-8") as f:
        f.write(f"{result['difficulty']}_{result['chart_name']}\n")
        f.write(f"{','.join(map(str, result['e_indexes']))}\n")
        f.write(f"{result['final_seq']}\n\n")

def main():
    css_path = Path("./out.css")
    if not css_path.exists():
        print("out.css 文件不存在")
        return
    
    # 清空或创建输出文件
    with open("1.txt", "w", encoding="utf-8") as f:
        f.write("")
    
    # 解析CSS文件
    charts_by_difficulty = parse_css_file(css_path)
    
    # 遍历所有难度
    for difficulty, charts in charts_by_difficulty.items():
        print(f"\n处理难度: {difficulty}")
        
        # 遍历该难度下的所有谱面
        for chart_name, original_seq in charts.items():
            if not original_seq.strip():  # 跳过空序列
                continue
                
            print(f"  处理谱面: {chart_name}")
            
            # 转换序列
            converted_seq = convert_sequence(original_seq)
            
            # 计算初始得分
            initial_score = calculate_final_score(converted_seq)
            
            if initial_score < 114514:
                print(f"    初始得分 {initial_score} < 114514，跳过")
                continue
            
            print(f"    初始得分 {initial_score} >= 114514，开始处理")
            
            # 找到所有e的位置
            e_positions = find_e_positions(converted_seq)
            print(f"    找到 {len(e_positions)} 个e")
            
            if not e_positions:
                print(f"    谱面没有e，跳过")
                continue
            
            # 寻找最优替换方案
            optimal_positions, final_seq = find_optimal_replacement(converted_seq, e_positions)
            
            if optimal_positions:
                # 验证最终得分
                final_score = calculate_final_score(final_seq)
                if final_score == 114514:
                    # 转换为在所有e中的序号
                    e_indexes = get_e_index_in_all_e(e_positions, optimal_positions)
                    
                    result = {
                        "difficulty": difficulty,
                        "chart_name": chart_name,
                        "e_indexes": e_indexes,
                        "final_seq": final_seq
                    }
                    
                    # 实时写入文件
                    write_result_to_file(result)
                    print(f"    找到匹配: 替换第 {e_indexes} 个e, 得分 {final_score}")
                else:
                    print(f"    验证失败: 预期 114514, 实际 {final_score}")
            else:
                print(f"    未找到114514的替换方案")
    
    print("\n处理完成，结果已实时写入1.txt")

if __name__ == "__main__":
    main()