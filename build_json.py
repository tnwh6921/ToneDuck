import pandas as pd
import json
import os

file_path = 'epepep_structure.xlsx'
xl = pd.ExcelFile(file_path)

struct2_df = xl.parse('Struct2')
word_df = xl.parse('Word')

word_dict = {}
for _, row in word_df.iterrows():
    if pd.notna(row['Honzi']) and pd.notna(row['Jyutping']):
        word_dict[str(row['Honzi']).strip()] = str(row['Jyutping']).strip()

def get_tone_combo(jyutping):
    tones = []
    for s in jyutping.split():
        if s and s[-1].isdigit():
            tones.append(s[-1])
        else:
            tones.append('?')
    return "+".join(tones)

lessons = []

for _, row in struct2_df.iterrows():
    unit = row['Unit']
    if pd.isna(unit):
        continue
    unit = int(unit)
    
    while len(lessons) < unit:
        lessons.append({
            "lessonNumber": len(lessons) + 1,
            "title": "",
            "description": "",
            "modules": []
        })
    
    current_lesson = lessons[unit - 1]
    
    module_type = str(row['Module']).strip()
    module_c = str(row['Module_C']).strip() if pd.notna(row['Module_C']) else ""
    data = str(row['Data']).strip() if pd.notna(row['Data']) else ""
    
    # Process modules
    if module_type == 'Unit_Title':
        current_lesson['title'] = data
    elif module_type == 'LearningObjectives':
        current_lesson['description'] = data
    elif module_type == 'Content':
        current_lesson['modules'].append({
            "type": "Content",
            "title": module_c,
            "data": data
        })
    elif module_type in ['Content_Mono', 'Prac_Mono']:
        items = []
        for char in data:
            if char.strip():
                items.append({
                    "character": char,
                    "jyutping": word_dict.get(char, "Unknown"),
                    "audioFile": f"asset/unit{unit}/{char}.wav"
                })
        current_lesson['modules'].append({
            "type": "AudioPractice",
            "subType": module_type,
            "title": module_c,
            "items": items
        })
    elif module_type == 'Prac_Disyl':
        unit_orders = {
            1: ['1+1', '2+2', '1+2', '2+1'],
            2: ['4+4', '4+1', '1+4', '4+2', '2+4'],
            3: ['3+3', '3+1', '1+3', '3+2', '2+3', '3+4', '4+3'],
            4: ['6+6', '6+1', '1+6', '6+2', '2+6', '6+3', '3+6', '6+4', '4+6'],
            5: ['5+5', '5+1', '1+5', '5+2', '2+5', '5+3', '3+5', '5+4', '4+5', '5+6', '6+5']
        }
        order = unit_orders.get(unit, [])
        from collections import defaultdict
        groups_dict = defaultdict(list)
        
        for word in data.split('|'):
            word = word.strip()
            if word:
                jp = word_dict.get(word, "Unknown")
                combo = get_tone_combo(jp)
                groups_dict[combo].append({
                    "character": word,
                    "jyutping": jp,
                    "audioFile": f"asset/unit{unit}/{word}.wav"
                })
        
        group_list = []
        for k in order:
            if k in groups_dict:
                group_list.append({
                    "title": k,
                    "items": groups_dict[k]
                })
                
        # remaining groups not in order
        for k in sorted(groups_dict.keys()):
            if k not in order:
                group_list.append({
                    "title": k,
                    "items": groups_dict[k]
                })

        current_lesson['modules'].append({
            "type": "AudioPractice",
            "subType": module_type,
            "title": module_c,
            "groups": group_list
        })
    elif module_type == 'Quiz':
        options = []
        correct_idx = 0
        raw_options = []
        
        i = 0
        while i < len(data):
            char = data[i]
            if char == '!':
                correct_idx = len(raw_options)
                i += 1
                continue
            raw_options.append(char)
            i += 1
                
        for char in raw_options:
            options.append({
                "character": char,
                "jyutping": word_dict.get(char, "Unknown"),
                "audioFile": f"asset/unit{unit}/{char}.wav"
            })
            
        current_lesson['modules'].append({
            "type": "Quiz",
            "title": module_c,
            "question": "以下哪個字的聲調和其他不一樣？",
            "options": options,
            "correctAnswer": correct_idx
        })
    elif module_type == 'Colour_colour':
        colors = data.split(',')
        colors = (colors + ['']*6)[:6]
        current_lesson['modules'].append({
            "type": "Colour_colour",
            "title": module_c,
            "colors": colors
        })
    elif module_type == 'Colour_puzzle':
        chars = list(data)
        distinct_chars = set(chars)
        distinct_items = []
        for char in distinct_chars:
            if char.strip():
                distp = word_dict.get(char, "Unknown")
                tone = int(distp[-1]) if distp[-1].isdigit() else 0
                distinct_items.append({
                    "character": char,
                    "jyutping": distp,
                    "audioFile": f"asset/unit{unit}/{char}.wav",
                    "tone": tone
                })
        current_lesson['modules'].append({
            "type": "Colour_puzzle",
            "title": module_c,
            "board": chars,
            "distinct_items": distinct_items
        })
    elif module_type == 'Colour_MC':
        options = []
        correct_idx = 0
        raw_options = []

        i = 0
        while i < len(data):
            char = data[i]
            if char == '!':
                correct_idx = len(raw_options)
                i += 1
                continue
            raw_options.append(char)
            i += 1

        for char in raw_options:
            options.append({
                "character": char,
                "jyutping": word_dict.get(char, "Unknown"),
                "audioFile": f"asset/unit{unit}/{char}.wav"
            })

        current_lesson['modules'].append({
            "type": "Colour_MC",
            "title": module_c,
            "question": "答案",
            "options": options,
            "correctAnswer": correct_idx
        })
    elif module_type in ['Colour_Q', 'Link']:
        current_lesson['modules'].append({
            "type": module_type,
            "title": module_c,
            "data": data
        })

final_data = {"lessons": lessons}

with open('data/lessons.json', 'w', encoding='utf-8') as f:
    json.dump(final_data, f, ensure_ascii=False, indent=2)

print("lessons.json generated successfully!")
