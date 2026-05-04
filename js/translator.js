import { tradToSimp, simpToTrad } from './dict.js';

let currentLang = localStorage.getItem('appLang') || 'trad'; // 'trad' or 'simp'

export function getLanguage() {
    return currentLang;
}

export function setLanguage(lang) {
    if (lang !== 'trad' && lang !== 'simp') return;
    currentLang = lang;
    localStorage.setItem('appLang', lang);
    applyLanguage();
}

export function initLanguageToggle() {
    const toggleBtn = document.getElementById('languageToggle');
    if (!toggleBtn) return;
    
    toggleBtn.addEventListener('click', () => {
        if (currentLang === 'trad') {
            setLanguage('simp');
        } else {
            setLanguage('trad');
        }
    });

    updateToggleVisual();
}

function updateToggleVisual() {
    const langTrad = document.getElementById('langTrad');
    const langSimp = document.getElementById('langSimp');
    if (!langTrad || !langSimp) return;

    if (currentLang === 'trad') {
        langTrad.style.opacity = '1';
        langSimp.style.opacity = '0.5';
    } else {
        langTrad.style.opacity = '0.5';
        langSimp.style.opacity = '1';
    }
}

// Convert string using the mapping
export function translateString(text) {
    if (!text) return text;
    const mapping = currentLang === 'simp' ? tradToSimp : simpToTrad;
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        result += mapping[char] || char;
    }
    return result;
}

// Walk the DOM and explicitly translate text nodes
function applyLanguage() {
    updateToggleVisual();
    
    // An event can be dispatched so other dynamic rendering scripts know to update if needed.
    const event = new CustomEvent('languageChanged', { detail: currentLang });
    window.dispatchEvent(event);
    
    // Also, we can just walk the DOM and replace text.
    // However, if DOM walking is done, it could translate things iteratively multiple times.
    // To prevent translating already translated texts incorrectly (or losing original if mappings are incomplete),
    // it's safer to re-render the dynamic content or have lesson.js handle it.
}

