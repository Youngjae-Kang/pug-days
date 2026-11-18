const focusScenes = [
  { mood: 'play', seconds: 18, label: '공놀이 중', speech: '통통! 이번엔 내가 잡을 거야.', description: '앞발로 공을 굴리고 꼬리를 흔들며 혼자 노는 퍼그' },
  { mood: 'study', seconds: 22, label: '공부 중', speech: '오늘은 간식의 비밀을 공부 중이야.', description: '동그란 안경을 쓰고 책장을 넘기며 공부하는 퍼그' },
  { mood: 'rest', seconds: 12, label: '잠깐 쉬는 중', speech: '조금만 쉬었다가 또 놀아야지…', description: '공부와 놀이 사이에 눈을 감고 편안히 쉬는 퍼그' },
];

const musicScene = { mood: 'music', seconds: 18, label: '리듬 타는 중', speech: '둠칫! 오늘 무대는 이 방이야.', description: '스피커 옆에서 고개와 앞발을 까딱이며 리듬을 타는 퍼그' };
function scenesForRoom(withSpeaker) { return withSpeaker ? [focusScenes[0], musicScene, ...focusScenes.slice(1)] : focusScenes; }
function focusSceneAt(elapsedSeconds, withSpeaker = false) {
  const scenes = scenesForRoom(withSpeaker);
  const duration = scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  let position = Math.max(0, elapsedSeconds) % duration;
  for (const scene of scenes) {
    if (position < scene.seconds) return scene;
    position -= scene.seconds;
  }
  return focusScenes[0];
}

function updateFocusScene(force = false) {
  const stage = $('pet-stage');
  if (isStudying()) return;
  if (!focusing || state?.activity?.kind !== 'focus') {
    delete stage.dataset.focusMood;
    delete stage.dataset.focusToy;
    document.querySelector('.room').classList.remove('music-playing');
    syncParkedToys();
    return;
  }
  const startedAt = state.activity.startedAt ?? state.activity.endsAt - state.focusRules.maxSeconds * 1000;
  const now = Math.min(Date.now() + clockOffset, state.activity.endsAt);
  const withSpeaker = state.progress.placedItems.includes('speaker');
  const scene = focusSceneAt((now - startedAt) / 1000, withSpeaker);
  const toys = state.roomItems.filter(item => item.kind === 'toy' && state.progress.placedItems.includes(item.id));
  const duration = scenesForRoom(withSpeaker).reduce((sum, scene) => sum + scene.seconds, 0);
  const cycle = Math.floor(Math.max(0, now - startedAt) / (duration * 1000));
  document.querySelector('.room').classList.toggle('music-playing', scene.mood === 'music');
  const toy = toys.length ? toys[cycle % toys.length].id : 'basic';
  if (!force && stage.dataset.focusMood === scene.mood && stage.dataset.focusToy === toy) return;
  if (stage.dataset.focusToy !== toy) {
    const target = document.querySelector('.purchased-toy'); target.replaceChildren();
    if (toy !== 'basic') {
      const svg = itemSvg(toy); svg.setAttribute('x', '260'); svg.setAttribute('y', '314'); svg.setAttribute('width', '72'); svg.setAttribute('height', '72'); target.append(svg);
    }
  }
  stage.dataset.focusToy = toy;
  stage.dataset.focusMood = scene.mood;
  const toyText = { tennis: ['테니스공 놀이 중', '통통! 새 공이 잘 튀네.'], duck: ['오리 장난감 놀이 중', '콕! 삑! 한 번만 더 눌러 볼까?'], rope: ['로프 놀이 중', '으쌰, 내 앞발 힘 좀 봐!'] };
  const customToy = state.roomItems.find(item => item.id === toy && item.custom);
  if (customToy) toyText[toy] = [`${customToy.name} 놀이 중`, '이거 새로 생긴 내 장난감이야!'];
  const playing = scene.mood === 'play' && toyText[toy];
  document.querySelector('.room-hint').textContent = playing ? playing[0] : scene.label;
  document.querySelector('.pug').setAttribute('aria-label', playing ? `구매한 장난감으로 ${playing[0]}인 퍼그` : scene.description);
  $('speech').textContent = playing ? playing[1] : scene.speech;
  syncParkedToys();
}
