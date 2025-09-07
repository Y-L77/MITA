// selector.js
// Question selector / roulette logic
// Loads questions.json, filters by elo, cycles metadata rapidly to simulate roulette,
// allows two players to confirm, then writes selectedQuestionId and selectedElo to localStorage
// and redirects to MITA_P_PROTO1.html

(async function () {
  const rouletteWindow = document.getElementById('roulette-window');
  const spinBtn = document.getElementById('spin-btn');
  const eloInput = document.getElementById('elo-input');
  const saveEloBtn = document.getElementById('save-elo');
  const homeBtn = document.getElementById('home-confirm');
  const guestBtn = document.getElementById('guest-confirm');
  const poolInfo = document.getElementById('pool-info');
  const shownId = document.getElementById('currently-shown-id');

  let questions = [];
  let pool = [];
  let spinning = false;
  let currentIndex = 0;
  let displayedQuestion = null;
  let homeConfirmed = false;
  let guestConfirmed = false;

  // Load questions.json
  async function loadQuestions() {
    try {
      const r = await fetch('questions.json');
      if (!r.ok) throw new Error('Failed to load questions.json');
      const data = await r.json();
      return data.questions || data;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  function updatePoolInfo() {
    poolInfo.textContent = `Pool: ${pool.length} question${pool.length === 1 ? '' : 's'} (ELO filter: ${eloInput.value})`;
  }

  function formatMetadata(q) {
    // Format: "1700\ncombinatorics\nalgebra" as requested
    const topics = (q.category && q.category.length) ? q.category.join('\n') : 'uncategorized';
    return `${q.elo}\n${topics}`;
  }

  function flashWindow() {
    rouletteWindow.classList.add('flash');
    setTimeout(() => rouletteWindow.classList.remove('flash'), 90);
  }

  function startSpinAnimation(duration = 2600, speed = 70) {
    if (spinning || pool.length === 0) return;
    spinning = true;
    homeConfirmed = guestConfirmed = false;
    homeBtn.classList.remove('active');
    guestBtn.classList.remove('active');

    const start = Date.now();
    const end = start + duration;
    let tick = () => {
      if (Date.now() >= end) {
        spinning = false;
        // final selection is currently displayedQuestion
        localStorage.setItem('lastSelectorChosenId', displayedQuestion ? displayedQuestion.id : '');
        spinBtn.disabled = false;
        return;
      }
      // Advance index (increase randomness by sometimes skipping)
      currentIndex = (currentIndex + Math.floor(1 + Math.random() * 3)) % pool.length;
      displayedQuestion = pool[currentIndex];
      rouletteWindow.textContent = formatMetadata(displayedQuestion);
      shownId.textContent = `Shown ID: ${displayedQuestion.id}`;
      flashWindow();
      // slightly vary speed as it nears the end
      let elapsed = Date.now() - start;
      let remaining = Math.max(20, end - Date.now());
      // compute next timeout (ease out)
      let next = Math.min(180, Math.max(40, speed + Math.floor((elapsed / duration) * 140)));
      setTimeout(tick, next);
    };

    spinBtn.disabled = true;
    tick();
  }

  function handleConfirm(which) {
    if (spinning) return;
    if (!displayedQuestion) {
      alert('No question currently selected. Press SPIN first.');
      return;
    }
    if (which === 'home') {
      homeConfirmed = true;
      homeBtn.classList.add('active');
    } else {
      guestConfirmed = true;
      guestBtn.classList.add('active');
    }

    // When both confirm, write to localStorage and redirect to canvas
    if (homeConfirmed && guestConfirmed) {
      // Save selected question id and elo to localStorage
      localStorage.setItem('selectedQuestionId', String(displayedQuestion.id));
      localStorage.setItem('selectedElo', String(eloInput.value));
      // small visual feedback then redirect
      spinBtn.textContent = 'Ready — launching...';
      setTimeout(() => {
        window.location.href = 'MITA_P_PROTO1.html';
      }, 400);
    }
  }

  // Save ELO button
  saveEloBtn.addEventListener('click', () => {
    // store on localStorage for MITA page to pick up the elo
    const val = parseInt(eloInput.value || '0', 10);
    localStorage.setItem('selectedElo', String(Math.max(0, val)));
    updatePool();
  });

  homeBtn.addEventListener('click', () => handleConfirm('home'));
  guestBtn.addEventListener('click', () => handleConfirm('guest'));
  spinBtn.addEventListener('click', () => startSpinAnimation());

  // update pool based on elo Input
  function updatePool() {
    const elo = parseInt(eloInput.value || '0', 10);
    // Find questions within the same tier-like band: +/- 200 as a convenient filter
    // (you can tweak filter logic later; this keeps it responsive)
    pool = questions.filter(q => {
      // if q.elo missing treat as 0
      const qelo = typeof q.elo === 'number' ? q.elo : 0;
      // we'll accept anything within +/- 250 of requested elo
      return Math.abs(qelo - elo) <= 250;
    });

    if (pool.length === 0) {
      // fallback: include all questions of that exact elo tier if none matched
      pool = questions.slice();
    }

    // initial displayed question default
    if (pool.length > 0) {
      currentIndex = Math.floor(Math.random() * pool.length);
      displayedQuestion = pool[currentIndex];
      rouletteWindow.textContent = formatMetadata(displayedQuestion);
      shownId.textContent = `Shown ID: ${displayedQuestion.id}`;
    } else {
      displayedQuestion = null;
      rouletteWindow.textContent = 'No questions in pool';
      shownId.textContent = '—';
    }
    updatePoolInfo();
  }

  // initialization
  try {
    questions = await loadQuestions();

    // if there is a saved ELO in localStorage show it
    const savedElo = localStorage.getItem('selectedElo');
    if (savedElo) {
      eloInput.value = savedElo;
    }

    // default populate pool
    updatePool();

    // quick accessibility: allow Enter to spin
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') spinBtn.click();
    });

  } catch (err) {
    console.error('Selector init failed', err);
    rouletteWindow.textContent = 'Failed to load questions';
    poolInfo.textContent = '';
  }

})();
