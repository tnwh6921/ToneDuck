import json
import csv
import os

with open('data/lessons.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for lesson in data['lessons']:
    lesson_num = lesson.get('lessonNumber')
    if not lesson_num:
        continue
        
    csv_path = f'asset/unit{lesson_num}/Unit{lesson_num}.csv'
    wav_path = f'asset/unit{lesson_num}/Unit{lesson_num}.WAV'
    
    if not os.path.exists(csv_path):
        continue
        
    # Read the CSV mapping into a dictionary. 
    # Notice that there could be multiple occurrences of the same text.
    # To be safe, we will just map each character to its most recent start/end, or keep a list of them.
    # Let's see if the CSV text matches exactly the 'character' in items.
    
    char_map = {}
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # removing spaces just in case
            text = row['Text'].strip()
            # if double character, maybe they are combined?
            char_map[text] = {'start': float(row['Start']), 'end': float(row['End'])}
            
    # Also attempt splitting the text by character if the user has double/multi char string and mapping it to the same audio?
    # Actually, we need to match carefully.
    
    def update_item(item):
        char = item.get('character', '').strip()
        # if the exact character is in char_map
        if char in char_map:
            item['audioFile'] = wav_path
            item['startTime'] = char_map[char]['start']
            item['endTime'] = char_map[char]['end']
            return True
            
        # check if jyutping can help, or if double chars are represented together or separated.
        
        return False
        
    for module in lesson.get('modules', []):
        if 'items' in module:
            for item in module['items']:
                update_item(item)
        if 'groups' in module:
            for group in module['groups']:
                for item in group['items']:
                    update_item(item)

with open('data/lessons_updated.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Done.')
