/* stats.js
 * Renders a radar (spider) chart of category accuracy using pure SVG.
 * Reads persistence from localStorage key 'mita_save_v3'.
 * Categories requested:
 *  combinatorics, algebra, functions, trigonometry, geometry,
 *  probability, number theory, logarithms, sequences
 */
(function(){
  const SAVE_KEY = 'mita_save_v3';
  const CATS = [
    'combinatorics','algebra','functions','trigonometry','geometry',
    'probability','number theory','logarithms','sequences'
  ];

  // map synonyms from your bank to our 9 buckets
  const ALIASES = {
    'number-theory': 'number theory',
    'number_thory': 'number theory', // forgiving misspells
    'number_theory': 'number theory',
    'nt': 'number theory',
    'sequence': 'sequences',
    'series': 'sequences',
    'summation': 'sequences',
    'coordinate-geometry': 'geometry',
    'log': 'logarithms',
  };

  function coerceCat(x){
    const key = (x||'').toLowerCase().trim();
    return ALIASES[key] || key;
  }

  function load(){
    try{ return JSON.parse(localStorage.getItem(SAVE_KEY)||'{}'); }catch{ return {}; }
  }

  function percent(correct, attempts){
    return attempts>0 ? Math.round((correct/attempts)*100) : 0;
  }

  function render(){
    const save = load();
    const stats = save.categoryStats || {};
    // compute vector in requested order
    const values = CATS.map(cat=>{
      const s = stats[cat] || {attempts:0,correct:0};
      return {cat, attempts:s.attempts||0, correct:s.correct||0, acc: percent(s.correct||0, s.attempts||0)};
    });

    // header lines
    const elo = (typeof save.currentElo==='number') ? save.currentElo : (parseInt(localStorage.getItem('selectedElo')||'300',10)||300);
    document.getElementById('elo-now').textContent = 'ELO: '+elo;
    document.getElementById('streak-line').textContent = 'Streak: '+(save.streak||0)+'  •  Best: '+(save.bestStreak||0);
    document.getElementById('total-line').textContent = (save.totalAttempts||0)+' attempts • '+(save.totalCorrect||0)+' correct';

    // breakdown list
    const list = document.getElementById('breakdown');
    list.innerHTML = '';
    values.forEach(v=>{
      const row = document.createElement('div');
      row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
      row.innerHTML = `<div><strong>${v.cat}</strong><div class="muted">${v.correct}/${v.attempts} correct</div></div>
                       <div style="font-weight:700">${v.acc}%</div>`;
      list.appendChild(row);
    });

    // radar chart
    const svg = document.getElementById('radar');
    const W = svg.viewBox.baseVal.width || svg.getAttribute('width') || 640;
    const H = svg.viewBox.baseVal.height || svg.getAttribute('height') || 520;
    const w = +W, h = +H;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const cx = w/2, cy = h/2 + 10;
    const radius = Math.min(w,h)*0.38;
    const levels = 5; // 0..100 in 20% steps

    function polar(angleIndex, value){ // value in [0,100]
      const angle = (-Math.PI/2) + (2*Math.PI*angleIndex/values.length);
      const r = (value/100)*radius;
      return [cx + r*Math.cos(angle), cy + r*Math.sin(angle)];
    }

    // grid circles + labels
    for (let i=1;i<=levels;i++){
      const rr = radius*i/levels;
      const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx',cx); circle.setAttribute('cy',cy); circle.setAttribute('r',rr);
      circle.setAttribute('fill','none'); circle.setAttribute('stroke','rgba(255,255,255,0.08)');
      svg.appendChild(circle);

      const lbl = document.createElementNS('http://www.w3.org/2000/svg','text');
      lbl.setAttribute('x', cx+4); lbl.setAttribute('y', cy-rr-2);
      lbl.setAttribute('fill','rgba(255,255,255,0.5)'); lbl.setAttribute('font-size','12');
      lbl.textContent = (i*20)+'%';
      svg.appendChild(lbl);
    }

    // axes
    values.forEach((v,i)=>{
      const [x, y] = polar(i, 100);
      const line = document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',cx); line.setAttribute('y1',cy); line.setAttribute('x2',x); line.setAttribute('y2',y);
      line.setAttribute('stroke','rgba(255,255,255,0.12)');
      svg.appendChild(line);

      const [lx, ly] = polar(i, 112);
      const text = document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x', lx); text.setAttribute('y', ly);
      text.setAttribute('text-anchor','middle'); text.setAttribute('dominant-baseline','middle');
      text.setAttribute('fill','#ddd'); text.setAttribute('font-size','12');
      text.textContent = v.cat;
      svg.appendChild(text);
    });

    // polygon
    const pts = values.map((v,i)=>polar(i, v.acc)).map(([x,y])=>`${x},${y}`).join(' ');
    const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill','rgba(255, 215, 64, 0.25)');
    poly.setAttribute('stroke','rgba(255, 215, 64, 0.9)');
    poly.setAttribute('stroke-width','2');
    svg.appendChild(poly);
  }

  render();
})();
