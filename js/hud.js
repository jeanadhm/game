'use strict';
// Colonie Noire · interface (HUD, dialogues) et commandes (clavier, souris, tactile)
const $ = id => document.getElementById(id);
const IN = { k: {}, dx: 0, dy: 0, shieldPress: false, fire: false, firePress: false, jump: false, wsel: 0, wheel: 0, locked: false, noLock: false, touch: false, mx: 0, my: 0, mrun: false };

(() => {
  const KEYMAP = { KeyW: 'f', KeyZ: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyQ: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
  addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (k) IN.k[k] = true;
    if (G.state === 'play' && (k || e.code === 'Space')) e.preventDefault();
    if (e.code === 'Space' && !e.repeat) IN.jump = true;
    if (/^Digit[1-4]$/.test(e.code)) IN.wsel = +e.code.slice(5);
    if (e.code === 'KeyF' || e.code === 'KeyE') IN.shieldPress = true;
    if (G.state === 'play' && e.code === 'KeyG' && !e.repeat) ALLY.command();
    if (G.state === 'play' && e.code === 'KeyR' && !e.repeat) ALLY.recall();
    if ((e.code === 'Escape' || e.code === 'KeyP') && G.state === 'play' && !IN.locked) G.pause();
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) IN.k[k] = false; });
  addEventListener('blur', () => { IN.k = {}; IN.fire = false; });
  const cv = $('c');
  cv.addEventListener('mousedown', e => {
    if (G.state !== 'play' || IN.touch) return;
    if (!IN.locked && !IN.noLock) { HUD.lock(); return; }
    if (e.button === 0) { IN.fire = true; IN.firePress = true; }
    if (e.button === 2) IN.shieldPress = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) IN.fire = false; });
  addEventListener('mousemove', e => { if (G.state === 'play' && !IN.touch && (IN.locked || IN.noLock)) { IN.dx += e.movementX || 0; IN.dy += e.movementY || 0; } });
  cv.addEventListener('wheel', e => { if (G.state === 'play') IN.wheel += e.deltaY > 0 ? 1 : -1; }, { passive: true });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    IN.locked = document.pointerLockElement === cv;
    if (!IN.locked && G.state === 'play' && !IN.noLock) G.pause();
  });
  document.addEventListener('pointerlockerror', () => { IN.fails = (IN.fails || 0) + 1; if (IN.fails >= 2) { IN.noLock = true; HUD.notice('Souris libre : Échap ou P pour la pause', 3); } else HUD.notice('Clique dans le jeu pour capturer la souris', 2.5); });

  // tactile : joystick à gauche, visée à droite, boutons
  const stick = $('stick'), knob = stick.firstElementChild; let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
  addEventListener('touchstart', () => { if (!IN.touch) { IN.touch = true; document.body.classList.add('touch'); if (G.state === 'play') $('touch').hidden = false; } }, { passive: true });
  $('tzone').addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    if (e.clientX < innerWidth * .45 && sid === null) { sid = e.pointerId; sx = e.clientX; sy = e.clientY; stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.hidden = false; }
    else if (lid === null) { lid = e.pointerId; lx = e.clientX; ly = e.clientY; }
  });
  addEventListener('pointermove', e => {
    if (e.pointerId === sid) { let dx = e.clientX - sx, dy = e.clientY - sy; const d = Math.hypot(dx, dy); if (d > 50) { dx *= 50 / d; dy *= 50 / d; } knob.style.transform = `translate(${dx}px,${dy}px)`; IN.mx = dx / 50; IN.my = -dy / 50; IN.mrun = d > 48 && -dy > 30; }
    else if (e.pointerId === lid) { IN.dx += (e.clientX - lx) * 1.6; IN.dy += (e.clientY - ly) * 1.6; lx = e.clientX; ly = e.clientY; }
  });
  const end = e => { if (e.pointerId === sid) { sid = null; IN.mx = IN.my = 0; IN.mrun = false; stick.hidden = true; knob.style.transform = ''; } if (e.pointerId === lid) lid = null; };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  const hold = (id, on, off) => { const b = $(id); b.addEventListener('pointerdown', e => { e.stopPropagation(); on(); }); b.addEventListener('pointerup', () => off && off()); b.addEventListener('pointerleave', () => off && off()); };
  hold('tFire', () => { IN.fire = true; IN.firePress = true; }, () => { IN.fire = false; });
  hold('tJump', () => { IN.jump = true; });
  hold('tWeap', () => { IN.wheel += 1; });
  hold('tShield', () => { IN.shieldPress = true; });
  hold('tOrder', () => ALLY.command());
  hold('tRecall', () => ALLY.recall());
  hold('tPause', () => G.pause());
})();

