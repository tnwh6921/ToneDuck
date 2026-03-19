// Quiz Component Module
// Handles the custom Quiz type with audio and Jyutping display

class Quiz {
    constructor(quizData, quizId) {
        this.data = quizData;
        this.id = quizId;
        this.isSubmitted = false;
    }
    
    // Create quiz element
    createElement() {
        const quizDiv = document.createElement('div');
        quizDiv.className = 'quiz fade-in';
        quizDiv.id = `quiz-${this.id}`;
        
        const question = document.createElement('div');
        question.className = 'quiz-question';
        question.textContent = this.data.question || "以下哪個字的聲調和其他不一樣？";
        quizDiv.appendChild(question);
        
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'quiz-options';
        optionsContainer.style.display = 'grid';
        optionsContainer.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
        optionsContainer.style.gap = 'var(--spacing-md)';
        
        this.data.options.forEach((option, index) => {
            const optWrapper = document.createElement('div');
            optWrapper.className = 'quiz-option';
            optWrapper.id = `quiz-${this.id}-option-${index}`;
            optWrapper.style.display = 'flex';
            optWrapper.style.flexDirection = 'column';
            optWrapper.style.alignItems = 'center';
            optWrapper.style.gap = '10px';
            
            // Add spectrogram container for options (Req 6)
            const specWrapper = document.createElement('div');
            specWrapper.id = `quiz-${this.id}-spec-${index}`;
            specWrapper.style.width = '100%';
            specWrapper.style.marginBottom = '10px';
            specWrapper.className = 'hidden';
            
            // Store HTML to be injected later so Wavesurfer gets correct width when visible
            specWrapper.dataset.html = `
                <div style="font-size:0.7rem; color:var(--text-secondary); text-align:left;">圖譜及音高：</div>
                <div class="waveform" id="waveform-q${this.id}-o${index}" data-src="${option.audioFile}" style="height: 60px; background: #eee; border-radius: 8px; border: 2px solid var(--primary-color);"></div>
            `;
            
            const audioBtn = document.createElement('button');
            audioBtn.className = 'btn-icon secondary';
            audioBtn.style.width = '100%';
            audioBtn.onclick = (e) => {
                e.stopPropagation();
                window.playAudio(`q${this.id}-o${index}`, option.audioFile);
            };
            audioBtn.innerHTML = `▶️ 播放示範 (${option.character})`;
            
            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn-icon';
            selectBtn.style.width = '100%';
            selectBtn.style.fontSize = '1.5rem';
            selectBtn.textContent = option.character;
            selectBtn.onclick = () => this.selectOption(index);
            selectBtn.id = `quiz-${this.id}-selectbtn-${index}`;
            
            const resultJyutping = document.createElement('div');
            resultJyutping.id = `quiz-${this.id}-jyutping-${index}`;
            resultJyutping.className = 'hidden';
            resultJyutping.style.color = 'var(--text-secondary)';
            resultJyutping.textContent = option.jyutping;
            
            optWrapper.appendChild(selectBtn);
            optWrapper.appendChild(specWrapper);
            optWrapper.appendChild(audioBtn);
            optWrapper.appendChild(resultJyutping);
            
            optionsContainer.appendChild(optWrapper);
        });
        
        quizDiv.appendChild(optionsContainer);
        
        const feedback = document.createElement('div');
        feedback.id = `quiz-${this.id}-feedback`;
        feedback.className = 'quiz-feedback hidden';
        quizDiv.appendChild(feedback);
        
        return quizDiv;
    }
    
    // Handle option selection
    selectOption(index) {
        if (this.isSubmitted) return;
        
        const correctIndex = this.data.correctAnswer;
        const isCorrect = index === correctIndex;
        
        const wrapper = document.getElementById(`quiz-${this.id}-option-${index}`);
        const jyutping = document.getElementById(`quiz-${this.id}-jyutping-${index}`);
        const feedback = document.getElementById(`quiz-${this.id}-feedback`);
        
        if (isCorrect) {
            this.isSubmitted = true;
            
            // Mark correct
            if (wrapper) wrapper.classList.add('correct');
            
            // Disable all options and show ALL jyutping and spectrograms
            this.data.options.forEach((_, i) => {
                const selectBtn = document.getElementById(`quiz-${this.id}-selectbtn-${i}`);
                const optJyutping = document.getElementById(`quiz-${this.id}-jyutping-${i}`);
                const optSpec = document.getElementById(`quiz-${this.id}-spec-${i}`);
                
                if (selectBtn) selectBtn.disabled = true;
                if (optJyutping) optJyutping.classList.remove('hidden');
                
                if (optSpec && optSpec.classList.contains('hidden')) {
                    optSpec.classList.remove('hidden');
                    optSpec.innerHTML = optSpec.dataset.html;
                }
            });
            
            // Re-initialize any newly added waveforms
            if (window.initWavesurfers) {
                setTimeout(() => window.initWavesurfers(), 50);
            }
            
            if (feedback) {
                feedback.classList.remove('hidden');
                feedback.className = 'quiz-feedback correct';
                feedback.textContent = '✓ 答對了！恭喜！';
            }
        } else {
            // Incorrect
            if (wrapper) wrapper.classList.add('incorrect');
            
            if (feedback) {
                feedback.classList.remove('hidden');
                feedback.className = 'quiz-feedback incorrect';
                feedback.textContent = '再次聆聽錄音並選擇正確答案。';
            }
        }
    }
}

// Factory function to create quiz
export function createQuiz(quizData, quizId) {
    const quiz = new Quiz(quizData, quizId);
    return quiz.createElement();
}

export { Quiz };
