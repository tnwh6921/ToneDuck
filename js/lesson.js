// Lesson Page Controller
// Handles loading and displaying lesson content dynamically based on modules

import { loadLessonsData } from './data-loader.js';
import { createQuiz } from './quiz.js';
import { renderColourColour, renderColourPuzzle, renderColourMC } from './colour-game.js';
import { AudioPlayer } from './audio.js';

let currentLesson = null;
let currentLessonNumber = 1;
let totalLessons = 5;
const audioPlayer = new AudioPlayer();

// Expose functions globally for inline handlers
window.playAudio = (audioId, src) => audioPlayer.playAudio(audioId, src);
window.recordAudio = (audioId) => audioPlayer.recordAudio(audioId);
window.playSequence = (audioIds, srcs) => audioPlayer.playSequence(audioIds, srcs);
window.initWavesurfers = () => audioPlayer.initializeWavesurfers();

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentLessonNumber = parseInt(urlParams.get('lesson')) || 1;
    
    await loadLesson(currentLessonNumber);
    setupNavigation();
});

async function loadLesson(lessonNumber) {
    try {
        const lessons = await loadLessonsData();
        totalLessons = lessons.length;
        
        if (lessonNumber < 1 || lessonNumber > totalLessons) {
            showError('無此單元');
            return;
        }
        
        currentLesson = lessons[lessonNumber - 1];
        currentLessonNumber = lessonNumber;
        
        renderLesson();
    } catch (error) {
        console.error('Error loading lesson:', error);
        showError('加載單元內容失敗');
    }
}

function renderLesson() {
    if (!currentLesson) return;
    
    document.getElementById('lessonTitle').textContent = currentLesson.title || `單元 ${currentLessonNumber}`;
    document.title = `${currentLesson.title} - 廣東話聲調學習`;
    
    const container = document.getElementById('dynamicContent');
    container.innerHTML = '';
    
    if (currentLesson.description) {
        const descDiv = document.createElement('div');
        descDiv.className = 'intro mb-3';
        descDiv.innerHTML = `<p style="font-weight:bold; color:var(--text-secondary);">${currentLesson.description}</p>`;
        container.appendChild(descDiv);
    }
    
    if (currentLesson.modules) {
        let currentColourSection = null;

        currentLesson.modules.forEach((module, idx) => {
            const isColourModule = ['Colour_colour', 'Colour_puzzle', 'Colour_MC'].includes(module.type);
            
            let section;
            
            if (isColourModule) {
                if (!currentColourSection) {
                    currentColourSection = document.createElement('section');
                    currentColourSection.className = 'section content-box mb-3 fade-in';
                    
                    const h2 = document.createElement('h2');
                    h2.textContent = module.title || '填色遊戲';
                    currentColourSection.appendChild(h2);
                    
                    container.appendChild(currentColourSection);
                }
                section = currentColourSection;
            } else {
                currentColourSection = null;
                section = document.createElement('section');
                section.className = 'section content-box mb-3 fade-in';
                
                if (module.title) {
                    const h2 = document.createElement('h2');
                    h2.textContent = module.title;
                    section.appendChild(h2);
                }
                container.appendChild(section);
            }

            switch(module.type) {
                case 'Content':
                    section.innerHTML += `<p>${module.data.replace(/\n/g, '<br>')}</p>`;
                    break;
                case 'AudioPractice':
                    section.appendChild(renderAudioPractice(module, idx));      
                    break;
                case 'Quiz':
                    section.appendChild(createQuiz(module, idx));
                    break;
                case 'Colour_colour':
                    module.hideTitle = true;
                    section.appendChild(renderColourColour(module, idx));       
                    break;
                case 'Colour_puzzle':
                    module.hideTitle = true;
                    section.appendChild(renderColourPuzzle(module, idx));       
                    break;
                case 'Colour_MC':
                    module.hideTitle = true;
                    section.appendChild(renderColourMC(module, idx));
                    break;
                case 'Colour_Q':
                    const placeholder = document.createElement('p');
                    placeholder.style.color = "var(--text-secondary)";
                    placeholder.textContent = "(內容備用)";
                    section.appendChild(placeholder);
                    break;
            }
        });
    }updateNavigationButtons();
    
    // Initialize standard wavesurfers globally for rendered elements
    setTimeout(() => audioPlayer.initializeWavesurfers(), 200);
}

function renderAudioPractice(module, moduleIdx) {
    const grid = document.createElement('div');
    grid.className = 'audio-grid';
    
    // If double character (Prac_Disyl), the audio visualization will show for the combination
    module.items.forEach((item, itemIdx) => {
        const audioId = `m${moduleIdx}-i${itemIdx}`;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'audio-item';
        
        itemDiv.innerHTML = `
            <div class="audio-header">
                <h4 style="font-size: 2rem;">${item.character}</h4>
                <div class="audio-romanization">${item.jyutping}</div>
            </div>
            <!-- Audio visualization container -->
            <div>
                <div style="font-size:0.8rem; color:var(--text-secondary);">示範音調：</div>
                <div class="waveform" id="waveform-${audioId}" data-src="${item.audioFile}" style="height: 60px; background: #eee; border-radius: 8px; border: 2px solid var(--primary-color);"></div>
            </div>
            ${module.subType !== 'Content_Mono' ? `
            <!-- Recording spectrogram container -->
            <div class="mt-1 hidden" id="spectrogram-container-${audioId}">
                 <div style="font-size:0.8rem; color:var(--text-secondary);">你的音調（錄音對比）：</div>
                 <div class="spectrogram" id="spectrogram-${audioId}" style="height: 60px; background: #eee; border-radius: 8px; border: 2px solid #FFA500;"></div>
            </div>
            ` : ''}
            
            <div class="audio-controls">
                <button class="btn-icon" onclick="window.playAudio('${audioId}', '${item.audioFile}')">
                    ▶️ 播放示範
                </button>
                ${module.subType !== 'Content_Mono' ? `
                <button class="btn-icon secondary" onclick="window.recordAudio('${audioId}')">
                    🎤 對比錄音
                </button>
                ` : ''}
            </div>
            <div id="recording-status-${audioId}" class="hidden" style="margin-top: 0.5rem; font-size: 0.9rem;"></div>
        `;
        
        grid.appendChild(itemDiv);
    });
    
    return grid;
}

function setupNavigation() {
    const prevBtn = document.getElementById('prevLesson');
    const nextBtn = document.getElementById('nextLesson');
    
    prevBtn.addEventListener('click', () => {
        if (currentLessonNumber > 1) {
            window.location.href = `lesson.html?lesson=${currentLessonNumber - 1}`;
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentLessonNumber < totalLessons) {
            window.location.href = `lesson.html?lesson=${currentLessonNumber + 1}`;
        }
    });
}

function updateNavigationButtons() {
    document.getElementById('prevLesson').disabled = currentLessonNumber <= 1;
    document.getElementById('nextLesson').disabled = currentLessonNumber >= totalLessons;
}

function showError(message) {
    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <div class="content-box text-center" style="padding: 2rem;">
                <h2 style="color: var(--error);">錯誤</h2>
                <p>${message}</p>
                <a href="index.html" style="display: inline-block; margin-top: 1rem;">
                    <button>返回首頁</button>
                </a>
            </div>
        `;
    }
}
