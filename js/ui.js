'use strict';
// Colonie Noire · écrans du monde ouvert : colonie (Reine, Chambres, Armée, Diplomatie, Journal) et carte
const UI = { tab: 'reine' };
(() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const btn = (act, label, dis, arg = '') => `<button data-act="${act}" data-arg="${esc(arg)}" ${dis ? 'disabled' : ''}>${label}</button>`;
  const nearQueen = () => OW.mode === 'nest' && OW.nestCol && OW.nestCol.player && Math.hypot(P.pos.x, P.pos.z - 30) < 14;
  const atHome = () => (OW.mode === 'surface' && Math.hypot(COL.player.x - P.pos.x, COL.player.z - P.pos.z) < 45) || (OW.mode === 'nest' && OW.nestCol.player);
  UI.open = tab => {
    if (G.mode !== 'open' || (G.state !== 'play' && G.state !== 'colony')) return;
    if (tab) UI.tab = tab;
    G.state = 'colony'; IN.fire = false; IN.k = {};
    if (document.pointerLockElement) document.exitPointerLock();
    $('colony').hidden = false; HUD.show(false); UI.render();
  };
  UI.close = () => { $('colony').hidden = true; $('map').hidden = true; G.state = 'play'; HUD.show(true); HUD.lock(); };
  UI.toggle = () => { if (G.state === 'colony') UI.close(); else UI.open(); };
  UI.map = () => {
    if (G.mode !== 'open') return;
    if (G.state === 'map') { UI.close(); return; }
    if (G.state !== 'play') return;
    G.state = 'map'; if (document.pointerLockElement) document.exitPointerLock();
    $('map').hidden = false; HUD.show(false); OW.bigMap();
  };
  UI.render = () => {
    const c = COL.player, t = UI.tab;
    for (const b of document.querySelectorAll('#colTabs button')) b.classList.toggle('on', b.dataset.tab === t);
    let h = '';
    if (t === 'reine') {
      const next = c.eggs.length ? Math.ceil(Math.min(...c.eggs.map(e => e.t))) : 0;
      h += `<p class="lead">La Reine pond un œuf pour <b>10</b> de nourriture. Réserve : <b>${Math.floor(c.food)}</b> / ${COL.foodCap(c)}. Population : <b>${COL.pop(c)}</b> / ${COL.cap(c)}.</p>`;
      h += `<p>${c.eggs.length ? `${c.eggs.length} œuf${c.eggs.length > 1 ? 's' : ''} en couvaison, prochaine éclosion dans ${next} s.` : 'Aucun œuf en couvaison.'}</p>`;
      h += '<div class="ratio"><b>Ce que la Reine doit pondre</b>' + [['Ouvrières', 0, 'récoltent la nourriture'], ['Soldates', 1, 'défendent et partent en guerre'], ['Éclaireuses', 2, 'rapides, repèrent les colonies']].map(([n, i, d]) =>
        `<label>${n} <small>${d}</small><input type="range" min="0" max="10" step="1" value="${Math.round(c.ratio[i] * 10)}" data-ratio="${i}"></label>`).join('') + '</div>';
      h += nearQueen() ? `<div class="row">${btn('feed', 'Nourrir · 1 œuf', c.food < 10, 1)}${btn('feed', 'Nourrir · 5 œufs', c.food < 50, 5)}</div>` : '<p class="hint">Pour nourrir la Reine, va la voir dans la chambre royale de ta fourmilière (entrée au sommet du dôme, touche E).</p>';
    } else if (t === 'chambres') {
      h += `<p class="lead">Les ouvrières creusent les chambres. ${c.chambers.length} / ${CHAMBER_SLOTS.length} chambres.</p><div class="list">`;
      h += c.chambers.map((k, i) => `<div class="card"><b>${CHAMBERS[k].name}</b><span>${CHAMBERS[k].desc}</span></div>`).join('') || '<p>Aucune chambre pour l\'instant, à part l\'entrée, le carrefour et la chambre royale.</p>';
      h += '</div><p><b>Creuser</b></p><div class="list">' + Object.entries(CHAMBERS).map(([k, d]) => `<div class="card"><b>${d.name}</b><span>${d.desc}</span>${btn('dig', `Creuser · ${d.cost}`, c.food < d.cost || c.chambers.length >= CHAMBER_SLOTS.length, k)}</div>`).join('') + '</div>';
    } else if (t === 'armee') {
      const army = ALLY.list.filter(a => a.army).length, targets = COL.list.filter(o => !o.player && o.alive && o.known);
      h += `<p class="lead">Soldates au nid : <b>${c.soldiers}</b>. Armée avec toi : <b>${army}</b>.</p>`;
      h += atHome() ? `<div class="row">${btn('levy', 'Lever 3 soldates', c.soldiers < 1, 3)}${btn('levy', 'Lever 8 soldates', c.soldiers < 1, 8)}${btn('disband', 'Renvoyer l\'armée au nid', !army)}</div>` : `<p class="hint">Rejoins ta fourmilière pour lever une armée. ${army ? btn('disband', 'Renvoyer l\'armée au nid', false) : ''}</p>`;
      h += '<p><b>Envoyer des soldates attaquer seules</b> (bataille calculée à l\'arrivée)</p>';
      h += targets.length ? '<div class="list">' + targets.map(o => `<div class="card"><b style="color:${o.species.color}">${esc(o.name)}</b><span>${o.status === 'guerre' ? 'En guerre' : o.status === 'alliee' ? 'Alliée' : 'Neutre'} · environ ${o.soldiers} soldates · ${Math.round(Math.hypot(o.x - c.x, o.z - c.z))} m</span>${o.status === 'alliee' ? '' : btn('send', `Envoyer ${Math.min(10, c.soldiers)} soldates`, c.soldiers < 1, o.id)}</div>`).join('') + '</div>' : '<p>Aucune colonie connue : explore le monde.</p>';
      const moves = COL.armies.filter(a => a.own || a.to.player);
      if (moves.length) h += '<p><b>Armées en marche</b></p><ul>' + moves.map(a => `<li>${a.own ? `${a.n} de tes soldates vers les ${esc(a.to.name)}` : `<span class="warn">Raid des ${esc(a.from.name)} (${a.n}) vers ta fourmilière</span>`} · ${Math.round(Math.hypot(a.to.x - a.x, a.to.z - a.z) / 3.2)} s</li>`).join('') + '</ul>';
    } else if (t === 'diplo') {
      const known = COL.list.filter(o => !o.player && o.known);
      h += '<p class="lead">Offre de la nourriture pour améliorer les relations. Au-dessus de 40, une alliance devient possible. Les alliées ne t\'attaquent pas et peuvent te demander de l\'aide.</p>';
      h += known.length ? '<div class="list">' + known.map(o => {
        const rel = Math.round(o.rel), st = !o.alive ? 'Vaincue' : o.status === 'guerre' ? 'En guerre' : o.status === 'alliee' ? 'Alliée' : 'Neutre';
        const wars = [...o.wars].map(id => COL.get(id)).filter(x => x && x.known).map(x => x.name);
        return `<div class="card dip"><b style="color:${o.species.color}">${esc(o.name)}</b><span>${st} · relation ${rel} · ${o.workers + o.soldiers} fourmis${wars.length ? ` · en guerre contre : ${esc(wars.join(', '))}` : ''}</span>
          <div class="relbar"><i style="width:${(rel + 100) / 2}%;background:${rel < -30 ? '#e0441f' : rel > 40 ? '#6ab8ff' : '#c9c2b4'}"></i></div>
          ${o.alive ? `<div class="row">${btn('gift', 'Offrir 20', c.food < 20, o.id)}${o.status === 'neutre' ? btn('ally', 'Proposer une alliance', false, o.id) : ''}${o.status === 'guerre' ? btn('peace', 'Proposer une trêve', false, o.id) : btn('war', 'Déclarer la guerre', false, o.id)}</div>` : ''}</div>`;
      }).join('') + '</div>' : '<p>Aucune colonie connue pour l\'instant. Explore : elles apparaissent sur la minicarte quand tu t\'approches.</p>';
    } else {
      h += '<ul class="journal">' + (COL.events.map(e => `<li class="${e.kind}">${esc(e.t)}</li>`).join('') || '<li>Rien à signaler.</li>') + '</ul>';
    }
    $('colBody').innerHTML = h;
  };
  $('colTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { UI.tab = b.dataset.tab; UI.render(); } });
  $('colClose').onclick = UI.close; $('mapClose').onclick = UI.close;
  $('colBody').addEventListener('input', e => { const i = e.target.dataset.ratio; if (i !== undefined) COL.player.ratio[+i] = +e.target.value / 10 + .001; });
  $('colBody').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const a = b.dataset.act, arg = b.dataset.arg, o = COL.get(arg);
    if (a === 'feed') COL.feedQueen(+arg);
    else if (a === 'dig') COL.dig(arg);
    else if (a === 'levy') { const n = Math.min(+arg, COL.player.soldiers); COL.player.soldiers -= n; ALLY.army(n);
      for (const o of COL.list) if (o.status === 'alliee' && o.alive && o.soldiers > 4 && Math.hypot(o.x - P.pos.x, o.z - P.pos.z) < 400) { const k = Math.min(3, Math.floor(o.soldiers / 4)); o.soldiers -= k; ALLY.army(k, o); HUD.feed(`Les ${o.name}, tes alliées, envoient ${k} soldates`); } if (ALLY.order !== 'follow') ALLY.order = 'follow'; HUD.notice(`${n} soldates te suivent (G : ordres, R : rappel)`, 2.4); }
    else if (a === 'disband') { const k = ALLY.disband(); HUD.notice(`${k} soldates rentrent au nid`, 2); }
    else if (a === 'send' && o) COL.sendArmy(o, Math.min(10, COL.player.soldiers));
    else if (a === 'gift' && o) COL.gift(o);
    else if (a === 'ally' && o) COL.ally(o);
    else if (a === 'peace' && o) COL.peace(o);
    else if (a === 'war' && o) COL.declare(o);
    UI.render();
  });
})();
