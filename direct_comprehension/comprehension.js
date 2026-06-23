// Firebase configuration (shared with the ranking study)
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

// Descriptive names stored with each response; UI never reveals model identity.
const MODELS = {
    sparse: 'sparse_step_2800_cached_dataset',
    fun_control: 'wan1.3b_fun_control_baseline',
};
const MODEL_KEYS = ['sparse', 'fun_control'];

// 9 scenes. Ground-truth translations are intentionally NOT included here —
// the test must stay blind. See analysis/comprehension_reference.json.
const SCENES = [
    { id: 'scene_01' },
    { id: 'scene_02' },
    { id: 'scene_03' },
    { id: 'scene_04' },
    { id: 'scene_05' },
    { id: 'scene_06' },
    { id: 'scene_07' },
    { id: 'scene_08' },
    { id: 'scene_09' },
    { id: 'scene_10' },
];
const SLOW_RATE = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Study State
// ─────────────────────────────────────────────────────────────────────────────

const study = {
    participantId: `C${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    consentGiven: false,
    consentTime: null,
    currentIndex: 0,
    questions: [],            // ordered [{ id, modelKey }]
    sceneAssignments: {},     // sceneId -> modelKey
    responses: [],            // accumulated response objects
    savedAnswers: {},         // sceneId -> { translation, couldNotUnderstand }
    replayCounts: {},         // sceneId -> number
    questionStart: null,      // ms timestamp for current question
    startTime: null,
    endTime: null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Build question list (per-participant random 5/4 model split)
// ─────────────────────────────────────────────────────────────────────────────

function buildQuestionList() {
    // Assign each scene to exactly one model, splitting the set as evenly as
    // possible (ceil/floor). A fair coin decides which model gets the larger
    // half when the count is odd. Randomized per participant; over many
    // participants each scene is seen by both models roughly equally.
    const bigKey = Math.random() < 0.5 ? 'sparse' : 'fun_control';
    const smallKey = bigKey === 'sparse' ? 'fun_control' : 'sparse';
    const bigCount = Math.ceil(SCENES.length / 2);

    const shuffledScenes = shuffleArray(SCENES);
    shuffledScenes.forEach((scene, i) => {
        study.sceneAssignments[scene.id] = i < bigCount ? bigKey : smallKey;
    });

    // Presentation order is independently randomized to reduce narrative priming.
    study.questions = shuffleArray(SCENES).map(scene => ({
        id: scene.id,
        modelKey: study.sceneAssignments[scene.id],
    }));

    console.log('Scene assignments:', study.sceneAssignments);
    console.log('Question order:', study.questions.map(q => q.id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Navigation
// ─────────────────────────────────────────────────────────────────────────────

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');

    const progressBar = document.getElementById('progress-bar');
    if (screenId === 'welcome' || screenId === 'thankyou') {
        progressBar.style.display = 'none';
    } else {
        progressBar.style.display = 'block';
        updateProgress();
    }
}

function updateProgress() {
    const total = study.questions.length;
    const pct = Math.min(100, (study.currentIndex / total) * 100);
    document.getElementById('progress-fill').style.width = `${pct}%`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent gating
// ─────────────────────────────────────────────────────────────────────────────

function onConsentChange() {
    const checked = document.getElementById('consent-checkbox').checked;
    document.getElementById('start-btn').disabled = !checked;
}

function startStudy() {
    if (!document.getElementById('consent-checkbox').checked) {
        alert('Please confirm the consent statement before starting.');
        return;
    }
    study.consentGiven = true;
    study.consentTime = new Date().toISOString();
    study.startTime = new Date().toISOString();

    buildQuestionList();
    study.currentIndex = 0;
    loadQuestion();
    showScreen('question');
}

// ─────────────────────────────────────────────────────────────────────────────
// Question Loading
// ─────────────────────────────────────────────────────────────────────────────

function loadQuestion() {
    const q = study.questions[study.currentIndex];
    const src = `videos/${q.id}_${q.modelKey}.mp4`;

    document.getElementById('question-title').textContent =
        `Video ${study.currentIndex + 1} of ${study.questions.length}`;

    if (study.replayCounts[q.id] === undefined) study.replayCounts[q.id] = 0;

    const normal = document.getElementById('video-normal');
    const slow = document.getElementById('video-slow');

    [normal, slow].forEach(v => {
        v.pause();
        v.removeAttribute('src');
        v.load(); // abort any in-flight fetch and reset playbackRate
    });

    normal.src = src;
    normal.playbackRate = 1.0;
    normal.load();

    slow.src = src;
    slow.load();
    // load() resets playbackRate to 1.0; re-apply once metadata is ready.
    slow.playbackRate = SLOW_RATE;
    slow.onloadedmetadata = () => { slow.playbackRate = SLOW_RATE; };

    // Count a replay whenever either player starts playing.
    normal.onplay = () => { study.replayCounts[q.id]++; };
    slow.onplay = () => { study.replayCounts[q.id]++; };

    // Restore or reset answer.
    const textarea = document.getElementById('translation-input');
    const cnu = document.getElementById('cnu-checkbox');
    const saved = study.savedAnswers[q.id];
    if (saved) {
        textarea.value = saved.translation || '';
        cnu.checked = !!saved.couldNotUnderstand;
    } else {
        textarea.value = '';
        cnu.checked = false;
    }
    applyCnuState();

    study.questionStart = Date.now();
    updateProgress();
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer input handling
// ─────────────────────────────────────────────────────────────────────────────

function applyCnuState() {
    const cnu = document.getElementById('cnu-checkbox').checked;
    const textarea = document.getElementById('translation-input');
    textarea.disabled = cnu;
    if (cnu) textarea.value = '';
}

function onCnuChange() {
    applyCnuState();
}

function onTranslationInput() {
    // If the user starts typing, they obviously understood something.
    if (document.getElementById('translation-input').value.trim()) {
        document.getElementById('cnu-checkbox').checked = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit & Navigate
// ─────────────────────────────────────────────────────────────────────────────

async function nextQuestion() {
    const translation = document.getElementById('translation-input').value.trim();
    const couldNotUnderstand = document.getElementById('cnu-checkbox').checked;

    if (!translation && !couldNotUnderstand) {
        alert('Please type a translation, or tick "I couldn\'t understand this video" to continue.');
        return;
    }

    const q = study.questions[study.currentIndex];
    study.savedAnswers[q.id] = { translation, couldNotUnderstand };

    const response = {
        participant_id: study.participantId,
        scene_id: q.id,
        model: MODELS[q.modelKey],
        model_key: q.modelKey,
        presentation_order: study.currentIndex,
        translation_text: translation,
        could_not_understand: couldNotUnderstand,
        replay_count: study.replayCounts[q.id] || 0,
        time_spent_ms: Date.now() - study.questionStart,
    };

    // Replace any prior response for this scene, then store.
    study.responses = study.responses.filter(r => r.scene_id !== q.id);
    study.responses.push(response);

    await saveResponseToFirebase(response);

    // Confirmation flash on the Next button.
    const btn = document.querySelector('.btn.btn-primary[onclick="nextQuestion()"]');
    if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = '&#10003; Saved';
        btn.style.background = '#22c55e';
        btn.disabled = true;
        await new Promise(r => setTimeout(r, 500));
        btn.innerHTML = original;
        btn.style.background = '';
        btn.disabled = false;
    }

    study.currentIndex++;
    if (study.currentIndex >= study.questions.length) {
        finishStudy();
    } else {
        loadQuestion();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
}

function previousQuestion() {
    if (study.currentIndex > 0) {
        study.currentIndex--;
        loadQuestion();
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase
// ─────────────────────────────────────────────────────────────────────────────

async function saveResponseToFirebase(response) {
    if (!database) {
        console.log('Firebase not configured. Skipping save.', response);
        return;
    }
    try {
        const ref = database.ref(
            `comprehension_responses/${study.participantId}/responses/${response.scene_id}`
        );
        await ref.set(response);
        console.log(`Saved response for ${response.scene_id}`);
    } catch (error) {
        console.error('Firebase save error:', error);
    }
}

async function finishStudy() {
    study.endTime = new Date().toISOString();
    showScreen('thankyou');

    localStorage.setItem('comprehension_responses', JSON.stringify(study));

    if (database) {
        try {
            await database.ref(`comprehension_responses/${study.participantId}/metadata`).set({
                participantId: study.participantId,
                consentGiven: study.consentGiven,
                consentTime: study.consentTime,
                startTime: study.startTime,
                endTime: study.endTime,
                totalResponses: study.responses.length,
                sceneOrder: study.questions.map(q => q.id),
                sceneAssignments: study.sceneAssignments,
                timestamp: firebase.database.ServerValue.TIMESTAMP,
            });
            console.log('Metadata saved to Firebase');
        } catch (error) {
            console.error('Firebase metadata error:', error);
        }
    }
}
