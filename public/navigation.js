const mainTabs = ['care', 'study', 'journey', 'shop', 'christmas'];
function showMainTab(tab, { updateUrl = true, focus = false } = {}) {
  if (!mainTabs.includes(tab)) tab = 'care';
  for (const name of mainTabs) {
    const active = name === tab;
    document.getElementById(`${name}-panel`).hidden = !active;
    const button = document.getElementById(`main-tab-${name}`);
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
  }
  if (updateUrl && location.hash !== `#tab-${tab}`) history.pushState(null, '', `#tab-${tab}`);
  if (updateUrl) window.scrollTo({ top: 0, behavior: 'instant' });
  if (focus) document.getElementById(`main-tab-${tab}`).focus();
}
function initNavigation() {
  const fromUrl = () => {
    const tab = location.hash.slice(1).replace(/^tab-/, '');
    showMainTab(tab, { updateUrl: false });
    if (mainTabs.includes(tab) && location.hash !== `#tab-${tab}`) history.replaceState(null, '', `#tab-${tab}`);
  };
  fromUrl();
  window.addEventListener('hashchange', fromUrl);
  window.addEventListener('popstate', fromUrl);
  for (const name of mainTabs) {
    const button = document.getElementById(`main-tab-${name}`);
    button.addEventListener('click', () => {
      showMainTab(name);
    });
    button.addEventListener('keydown', event => {
      let index = mainTabs.indexOf(name);
      if (event.key === 'ArrowRight') index = (index + 1) % mainTabs.length;
      else if (event.key === 'ArrowLeft') index = (index + mainTabs.length - 1) % mainTabs.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = mainTabs.length - 1;
      else return;
      event.preventDefault(); showMainTab(mainTabs[index], { focus: true });
    });
  }
  document.getElementById('knowledge-today').addEventListener('click', event => {
    event.preventDefault(); showMainTab('study');
  });
  document.getElementById('study-quests').addEventListener('click', () => {
    journeyTab = 'study'; showMainTab('journey'); renderJourney();
  });
}
