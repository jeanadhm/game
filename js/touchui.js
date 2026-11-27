'use strict';
// Colonie Noire · boutons tactiles : icônes, couleurs, et éditeur de disposition (glisser, taille, transparence)
const TOUCHUI = {};
(() => {
  const ic = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const B = {
    tFire: ['Tir', '#a6ff3d', ic('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>')],
    tJump: ['Saut', '#f3ead8', ic('<path d="M12 19V6"/><path d="M6 11l6-6 6 6"/><path d="M5 21h14"/>')],
    tWeap: ['Arme', '#f2a93b', ic('<path d="M4 9h13l-3-3"/><path d="M20 15H7l3 3"/>')],
    tShield: ['Bouclier', '#7dffd0', ic('<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>')],
    tAct: ['Agir', '#a6ff3d', ic('<path d="M9 11V5a1.5 1.5 0 013 0v5"/><path d="M12 10V4a1.5 1.5 0 013 0v7"/><path d="M15 9a1.5 1.5 0 013 0v5a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L4 14a1.5 1.5 0 012.5-1.7L9 15"/>')],
    tClimb: ['Grimper', '#f2a93b', ic('<path d="M7 14l5-5 5 5"/><path d="M7 20l5-5 5 5"/><path d="M4 4h16"/>')],
    tFly: ['Voler', '#c9b8ff', ic('<path d="M12 12c-2-5-7-7-9-5s2 7 9 5z"/><path d="M12 12c2-5 7-7 9-5s-2 7-9 5z"/><path d="M12 12v8"/>')],
    tOrder: ['Ordre', '#7dffd0', ic('<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>')],
    tRecall: ['Rappel', '#ff8a5a', ic('<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><path d="M10 5l2 2 2-2M10 19l2-2 2 2M5 10l2 2-2 2M19 10l-2 2 2 2"/>')],
    tCol: ['Colonie', '#f2a93b', ic('<path d="M3 19c1-8 5-12 9-12s8 4 9 12z"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M2 19h20"/>')],
    tMap: ['Carte', '#f3ead8', ic('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>')],
    tPause: ['', '#f3ead8', ic('<path d="M9 5v14M15 5v14"/>')],
    bView: ['Vue', '#f3ead8', ic('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>')],
  };
  const EDIT = Object.keys(B);
  let L = { p: {}, l: {}, scale: 1, alpha: .85 };
  try { const s = JSON.parse(localStorage.getItem('cn-layout') || 'null'); if (s) L = Object.assign(L, s); } catch (e) {}
  const save = () => { try { localStorage.setItem('cn-layout', JSON.stringify(L)); } catch (e) {} };
  const orient = () => innerWidth > innerHeight ? 'l' : 'p';

  TOUCHUI.label = (id, text) => { const s = $(id) && $(id).querySelector('span'); if (s && s.textContent !== text) s.textContent = text; };
  TOUCHUI.init = () => {
    for (const id of EDIT) { const b = $(id); if (!b) continue; const [lab, col, svg] = B[id]; b.classList.add('tbtn'); b.style.setProperty('--c', col); b.innerHTML = svg + (lab ? `<span>${lab}</span>` : ''); }
    TOUCHUI.apply();
  };
  // position enregistrée : centre du bouton en fraction de l'écran
  TOUCHUI.apply = () => {
    document.documentElement.style.setProperty('--bs', L.scale); document.documentElement.style.setProperty('--ba', L.alpha);
    const o = L[orient()] || {};
    for (const id of EDIT) {
      const b = $(id); if (!b) continue;
      const p = o[id];
      if (p) { b.style.left = (p[0] * innerWidth) + 'px'; b.style.top = (p[1] * innerHeight) + 'px'; b.style.right = 'auto'; b.style.bottom = 'auto'; b.classList.add('placed'); }
      else { b.style.left = b.style.top = b.style.right = b.style.bottom = ''; b.classList.remove('placed'); }
    }
  };
  addEventListener('resize', () => TOUCHUI.apply());

  // --- éditeur
  let drag = null;
  TOUCHUI.edit = () => {
    G.prevState = G.state; G.state = 'layout'; show(null); HUD.show(false);
    $('touch').hidden = false; $('hud').hidden = false; $('bView').hidden = false; document.body.classList.add('editing'); $('layoutBar').hidden = false;
    $('lScale').value = L.scale; $('lAlpha').value = L.alpha;
  };
  TOUCHUI.done = () => {
    document.body.classList.remove('editing'); $('layoutBar').hidden = true; $('hud').hidden = true; save();
    G.state = 'pause'; show('pause'); HUD.show(false);
  };
  for (const id of EDIT) {
    const b = $(id); if (!b) continue;
    b.addEventListener('pointerdown', e => {
      if (!document.body.classList.contains('editing')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const r = b.getBoundingClientRect(); drag = { b, id, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2), pid: e.pointerId };
      try { b.setPointerCapture(e.pointerId); } catch (er) {} b.classList.add('dragging');
    }, true);
  }
  addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const x = clamp(e.clientX - drag.dx, 24, innerWidth - 24) / innerWidth, y = clamp(e.clientY - drag.dy, 24, innerHeight - 24) / innerHeight;
    (L[orient()] = L[orient()] || {})[drag.id] = [x, y]; TOUCHUI.apply();
  }, true);
  addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pid) { drag.b.classList.remove('dragging'); drag = null; save(); } }, true);
  $('lScale').addEventListener('input', e => { L.scale = +e.target.value; TOUCHUI.apply(); });
  $('lAlpha').addEventListener('input', e => { L.alpha = +e.target.value; TOUCHUI.apply(); });
  $('lReset').onclick = () => { L[orient()] = {}; L.scale = 1; L.alpha = .85; $('lScale').value = 1; $('lAlpha').value = .85; TOUCHUI.apply(); save(); };
  $('lDone').onclick = TOUCHUI.done;
  $('bLayout').onclick = () => TOUCHUI.edit();
  TOUCHUI.init();
})();