const HUD = (() => {
  const q = []; let tgtT = 0, dlgT = 0, typing = null, noticeT = 0, hitT = 0, dmgT = 0, lastHp = -1, lastAr = -1, lastW = '', lastAmmo = '';
  const slots = [...document.querySelectorAll('#slots span')];
  const H = {
    show(v) { $('hud').hidden = !v; $('touch').hidden = !(v && IN.touch); },
    lock() { if (IN.touch || IN.noLock) return; try { const r = $('c').requestPointerLock(); if (r && r.catch) r.catch(() => { IN.noLock = true; }); } catch (e) { IN.noLock = true; } },
    level(chap, name) { $('lvlName').textContent = chap + ' · ' + name; },
    objective(t) { const o = $('objText'); if (o.textContent !== t) { o.textContent = t; $('obj').classList.remove('flash'); void o.offsetWidth; $('obj').classList.add('flash'); } },
    say(who, text, dur) { q.push({ who, text, dur: dur || 2.2 + text.length * .045 }); },
    clearSay() { q.length = 0; dlgT = 0; $('dlg').hidden = true; },
    notice(t, d = 2.2) { const n = $('notice'); n.textContent = t; n.classList.add('on'); noticeT = d; },
    feed(t) { const f = $('feed'), d = document.createElement('div'); d.textContent = t; f.prepend(d); while (f.children.length > 4) f.lastChild.remove(); setTimeout(() => d.remove(), 4200); },
    hit(head) { const h = $('hitm'); h.className = head ? 'on head' : 'on'; hitT = .18; SFX.hit(head); },
    hurt(ang, amt) {
      dmgT = Math.min(1, dmgT + amt / 30);
      if (ang !== null) { const d = $('dmgDir'); d.style.transform = `rotate(${-ang}rad)`; d.classList.remove('on'); void d.offsetWidth; d.classList.add('on'); }
    },
    allies() {
      $('allies').innerHTML = (ALLY.list.length ? `<div class="order">Escouade : <b>${ORDERS[ALLY.order]}</b> <small>${IN.touch ? '' : 'G ordre · R rappel'}</small></div>` : '') + ALLY.list.map(a => `<div class="ally${a.down ? ' down' : ''}"><span></span><div class="track"><div style="width:${a.hp / a.max * 100}%"></div></div></div>`).join('');
      [...$('allies').querySelectorAll('.ally span')].forEach((el, i) => el.textContent = ALLY.list[i].name + (ALLY.list[i].down ? ' · à terre' : ''));
    },
    prompt(t) { const p = $('prompt'); if (p.textContent !== t) { p.textContent = t; p.hidden = !t; } },
    nectar() { $('nect').textContent = UP.nectar; $('nectW').classList.remove('bump'); void $('nectW').offsetWidth; $('nectW').classList.add('bump'); },
    boss(name, frac) { const b = $('boss'); if (frac === null) { b.hidden = true; return; } b.hidden = false; $('bossName').textContent = name; $('bossBar').style.width = (frac * 100) + '%'; },
    update(dt) {
      // dialogues avec effet machine à écrire
      if (dlgT > 0) { dlgT -= dt; if (typing) { typing.i = Math.min(typing.text.length, typing.i + dt * 55); $('dlgText').textContent = typing.text.slice(0, Math.floor(typing.i)); } if (dlgT <= 0) $('dlg').hidden = true; }
      if (dlgT <= 0 && q.length) { const m = q.shift(); typing = { text: m.text, i: 0 }; $('dlgWho').textContent = m.who; $('dlgWho').dataset.who = m.who; $('dlgText').textContent = ''; $('dlg').hidden = false; dlgT = m.dur; }
      if (noticeT > 0) { noticeT -= dt; if (noticeT <= 0) $('notice').classList.remove('on'); }
      if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hitm').className = ''; }
      dmgT = Math.max(0, dmgT - dt * .8); $('dmg').style.opacity = Math.max(dmgT, P.hp < 30 ? .35 + Math.sin(performance.now() / 300) * .1 : 0);
      const hp = Math.ceil(P.hp), ar = Math.ceil(P.armor);
      if (hp !== lastHp) { lastHp = hp; $('hpBar').style.width = (hp / P.maxHp * 100) + '%'; $('hpNum').textContent = hp; $('hpBar').classList.toggle('low', hp < 30); }
      if (ar !== lastAr) { lastAr = ar; $('arBar').style.width = ar + '%'; $('arNum').textContent = ar; }
      const w = WEAPONS[P.weapon].name; if (w !== lastW) { lastW = w; $('wName').textContent = w; slots.forEach((s, i) => s.classList.toggle('on', i + 1 === P.weapon)); }
      const am = P.weapon === 1 ? '∞' : P.weapon === 2 ? Math.floor(P.acid) + '%' : P.weapon === 3 ? P.seeds + ' / 6' : P.darts + ' / 8';
      if (am !== lastAmmo) { lastAmmo = am; $('wAmmo').textContent = am; }
      $('acidBar').style.width = P.acid + '%';
      const sb = $('shieldBar'); sb.style.width = (P.shieldT > 0 ? P.shieldT / 4 * 100 : 100 - P.shieldCd / 10 * 100) + '%'; sb.className = P.shieldT > 0 ? 'on' : P.shieldCd > 0 ? 'cd' : '';
      if (ALLY.list.length && Math.random() < dt * 4) HUD.allies();
      // boussole vers l'objectif
      const tg = G.target && G.target();
      if (tg) {
        const a = Math.atan2(tg.x - P.pos.x, tg.z - P.pos.z) - (P.yaw + Math.PI);
        $('arrow').style.transform = `rotate(${-a}rad)`; $('dist').textContent = Math.round(Math.hypot(tg.x - P.pos.x, tg.z - P.pos.z)) + ' m';
        $('compass').hidden = false;
      } else $('compass').hidden = true;
      const sp = 6 + Math.min(14, Math.hypot(P.vel.x, P.vel.z) * 1.6) + P.recoil * 6;
      $('cross').style.setProperty('--g', sp + 'px'); $('cross').dataset.w = P.weapon; $('cross').style.setProperty('--c', (P.charge * 360) + 'deg');
      // barre de vie de l'ennemi visé
      tgtT -= dt;
      if (tgtT <= 0) {
        tgtT = .1; const d = new T.Vector3(); cam.getWorldDirection(d);
        const h = EN.rayHit(cam.position, d, world.rayBlock(cam.position, d, 60));
        if (h && !h.e.d.boss) { $('target').hidden = false; $('tName').textContent = h.e.d.name + (h.e.stun > 0 ? ' · paralysée' : ''); $('tBar').style.width = Math.max(0, h.e.hp / h.e.max * 100) + '%'; }
        else $('target').hidden = true;
      }
    },
  };
  return H;
})();
