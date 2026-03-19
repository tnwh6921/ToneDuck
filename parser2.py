import pandas as pd
import json
import os
import math

file_path = 'C:/Users/annwa/OneDrive/Desktop/Workspace/epepep/epepep_structure.xlsx'
xl = pd.ExcelFile(file_path)

struct2_df = xl.parse('Struct2')
word_df = xl.parse('Word')

# Convert Word dataframe to dictionary mapping Honzi to Jyutping
word_dict = {}
for _, row in word_df.iterrows():
    if pd.notna(row['Honzi']) and pd.notna(row['Jyutping']):
        word_dict[str(row['Honzi']).strip()] = str(row['Jyutping']).strip()

lessons = []
current_lesson = None

for _, row in struct2_df.iterrows():
    unit = row['Unit']
    
    # Handle NaN
    if pd.isna(unit):
        continue
    unit = int(unit)
    
    while len(lessons) < unit:
        lessons.append({
            "lessonNumber": len(lessons) + 1,
            "title": "",
            "description": "",
            "introduction": "",
            "keyPoints": [],
            "modules": []
        })
    
    current_lesson = lessons[unit - 1]
    
    module_type = str(row['Module']).strip()
    module_c = str(row['Module_C']).strip() if pd.notna(row['Module_C']) else ""
    data = str(row['Data']).strip() if pd.notna(row['Data']) else ""
    
    if module_type == 'Unit_Title':
        current_lesson['title'] = data
    elif module_type == 'LearningObjectives':
        current_lesson['description'] = data
    elif module_type == 'Content':
        # Used as introductory/key point texts?
        # Actually I can just treat everything as a module to display in order.
        current_lesson['modules'].append({
            "type": "Content",
            "title": module_c,
            "data": data
        })
    elif module_type in ['Content_Mono', 'Prac_Mono', 'Prac_Disyl']:
        # Multiple characters in `data`, e.g., "都開今周"
        items = []
        # If it's Prac_Disyl, maybe data is comma separated?
        # Let's check how many characters per item. Let's just process string.
        # But maybe Prac_Disyl has two characters. Let's print out Prac_Disyl data.
        current_lesson['modules'].append({
            "type": module_type,
            "title": module_c,
            "data": data
        })
    elif module_type == 'Quiz':
        current_lesson['modules'].append({
            "type": "Quiz",
            "title": module_c,
            "data": data
        })
    elif module_type in ['Colour_Q', 'Colour_MC']:
        current_lesson['modules'].append({
            "type": module_type,
            "title": module_c,
            "data": ""
        })
    else:
        current_lesson['modules'].append({
            "type": module_type,
            "title": module_c,
            "data": data
        })

# Let's save this structure to see it.
with open('debug_lessons.json', 'w', encoding='utf-8') as f:
    json.dump(lessons, f, ensure_ascii=False, indent=2)

with open('debug_words.json', 'w', encoding='utf-8') as f:
    json.dump(word_dict, f, ensure_ascii=False, indent=2)

print("Parsed successfully!")
