// 장식과 걸음걸이는 돌보기 탭의 SVG를 복제해서 공유합니다.
// 게임 규칙은 서버의 개인기 훈련(체력·횟수·확률)과 완전히 분리되어 있습니다.
const PUG_RUNNER_RULES = Object.freeze({
  startSpeed: 205, maxSpeed: 405, acceleration: 2.5,
  gravity: 1850, jumpVelocity: 685, ground: 52,
});
const PUG_RUNNER_PHYSICS = Object.freeze({
  speedAt(seconds) { return Math.min(PUG_RUNNER_RULES.maxSpeed, PUG_RUNNER_RULES.startSpeed + Math.max(0, seconds) * PUG_RUNNER_RULES.acceleration); },
  jumpStep(y, velocity, dt) {
    const next = y + velocity * dt - PUG_RUNNER_RULES.gravity * dt * dt / 2;
    return next <= 0 ? { y: 0, velocity: 0 } : { y: next, velocity: velocity - PUG_RUNNER_RULES.gravity * dt };
  },
  // 발 부분을 기준으로 충돌 판정을 조금 너그럽게 잡습니다.
  hitsHurdle(hurdle, dogLeft, dogRight, jumpHeight) {
    return hurdle.x < dogRight && hurdle.x + hurdle.width > dogLeft && jumpHeight < hurdle.height - 12;
  },
  spawnInterval(random) { return 1.55 + Math.max(0, Math.min(1, random)) * .7; },
});
window.PugRunnerPhysics = PUG_RUNNER_PHYSICS;

