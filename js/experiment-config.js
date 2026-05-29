// Shared experiment gating and token-assignment helpers.

const CONFIG_PATH = './data/experiment-config.json';
const VALID_MODES = new Set(['full-viz', 'no-viz']);

export async function loadExperimentConfig() {
    const response = await fetch(`${CONFIG_PATH}?t=${Date.now()}`, { cache: 'no-store' });

    if (!response.ok) {
        throw new Error(`Experiment config failed to load: ${response.status}`);
    }

    return response.json();
}

export function isSiteActive(config) {
    return config && config.siteActive === true;
}

export function isHomepageVisible(config) {
    return config && config.homepageVisible === true;
}

export function isDirectLessonAccessEnabled(config) {
    return config && config.directLessonAccess === true;
}

export function shouldHideQuizzesAndGames(config) {
    return config && config.hideQuizzesAndGames === true;
}

export function getOfflineMessage(config) {
    return (config && config.offlineMessage) || 'ToneDuck is currently offline.';
}

export async function resolveLessonAccess(config, urlParams) {
    if (!isSiteActive(config)) {
        return block(getOfflineMessage(config));
    }

    const isTraining = urlParams.get('training') === '1';

    if (isTraining) {
        return resolveTrainingAssignment(config, urlParams);
    }

    if (!isDirectLessonAccessEnabled(config)) {
        return block('This lesson requires an access link.');
    }

    return resolveDirectLessonAccess(urlParams);
}

export function renderExperimentNotice(message) {
    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <section class="experiment-notice content-box text-center">
                <h2>ToneDuck</h2>
                <p>${escapeHtml(message)}</p>
            </section>
        `;
    }

    const lessonTitle = document.getElementById('lessonTitle');
    if (lessonTitle) lessonTitle.textContent = 'ToneDuck';

    const lessonNav = document.querySelector('.lesson-nav');
    if (lessonNav) lessonNav.classList.add('hidden');

    const headerNav = document.querySelector('.lesson-header-nav');
    if (headerNav) headerNav.classList.add('hidden');

    document.title = 'ToneDuck';
}

export function isValidMode(mode) {
    return VALID_MODES.has(mode);
}

async function resolveTrainingAssignment(config, urlParams) {
    const token = urlParams.get('access');
    if (!token) {
        return block('This training link is missing an access token.');
    }

    const tokenHash = await sha256Hex(token);
    const assignment = (config.assignments || []).find(item => item.tokenHash === tokenHash);

    if (!assignment) {
        return block('This training link is not valid.');
    }

    const lessonNumber = Number.parseInt(assignment.lesson, 10);
    const mode = assignment.mode;

    if (!Number.isInteger(lessonNumber) || lessonNumber < 1 || !isValidMode(mode)) {
        return block('This training assignment is not configured correctly.');
    }

    return {
        ok: true,
        training: true,
        lessonNumber,
        mode
    };
}

function resolveDirectLessonAccess(urlParams) {
    const modeParam = urlParams.get('mode');

    if (modeParam && !isValidMode(modeParam)) {
        return block('Invalid visualization mode.');
    }

    return {
        ok: true,
        training: false,
        lessonNumber: Number.parseInt(urlParams.get('lesson'), 10) || 1,
        mode: modeParam || 'full-viz'
    };
}

async function sha256Hex(value) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error('Browser crypto API is not available.');
    }

    const bytes = new TextEncoder().encode(value);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hashBuffer))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

function block(message) {
    return {
        ok: false,
        message
    };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);
}
