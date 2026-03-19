export function renderColourColour(module, idx) {
    const container = document.createElement('div');
    container.className = 'colour-keys-container mb-3';
    
    const h3 = document.createElement('h3');
    h3.textContent = '填色提示';
    container.appendChild(h3);

    const keysDiv = document.createElement('div');
    keysDiv.style.display = 'flex';
    keysDiv.style.gap = '15px';
    keysDiv.style.flexWrap = 'wrap';
    keysDiv.style.marginBottom = '15px';
    
    // global variable to keep palette for the page
    window.colourGamePalette = [];
    
    module.colors.forEach((col, i) => {
        if (col && col.trim() !== '') {
            const toneNum = i + 1;
            window.colourGamePalette.push(col.trim());
            
            const keyBox = document.createElement('div');
            keyBox.style.display = 'flex';
            keyBox.style.alignItems = 'center';
            keyBox.style.gap = '5px';
            
            const label = document.createElement('span');
            label.textContent = `第${toneNum}調：`;
            
            const colorRect = document.createElement('div');
            colorRect.style.width = '30px';
            colorRect.style.height = '30px';
            colorRect.style.backgroundColor = col.trim();
            colorRect.style.border = '1px solid #ccc';
            colorRect.style.borderRadius = '4px';
            
            keyBox.appendChild(label);
            keyBox.appendChild(colorRect);
            keysDiv.appendChild(keyBox);
        }
    });
    
    container.appendChild(keysDiv);

    // Provide a distinct words container place, which will be filled when Colour_puzzle renders
    const wordsDiv = document.createElement('div');
    wordsDiv.id = 'colour-game-distinct-words';
    wordsDiv.style.display = 'flex';
    wordsDiv.style.flexWrap = 'wrap';
    wordsDiv.style.gap = '15px';
    container.appendChild(wordsDiv);
    
    return container;
}

export function renderColourPuzzle(module, idx) {
    const container = document.createElement('div');
    container.className = 'colour-puzzle-container mb-3';
    
    const h3 = document.createElement('h3');
    h3.textContent = '填色遊戲 (點擊方格改變顏色)';
    container.appendChild(h3);

    const boardDiv = document.createElement('div');
    boardDiv.style.display = 'grid';
    boardDiv.style.gridTemplateColumns = 'repeat(8, 40px)';
    boardDiv.style.gridTemplateRows = 'repeat(8, 40px)';
    boardDiv.style.gap = '2px';
    boardDiv.style.margin = '20px 0';
    boardDiv.style.justifyContent = 'start';
    
    const palette = window.colourGamePalette || [];
    
    module.board.forEach((char, i) => {
        const cell = document.createElement('button');
        cell.className = 'btn-icon';
        cell.style.width = '40px';
        cell.style.height = '40px';
        cell.style.padding = '0';
        cell.style.display = 'flex';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.style.backgroundColor = '#fff';
        cell.style.border = '1px solid #ccc';
        cell.style.color = '#000';
        cell.textContent = char;
        
        let colorIdx = -1;
        cell.onclick = (e) => {
            e.preventDefault();
            if (palette.length === 0) return;
            colorIdx = (colorIdx + 1) % (palette.length + 1);
            if (colorIdx === palette.length) {
                cell.style.backgroundColor = '#fff'; // Reset to white
            } else {
                cell.style.backgroundColor = palette[colorIdx];
            }
        };
        
        boardDiv.appendChild(cell);
    });
    
    container.appendChild(boardDiv);
    
    // Setup distinct words
    setTimeout(() => {
        const wordsDiv = document.getElementById('colour-game-distinct-words');
        if (wordsDiv) {
            wordsDiv.innerHTML = ''; // clear if multiple re-renders
            
            // Render words
            module.distinct_items.forEach((item, di) => {
                const wordBox = document.createElement('div');
                wordBox.className = 'quiz-option fade-in';
                wordBox.style.display = 'flex';
                wordBox.style.flexDirection = 'column';
                wordBox.style.alignItems = 'center';
                wordBox.style.gap = '5px';
                wordBox.style.padding = '10px';
                wordBox.style.minWidth = '120px';
                
                // Character
                const charSpan = document.createElement('div');
                charSpan.style.fontSize = '1.5rem';
                charSpan.style.fontWeight = 'bold';
                charSpan.textContent = item.character;
                
                // Audio button
                const audioBtn = document.createElement('button');
                audioBtn.className = 'btn-icon secondary';
                audioBtn.style.padding = '5px 10px';
                audioBtn.style.fontSize = '0.8rem';
                audioBtn.onclick = () => window.playAudio(`distinct-${idx}-${di}`, item.audioFile);
                audioBtn.innerHTML = `▶️ 播放`;
                
                // Jyutping (hidden initially)
                const jyutping = document.createElement('div');
                jyutping.id = `distinct-jyutping-${idx}-${di}`;
                jyutping.className = 'hidden distinct-jyutping';
                jyutping.style.color = 'var(--text-secondary)';
                jyutping.textContent = item.jyutping;
                
                // Spectrogram (hidden initially)
                const specWrapper = document.createElement('div');
                specWrapper.id = `distinct-spec-${idx}-${di}`;
                specWrapper.className = 'hidden distinct-spec';
                specWrapper.style.width = '100%';
                specWrapper.style.marginTop = '5px';
                specWrapper.dataset.html = `
                    <div style="font-size:0.7rem; color:var(--text-secondary); text-align:left;">圖譜及音高：</div>
                    <div class="waveform" id="waveform-distinct-${idx}-${di}" data-src="${item.audioFile}" style="height: 40px; background: #eee; border-radius: 4px; border: 1px solid var(--primary-color);"></div>
                `;
                
                wordBox.appendChild(charSpan);
                wordBox.appendChild(audioBtn);
                wordBox.appendChild(jyutping);
                wordBox.appendChild(specWrapper);
                wordsDiv.appendChild(wordBox);
            });
        }
    }, 100);

    return container;
}