function initPugRunner() {
  const byId = id => document.getElementById(id);
  const runnerSection = byId('runner-section');
  const practiceSection = byId('training-practice-section');
  const runnerStage = byId('runner-pet-stage');
  const practiceStage = byId('training-pet-stage');
  const arena = byId('runner-arena');
  const obstacleLayer = byId('runner-obstacles');
  const overlay = byId('runner-overlay');
  const start = byId('runner-start');
  const jump = byId('runner-jump');
  const scoreText = byId('runner-score');
  const bestText = byId('runner-best');
  const speedText = byId('runner-speed');
  const title = byId('runner-overlay-title');
  const description = byId('runner-overlay-description');
  const status = byId('runner-status');
  const demoStatus = byId('training-demo-status');
  const svgNs = 'http://www.w3.org/2000/svg';
  const originalPug = byId('pet-stage').querySelector('svg.pug');
  const dog = originalPug.querySelector('.pose-walk .walk-dog');
  const runnerSvg = document.createElementNS(svgNs, 'svg');
  runnerSvg.setAttribute('viewBox', '90 165 260 194');
  runnerSvg.setAttribute('class', 'pug runner-pug');
  runnerSvg.setAttribute('aria-hidden', 'true');
  const walkPose = document.createElementNS(svgNs, 'g');
  walkPose.setAttribute('class', 'pose pose-walk');
  walkPose.append(dog.cloneNode(true));
  runnerSvg.append(walkPose); runnerStage.append(runnerSvg);

  // 개인기 훈련도 기존 SVG를 사용해 방으로 돌아가지 않고 바로 볼 수 있게 합니다.
  const practiceSvg = originalPug.cloneNode(true);
  practiceSvg.classList.add('training-pug');
  const face = practiceSvg.querySelector('#pug-face-art');
  if (face) face.id = 'training-pug-face-art';
  for (const use of practiceSvg.querySelectorAll('use[href="#pug-face-art"]')) use.setAttribute('href', '#training-pug-face-art');
  for (const selector of ['.purchased-toy', '.focus-ball', '.focus-book']) practiceSvg.querySelector(selector)?.remove();
  practiceStage.append(practiceSvg);

  let mode = 'runner';
  let phase = 'ready';
  let raf = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let speed = PUG_RUNNER_RULES.startSpeed;
  let score = 0;
  let jumpY = 0;
  let jumpVelocity = 0;
  let spawnIn = 1;
  let hurdles = [];
  let previewTimer;
  let best = 0;
  try { best = Math.max(0, Number.parseInt(localStorage.getItem('pug-runner-best-v1') || '0', 10) || 0); } catch { /* 저장이 불가능해도 플레이 가능 */ }
  bestText.textContent = best;

  const active = () => !byId('training-panel').hidden && mode === 'runner' && !document.hidden;
  function saveBest() {
    if (score <= best) return;
    best = score; bestText.textContent = best;
    try { localStorage.setItem('pug-runner-best-v1', String(best)); } catch { /* 이번 방문에서만 기록 */ }
  }
  function showOverlay(heading, detail) {
    title.textContent = heading; description.textContent = detail; overlay.hidden = false;
  }
  function updateControls() {
    start.textContent = phase === 'running' ? '일시정지' : phase === 'paused' ? '이어서 달리기' : phase === 'over' ? '다시 도전' : '달리기 시작';
    start.disabled = !window.pugRunner?.hasPet;
    jump.disabled = phase !== 'running';
    arena.dataset.phase = phase;
  }
  function updateDisplay() {
    scoreText.textContent = score;
    speedText.textContent = `${(speed / PUG_RUNNER_RULES.startSpeed).toFixed(1)}배`;
    arena.style.setProperty('--runner-ground-duration', `${(.6 * PUG_RUNNER_RULES.startSpeed / speed).toFixed(3)}s`);
    runnerStage.style.setProperty('--stride', `${Math.max(.20, .35 * PUG_RUNNER_RULES.startSpeed / speed).toFixed(3)}s`);
    runnerStage.style.setProperty('--runner-jump', `${(-jumpY).toFixed(2)}px`);
    runnerStage.classList.toggle('in-air', jumpY > 0);
    for (const hurdle of hurdles) hurdle.element.style.transform = `translate3d(${hurdle.x.toFixed(2)}px, 0, 0)`;
  }
  function clearHurdles() {
    for (const hurdle of hurdles) hurdle.element.remove();
    hurdles = []; obstacleLayer.replaceChildren();
  }
  function spawnHurdle(first = false) {
    const element = document.createElement('div');
    element.className = 'runner-hurdle';
    const width = 30;
    const height = 38 + Math.round(Math.random() * 10);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    const x = first ? Math.max(arena.clientWidth * .78, runnerStage.offsetLeft + runnerStage.offsetWidth + 85) : arena.clientWidth + 32;
    const hurdle = { x, width, height, element, passed: false };
    obstacleLayer.append(element); hurdles.push(hurdle);
    element.style.transform = `translate3d(${x}px, 0, 0)`;
  }
  function stopFrame() { if (raf) cancelAnimationFrame(raf); raf = 0; lastFrame = 0; }
  function endRun() {
    stopFrame(); phase = 'over'; saveBest();
    showOverlay('앗, 장애물에 닿았어!', `장애물 ${score}개 성공 · 다시 도전해 볼까?`);
    status.textContent = `게임 오버! ${score}개를 넘었어요. 다시 도전할 수 있어요.`;
    updateControls();
  }
  function step(timestamp) {
    if (phase !== 'running') return;
    if (!active() || document.querySelector('dialog[open]')) { pause(); return; }
    if (!lastFrame) lastFrame = timestamp;
    const dt = Math.max(0, Math.min((timestamp - lastFrame) / 1000, .04));
    lastFrame = timestamp;
    elapsed += dt;
    speed = PUG_RUNNER_PHYSICS.speedAt(elapsed);
    const jumpState = PUG_RUNNER_PHYSICS.jumpStep(jumpY, jumpVelocity, dt);
    jumpY = jumpState.y; jumpVelocity = jumpState.velocity;
    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnHurdle(score === 0 && hurdles.length === 0 && elapsed < 2);
      spawnIn = PUG_RUNNER_PHYSICS.spawnInterval(Math.random());
    }
    const dogLeft = runnerStage.offsetLeft + runnerStage.offsetWidth * .43;
    const dogRight = runnerStage.offsetLeft + runnerStage.offsetWidth * .77;
    for (const hurdle of hurdles) {
      hurdle.x -= speed * dt;
      if (PUG_RUNNER_PHYSICS.hitsHurdle(hurdle, dogLeft, dogRight, jumpY)) {
        updateDisplay(); endRun(); return;
      }
      if (!hurdle.passed && hurdle.x + hurdle.width < dogLeft) {
        hurdle.passed = true; score++; saveBest();
      }
    }
    hurdles = hurdles.filter(hurdle => {
      if (hurdle.x + hurdle.width >= -10) return true;
      hurdle.element.remove(); return false;
    });
    updateDisplay();
    raf = requestAnimationFrame(step);
  }
  function startRun() {
    if (!window.pugRunner?.hasPet || !active()) return;
    stopFrame(); clearHurdles();
    phase = 'running'; elapsed = 0; speed = PUG_RUNNER_RULES.startSpeed; score = 0;
    jumpY = 0; jumpVelocity = 0; spawnIn = .95;
    overlay.hidden = true;
    status.textContent = '장애물이 다가오면 스페이스바 또는 화면을 눌러 점프!';
    updateControls(); updateDisplay(); arena.focus({ preventScroll: true }); raf = requestAnimationFrame(step);
  }
  function pause() {
    if (phase !== 'running') return;
    stopFrame(); phase = 'paused';
    showOverlay('일시정지', '이어서 달리기를 누르면 같은 자리에서 계속해요.');
    status.textContent = '잠시 멈췄어요. 점수와 장애물 위치는 유지돼요.';
    updateControls();
  }
  function resume() {
    if (phase !== 'paused' || !active()) return;
    phase = 'running'; lastFrame = 0; overlay.hidden = true;
    status.textContent = '달리는 중 · 스페이스바 / 화면 터치로 점프!';
    updateControls(); arena.focus({ preventScroll: true }); raf = requestAnimationFrame(step);
  }
  function toggleStart() {
    if (phase === 'running') pause();
    else if (phase === 'paused') resume();
    else startRun();
  }
  function hop() {
    if (phase !== 'running' || jumpY > 0 || jumpVelocity !== 0) return;
    jumpVelocity = PUG_RUNNER_RULES.jumpVelocity;
  }
  function showMode(next) {
    mode = next === 'tricks' ? 'tricks' : 'runner';
    runnerSection.hidden = mode !== 'runner'; practiceSection.hidden = mode !== 'tricks';
    byId('training-mode-runner').setAttribute('aria-pressed', String(mode === 'runner'));
    byId('training-mode-tricks').setAttribute('aria-pressed', String(mode === 'tricks'));
    if (!active()) pause();
  }
  function syncAppearance(petState) {
    const progress = petState?.progress;
    if (!progress) return;
    window.pugRunner.hasPet = Boolean(petState.name);
    if (!window.pugRunner.hasPet) pause();
    for (const stage of [runnerStage, practiceStage]) {
      stage.dataset.outfit = progress.equipped || 'none';
      stage.dataset.hat = progress.hat || 'none';
      stage.dataset.leash = petState.leashColor || 'coral';
      stage.classList.toggle('christmas-santa', progress.hat === 'santa');
      stage.classList.toggle('christmas-rudolph', (petState.christmas?.accessories || []).includes('rudolph'));
      applyOutfitLook(stage, petState.outfits.find(outfit => outfit.id === progress.equipped));
      applyHatLook(stage, petState.hats.find(hat => hat.id === progress.hat));
    }
    updateControls();
  }
  function showTrick(animation, message) {
    clearTimeout(previewTimer);
    practiceStage.dataset.animation = '';
    // 같은 동작을 반복 실행해도 CSS 애니메이션을 처음부터 재생합니다.
    void practiceStage.offsetWidth;
    practiceStage.dataset.animation = animation || 'tilt';
    demoStatus.textContent = message || '열심히 연습 중!';
    previewTimer = setTimeout(() => {
      practiceStage.dataset.animation = '';
      demoStatus.textContent = '다른 동작도 연습해 볼까?';
    }, 6000);
  }
  byId('training-mode-runner').addEventListener('click', () => showMode('runner'));
  byId('training-mode-tricks').addEventListener('click', () => showMode('tricks'));
  start.addEventListener('click', toggleStart);
  jump.addEventListener('click', hop);
  arena.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    if (phase === 'running') { event.preventDefault(); hop(); }
  });
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || !active()) return;
    if (document.querySelector('dialog[open]')) return;
    const target = document.activeElement;
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
    // 키보드 사용자가 버튼에 초점을 둔 상태에서는 원래 버튼 조작을 보존합니다.
    if (target?.matches('button, a, [role="button"]')) return;
    event.preventDefault();
    if (phase === 'running') hop();
    else if (phase === 'paused') resume();
    else startRun();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);
  window.pugRunner = {
    hasPet: false, showMode, syncAppearance, showTrick,
    onMainTabChange(tab) { if (tab !== 'training') pause(); },
  };
  showMode('runner'); updateControls(); updateDisplay();
}
