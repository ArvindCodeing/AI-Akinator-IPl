// import { askAI, initSession } from './groq.js';

const MAX_QUESTIONS = 10;
let questionCount = 0;

const el = id => document.getElementById(id);
const setText = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };

let sessionId = null;
let currentQuestionId = null;
let currentGuess = null;

async function startGame() {
  questionCount = 0;
  el('result').classList.add('hidden');
  el('debug').classList.add('hidden');
  el('question-card').classList.remove('hidden');
  el('controls').classList.remove('hidden');

  // Reset result HTML just in case it was changed
  el('result').innerHTML = `
    <h2 id="guess-title"></h2>
    <p id="guess-details"></p>
    <div class="btn-row" id="confirm-buttons">
      <button id="confirm-yes" class="btn"><i class="fa-solid fa-check"></i> Yes — Correct</button>
      <button id="confirm-no" class="btn"><i class="fa-solid fa-xmark"></i> No — Incorrect</button>
    </div>
  `;

  setText('question-count', `Question ${questionCount} / ${MAX_QUESTIONS}`);
  setText('confidence', `AI Confidence: 0%`);

  el('question-text').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Initializing Local AI Engine...';
  el('question-card').querySelectorAll('button').forEach(b => b.disabled = true);

  try {
    const res = await fetch('/start', { method: 'POST' });
    const data = await res.json();
    sessionId = data.sessionId;
    processNextAIState(null, data);
  } catch (err) {
    el('question-text').textContent = "Error: Please start the local server (node server.js)";
  }
}

async function processNextAIState(userAnswer, preloadedData = null) {
  el('question-card').classList.remove('hidden');
  el('controls').classList.remove('hidden');

  let response = preloadedData;

  if (!response && userAnswer) {
    el('question-text').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Engine calculating entropy...';
    el('question-card').querySelectorAll('button').forEach(b => b.disabled = true);

    try {
      const res = await fetch('/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          questionId: currentQuestionId,
          answer: userAnswer
        })
      });
      response = await res.json();
    } catch (err) {
      el('question-text').textContent = "Error communicating with backend.";
      return;
    }
  }

  if (response.type === "guess") {
    currentGuess = response.text;
    showGuess(response.text, response.confidence, response.details);
  } else if (response.type === "question") {
    currentQuestionId = response.questionId;
    // If it's a new question and not the initial one or an incorrect feedback
    if (userAnswer && userAnswer !== "No, that is incorrect. That is NOT the player. Please ask another question to narrow it down.") {
      questionCount++;
    }
    setText('question-count', `Question ${questionCount} / ${MAX_QUESTIONS}`);

    // Use actual confidence from candidates_pool
    let currentConfidence = 0;
    if (questionCount > 0 && response.candidates_pool && response.candidates_pool.length > 0) {
      currentConfidence = response.candidates_pool[0].probability;
    }
    setText('confidence', `AI Confidence: ~${currentConfidence}%`);

    el('question-text').textContent = response.text;
    el('question-card').querySelectorAll('button').forEach(b => b.disabled = false);

    // Auto-force guess if we reach max questions
    if (questionCount >= MAX_QUESTIONS) {
      processNextAIState("I don't know, just guess now.");
    }
  } else {
    el('question-text').textContent = response.text || "An error occurred.";
    el('question-card').querySelectorAll('button').forEach(b => b.disabled = false);
  }

  if (response.candidates_pool) {
    updateLivePool(response.candidates_pool);
  }
}

function updateLivePool(candidates) {
  const poolContainer = el('live-pool');
  const poolList = el('pool-list');

  if (!candidates || candidates.length === 0) {
    poolContainer.classList.add('hidden');
    return;
  }

  poolContainer.classList.remove('hidden');
  poolList.innerHTML = '';

  candidates.forEach(c => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.background = 'rgba(255, 255, 255, 0.1)';
    li.style.padding = '0.5rem 1rem';
    li.style.borderRadius = '8px';

    const name = document.createElement('span');
    name.textContent = c.name;

    const prob = document.createElement('span');
    prob.textContent = `${c.probability}%`;
    prob.style.fontWeight = 'bold';
    prob.style.color = '#03dac6';

    li.appendChild(name);
    li.appendChild(prob);
    poolList.appendChild(li);
  });
}

function showGuess(name, confidence, details) {
  el('guess-title').textContent = `You’re thinking of ${name}?`;
  el('guess-details').textContent = details || `Confidence: ${confidence || 90}%.`;
  el('result').classList.remove('hidden');

  // Hide the question card and controls while guessing so the user focuses on the result
  el('question-card').classList.add('hidden');
  el('controls').classList.add('hidden');
}

// UI wiring
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;

  if (btn.dataset.answer) {
    const answerMap = {
      'yes': 'Yes',
      'no': 'No',
      'maybe': 'Maybe',
      'dontknow': 'I don\'t know'
    };
    const answer = answerMap[btn.dataset.answer];
    processNextAIState(answer);
  } else if (btn.id === 'restart') {
    startGame();
  } else if (btn.id === 'force-guess') {
    processNextAIState("Make your best guess right now based on what you know.");
  } else if (btn.id === 'confirm-yes') {
    // Success state!
    el('guess-title').innerHTML = `<i class="fa-solid fa-trophy"></i> I knew it!`;
    el('guess-details').textContent = "Thanks for playing! AI wins again.";
    el('confirm-buttons').innerHTML = `<button id="restart" class="btn secondary">Play Again</button>`;
  } else if (btn.id === 'confirm-no') {
    // Resume the game
    el('result').classList.add('hidden');

    el('question-card').classList.remove('hidden');
    el('controls').classList.remove('hidden');
    el('question-text').innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Engine recalculating...';
    el('question-card').querySelectorAll('button').forEach(b => b.disabled = true);

    fetch('/reject_guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, playerName: currentGuess })
    }).then(res => res.json()).then(data => {
      processNextAIState(null, data);
    }).catch(err => {
      el('question-text').textContent = "Error rejecting guess.";
    });
  }
});

// start
startGame();
