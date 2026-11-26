'use strict';
// Colonie Noire · progression : nectar, évolutions, difficulté, qualité graphique, sauvegarde
const DIFFS = [
  { name: 'Facile', dmg: .6, hp: .8 },
  { name: 'Normal', dmg: 1, hp: 1 },
  { name: 'Difficile', dmg: 1.45, hp: 1.25 },
];
const QUAL = [
  { name: 'Basse', pr: .8, shadow: 0, bloom: false },
  { name: 'Moyenne', pr: 1, shadow: 1024, bloom: true },
  { name: 'Haute', pr: 1.5, shadow: 2048, bloom: true },
];
const UPG = [
  { id: 'chitine', name: 'Chitine renforcée', desc: lv => `+10 vie max et +15 chitine au départ (niveau ${lv}/3)`, icon: '#a8b4c8' },
  { id: 'acide', name: 'Glande à acide', desc: lv => `+20 % de dégâts d'acide et recharge plus rapide (niveau ${lv}/3)`, icon: '#a6ff3d' },
  { id: 'mandibules', name: 'Mandibules d\'acier', desc: lv => `+30 % de dégâts de morsure (niveau ${lv}/3)`, icon: '#f2a93b' },
  { id: 'pattes', name: 'Pattes de sprinteuse', desc: lv => `+7 % de vitesse et saut plus haut (niveau ${lv}/3)`, icon: '#ff8a5a' },
];
const UP_COST = [5, 10, 16];
const UP = { nectar: 0, lv: { chitine: 0, acide: 0, mandibules: 0, pattes: 0 } };
const SAVE = {
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('cn-save') || 'null');
      if (s) { G.unlocked = s.unlocked || 1; G.diff = s.diff ?? 1; G.qual = s.qual ?? G.qual; G.squad = s.squad ?? 0; if (s.up) { UP.nectar = s.up.nectar || 0; Object.assign(UP.lv, s.up.lv || {}); } }
    } catch (e) {}
  },
  save() { try { localStorage.setItem('cn-save', JSON.stringify({ unlocked: G.unlocked, diff: G.diff, qual: G.qual, squad: G.squad, up: UP })); } catch (e) {} },
};
const diff = () => DIFFS[G.diff];
function resetUpgrades() { UP.nectar = 0; for (const k in UP.lv) UP.lv[k] = 0; }
function addNectar(n) { UP.nectar += n; HUD.nectar(); }

function evolveScreen(next) {
  const draw = () => {
    $('nectar').textContent = UP.nectar;
    $('ups').innerHTML = UPG.map(u => {
      const lv = UP.lv[u.id], cost = UP_COST[lv], max = lv >= 3;
      return `<div class="up"><i style="background:${u.icon}"></i><div><b>${u.name}</b><p>${u.desc(Math.min(3, lv + (max ? 0 : 1)))}</p>
        <span class="pips">${[0, 1, 2].map(k => `<em class="${k < lv ? 'on' : ''}"></em>`).join('')}</span></div>
        <button data-id="${u.id}" ${max || UP.nectar < cost ? 'disabled' : ''}>${max ? 'Maximum' : cost + ' nectar'}</button></div>`;
    }).join('');
    for (const b of $('ups').querySelectorAll('button')) b.onclick = () => {
      const id = b.dataset.id, lv = UP.lv[id]; if (lv >= 3 || UP.nectar < UP_COST[lv]) return;
      UP.nectar -= UP_COST[lv]; UP.lv[id]++; SFX.pick(); SAVE.save(); draw();
    };
  };
  G.state = 'evolve'; HUD.show(false); show('evolve'); draw();
  $('bEvoGo').onclick = () => { SAVE.save(); next(); };
}
