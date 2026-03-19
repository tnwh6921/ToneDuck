import pandas as pd
import json

file_path = 'epepep_structure.xlsx'
xl = pd.ExcelFile(file_path)

# Print sheet names to understand the structure
print("Sheet names:", xl.sheet_names)

struct2_df = xl.parse('Struct2')
word_df = xl.parse('Word')

print("\nStruct2 columns:", struct2_df.columns.tolist())
print(struct2_df.head(10))
print("\nWord columns:", word_df.columns.tolist())
print(word_df.head(10))
