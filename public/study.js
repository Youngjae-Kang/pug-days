let studySelectedWord = null, studySelectedAnswer = null, studyBoardKey = '', vocabularyPage = 0;
function isStudying() { return ['active', 'paused'].includes(state?.study?.session?.status); }
function studyNode(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function renderStudy() {
  if (!state?.study) return;
  const study = state.study, session = study.session, open = isStudying();
  const blocked = busy || Boolean(pendingAction) || !state.name;
  $('knowledge-value').textContent = `${study.knowledge} / 100`;
  $('knowledge-bar').value = study.knowledge;
  $('knowledge-today').textContent = `오늘 ${study.todayCount}개 공부했어요`;
  $('study-buddy-status').textContent = `${state.name || '퍼그'} · 지식 ${study.knowledge} / 100`;
  $('study').classList.toggle('studying-now', session?.status === 'active');
  $('study-wordbook').textContent = `단어장 · ${study.words.length}개`;
  $('study-start-form').hidden = open;
  $('study-session').hidden = !session;
  $('study-empty').hidden = study.words.length > 0;
  $('study-target').max = Math.max(1, study.words.length);
  if (study.words.length && document.activeElement !== $('study-target') && Number($('study-target').value) > study.words.length) $('study-target').value = Math.min(20, study.words.length);
  $('study-target').disabled = blocked || !study.words.length;
  $('study-start').disabled = blocked || !study.words.length || Boolean(state.activity);
  $('study-availability').textContent = state.activity ? '지금 하는 활동을 마치고 공부를 시작해요.' : '';
  $('study-wordbook').disabled = blocked;
  $('study-pause').hidden = !open;
  $('study-stop').hidden = !open;
  $('study-pause').disabled = blocked;
  $('study-stop').disabled = blocked;
  $('study-pause').textContent = session?.status === 'paused' ? '계속하기' : '일시정지';
  $('study-paused').hidden = session?.status !== 'paused';
  $('study-board').hidden = session?.status !== 'active';
  if (session) {
    $('study-progress').max = session.target;
    $('study-progress').value = session.completed;
    $('study-count').textContent = `${session.completed} / ${session.target}개`;
    $('study-result').textContent = session.status === 'completed' ? '목표 달성! 퍼그와 한 뼘 더 똑똑해졌어요.' : session.status === 'stopped' ? '공부를 마쳤어요. 맞힌 단어와 지식은 저장했어요.' : '';
  }
  const key = JSON.stringify([session?.id, session?.left, session?.right, session?.status]);
  if (key !== studyBoardKey) {
    studyBoardKey = key; studySelectedWord = null; studySelectedAnswer = null;
    $('study-feedback').textContent = '';
    $('study-words').replaceChildren(); $('study-answers').replaceChildren();
    if (session?.status === 'active') {
      const words = new Map(study.words.map(w => [w.id, w]));
      for (const side of ['left', 'right']) {
        for (const id of session[side]) {
          const word = words.get(id);
          if (!word) continue;
          const button = studyNode('button', 'study-card', side === 'left' ? word.term : word.answer);
          button.type = 'button'; button.dir = 'auto'; button.dataset.cardId = id; button.dataset.side = side;
          button.addEventListener('click', () => chooseStudyCard(side, id));
          $(side === 'left' ? 'study-words' : 'study-answers').append(button);
        }
      }
    }
  }
  for (const button of document.querySelectorAll('.study-card')) {
    button.disabled = blocked || session?.status !== 'active';
    button.setAttribute('aria-pressed', String(button.dataset.cardId === (button.dataset.side === 'left' ? studySelectedWord : studySelectedAnswer)));
  }
  $('vocab-file').disabled = blocked || open;
  $('vocab-upload-label').classList.toggle('disabled', blocked || open);
  for (const button of document.querySelectorAll('[data-study-retry]')) { button.hidden = !pendingAction; button.disabled = busy; }
  $('vocab-lock').textContent = open ? '공부를 마치거나 그만두면 단어장을 수정할 수 있어요.' : '';
  if ($('vocab-dialog').open) renderVocabulary();
}
async function chooseStudyCard(side, id) {
  if (busy || pendingAction || state.study.session?.status !== 'active') return;
  if (side === 'left') studySelectedWord = studySelectedWord === id ? null : id;
  else studySelectedAnswer = studySelectedAnswer === id ? null : id;
  renderStudy();
  if (!studySelectedWord || !studySelectedAnswer) return;
  const session = state.study.session, before = session.completed;
  const okay = await act({ type: 'study_match', sessionId: session.id, wordId: studySelectedWord, answerId: studySelectedAnswer });
  if (!pendingAction) { studySelectedWord = null; studySelectedAnswer = null; }
  if (okay) {
    const correct = state.study.session.completed > before;
    $('study-feedback').textContent = correct ? '정답! 잘했어요 ♡' : '조금 달라요. 다시 골라보세요.';
    $('study-feedback').classList.toggle('try-again', !correct);
  }
  renderStudy();
}
function renderVocabulary() {
  const search = $('vocab-search').value.normalize('NFC').toLocaleLowerCase();
  const words = state.study.words.filter(w => `${w.term} ${w.answer}`.toLocaleLowerCase().includes(search));
  const pages = Math.max(1, Math.ceil(words.length / 20));
  vocabularyPage = Math.min(vocabularyPage, pages - 1);
  $('vocab-page').textContent = `${vocabularyPage + 1} / ${pages}`;
  $('vocab-prev').disabled = vocabularyPage === 0;
  $('vocab-next').disabled = vocabularyPage === pages - 1;
  $('vocab-list').replaceChildren();
  if (!words.length) $('vocab-list').append(studyNode('p', 'study-note', '아직 단어가 없어요. TXT 파일을 올려주세요.'));
  for (const word of words.slice(vocabularyPage * 20, (vocabularyPage + 1) * 20)) {
    const row = studyNode('div', 'vocab-row'), term = studyNode('span', '', word.term), answer = studyNode('span', '', word.answer);
    term.dir = answer.dir = 'auto';
    const edit = studyNode('button', 'text-button', '수정'), remove = studyNode('button', 'text-button', '삭제');
    edit.disabled = remove.disabled = busy || Boolean(pendingAction) || isStudying();
    edit.setAttribute('aria-label', `${word.term} 수정`); remove.setAttribute('aria-label', `${word.term} 삭제`);
    edit.addEventListener('click', () => {
      $('vocab-edit-form').dataset.wordId = word.id;
      $('vocab-term').value = word.term; $('vocab-answer').value = word.answer;
      $('vocab-edit-dialog').showModal();
    });
    remove.addEventListener('click', () => {
      $('vocab-delete-confirm').dataset.wordId = word.id;
      $('vocab-delete-word').textContent = word.term;
      $('vocab-delete-dialog').showModal();
    });
    row.append(term, answer, edit, remove); $('vocab-list').append(row);
  }
}
function initStudy() {
  for (const button of document.querySelectorAll('[data-study-retry]')) button.addEventListener('click', async () => {
    if (await act(pendingAction)) {
      $('vocab-edit-dialog').close(); $('vocab-delete-dialog').close();
      $('vocab-upload-status').textContent = `저장을 확인했어요 · 총 ${state.study.words.length}개`;
      for (const error of document.querySelectorAll('.study-dialog-error')) error.textContent = '';
    }
  });
  $('study-wordbook').addEventListener('click', () => { $('vocab-dialog').showModal(); renderStudy(); });
  for (const button of document.querySelectorAll('[data-close-study-dialog]')) button.addEventListener('click', () => $(button.dataset.closeStudyDialog).close());
  for (const id of ['vocab-edit-dialog', 'vocab-delete-dialog']) $(id).addEventListener('cancel', event => { if (busy || pendingAction) event.preventDefault(); });
  $('vocab-search').addEventListener('input', () => { vocabularyPage = 0; renderVocabulary(); });
  $('vocab-prev').addEventListener('click', () => { vocabularyPage--; renderVocabulary(); });
  $('vocab-next').addEventListener('click', () => { vocabularyPage++; renderVocabulary(); });
  $('vocab-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (!/\.txt$/i.test(file.name)) throw new Error('TXT 파일을 선택해주세요.');
      if (file.size > state.study.rules.maxFileBytes) throw new Error('파일은 256KB까지 올릴 수 있어요.');
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error('파일을 UTF-8 형식으로 저장한 뒤 다시 올려주세요.'); }
      if (await act({ type: 'vocab_upload', text })) {
        $('vocab-upload-status').textContent = `서버에 저장했어요 · 총 ${state.study.words.length}개`;
        if (Number($('study-target').value) > state.study.words.length) $('study-target').value = Math.min(20, state.study.words.length);
      } else $('vocab-upload-status').textContent = $('toast-message').textContent;
    } catch (error) { $('vocab-upload-status').textContent = error.message; }
    finally { event.target.value = ''; renderStudy(); }
  });
  $('vocab-edit-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('vocab-edit-save'); button.disabled = true;
    if (await act({ type: 'vocab_edit', wordId: event.currentTarget.dataset.wordId, term: $('vocab-term').value, answer: $('vocab-answer').value })) $('vocab-edit-dialog').close();
    button.disabled = false;
  });
  $('vocab-delete-confirm').addEventListener('click', async event => {
    event.currentTarget.disabled = true;
    if (await act({ type: 'vocab_delete', wordId: event.currentTarget.dataset.wordId })) $('vocab-delete-dialog').close();
    $('vocab-delete-confirm').disabled = false;
  });
  $('study-start-form').addEventListener('submit', async event => {
    event.preventDefault(); $('study-feedback').textContent = '';
    await act({ type: 'study_start', target: Number($('study-target').value) });
  });
  $('study-pause').addEventListener('click', () => act({ type: state.study.session.status === 'paused' ? 'study_resume' : 'study_pause', sessionId: state.study.session.id }));
  $('study-stop').addEventListener('click', () => act({ type: 'study_stop', sessionId: state.study.session.id }));
}
