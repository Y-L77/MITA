// selector.js — pure random selection inside ELO min/max range
// - no softmax / scoring / temperature
// - strict bounds (empty range → 0 eligible)
// - fixes duplicate ids and SVG label rendering

(function(){
  const SAVE_KEY = 'mita_save_v3';
  const AXES = ['mechanics','geometry','number theory','problem solving','time pressure'];
  const FILTER_AXES = ['mechanics','geometry','number theory','problem solving'];

  const el = {
    eloMin:     document.getElementById('elo-min'),
    eloMax:     document.getElementById('elo-max'),
    saveElo:    document.getElementById('save-elo'),
    catList:    document.getElementById('cat-list'),
    spinBtn:    document.getElementById('spin-btn'),
    startBtn:   document.getElementById('start-btn'),
    preview:    document.getElementById('preview'),
    poolHeader: document.getElementById('pool-info'),
    poolInline: document.getElementById('eligible-count'),
    currentId:  document.getElementById('current-id'),
    currentElo: document.getElementById('current-elo'),
    miniRadar:  document.getElementById('mini-radar'),
  };

  if (el.saveElo) el.saveElo.classList.add('btn','accent');

  let questions = [];
  let selectedCats = new Set();
  let currentPick = null;

  const sample = (arr)=> arr[Math.floor(Math.random()*arr.length)];
  const clamp01 = (x)=> x<0?0:(x>1?1:x);

  function getAxesValues(q){
    const wd = (q && q.web_difficulty) || {};
    const toNum = v => (typeof v === 'number' ? v : 0);
    const map = {};
    for (const k of Object.keys(wd)) map[k.trim().toLowerCase()] = wd[k];
    return {
      'mechanics':       toNum(map['mechanics']),
      'geometry':        toNum(map['geometry']),
      'number theory':   toNum(map['number theory']),
      'problem solving': toNum(map['problem solving']),
      'time pressure':   toNum(map['time pressure']),
    };
  }

  function parseBound(v){
    const n = parseInt(v,10);
    return Number.isFinite(n) ? n : null;
  }
  function getBounds(){
    let min = parseBound(el.eloMin?.value);
    let max = parseBound(el.eloMax?.value);
    if (min!=null && max!=null && min>max){ const t=min; min=max; max=t; }
    return {min, max};
  }

  function loadSavedBounds(){
    try{
      const save = JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');
      if (save.selectorBounds){
        const {min,max} = save.selectorBounds;
        if (Number.isFinite(min)) el.eloMin.value = min;
        if (Number.isFinite(max)) el.eloMax.value = max;
      }
    }catch{}
  }
  function saveBounds(){
    const {min,max} = getBounds();
    const payload = JSON.parse(localStorage.getItem(SAVE_KEY)||'{}');
    payload.selectorBounds = {min,max};
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }

  function renderChips(){
    el.catList.innerHTML = '';
    FILTER_AXES.forEach(axis=>{
      const b=document.createElement('button');
      b.className='chip';
      b.textContent=axis;
      b.addEventListener('click',()=>{
        if(selectedCats.has(axis)){selectedCats.delete(axis);b.classList.remove('active');}
        else{selectedCats.add(axis);b.classList.add('active');}
        updatePoolInfo();
      });
      el.catList.appendChild(b);
    });
  }

  async function load(){
    const res=await fetch('questions.json');
    const payload=await res.json();
    questions=payload.questions||payload;
    renderChips();
    loadSavedBounds();
    updatePoolInfo();
  }

  function withinBounds(q,min,max){
    const hasElo=(typeof q.elo==='number');
    if(hasElo && min!=null && q.elo<min) return false;
    if(hasElo && max!=null && q.elo>max) return false;
    return true;
  }
  function matchesSelectedAxes(q){
    if(selectedCats.size===0) return true;
    const vals=getAxesValues(q);
    for(const c of selectedCats){ if((vals[c]||0)>0) return true; }
    return false;
  }

  function eligiblePool(){
    const {min,max}=getBounds();
    return questions.filter(q=>withinBounds(q,min,max)&&matchesSelectedAxes(q));
  }

  function setPoolInfoText(txt){
    if(el.poolHeader) el.poolHeader.textContent=txt;
    if(el.poolInline) el.poolInline.textContent=txt;
  }

  function updatePoolInfo(){
    const pool=eligiblePool();
    setPoolInfoText(`Eligible: ${pool.length} question${pool.length===1?'':'s'}`);
    if(!pool.includes(currentPick)){
      currentPick=null;
      el.preview.innerHTML=`<div class="ka muted">No question selected yet.</div>`;
      el.currentId.textContent='—';
      el.currentElo.textContent='—';
      clearMiniRadar();
      el.startBtn.disabled=true;
    }
  }

  function spinOnce(){
    const pool=eligiblePool();
    if(!pool.length){
      el.preview.innerHTML=`<div class="ka muted">No questions with those filters.</div>`;
      el.currentId.textContent='—'; el.currentElo.textContent='—';
      clearMiniRadar(); el.startBtn.disabled=true; return;
    }
    const pick=sample(pool);
    currentPick=pick;
    renderPreview(pick);
  }

  function renderPreview(q){
    el.preview.innerHTML='';
    const inner=document.createElement('div');
    inner.className='ka';
    try{katex.render(q.latex||q.question,inner);}
    catch{inner.textContent=q.question;}
    el.preview.appendChild(inner);

    el.currentId.textContent=q.id;
    el.currentElo.textContent=(typeof q.elo==='number')?q.elo:'—';
    el.startBtn.disabled=false;
    renderMiniRadarForQuestion(q);
  }

  function clearMiniRadar(){
    const svg=el.miniRadar;
    while(svg.firstChild) svg.removeChild(svg.firstChild);
  }
  function renderMiniRadarForQuestion(q){
    const valsObj=getAxesValues(q);
    const vals=AXES.map(a=>(valsObj[a]||0));
    const svg=el.miniRadar;
    const w=+svg.getAttribute('width')||360;
    const h=+svg.getAttribute('height')||260;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const cx=w/2, cy=h/2+6, radius=Math.min(w,h)*0.38, levels=5;
    const polar=(i,v)=>{
      const angle=(-Math.PI/2)+(2*Math.PI*i/vals.length);
      const r=(v/5)*radius;
      return [cx+r*Math.cos(angle), cy+r*Math.sin(angle)];
    };

    for(let i=1;i<=levels;i++){
      const rr=radius*i/levels;
      const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx',cx);circle.setAttribute('cy',cy);circle.setAttribute('r',rr);
      circle.setAttribute('fill','none');circle.setAttribute('stroke','rgba(255,255,255,0.08)');
      svg.appendChild(circle);
    }
    AXES.forEach((name,i)=>{
      const [x,y]=polar(i,5);
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.setAttribute('x1',cx);line.setAttribute('y1',cy);
      line.setAttribute('x2',x);line.setAttribute('y2',y);
      line.setAttribute('stroke','rgba(255,255,255,0.12)');
      svg.appendChild(line);

      const [lx,ly]=polar(i,5.4);
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');
      text.setAttribute('x',lx);text.setAttribute('y',ly);
      text.setAttribute('text-anchor','middle');
      text.setAttribute('dominant-baseline','middle');
      text.setAttribute('fill','rgba(255,255,255,0.85)');
      text.setAttribute('font-size','12');
      text.textContent=name;
      svg.appendChild(text);
    });

    const pts=vals.map((v,i)=>polar(i,v)).map(([x,y])=>`${x},${y}`).join(' ');
    const poly=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    poly.setAttribute('points',pts);
    poly.setAttribute('fill','rgba(255,213,79,0.22)');
    poly.setAttribute('stroke','rgba(255,213,79,0.55)');
    poly.setAttribute('stroke-width','2');
    svg.appendChild(poly);
  }

  el.eloMin?.addEventListener('input',updatePoolInfo);
  el.eloMax?.addEventListener('input',updatePoolInfo);
  el.saveElo?.addEventListener('click',()=>{
    saveBounds();
    updatePoolInfo();
    const old=el.saveElo.textContent;
    el.saveElo.textContent='Saved ✓';
    setTimeout(()=>el.saveElo.textContent=old,900);
  });
  el.spinBtn?.addEventListener('click',spinOnce);
  el.startBtn?.addEventListener('click',()=>{
    if(!currentPick)return;
    localStorage.setItem('selectedQuestionId',String(currentPick.id));
    const {min,max}=getBounds();
    if(min!=null&&max!=null){
      localStorage.setItem('selectedElo',String(Math.round((min+max)/2)));
    }
    location.href='MITA_P_PROTO1.html';
  });

  load().catch(err=>{
    console.error(err);
    el.preview.innerHTML=`<div class="ka muted">Failed to load questions.json</div>`;
    if(el.poolHeader) el.poolHeader.textContent='Eligible: 0';
    if(el.poolInline) el.poolInline.textContent='Eligible: 0';
  });
})();
