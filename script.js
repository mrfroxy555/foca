const ZONES = [
  // positions are % relative to .scene
  { id: 'TL', name: 'Bal felső',  x: 16, y: 23, mult: 1.55 },
  { id: 'BL', name: 'Bal alsó',  x: 16, y: 56, mult: 1.25 },
  { id: 'TC', name: 'Közép felső',x: 50, y: 26, mult: 1.40 },
  { id: 'C',  name: 'Közép',     x: 50, y: 58, mult: 1.15 },
  { id: 'TR', name: 'Jobb felső', x: 84, y: 23, mult: 1.55 },
  { id: 'BR', name: 'Jobb alsó',  x: 84, y: 56, mult: 1.25 },
];

const el = {
  scene: document.getElementById('scene'),
  targets: document.getElementById('targets'),
  bgImg: document.getElementById('bgImg'),
  bgImgNext: document.getElementById('bgImgNext'),
  ball: document.getElementById('ball'),
  fx: document.getElementById('fx'),
  balance: document.getElementById('balance'),
  bet: document.getElementById('bet'),
  status: document.getElementById('status'),
  goals: document.getElementById('goals'),
  streak: document.getElementById('streak'),
  cashout: document.getElementById('cashout'),
  reset: document.getElementById('reset'),
  chips: document.getElementById('chips'),
  modal: document.getElementById('modal'),
  finalBalance: document.getElementById('finalBalance'),
  playAgain: document.getElementById('playAgain'),
};

let state = {
  startingBalance: 1000,
  balance: 1000,
  goals: 0,
  streak: 0,
  inFlight: false,
  cashedOut: false,
};

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function fmtFt(n){ return Math.round(n).toString(); }

function setStatus(html){
  el.status.innerHTML = html;
}

function getStreakBonus(){
  // +0.05x for every goal in the streak
  return state.streak * 0.05;
}

function getEffectiveMultiplier(baseMult){
  return baseMult + getStreakBonus();
}

function renderHud(){
  el.balance.textContent = fmtFt(state.balance);
  el.goals.textContent = String(state.goals);
  el.streak.textContent = String(state.streak);

  // cashout only after at least one goal
  el.cashout.disabled = state.goals <= 0 || state.inFlight || state.cashedOut;

  // bet max should follow balance
  el.bet.max = String(Math.max(0, state.balance));
  
  // update chips to show current bonus
  renderChips();
  
  // update target buttons to show current multipliers
  updateTargetLabels();
}

function renderChips(){
  el.chips.innerHTML = '';
  const bonus = getStreakBonus();
  
  for (const z of ZONES){
    const effectiveMult = getEffectiveMultiplier(z.mult);
    const chip = document.createElement('div');
    chip.className = 'chip';
    
    if (bonus > 0){
      chip.innerHTML = `<span class="badge"></span><strong>${z.id}</strong> ${z.mult.toFixed(2)}× <span style="color: #36d399;">+${bonus.toFixed(2)}×</span>`;
    } else {
      chip.innerHTML = `<span class="badge"></span><strong>${z.id}</strong> ${z.mult.toFixed(2)}×`;
    }
    
    el.chips.appendChild(chip);
  }
}

function zoneToPx(zone){
  const r = el.scene.getBoundingClientRect();
  return {
    x: (zone.x / 100) * r.width,
    y: (zone.y / 100) * r.height,
    rect: r,
  };
}

let poseResetTimer = null;

const POSES = {
  alap: 'alap.png',
  save: {
    TL: 'balfelso.jfif',
    BL: 'balalso.png',
    TC: 'kozepfelso.png',
    C:  'kozepalso.png',
    TR: 'jobbfelso.jfif',
    BR: 'jobbalso.png',
  },
  miss: {
    TL: 'balfelso_miss.jfif.png',
    BL: 'balalso_miss.png',
    TC: 'kozepfelso_miss.png',
    C:  'kozepalso_miss.png',
    TR: 'jobbfelso_miss.jfif.png',
    BR: 'jobbalso_miss.png',
  },
};

function setGoalkeeperPose(file){
  if (!file) return;

  // cancel any pending return-to-base
  if (poseResetTimer){
    clearTimeout(poseResetTimer);
    poseResetTimer = null;
  }

  // if already on this file, no-op
  if (el.bgImg && el.bgImg.getAttribute('src') === file) return;

  // crossfade via the second layer
  el.bgImgNext.src = file;
  el.bgImgNext.classList.add('isOn');

  // after fade-in, swap base and fade-out next
  window.setTimeout(() => {
    el.bgImg.src = file;
    el.bgImgNext.classList.remove('isOn');
  }, 170);
}

