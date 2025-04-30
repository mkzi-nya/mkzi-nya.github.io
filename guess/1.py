import pandas as pd

# 读取原始数据文件
df = pd.read_csv('./zi-dataset.tsv', sep='\t', dtype=str)

# 只保留 "zi" 和 "stroke_count" 两列
df_simple = df[['zi', 'stroke_count']]

# 保存到新文件
df_simple.to_csv('./zi-strokes.tsv', sep='\t', index=False, encoding='utf-8')
