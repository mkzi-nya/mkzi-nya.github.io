import re

with open('./mkzi/mkzi.md', 'r', encoding='utf-8') as f:
    md_content = f.read()

with open('./mkzi/index.html', 'r', encoding='utf-8') as f:
    html_template = f.read()

def md_to_html(text):
    # 1. 先保护转义符（把反斜杠+特殊字符替换成占位符）
    escapes = []
    def save_escape(match):
        escapes.append(match.group(0))
        return f'\x00ESCAPE{len(escapes)-1}\x00'
    
    text = re.sub(r'\\([\\`*_{}\[\]()#+\-.!~])', save_escape, text)
    
    # 2. 删除线 ~~text~~（注意：内部不能包含未闭合的~~）
    text = re.sub(r'~~(.*?)~~', r'<del>\1</del>', text)
    
    # 3. 标题
    text = re.sub(r'^### (.*?)$', r'<h3>\1</h3>', text, flags=re.M)
    text = re.sub(r'^## (.*?)$', r'<h2>\1</h2>', text, flags=re.M)
    text = re.sub(r'^# (.*?)$', r'<h1>\1</h1>', text, flags=re.M)
    
    # 4. 粗体
    text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', text)
    # 5. 斜体
    text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', text)
    # 6. 链接
    text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2">\1</a>', text)
    # 7. 无序列表
    text = re.sub(r'^- (.*?)$', r'<li>\1</li>', text, flags=re.M)
    text = re.sub(r'((<li>.*?</li>\n?)+)', r'<ul>\1</ul>', text)
    
    # 8. 恢复转义符
    for i, esc in enumerate(escapes):
        text = text.replace(f'\x00ESCAPE{i}\x00', esc)
        # 再把反斜杠转成 HTML 实体
        text = text.replace('\\~', '~')  # \~ 变成普通 ~
        text = text.replace('\\', '&#92;')
    
    # 9. 段落（跳过已有标签的行）
    lines = text.split('\n')
    result = []
    for line in lines:
        if line.strip() and not re.match(r'^\s*<[^>]+>', line):
            result.append(f'<p>{line}</p>')
        else:
            result.append(line)
    text = '\n'.join(result)
    
    return text

html_content = html_template.replace('{{html}}', md_to_html(md_content))

with open('./index.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print('生成成功：./index.html')