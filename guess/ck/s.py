import re
import glob

def extract_patterns(filepath):
    patterns = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            # 匹配形如 1. ***abc 的行
            match = re.match(r'^\d+\.\s+(.*)', line.strip())
            if match:
                pattern = match.group(1)
                patterns.append(pattern)
    return patterns

def match_word(word, pattern):
    if len(word) != len(pattern):
        return False
    for wc, pc in zip(word, pattern):
        if pc == '*':
            continue
        if wc.lower() != pc.lower():
            return False
    return True

def match_line(line, pattern):
    # pattern 可能含空格，匹配整行
    line = line.strip()
    pattern = pattern.strip()
    return match_word(line, pattern)

def search_matches(patterns, limit=20):
    results = []
    for pattern in patterns:
        found = []
        for filename in glob.glob("*.txt"):
            with open(filename, 'r', encoding='utf-8') as f:
                for line in f:
                    if match_line(line, pattern):
                        found.append(line.strip())
                        if len(found) >= limit:
                            break
            if len(found) >= limit:
                break
        results.append((pattern, found))
    return results

def main():
    patterns = extract_patterns('./guess.txt')
    results = search_matches(patterns)

    with open('out.txt', 'w', encoding='utf-8') as out:
        for i, (pattern, matches) in enumerate(results, 1):
            out.write(f'{i}. {pattern}\n')
            if matches:
                for match in matches:
                    out.write(f'  - {match}\n')
            else:
                out.write('  - (no match)\n')
            out.write('\n')

if __name__ == '__main__':
    main()
