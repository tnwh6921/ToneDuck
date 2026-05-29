// Main Application Entry Point
// Loads lesson cards on the home page

import { loadLessonsData } from './data-loader.js';
import {
    getOfflineMessage,
    isHomepageVisible,
    isSiteActive,
    loadExperimentConfig,
    renderExperimentNotice
} from './experiment-config.js';
import { initLanguageToggle } from './translator.js';
import { translateDOM } from './dom-translator.js';

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const experimentConfig = await loadExperimentConfig();

        if (!isSiteActive(experimentConfig) || !isHomepageVisible(experimentConfig)) {
            renderExperimentNotice(getOfflineMessage(experimentConfig));
            initLanguageToggle();
            translateDOM(document.body);
            return;
        }
    } catch (error) {
        console.error('Error loading experiment config:', error);
        renderExperimentNotice('ToneDuck is currently offline.');
        return;
    }

    await loadLessonCards();
    
    initLanguageToggle();
    translateDOM(document.body);
    
    window.addEventListener('languageChanged', () => {
        translateDOM(document.body);
    });
});

// Load and display lesson cards on home page
async function loadLessonCards() {
    const container = document.getElementById('lessonsContainer');
    
    if (!container) return;
    
    try {
        const lessons = await loadLessonsData();
        
        if (!lessons || lessons.length === 0) {
            container.innerHTML = '<p>No lessons available yet. Please check back later.</p>';
            return;
        }
        
        container.innerHTML = '';
        
        lessons.forEach((lesson, index) => {
            const card = createLessonCard(lesson, index + 1);
            container.appendChild(card);
        });
        
    } catch (error) {
        console.error('Error loading lessons:', error);
        container.innerHTML = '<p>Error loading lessons. Please refresh the page.</p>';
    }
}

// Create a lesson card element
function createLessonCard(lesson, lessonNumber) {
    const card = document.createElement('a');
    card.href = `lesson.html?lesson=${lessonNumber}`;
    card.className = 'lesson-card fade-in';
    
    card.innerHTML = `
        <span class="lesson-number">單元 ${lessonNumber}</span>
        <h3>${lesson.title}</h3>
        <p>${lesson.description}</p>
    `;
    
    return card;
}

// Export for testing
export { loadLessonCards, createLessonCard };