function resetGoalkeeperPoseSoon(){
  if (poseResetTimer) clearTimeout(poseResetTimer);
  poseResetTimer = window.setTimeout(() => setGoalkeeperPose(POSES.alap), 520);
}

function resetPositions(){
  // cancel animation so the ball doesn't remain at the last "forwards" transform
  if (ballAnim){
    ballAnim.cancel();
    ballAnim = null;
  }

  // ball back to start
  el.ball.style.transform = 'translate(-50%, -50%)';
  el.ball.style.left = '50%';
  el.ball.style.top = '84%';
}

function setTargetsDisabled(disabled){
  for (const btn of el.targets.querySelectorAll('button.target')){
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }
}

function createTargets(){
  el.targets.innerHTML = '';

  for (const zone of ZONES){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'target';
    btn.style.left = `${zone.x}%`;
    btn.style.top = `${zone.y}%`;
    btn.dataset.zone = zone.id;
    btn.dataset.mult = String(zone.mult);
    
    const effectiveMult = getEffectiveMultiplier(zone.mult);
    btn.setAttribute('aria-label', `${zone.name} (${effectiveMult.toFixed(2)}x)`);

    const label = document.createElement('div');
    label.className = 'targetLabel';
    label.textContent = `${effectiveMult.toFixed(2)}×`;
    btn.appendChild(label);

    btn.addEventListener('click', () => shoot(zone.id));
    el.targets.appendChild(btn);
  }
}

function updateTargetLabels(){
  // Update existing target button labels with current multipliers
  for (const btn of el.targets.querySelectorAll('button.target')){
    const zoneId = btn.dataset.zone;
    const zone = ZONES.find(z => z.id === zoneId);
    if (!zone) continue;
    
    const effectiveMult = getEffectiveMultiplier(zone.mult);
    btn.setAttribute('aria-label', `${zone.name} (${effectiveMult.toFixed(2)}x)`);
    
    const label = btn.querySelector('.targetLabel');
    if (label){
      label.textContent = `${effectiveMult.toFixed(2)}×`;
    }
  }
}

function randomGoalieZone(){
  return ZONES[Math.floor(Math.random() * ZONES.length)].id;
}

function setKeeperDive(goalieZoneId, isSave){
  // If keeper guessed correctly => show the SAVE pose.
  // If keeper guessed wrong => show the *_miss pose for where he dived.
  const file = isSave
    ? (POSES.save[goalieZoneId] ?? POSES.alap)
    : (POSES.miss[goalieZoneId] ?? POSES.alap);

  setGoalkeeperPose(file);
}

function flashAt(zoneId, color = 'rgba(110,231,255,.9)'){
  const z = ZONES.find(x => x.id === zoneId);
  if (!z) return;

  const f = document.createElement('div');
  f.className = 'flash';
  f.style.left = `${z.x}%`;
  f.style.top = `${z.y}%`;
  f.style.background = color;
  el.fx.appendChild(f);

  f.addEventListener('animationend', () => f.remove());
}

let ballAnim = null;

async function animateBallTo(zoneId){
  const z = ZONES.find(x => x.id === zoneId);
  if (!z) return;

  // cancel any previous animation so styles don't get "stuck"
  if (ballAnim){
    ballAnim.cancel();
    ballAnim = null;
  }

  // compute keyframes in px (more stable across resize)
  const start = zoneToPx({x: 50, y: 84});
  const end = zoneToPx(z);

  const kf = [
    { transform: `translate(-50%, -50%) translate(0px, 0px) scale(1)`, offset: 0 },
    { transform: `translate(-50%, -50%) translate(${(end.x - start.x) * 0.55}px, ${(end.y - start.y) * 0.55}px) scale(.82)`, offset: 0.55 },
    { transform: `translate(-50%, -50%) translate(${(end.x - start.x)}px, ${(end.y - start.y)}px) scale(.72)`, offset: 1 },
  ];

  ballAnim = el.ball.animate(kf, {
    duration: 620,
    easing: 'cubic-bezier(.2,.9,.2,1)',
    fill: 'forwards',
  });

  await ballAnim.finished;
}

function getBet(){
  const raw = Number(el.bet.value);
  if (!Number.isFinite(raw)) return 0;
  return Math.floor(raw);
}

function payout(bet, mult){
  // payout includes stake, e.g. 100 * 1.55 = 155
  return Math.round(bet * mult);
}