export function renderColourMC(module, idx) {
    const quizDiv = document.createElement('div');
    quizDiv.className = 'quiz fade-in mb-3';
    quizDiv.id = `cquiz-${idx}`;

    const question = document.createElement('div');
    question.className = 'quiz-question';
    question.textContent = module.question || "圖案是甚麼？";
    quizDiv.appendChild(question);

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'quiz-options';
    optionsContainer.style.display = 'grid';
    optionsContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
    optionsContainer.style.gap = 'var(--spacing-md)';

    let isSubmitted = false;

    module.options.forEach((option, index) => {
        const optWrapper = document.createElement('div');
        optWrapper.className = 'quiz-option';
        optWrapper.id = `cquiz-${idx}-option-${index}`;
        optWrapper.style.display = 'flex';
        optWrapper.style.flexDirection = 'column';
        optWrapper.style.alignItems = 'center';
        optWrapper.style.gap = '10px';

        const specWrapper = document.createElement('div');
        specWrapper.id = `cquiz-${idx}-spec-${index}`;
        specWrapper.style.width = '100%';
        specWrapper.style.marginBottom = '10px';
        specWrapper.className = 'hidden';

        specWrapper.dataset.html = `
            <div style="font-size:0.7rem; color:var(--text-secondary); text-align:left;">圖譜及音高：</div>
            <div class="waveform" id="waveform-cq${idx}-o${index}" data-src="${option.audioFile}" style="height: 60px; background: #eee; border-radius: 8px; border: 2px solid var(--primary-color);"></div>
        `;

        const audioBtn = document.createElement('button');
        audioBtn.className = 'btn-icon secondary';
        audioBtn.style.width = '100%';
        audioBtn.onclick = (e) => {
            e.stopPropagation();
            window.playAudio(`cq${idx}-o${index}`, option.audioFile);
        };
        audioBtn.innerHTML = `▶️ 播放示範 (${option.character})`;

        const selectBtn = document.createElement('button');
        selectBtn.className = 'btn-icon';
        selectBtn.style.width = '100%';
        selectBtn.style.fontSize = '1.5rem';
        selectBtn.textContent = option.character;
        selectBtn.id = `cquiz-${idx}-selectbtn-${index}`;

        const resultJyutping = document.createElement('div');
        resultJyutping.id = `cquiz-${idx}-jyutping-${index}`;
        resultJyutping.className = 'hidden';
        resultJyutping.style.color = 'var(--text-secondary)';
        resultJyutping.textContent = option.jyutping;
        
        const feedback = document.createElement('div');
        feedback.id = `cquiz-${idx}-feedback`;
        feedback.className = 'quiz-feedback hidden';
        
        selectBtn.onclick = () => {
            if (isSubmitted) return;

            const isCorrect = index === module.correctAnswer;

            if (isCorrect) {
                isSubmitted = true;
                optWrapper.classList.add('correct');

                module.options.forEach((_, i) => {
                    const sBtn = document.getElementById(`cquiz-${idx}-selectbtn-${i}`);
                    const optJy = document.getElementById(`cquiz-${idx}-jyutping-${i}`);
                    const optSp = document.getElementById(`cquiz-${idx}-spec-${i}`);

                    if (sBtn) sBtn.disabled = true;
                    if (optJy) optJy.classList.remove('hidden');
                    if (optSp && optSp.classList.contains('hidden')) {
                        optSp.classList.remove('hidden');
                        optSp.innerHTML = optSp.dataset.html;
                    }
                });
                
                // Show jyutping and specs for all distinct items in the puzzle
                const distJys = document.querySelectorAll('.distinct-jyutping');
                const distSps = document.querySelectorAll('.distinct-spec');
                
                distJys.forEach(el => el.classList.remove('hidden'));
                distSps.forEach(el => {
                    if (el.classList.contains('hidden')) {
                        el.classList.remove('hidden');
                        el.innerHTML = el.dataset.html;
                    }
                });

                if (window.initWavesurfers) {
                    setTimeout(() => window.initWavesurfers(), 50);
                }

                feedback.classList.remove('hidden');
                feedback.className = 'quiz-feedback correct';
                feedback.textContent = '✓ 答對了！恭喜！';
                quizDiv.appendChild(feedback);
                
            } else {
                optWrapper.classList.add('incorrect');
                feedback.classList.remove('hidden');
                feedback.className = 'quiz-feedback incorrect';
                feedback.textContent = '請再次聆聽錄音並選擇正確答案。';
                quizDiv.appendChild(feedback);
            }
        };

        optWrapper.appendChild(selectBtn);
        optWrapper.appendChild(specWrapper);
        optWrapper.appendChild(audioBtn);
        optWrapper.appendChild(resultJyutping);

        optionsContainer.appendChild(optWrapper);
    });

    quizDiv.appendChild(optionsContainer);
    return quizDiv;
}
