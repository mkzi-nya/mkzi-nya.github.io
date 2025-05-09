import re
import glob

def extract_patterns(filepath):
    patterns = []
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            match = re.match(r'^\d+\.\s+(.*)', line.strip())
            if match:
                pattern = match.group(1)
                patterns.append(pattern)
    return patterns

def get_guessed_chars(patterns):
    guessed = set()
    for pattern in patterns:
        for ch in pattern:
            if ch != '*':
                guessed.add(ch.lower())
    guessed.add(' ')  # 将空格也纳入 guessed
    return guessed

def match_word(word, pattern, guessed):
    if len(word) != len(pattern):
        return False
    for wc, pc in zip(word, pattern):
        if pc == '*':
            if wc.lower() in guessed:
                return False
        else:
            if wc.lower() != pc.lower():
                return False
    return True

def match_line(line, pattern, guessed):
    return match_word(line.strip(), pattern.strip(), guessed)

def search_matches(patterns, guessed, limit=20):
    results = []
    for pattern in patterns:
        found = []
        for filename in glob.glob("*.txt"):
            with open(filename, 'r', encoding='utf-8') as f:
                for line in f:
                    if match_line(line, pattern, guessed):
                        found.append(line.strip())
                        if len(found) >= limit:
                            break
            if len(found) >= limit:
                break
        results.append((pattern, found))
    return results

def main():
    patterns = extract_patterns('./guess.txt')
    guessed = get_guessed_chars(patterns)
    results = search_matches(patterns, guessed)

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