async function shoot(zoneId){
  if (state.inFlight || state.cashedOut) return;

  const bet = getBet();
  if (bet < 10){
    setStatus(`<strong>Minimum tét:</strong> 10 Ft`);
    return;
  }
  if (bet > state.balance){
    setStatus(`<strong>Nincs elég egyenleged.</strong> Max tét: ${fmtFt(state.balance)} Ft`);
    return;
  }

  state.inFlight = true;
  setTargetsDisabled(true);
  renderHud();

  setStatus('Lövés...');

  // decide keeper
  const goalie = randomGoalieZone();

  // reset (in case of previous animation)
  resetPositions();

  const zone = ZONES.find(z => z.id === zoneId);
  if (!zone){
    state.inFlight = false;
    setTargetsDisabled(false);
    renderHud();
    setStatus('<strong>Hiba:</strong> ismeretlen zóna.');
    return;
  }

  const isSave = goalie === zoneId;

  // keeper dive pose a bit earlier
  setKeeperDive(goalie, isSave);

  // animate ball
  await animateBallTo(zoneId);

  if (isSave){
    state.balance -= bet;
    state.streak = 0;
    flashAt(goalie, 'rgba(255,77,109,.95)');
    setStatus(`<strong>VÉDÉS!</strong> -${fmtFt(bet)} Ft (Kapus: ${goalie})`);
  } else {
    const effectiveMult = getEffectiveMultiplier(zone.mult);
    const win = payout(bet, effectiveMult);
    const profit = win - bet;
    state.balance += profit;
    state.goals += 1;
    state.streak += 1;
    flashAt(zoneId, 'rgba(54,211,153,.95)');
    
    const bonusText = getStreakBonus() > 0 
      ? ` <span style="color: #36d399;">+Streak bónusz!</span>` 
      : '';
    setStatus(`<strong>GÓL!</strong> +${fmtFt(profit)} Ft (Szorzó: ${effectiveMult.toFixed(2)}×, Kapus: ${goalie})${bonusText}`);
  }

  renderHud();

  // settle animation and reset for next shot
  await new Promise(r => setTimeout(r, 520));
  resetGoalkeeperPoseSoon();
  resetPositions();

  state.inFlight = false;
  setTargetsDisabled(false);
  renderHud();

  if (state.balance <= 0){
    state.balance = 0;
    renderHud();
    setStatus('<strong>Elfogyott az egyenleged.</strong> Indíts új játékot.');
    setTargetsDisabled(true);
  }
}

function resetGame(){
  state = {
    startingBalance: 1000,
    balance: 1000,
    goals: 0,
    streak: 0,
    inFlight: false,
    cashedOut: false,
  };

  setStatus('Válassz zónát a lövéshez.');
  setGoalkeeperPose(POSES.alap);
  resetPositions();
  setTargetsDisabled(false);
  hideModal();
  renderHud();
  createTargets(); // Recreate targets with base multipliers
}

function showModal(){
  el.finalBalance.textContent = fmtFt(state.balance);
  el.modal.setAttribute('aria-hidden', 'false');
}

function hideModal(){
  el.modal.setAttribute('aria-hidden', 'true');
}

function cashOut(){
  if (state.goals <= 0 || state.inFlight || state.cashedOut) return;
  state.cashedOut = true;
  setTargetsDisabled(true);
  renderHud();
  setStatus(`<strong>Kiszálltál.</strong> Végső egyenleg: ${fmtFt(state.balance)} Ft`);
  showModal();
}

function preloadPoses(){
  // base
  new Image().src = POSES.alap;

  // all save/miss variants
  for (const id of Object.keys(POSES.save)){
    new Image().src = POSES.save[id];
  }
  for (const id of Object.keys(POSES.miss)){
    new Image().src = POSES.miss[id];
  }
}

function init(){
  preloadPoses();
  setGoalkeeperPose(POSES.alap);
  renderChips();
  createTargets();
  resetPositions();

  setStatus('Válassz zónát a lövéshez.');
  renderHud();

  el.reset.addEventListener('click', resetGame);
  el.cashout.addEventListener('click', cashOut);
  el.playAgain.addEventListener('click', resetGame);

  // keep bet sane
  el.bet.addEventListener('input', () => {
    const max = Math.max(0, state.balance);
    const v = clamp(getBet(), 0, max);
    if (!Number.isFinite(v)) return;
    el.bet.value = String(v);
  });

  // close modal on backdrop click
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) hideModal();
  });

  // resize safety
  window.addEventListener('resize', () => {
    if (!state.inFlight) resetPositions();
  });
}

init();