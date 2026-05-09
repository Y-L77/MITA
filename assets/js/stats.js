/* stats.js — MITA Stats (v2)
 * Reads from localStorage key 'mita_save_v4'
 * Categories: combinatorics, linear-algebra, calculus, probability, enrichment
 */
(function () {
  const SAVE_KEY = 'mita_save_v4';

  const CATEGORIES = [
    { key: 'combinatorics',  label: 'Combinatorics',  color: '#7eb8f7' },
    { key: 'linear-algebra', label: 'Linear Algebra',  color: '#a78bfa' },
    { key: 'calculus',       label: 'Calculus',        color: '#f97316' },
    { key: 'probability',    label: 'Probability',     color: '#4ade80' },
    { key: 'enrichment',     label: 'Enrichment',      color: '#f472b6' },
  ];

  const ELO_TIERS = [
    { min: 0,    name: 'Novice' },
    { min: 400,  name: 'Apprentice' },
    { min: 700,  name: 'Intermediate' },
    { min: 1000, name: 'Advanced' },
    { min: 1300, name: 'Expert' },
    { min: 1600, name: 'Master' },
    { min: 1900, name: 'Grandmaster' },
  ];

  function getTier(elo) {
    for (let i = ELO_TIERS.length - 1; i >= 0; i--) {
      if (elo >= ELO_TIERS[i].min) return ELO_TIERS[i].name;
    }
    return ELO_TIERS[0].name;
  }

  function loadData() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
      const catElos = {};
      CATEGORIES.forEach(c => { catElos[c.key] = 300; });
      if (s.categoryElos) Object.assign(catElos, s.categoryElos);
      return {
        categoryElos:  catElos,
        streak:        s.streak        || 0,
        bestStreak:    s.bestStreak    || 0,
        totalAttempts: s.totalAttempts || 0,
        totalCorrect:  s.totalCorrect  || 0,
        eloHistory:    Array.isArray(s.eloHistory) ? s.eloHistory : [],
      };
    } catch {
      return {
        categoryElos:  Object.fromEntries(CATEGORIES.map(c => [c.key, 300])),
        streak: 0, bestStreak: 0, totalAttempts: 0, totalCorrect: 0, eloHistory: [],
      };
    }
  }

  function getOverall(elos) {
    const vals = Object.values(elos);
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  // ── KPI strip ──
  function renderKpis(data) {
    const overall = getOverall(data.categoryElos);
    const acc = data.totalAttempts > 0
      ? Math.round((data.totalCorrect / data.totalAttempts) * 100)
      : null;

    setText('kpi-elo',        overall);
    setText('kpi-tier',       getTier(overall));
    setText('kpi-acc',        acc !== null ? acc + '%' : '—');
    setText('kpi-acc-sub',    `of ${data.totalAttempts} attempts`);
    setText('kpi-streak',     data.bestStreak || '—');
    setText('kpi-streak-cur', `current: ${data.streak}`);
    setText('kpi-solved',     data.totalCorrect || '—');
    setText('kpi-attempts',   `${data.totalAttempts} attempted`);
  }

  // ── Spider chart ──
  function drawSpider(elos) {
    const svg = document.getElementById('spider-svg');
    if (!svg) return;
    const R = 100, MAX_ELO = 2000;
    const n = CATEGORIES.length;
    const angles = CATEGORIES.map((_, i) => (Math.PI * 2 * i / n) - Math.PI / 2);

    function polar(a, r) {
      return { x: +(r * Math.cos(a)).toFixed(2), y: +(r * Math.sin(a)).toFixed(2) };
    }

    let html = '';

    // Grid rings + ELO labels
    [0.25, 0.5, 0.75, 1.0].forEach((frac, ri) => {
      const pts = angles.map(a => polar(a, R * frac));
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
      html += `<path d="${d}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
      const labelElo = [500, 1000, 1500, 2000][ri];
      html += `<text x="4" y="${-(R * frac + 3)}" font-family="DM Mono,monospace" font-size="7" fill="rgba(255,255,255,0.18)">${labelElo}</text>`;
    });

    // Axes
    angles.forEach(a => {
      const tip = polar(a, R);
      html += `<line x1="0" y1="0" x2="${tip.x}" y2="${tip.y}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`;
    });

    // Data polygon
    const pts = CATEGORIES.map((cat, i) => {
      const elo = Math.min(elos[cat.key] ?? 300, MAX_ELO);
      return polar(angles[i], R * (elo / MAX_ELO));
    });
    const poly = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
    html += `<path d="${poly}" fill="rgba(200,184,154,0.1)" stroke="rgba(200,184,154,0.55)" stroke-width="1.5" stroke-linejoin="round"/>`;

    // Colored dots + labels
    CATEGORIES.forEach((cat, i) => {
      const elo = Math.min(elos[cat.key] ?? 300, MAX_ELO);
      const p = polar(angles[i], R * (elo / MAX_ELO));
      const tip = polar(angles[i], R + 20);
      const anchor = tip.x > 4 ? 'start' : tip.x < -4 ? 'end' : 'middle';
      html += `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${cat.color}"/>`;
      html += `<text x="${tip.x}" y="${tip.y}" text-anchor="${anchor}" dominant-baseline="middle" font-family="DM Mono,monospace" font-size="9" fill="${cat.color}" letter-spacing="0.04em">${cat.label.split(' ')[0].toUpperCase()}</text>`;
    });

    svg.innerHTML = html;
  }

  // ── Category ELO rows with progress bars ──
  function renderCatRows(elos) {
    const MAX_ELO = 2000;
    const container = document.getElementById('cat-rows');
    if (!container) return;
    container.innerHTML = '';

    CATEGORIES.forEach(cat => {
      const elo = elos[cat.key] ?? 300;
      const pct = Math.min((elo / MAX_ELO) * 100, 100).toFixed(1);
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div class="cat-row-header">
          <div class="cat-dot" style="background:${cat.color}"></div>
          <div class="cat-row-name">${cat.label}</div>
          <div class="cat-row-elo">${elo}</div>
          <div class="cat-row-tier">${getTier(elo)}</div>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%;background:${cat.color};opacity:0.7"></div>
        </div>
      `;
      container.appendChild(row);
    });

    setText('overall-elo', getOverall(elos));
  }

  // ── Accuracy by category (inferred from eloHistory) ──
  function renderAccRows(data) {
    const container = document.getElementById('acc-rows');
    if (!container) return;
    container.innerHTML = '';

    CATEGORIES.forEach(cat => {
      const catHistory = data.eloHistory.filter(h => h.cat === cat.key).slice(-30);
      let accText = '—', fillPct = 0;

      if (catHistory.length >= 2) {
        let wins = 0;
        for (let i = 1; i < catHistory.length; i++) {
          if (catHistory[i].elo > catHistory[i - 1].elo) wins++;
        }
        fillPct = Math.round((wins / (catHistory.length - 1)) * 100);
        accText = fillPct + '%';
      } else if (catHistory.length === 1) {
        accText = 'new';
      }

      const row = document.createElement('div');
      row.className = 'acc-row';
      row.innerHTML = `
        <div class="acc-label">${cat.label}</div>
        <div class="acc-bar-track">
          <div class="acc-bar-fill" style="width:${fillPct}%;background:${cat.color}"></div>
        </div>
        <div class="acc-pct">${accText}</div>
      `;
      container.appendChild(row);
    });

    // Overall row
    const overallPct = data.totalAttempts > 0
      ? Math.round((data.totalCorrect / data.totalAttempts) * 100)
      : 0;
    const sep = document.createElement('div');
    sep.className = 'acc-row';
    sep.style.cssText = 'margin-top:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05)';
    sep.innerHTML = `
      <div class="acc-label" style="color:var(--text)">Overall</div>
      <div class="acc-bar-track">
        <div class="acc-bar-fill" style="width:${overallPct}%;background:var(--accent)"></div>
      </div>
      <div class="acc-pct" style="color:var(--accent)">${data.totalAttempts > 0 ? overallPct + '%' : '—'}</div>
    `;
    container.appendChild(sep);
  }

  // ── Session panel ──
  function renderSession(data) {
    const container = document.getElementById('session-rows');
    if (!container) return;
    container.innerHTML = '';

    [
      { label: 'Current streak',  value: data.streak },
      { label: 'Best streak',     value: data.bestStreak },
      { label: 'Total correct',   value: data.totalCorrect },
      { label: 'Total attempted', value: data.totalAttempts },
    ].forEach(r => {
      const row = document.createElement('div');
      row.className = 'acc-row';
      row.innerHTML = `
        <div class="acc-label">${r.label}</div>
        <div class="acc-pct" style="width:auto;color:var(--text)">${r.value ?? 0}</div>
      `;
      container.appendChild(row);
    });
  }

  // ── ELO sparkline ──
  function renderSparkline(eloHistory) {
    const wrap = document.getElementById('sparkline-wrap');
    if (!wrap) return;

    if (!eloHistory || eloHistory.length < 2) {
      wrap.innerHTML = `<div class="sparkline-empty">No history yet — solve some questions to see your ELO over time.</div>`;
      return;
    }

    const pts = eloHistory.slice(-60);
    const eloVals = pts.map(p => p.elo);
    const minElo = Math.min(...eloVals);
    const maxElo = Math.max(...eloVals);
    const range = Math.max(maxElo - minElo, 50);

    const W = 600, H = 100, padX = 8, padY = 14;
    const innerW = W - padX * 2, innerH = H - padY * 2;

    function toSvg(i, elo) {
      return {
        x: (padX + (i / (pts.length - 1)) * innerW).toFixed(2),
        y: (padY + innerH - ((elo - minElo) / range) * innerH).toFixed(2),
      };
    }

    const points = pts.map((p, i) => toSvg(i, p.elo));
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaPath = linePath + ` L${points[points.length - 1].x},${H} L${points[0].x},${H} Z`;
    const last = points[points.length - 1];
    const lastElo = eloVals[eloVals.length - 1];

    // Draw per-category colored mini lines
    const catLines = CATEGORIES.map(cat => {
      const catPts = eloHistory.filter(h => h.cat === cat.key).slice(-40);
      if (catPts.length < 2) return '';
      const catElos = catPts.map(p => p.elo);
      const cMin = Math.min(...catElos), cMax = Math.max(...catElos);
      const cRange = Math.max(cMax - cMin, 50);
      const mapped = catPts.map((p, i) => ({
        x: (padX + (i / (catPts.length - 1)) * innerW).toFixed(2),
        y: (padY + innerH - ((p.elo - cMin) / cRange) * innerH).toFixed(2),
      }));
      const path = mapped.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      return `<path d="${path}" fill="none" stroke="${cat.color}" stroke-width="1" stroke-linejoin="round" stroke-linecap="round" opacity="0.5"/>`;
    }).join('');

    wrap.innerHTML = `
      <svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;display:block">
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(200,184,154,0.18)"/>
            <stop offset="100%" stop-color="rgba(200,184,154,0)"/>
          </linearGradient>
        </defs>
        ${catLines}
        <path d="${areaPath}" fill="url(#spark-grad)"/>
        <path d="${linePath}" fill="none" stroke="rgba(200,184,154,0.8)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${last.x}" cy="${last.y}" r="3" fill="#c8b89a"/>
        <text x="${(parseFloat(last.x) + 6).toFixed(1)}" y="${last.y}" dominant-baseline="middle" font-family="DM Mono,monospace" font-size="9" fill="#c8b89a">${lastElo}</text>
      </svg>
    `;
  }

  // ── Reset ──
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all progress? This cannot be undone.')) {
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem('mita_active_categories');
        window.location.reload();
      }
    });
  }

  // ── Helpers ──
  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── Init ──
  const data = loadData();
  renderKpis(data);
  drawSpider(data.categoryElos);
  renderCatRows(data.categoryElos);
  renderAccRows(data);
  renderSession(data);
  renderSparkline(data.eloHistory);

})();