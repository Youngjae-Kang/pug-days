function christmasTree(count) {
  const lights = [[96,95],[132,116],[76,145],[147,162],[104,188],[65,203],[164,214],[116,236]];
  return `<svg viewBox="0 0 230 300" role="img" aria-label="${count >= 30 ? '완성한' : '꾸미는 중인'} 크리스마스 트리"><ellipse cx="115" cy="278" rx="93" ry="13" fill="#c8bda8" opacity=".35"/><path d="M102 237h26v42h-26" fill="#a77d59"/><path d="m115 33 51 91h-23l45 65h-27l44 67H25l44-67H42l45-65H64Z" fill="#648b73" stroke="#3f6958" stroke-width="3"/><path d="M63 131q54 30 105 1M48 195q67 34 132 0" fill="none" stroke="${count >= 5 ? '#e9cd8e' : '#84a18a'}" stroke-width="6"/>${count >= 15 ? lights.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="7" fill="${i%2?'#f0d799':'#cd7d70'}"/>`).join('') : ''}${count >= 30 ? '<path d="m115 13 7 17 18 2-14 12 4 18-15-10-15 10 4-18-14-12 18-2Z" fill="#f2d17e" stroke="#bd9b50" stroke-width="2"/>' : ''}</svg>`;
}
function renderChristmas() {
  const c = state?.christmas; if (!c) return;
  const blocked = busy || Boolean(pendingAction) || !state.name;
  $('christmas-status').textContent = c.active ? '12월 31일까지 · 한국 시간' : '이벤트 종료 · 모은 선물은 계속 간직해요';
  $('christmas-tree').innerHTML = christmasTree(c.decorations);
  $('christmas-count').textContent = `장식 ${c.decorations} / 30개 · 오늘 ${c.dropsToday} / ${c.dailyDecorations}개`;
  $('christmas-progress').value = c.decorations;
  $('christmas-stages').textContent = c.goals.map((n,i)=>`${c.decorations>=n?'✓':'○'} ${['리본','반짝 장식','꼭대기 별'][i]} ${n}개`).join(' · ');
  $('christmas-place').disabled = blocked || c.decorations < 30;
  $('christmas-place').textContent = c.installed ? '트리 보관하기' : '완성한 트리 방에 놓기';
  $('christmas-attendance').textContent = `함께한 날 ${c.attendance}일 · ${c.attendedToday ? '오늘 출석 완료' : '이벤트 기간에 접속하면 출석해요'}`;
  const rewards = [[1,'산타 모자','santa'],[3,'크리스마스 니트','christmas'],[5,'루돌프 코','rudolph'],[7,'비스킷 15개',null]];
  $('christmas-rewards').replaceChildren();
  for (const [day,name,item] of rewards) {
    const card = document.createElement('article'), label = document.createElement('p'), button = document.createElement('button');
    const claimed = c.claimed.includes(day); label.textContent = `${day}일 · ${name}`;
    button.textContent = !claimed ? '선물 받기' : !item ? '수령 완료' : item === 'christmas' ? (state.progress.equipped === item ? '벗기' : '입히기') : c.accessories.includes(item) ? '벗기' : '착용하기';
    button.disabled = blocked || (!claimed && c.attendance < day) || (claimed && !item);
    button.onclick = () => act(!claimed ? {type:'christmas_claim',day} : item === 'christmas' ? {type:'equip',outfit:state.progress.equipped === item ? null : item} : {type:'christmas_wear',item});
    card.append(label,button); $('christmas-rewards').append(card);
  }
  $('christmas-gift-count').textContent = `오늘 ${c.giftsToday} / ${c.giftLimit}회 · 성공 3개, 참여 1개`;
  $('christmas-gift-start').disabled = blocked || !c.active || c.giftsToday >= c.giftLimit || Boolean(c.challenge && Date.now()+clockOffset<c.challenge.expires);
  $('christmas-throw').disabled = blocked || !c.active || !c.challenge;
  for (const stage of [$('pet-stage'), document.querySelector('.study-buddy')]) {
    stage.classList.toggle('christmas-santa', c.accessories.includes('santa'));
    stage.classList.toggle('christmas-rudolph', c.accessories.includes('rudolph'));
  }
  let tree = $('christmas-home-tree');
  if (!tree) { tree = document.createElement('div'); tree.id = 'christmas-home-tree'; tree.innerHTML = christmasTree(30); document.querySelector('.room').append(tree); }
  tree.hidden = !c.installed || walking;
}
function initChristmas() {
  $('christmas-place').onclick = () => act({type:'christmas_tree',placed:!state.christmas.installed});
  $('christmas-gift-start').onclick = async () => { if(await act({type:'christmas_gift_start'})) $('christmas-result').textContent = '가운데 점선 안에 썰매가 오면 던져요!'; };
  $('christmas-throw').onclick = async () => {
    const challenge = state.christmas.challenge; if (!challenge) return;
    $('christmas-arena').classList.remove('throwing'); void $('christmas-arena').offsetWidth; $('christmas-arena').classList.add('throwing');
    await act({type:'christmas_gift_throw',challenge:challenge.id}); $('christmas-result').textContent = $('toast-message').textContent;
  };
  setInterval(() => {
    const c = state?.christmas, g = c?.challenge; if (!g || $('christmas-panel').hidden) return;
    const now = Date.now()+clockOffset, position = (Math.sin(Math.max(0,now-g.start)/1000*Math.PI/2)+1)/2;
    $('christmas-sleigh').style.left = `${10+position*80}%`;
    $('christmas-throw').disabled = busy || Boolean(pendingAction) || !c.active || now<g.start;
    if (now>g.expires) { $('christmas-result').textContent = '시간이 지났어요. 던져서 참여 선물을 받거나 다음 판을 시작하세요.'; $('christmas-gift-start').disabled = busy || c.giftsToday>=c.giftLimit || !c.active; }
  },50);
}
