with open('js/colour-game.js', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('window.playAudio(cq\-o\, option.audioFile);', 'window.playAudio(cq\-o\, option.audioFile, option.startTime, option.endTime);')

with open('js/colour-game.js', 'w', encoding='utf-8') as f:
    f.write(text)
