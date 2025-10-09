// selector.js — Single-player Selector (v4)
// - Filters by 9 canonical categories + ±150 ELO window
// - Randomize preview; Start => canvas
// - Renders per-question web chart (1–5) from q.web_difficulty
//   If missing, it derives a chart from ELO + categories (fallback).

(function(){
  const ELO_WINDOW = 150;
  const SAVE_KEY = 'mita_save_v3';
  const CATS = [
    'combinatorics','algebra','functions','trigonometry','geometry',
    'probability','number theory','logarithms','sequences'
  ];

  // map your miscellaneous labels to our 9 canonical axes
  const ALIASES = {
    'number-theory':'number theory',
    'gcd-lcm':'number theory',
    'divisibility':'number theory',
    'coordinate-geometry':'geometry',
    'exponents':'algebra',
    'calculus':'functions',
    'series':'sequences',
    'summation':'sequences',
    'telescoping':'sequences',
    'inclusion-exclusion':'combinatorics',
    'problem-solving':'algebra',
  };

  const el = {
    catList: document.getElementById('cat-list'),
    eloInput: document.getElementById('elo-input'),
    saveElo: document.getElementById('save-elo'),
    spinBtn: document.getElementById('spin-btn'),
    startBtn: document.getElementById('start-btn'),
    preview: document.getElementById('preview'),
    poolInfo: document.getElementById('pool-info'),
    currentId: document.getElementById('current-id'),
    currentElo: document.getElementById('current-elo'),
    miniRadar: document.getElementById('mini-radar'),
  };

  let questions = [];
  let selectedCats = new Set();
  let currentPick = null;

  // hydrate ELO
  (function seedElo(){
    try {
      const save = JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');
      if (typeof save.currentElo === 'number') el.eloInput.value = save.currentElo;
      else {
        const seed = localStorage.getItem('selectedElo');
        if (seed) el.eloInput.value = parseInt(seed,10);
      }
    } catch {}
  })();

  // chips
  function renderChips(){
    el.catList.innerHTML = '';
    CATS.forEach(c=>{
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = c;
      b.addEventListener('click', ()=>{
        if (selectedCats.has(c)) { selectedCats.delete(c); b.classList.remove('active'); }
        else { selectedCats.add(c); b.classList.add('active'); }
        updatePoolInfo();
      });
      el.catList.appendChild(b);
    });
  }

  // load questions
  async function load() {
    const res = await fetch('questions.json');
    const payload = await res.json();
    questions = payload.questions || payload;
    renderChips();
    updatePoolInfo();
  }

  function normCats(arr){
    const raw = Array.isArray(arr) ? arr : (arr ? [arr] : []);
    return raw.map(s => (ALIASES[s] || s).toLowerCase());
  }

  function inEloWindow(q, target){
    const qE = typeof q.elo === 'number' ? q.elo : target;
    return (qE >= target - ELO_WINDOW) && (qE <= target + ELO_WINDOW);
  }

  function matchesCats(q){
    if (selectedCats.size === 0) return true;
    const lower = normCats(q.category);
    for (const c of selectedCats) if (lower.includes(c)) return true;
    return false;
  }

  function currentPool(){
    const target = parseInt(el.eloInput.value, 10) || 300;
    const pool = questions.filter(q => inEloWindow(q, target) && matchesCats(q));
    return { pool, target };
  }

  function updatePoolInfo(){
    const { pool } = currentPool();
    el.poolInfo.textContent = `Pool: ${pool.length} question${pool.length===1?'':'s'}`;

    if (!pool.includes(currentPick)) {
      currentPick = null;
      el.preview.innerHTML = `<div class="ka muted">No question selected yet.</div>`;
      el.currentId.textContent = '—';
      el.currentElo.textContent = '—';
      clearMiniRadar();
      el.startBtn.disabled = true;
    }
  }

  function sample(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

  function renderPreview(q){
    el.preview.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'ka';
    try { katex.render(q.latex || q.question, inner); }
    catch { inner.textContent = q.question; }
    el.preview.appendChild(inner);
    el.currentId.textContent = q.id;
    el.currentElo.textContent = typeof q.elo === 'number' ? q.elo : '—';
    el.startBtn.disabled = false;

    renderMiniRadarForQuestion(q); // <-- per-question web chart
  }

  el.saveElo.addEventListener('click', ()=>{
    const val = parseInt(el.eloInput.value,10);
    if (!isNaN(val)) localStorage.setItem('selectedElo', String(val));
    updatePoolInfo();
  });

  el.spinBtn.addEventListener('click', ()=>{
    const { pool } = currentPool();
    if (pool.length === 0){
      el.preview.innerHTML = `<div class="ka muted">No questions in this filter. Widen the ELO window or deselect some categories.</div>`;
      el.currentId.textContent = '—'; el.currentElo.textContent = '—';
      clearMiniRadar();
      el.startBtn.disabled = true;
      return;
    }
    currentPick = sample(pool);
    renderPreview(currentPick);
  });

  el.startBtn.addEventListener('click', ()=>{
    if (!currentPick) return;
    localStorage.setItem('selectedQuestionId', String(currentPick.id));
    localStorage.setItem('selectedElo', String(parseInt(el.eloInput.value,10) || 300));
    location.href = 'MITA_P_PROTO1.html';
  });

  // ---------- PER-QUESTION MINI RADAR (1–5) ----------
  function eloToLevel(e){
    if (e <= 900) return 1;
    if (e <= 1150) return 2;
    if (e <= 1350) return 3;
    if (e <= 1600) return 4;
    return 5;
  }

  function getWebDifficulty(q){
    // If provided explicitly, respect it.
    if (q.web_difficulty && typeof q.web_difficulty === 'object'){
      return CATS.map(cat => {
        const v = q.web_difficulty[cat];
        return (typeof v === 'number' && v >= 0) ? Math.max(0, Math.min(5, v)) : 0;
      });
    }
    // Fallback: derive from ELO + categories
    const level = eloToLevel(q.elo || 1200);
    const lower = new Set(normCats(q.category));
    return CATS.map(cat => lower.has(cat) ? level : 0);
  }

  function clearMiniRadar(){
    const svg = el.miniRadar;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function renderMiniRadarForQuestion(q){
    const vals = getWebDifficulty(q); // array length 9, values 0..5
    const svg = el.miniRadar;
    const W = svg.viewBox?.baseVal?.width || svg.getAttribute('width') || 360;
    const H = svg.viewBox?.baseVal?.height || svg.getAttribute('height') || 260;
    const w = +W, h = +H;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const cx = w/2, cy = h/2 + 6;
    const radius = Math.min(w,h)*0.38;
    const levels = 5;

    function polar(i, v /* 0..5 */){
      const angle = (-Math.PI/2) + (2*Math.PI*i/vals.length);
      const r = (v/5)*radius;
      return [cx + r*Math.cos(angle), cy + r*Math.sin(angle)];
    }

    // grid + labels
    for (let i=1;i<=levels;i++){
      const rr = radius*i/levels;
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx',cx); circle.setAttribute('cy',cy); circle.setAttribute('r',rr);
      circle.setAttribute('fill','none'); circle.setAttribute('stroke','rgba(255,255,255,0.08)');
      svg.appendChild(circle);

      const lbl = document.createElementNS('http://www.w3.org/2000/svg','text');
      lbl.setAttribute('x', cx+4); lbl.setAttribute('y', cy-rr-2);
      lbl.setAttribute('fill','rgba(255,255,255,0.55)'); lbl.setAttribute('font-size','10');
      lbl.textContent = i.toString();
      svg.appendChild(lbl);
    }

    // axes + category labels
    CATS.forEach((cat,i)=>{
      const [x,y] = polar(i, 5);
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',cx); line.setAttribute('y1',cy); line.setAttribute('x2',x); line.setAttribute('y2',y);
      line.setAttribute('stroke','rgba(255,255,255,0.12)');
      svg.appendChild(line);

      const [lx, ly] = polar(i, 5.4);
      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x', lx); text.setAttribute('y', ly);
      text.setAttribute('text-anchor','middle'); text.setAttribute('dominant-baseline','middle');
      text.setAttribute('fill','#e6eeff'); text.setAttribute('font-size','10');
      text.textContent = cat;
      svg.appendChild(text);
    });

    // polygon
    const pts = vals.map((v,i)=>polar(i, v)).map(([x,y])=>`${x},${y}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill','rgba(255, 215, 79, 0.28)');
    poly.setAttribute('stroke','rgba(255, 215, 79, 0.95)');
    poly.setAttribute('stroke-width','2');
    svg.appendChild(poly);
  }

  // boot
  load().catch(err=>{
    console.error(err);
    el.preview.innerHTML = `<div class="ka muted">Failed to load questions.json</div>`;
  });
})();
