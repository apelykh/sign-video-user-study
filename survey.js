// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB-vI2B28YRQDVnFlOYXhJ1CJ7GGTvPowE",
    authDomain: "sign-video-user-study.firebaseapp.com",
    databaseURL: "https://sign-video-user-study-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "sign-video-user-study",
    storageBucket: "sign-video-user-study.firebasestorage.app",
    messagingSenderId: "287567805486",
    appId: "1:287567805486:web:09bd54a5ce11812b5a73bf"
};

let database = null;
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    console.log('Firebase initialized');
} catch (error) {
    console.warn('Firebase not configured. Demo mode.', error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const MODELS = ['ours', 'fun_control', 'signvip', 'signgan', 'vace'];
const VIDEO_LABELS = ['A', 'B', 'C', 'D'];

// BSL Visual Ranking — 12 clips, no reference
const BSL_VIS_CLIPS = [
    { id: 'bsl_vis_01', dataset: 'bslzone' },
    { id: 'bsl_vis_02', dataset: 'bslzone' },
    { id: 'bsl_vis_03', dataset: 'bslzone' },
    { id: 'bsl_vis_04', dataset: 'bslzone' },
    { id: 'bsl_vis_05', dataset: 'bslzone' },
    { id: 'bsl_vis_06', dataset: 'bslzone' },
    { id: 'bsl_vis_07', dataset: 'bslzone' },
    { id: 'bsl_vis_08', dataset: 'bslzone' },
    { id: 'bsl_vis_09', dataset: 'bslzone' },
    { id: 'bsl_vis_10', dataset: 'bslzone' },
    { id: 'bsl_vis_11', dataset: 'bslzone' },
    { id: 'bsl_vis_12', dataset: 'bslzone' },
];

// Phoenix Visual Ranking — 5 clips, with reference video
const PHOENIX_VIS_CLIPS = [
    { id: 'phoenix_vis_01', dataset: 'phoenix' },
    { id: 'phoenix_vis_02', dataset: 'phoenix' },
    { id: 'phoenix_vis_03', dataset: 'phoenix' },
    { id: 'phoenix_vis_04', dataset: 'phoenix' },
    { id: 'phoenix_vis_05', dataset: 'phoenix' },
];

// Text Reference BSL — 5 clips, with English text reference
const TEXT_REF_CLIPS = [
    { id: 'bsl_text_01', dataset: 'bslzone', referenceText: '£450,000' },
    { id: 'bsl_text_02', dataset: 'bslzone', referenceText: "Look at the walls in here, painted white. They're great." },
    { id: 'bsl_text_03', dataset: 'bslzone', referenceText: 'The Deaf History event was set up here.' },
    { id: 'bsl_text_04', dataset: 'bslzone', referenceText: 'For many years, Deaf people have been involved...' },
    { id: 'bsl_text_05', dataset: 'bslzone', referenceText: '... understand how to measure distance, the area of a galaxy.' },
];

// Question type metadata
const QUESTION_TYPES = {
    bsl_visual: {
        title: 'BSL Visual Ranking',
        instructions: 'Watch the four videos below and rank them by the <strong>naturalness of signing</strong>, <strong>quality and expressivity of hand and facial features</strong> (1 = best, 4 = worst). Drag or use arrows to reorder.',
        hasReferenceVideo: false,
        hasReferenceText: false,
    },
    phoenix_visual: {
        title: 'Phoenix Visual Ranking',
        instructions: 'Watch the four videos below and rank them by the <strong>naturalness of signing</strong>, <strong>quality and expressivity of hand and facial features</strong> (1 = best, 4 = worst). Drag or use arrows to reorder.',
        hasReferenceVideo: false,
        hasReferenceText: false,
    },
    text_reference: {
        title: 'Text Comprehension Ranking',
        instructions: 'Read the reference text, then rank the four videos by how well they represent the text in British Sign Language (1 = best, 4 = worst). Drag or use arrows to reorder.',
        hasReferenceVideo: false,
        hasReferenceText: true,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Survey State
// ─────────────────────────────────────────────────────────────────────────────

const survey = {
    participantId: `P${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    bslProficiency: '',
    isAdvancedBsl: false,
    currentIndex: 0,
    questions: [],      // Populated after proficiency selection
    modelMappings: {},  // clipId -> {A: model, B: model, ...}
    responses: [],
    startTime: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickRandom(arr, n) {
    return shuffleArray(arr).slice(0, n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initializeRankingInterface();
});

function buildQuestionList() {
    let questions;

    if (survey.isAdvancedBsl) {
        // 9 BSL visual (random from 12) + 3 Phoenix (random from 5) + 5 text ref = 17
        const bslSubset = pickRandom(BSL_VIS_CLIPS, 9);
        const phoenixSubset = pickRandom(PHOENIX_VIS_CLIPS, 3);
        questions = [
            ...bslSubset.map(c => ({ ...c, type: 'bsl_visual' })),
            ...phoenixSubset.map(c => ({ ...c, type: 'phoenix_visual' })),
            ...TEXT_REF_CLIPS.map(c => ({ ...c, type: 'text_reference' })),
        ];
    } else {
        // 12 BSL visual + 5 Phoenix = 17
        questions = [
            ...BSL_VIS_CLIPS.map(c => ({ ...c, type: 'bsl_visual' })),
            ...PHOENIX_VIS_CLIPS.map(c => ({ ...c, type: 'phoenix_visual' })),
        ];
    }

    // Shuffle within each type, then concatenate in type order
    const byType = {};
    questions.forEach(q => {
        if (!byType[q.type]) byType[q.type] = [];
        byType[q.type].push(q);
    });
    const typeOrder = ['bsl_visual', 'phoenix_visual', 'text_reference'];
    const ordered = [];
    typeOrder.forEach(t => {
        if (byType[t]) ordered.push(...shuffleArray(byType[t]));
    });

    survey.questions = ordered;

    // Build balanced model exclusion schedule:
    // Each question shows 4 of 5 models (excludes 1). Spread exclusions evenly.
    // 'ours' is guaranteed to appear in ceil(N/5)*5 - remainder = max questions
    // (i.e. excluded only floor(N/5) times, never gets extra exclusions).
    const n = survey.questions.length;
    const baseExclusions = Math.floor(n / MODELS.length);
    const extra = n - baseExclusions * MODELS.length; // models needing 1 extra exclusion
    // Put 'ours' last so it never gets extra exclusions
    const otherModels = shuffleArray(MODELS.filter(m => m !== 'ours'));
    const exclusions = [];
    // First: other models get base+1 exclusions (for 'extra' of them)
    otherModels.forEach((m, i) => {
        const count = baseExclusions + (i < extra ? 1 : 0);
        for (let j = 0; j < count; j++) exclusions.push(m);
    });
    // 'ours' gets exactly baseExclusions
    for (let j = 0; j < baseExclusions; j++) exclusions.push('ours');
    const shuffledExclusions = shuffleArray(exclusions);

    survey.questions.forEach((q, idx) => {
        const excluded = shuffledExclusions[idx];
        const selected = shuffleArray(MODELS.filter(m => m !== excluded));
        survey.modelMappings[q.id] = {};
        VIDEO_LABELS.forEach((label, i) => {
            survey.modelMappings[q.id][label] = selected[i];
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Navigation
// ─────────────────────────────────────────────────────────────────────────────

const HALFWAY_AFTER = 8; // Show encouragement screen after this many questions

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');

    const progressBar = document.getElementById('progress-bar');
    if (screenId === 'welcome' || screenId === 'thankyou' || screenId === 'halfway') {
        progressBar.style.display = 'none';
    } else {
        progressBar.style.display = 'block';
        updateProgress();
    }
}

function dismissHalfway() {
    loadQuestion();
    showScreen('question');
}

function updateProgress() {
    const total = survey.questions.length;
    const pct = Math.min(100, (survey.currentIndex / total) * 100);
    document.getElementById('progress-fill').style.width = `${pct}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Start Survey
// ─────────────────────────────────────────────────────────────────────────────

function startSurvey() {
    const bslProficiency = document.querySelector('input[name="bsl-proficiency"]:checked')?.value;
    if (!bslProficiency) {
        alert('Please select your BSL proficiency level before starting.');
        return;
    }

    survey.bslProficiency = bslProficiency;
    survey.isAdvancedBsl = ['intermediate', 'advanced_fluent'].includes(bslProficiency);
    survey.startTime = new Date().toISOString();

    buildQuestionList();
    survey.currentIndex = 0;
    loadQuestion();
    showScreen('question');
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Question Loading
// ─────────────────────────────────────────────────────────────────────────────

function loadQuestion() {
    const q = survey.questions[survey.currentIndex];
    const meta = QUESTION_TYPES[q.type];
    const mapping = survey.modelMappings[q.id];

    // Update title and instructions
    document.getElementById('question-title').textContent =
        `${meta.title} (${survey.currentIndex + 1}/${survey.questions.length})`;
    document.getElementById('question-instructions').innerHTML = meta.instructions;

    // Reference video section
    const refVideoSection = document.getElementById('reference-video-section');
    if (meta.hasReferenceVideo) {
        refVideoSection.style.display = 'block';
        const refVideo = document.getElementById('reference-video');
        refVideo.src = `videos/${q.id}_reference.mp4`;
        refVideo.load();
    } else {
        refVideoSection.style.display = 'none';
    }

    // Reference text section
    const refTextSection = document.getElementById('reference-text-section');
    if (meta.hasReferenceText) {
        refTextSection.style.display = 'block';
        document.getElementById('reference-text-content').textContent = q.referenceText;
        // Re-trigger pulse animation
        refTextSection.style.animation = 'none';
        refTextSection.offsetHeight; // force reflow
        refTextSection.style.animation = '';
    } else {
        refTextSection.style.display = 'none';
    }

    // Candidate videos
    ['a', 'b', 'c', 'd'].forEach(label => {
        const videoEl = document.getElementById(`video-${label}`);
        const model = mapping[label.toUpperCase()];
        videoEl.src = `videos/${q.id}_${model}.mp4`;
        videoEl.load();
    });

    // Reset ranking and rating
    resetRanking();
    document.querySelectorAll('input[name="hf-rating"]').forEach(el => el.checked = false);

    updateProgress();
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit Answer & Navigate
// ─────────────────────────────────────────────────────────────────────────────

async function nextQuestion() {
    const ranking = getRanking();
    const rating = document.querySelector('input[name="hf-rating"]:checked')?.value;

    if (!ranking || !rating) {
        alert('Please complete both the ranking and the rating before continuing.');
        return;
    }

    const q = survey.questions[survey.currentIndex];
    const mapping = survey.modelMappings[q.id];

    // Build batch of responses for this question
    const batch = [];

    // 4 ranking responses
    for (const [label, rank] of Object.entries(ranking)) {
        batch.push({
            participant_id: survey.participantId,
            bsl_proficient: survey.bslProficiency,
            question_type: q.type,
            question_id: `rank_${q.id}`,
            clip_id: q.id,
            dataset: q.dataset,
            model: mapping[label],
            response_value: rank,
        });
    }

    // 1 rating response for the #1-ranked video
    const topLabel = Object.keys(ranking).find(l => ranking[l] === 1);
    batch.push({
        participant_id: survey.participantId,
        bsl_proficient: survey.bslProficiency,
        question_type: `${q.type}_rating`,
        question_id: `rating_${q.id}`,
        clip_id: q.id,
        dataset: q.dataset,
        model: mapping[topLabel],
        response_value: parseInt(rating),
    });

    // Save locally
    batch.forEach(r => survey.responses.push(r));

    // Save to Firebase immediately
    await saveQuestionToFirebase(batch);

    // Advance
    survey.currentIndex++;
    if (survey.currentIndex >= survey.questions.length) {
        finishSurvey();
    } else if (survey.currentIndex === HALFWAY_AFTER) {
        showScreen('halfway');
    } else {
        loadQuestion();
    }
}

function previousQuestion() {
    if (survey.currentIndex > 0) {
        survey.currentIndex--;
        // Remove last 5 local responses (4 ranks + 1 rating)
        survey.responses = survey.responses.slice(0, -5);
        loadQuestion();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking Interface (single, reused for all question types)
// ─────────────────────────────────────────────────────────────────────────────

let draggedItem = null;

function initializeRankingInterface() {
    const container = document.getElementById('ranking-interface');
    VIDEO_LABELS.forEach((label, i) => {
        const item = document.createElement('div');
        item.className = 'rank-item';
        item.draggable = true;
        item.dataset.label = label;
        item.innerHTML = `
            <div class="rank-number">${i + 1}</div>
            <div class="rank-label">Video ${label}</div>
            <div class="rank-arrows">
                <button type="button" class="arrow-up" title="Move up">&#9650;</button>
                <button type="button" class="arrow-down" title="Move down">&#9660;</button>
            </div>
        `;
        container.appendChild(item);

        // Arrow buttons
        item.querySelector('.arrow-up').addEventListener('click', e => {
            e.stopPropagation();
            const prev = item.previousElementSibling;
            if (prev) {
                prev.before(item);
                updateRankNumbers();
                updateArrowStates();
            }
        });
        item.querySelector('.arrow-down').addEventListener('click', e => {
            e.stopPropagation();
            const next = item.nextElementSibling;
            if (next) {
                next.after(item);
                updateRankNumbers();
                updateArrowStates();
            }
        });

        // Drag and drop
        item.addEventListener('dragstart', e => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            if (draggedItem && draggedItem !== item) {
                const all = [...container.children];
                const fromIdx = all.indexOf(draggedItem);
                const toIdx = all.indexOf(item);
                if (fromIdx < toIdx) item.after(draggedItem);
                else item.before(draggedItem);
                updateRankNumbers();
                updateArrowStates();
            }
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
        });
    });
    updateArrowStates();
}

function updateArrowStates() {
    const items = document.querySelectorAll('#ranking-interface .rank-item');
    items.forEach((item, i) => {
        item.querySelector('.arrow-up').disabled = (i === 0);
        item.querySelector('.arrow-down').disabled = (i === items.length - 1);
    });
}

function updateRankNumbers() {
    document.querySelectorAll('#ranking-interface .rank-item').forEach((item, i) => {
        item.querySelector('.rank-number').textContent = i + 1;
    });
}

function resetRanking() {
    const container = document.getElementById('ranking-interface');
    const items = [...container.children].sort((a, b) =>
        a.dataset.label.localeCompare(b.dataset.label)
    );
    items.forEach(item => container.appendChild(item));
    updateRankNumbers();
    updateArrowStates();
}

function getRanking() {
    const ranking = {};
    document.querySelectorAll('#ranking-interface .rank-item').forEach((item, i) => {
        ranking[item.dataset.label] = i + 1;
    });
    return ranking;
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase
// ─────────────────────────────────────────────────────────────────────────────

async function saveQuestionToFirebase(batch) {
    if (!database) {
        console.log('Firebase not configured. Skipping save.');
        return;
    }
    try {
        const qId = batch[0].question_id;
        const ref = database.ref(
            `survey_responses/${survey.participantId}/responses/${qId}`
        );
        await ref.set(batch);
        console.log(`Saved ${batch.length} responses for ${qId}`);
    } catch (error) {
        console.error('Firebase save error:', error);
    }
}

async function finishSurvey() {
    survey.endTime = new Date().toISOString();
    showScreen('thankyou');

    // localStorage backup
    localStorage.setItem('survey_responses', JSON.stringify(survey));

    // Save metadata
    if (database) {
        try {
            await database.ref(`survey_responses/${survey.participantId}/metadata`).set({
                participantId: survey.participantId,
                bslProficiency: survey.bslProficiency,
                isAdvancedBsl: survey.isAdvancedBsl,
                startTime: survey.startTime,
                endTime: survey.endTime,
                totalResponses: survey.responses.length,
                questionOrder: survey.questions.map(q => q.id),
                modelMappings: survey.modelMappings,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
            });
            console.log('Metadata saved to Firebase');
        } catch (error) {
            console.error('Firebase metadata error:', error);
        }
    }
}
