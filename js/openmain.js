'use strict';
// Colonie Noire · mode monde ouvert : surface et souterrain, récolte, fourmis autour des nids,
// entrée dans la fourmilière, assauts, raids, propositions diplomatiques, sauvegarde, minicarte.
const OW = { surface: null, mode: 'off', nestCol: null, nestWorld: null, stash: null, unitsT: 0, saveT: 0, mapT: 0, props: [], amb: [], queen: null };
const OPEN_L = { id: 'open', chapter: 'Monde ouvert', name: '', type: 'surface', events: [], objective: () => COL.quest().t(), target: () => OW.target() };
(() => {
  const V = new T.Vector3();
  OW.target = () => {
    if (OW.mode === 'nest') {
      if (OW.nestCol.player) return COL.q === 1 ? { x: 0, z: 26 } : { x: 0, z: -46 };
      const q = EN.list.find(e => e.d.queen && !e.dead); return q ? q.pos : { x: 0, z: -46 };
    }
    const t = COL.quest().target(); return t ? { x: t.x, z: t.z } : null;
  };
  OW.saveable = () => G.mode === 'open';
  OW.save = () => {
    if (!COL.player) return;
    const s = { seed: COL.seed, t: COL.t, q: COL.q, stats: COL.stats, p: OW.mode === 'surface' ? [P.pos.x, P.pos.z] : [COL.player.x, COL.player.z + 20],
      cols: COL.list.map(c => ({ ...c, wars: [...c.wars], glow: undefined })), regions: [...COL.regions] };
    try { localStorage.setItem('cn-open', JSON.stringify(s)); } catch (e) {}
  };
  OW.hasSave = () => { try { return !!localStorage.getItem('cn-open'); } catch (e) { return false; } };
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem('cn-open')); if (!s) return null;
      COL.seed = s.seed; COL.t = s.t; COL.q = s.q; COL.stats = s.stats; COL.events = []; COL.raids = []; COL.armies = [];
      COL.list = s.cols.map(c => ({ ...c, wars: new Set(c.wars) })); COL.nests = COL.list.slice(); COL.player = COL.list.find(c => c.player); COL.regions = new Set(s.regions);
      return s;
    } catch (e) { return null; }
  }

  // --- démarrage du monde ouvert
  OW.start = cont => {
    G.mode = 'open'; resetStats(); P.reset();
    const s = cont ? load() : null;
    if (!s) COL.newGame(1 + Math.floor(Math.random() * 9999));
    if (G.chapterWorld) G.chapterWorld.clear();
    EN.clear(); PK.clear(); FX.clear(); ALLY.clear(); HUD.boss(null, null); HUD.clearSay(); HUD.prompt('');
    if (OW.surface) OW.surface.clear();
    OW.surface = new OpenWorld(scene, COL.seed); world = OW.surface; OW.mode = 'surface';
    setEnv(false);
    const px = s ? s.p[0] : COL.player.x, pz = s ? s.p[1] : COL.player.z + 24;
    P.pos.set(px, 0, pz); OW.surface.stream(true);
    P.spawn({ start: { x: px, z: pz, yaw: 0 } });
    G.L = OPEN_L; OPEN_L.name = COL.player.name; G.target = OPEN_L.target; G.fired = new Set(); G.lt = 0;
    HUD.level('Monde ouvert', 'Surface'); OW.amb = []; OW.props = []; drawProps();
    SFX.ambient('surface');
    if (!s) {
      HUD.say(WHO.reine, 'Sergent Obsidienne, la colonie a faim. Rapporte de la nourriture : graines, miellat, insectes morts.');
      HUD.say(WHO.nyx, 'Approche-toi de la nourriture et appuie sur E pour la porter. Tab ouvre la colonie, M la carte.');
    } else HUD.notice('Partie reprise', 2);
    $('colbar').hidden = false; $('mini').hidden = false;
  };
  OW.stop = () => {
    OW.save(); G.mode = 'story';
    EN.clear(); PK.clear(); ALLY.clear(); clearAmb();
    if (OW.nestWorld) { OW.nestWorld.clear(); OW.nestWorld = null; }
    if (OW.surface) { OW.surface.clear(); OW.surface = null; }
    world = G.chapterWorld; OW.mode = 'off'; $('colbar').hidden = true; $('mini').hidden = true; $('colony').hidden = true; $('map').hidden = true;
  };

  // --- fourmis autour des nids (créées près de la joueuse, retirées quand elle s'éloigne)
  function units() {
    for (let i = EN.list.length - 1; i >= 0; i--) { const e = EN.list[i]; if (!e.raid && !e.dead && e.pos.distanceTo(P.pos) > 120) { scene.remove(e.ant.root); EN.list.splice(i, 1); } }
    for (const c of COL.list) {
      if (c.player || !c.alive) continue;
      const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z); if (d > 95) continue;
      const war = c.status === 'guerre', mine = EN.list.filter(e => e.col === c.id && !e.dead && !e.raid);
      const wantW = Math.min(6, Math.ceil(c.workers / 4)), wantS = Math.min(war ? 7 : 4, Math.ceil(c.soldiers / 4));
      const nw = mine.filter(e => e.type === 'worker').length, ns = mine.length - nw;
      if (nw < wantW) spawnAt(c, 'worker', 10 + Math.random() * 22);
      else if (ns < wantS) spawnAt(c, Math.random() < .3 ? 'spitter' : Math.random() < .15 ? 'scout' : 'soldier', c.r * .9 + Math.random() * 8);
    }
    // tes ouvrières vont et viennent entre la fourmilière et la nourriture
    const p = COL.player, want = OW.mode === 'surface' && Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 90 ? Math.min(8, Math.ceil(p.workers / 3)) : 0;
    while (OW.amb.length > want) { const a = OW.amb.pop(); scene.remove(a.ant.root); }
    if (OW.amb.length < want) spawnAmb(p.x + rand(-4, 4), p.z + rand(-4, 4));
  }
  function spawnAt(c, type, r) {
    const a = Math.random() * 6.28, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    const e = EN.spawn(type, x, z, { col: c.id, body: c.species.body, gaster: c.species.gaster });
    if (type === 'worker') e.home.set(c.x + Math.cos(a) * rand(14, 34), e.pos.y, c.z + Math.sin(a) * rand(14, 34));
    return e;
  }
  function spawnAmb(x, z) {
    const ant = buildAnt({ body: '#151311', gaster: '#0b0a09', head: .9, legLen: 1.05 }); ant.root.scale.setScalar(.75);
    const a = { ant, pos: new T.Vector3(x, world.groundAt(x, z, 99), z), vel: new T.Vector3(), yaw: 0, goal: null, carry: null, t: 0 };
    ant.root.position.copy(a.pos); scene.add(ant.root); OW.amb.push(a);
  }
  function clearAmb() { for (const a of OW.amb) scene.remove(a.ant.root); OW.amb = []; if (OW.queen) { scene.remove(OW.queen.root); OW.queen = null; } }
  function ambUpdate(dt) {
    const home = OW.mode === 'nest' ? null : COL.player, foods = OW.surface ? OW.surface.food : [];
    for (const a of OW.amb) {
      a.t -= dt;
      if (!a.goal || a.t <= 0 || Math.hypot(a.goal[0] - a.pos.x, a.goal[1] - a.pos.z) < 1.2) {
        if (OW.mode === 'nest') { const rm = world.L.shapes.filter(s => !s.b); const r = rm[Math.floor(Math.random() * rm.length)]; a.goal = [r.x + rand(-3, 3), r.z + rand(-3, 3)]; a.carry = Math.random() < .4; }
        else if (a.carry || !foods.length) { a.goal = [home.x + rand(-2, 2), home.z + rand(-2, 2)]; a.carry = false; }
        else { const f = foods[Math.floor(Math.random() * foods.length)]; if (Math.hypot(f.x - home.x, f.z - home.z) < 70) { a.goal = [f.x, f.z]; a.carry = true; } else a.goal = [home.x + rand(-25, 25), home.z + rand(-25, 25)]; }
        a.t = 25;
      }
      const dx = a.goal[0] - a.pos.x, dz = a.goal[1] - a.pos.z, l = Math.hypot(dx, dz) || 1, sp = 3.4;
      a.vel.x += (dx / l * sp - a.vel.x) * Math.min(1, dt * 5); a.vel.z += (dz / l * sp - a.vel.z) * Math.min(1, dt * 5);
      const ox = a.pos.x, oz = a.pos.z;
      world.move(a.pos, a.vel.x * dt, a.vel.z * dt, .35, .45);
      if (!world.bodyFree(a.pos, a.yaw, .75)) { a.pos.x = ox; a.pos.z = oz; a.goal = null; }
      a.pos.y += (world.groundAt(a.pos.x, a.pos.z, a.pos.y + .4) - a.pos.y) * Math.min(1, dt * 12);
      a.yaw = angLerp(a.yaw, Math.atan2(a.vel.x, a.vel.z), dt * 6);
      a.ant.root.position.copy(a.pos); a.ant.root.rotation.y = a.yaw; a.ant.setOpen(a.carry ? .35 : .1);
      a.ant.anim(dt, Math.hypot(a.vel.x, a.vel.z) / .75, a.vel);
    }
  }

  // --- nourriture : ramasser (E), porter, déposer à la fourmilière
  OW.carryMesh = null;
  function pick(f) {
    f.taken = true; f.g.visible = false; P.carry = f; SFX.pick();
    const m = f.m.clone(); m.scale.multiplyScalar(f.type === 'beetle' ? .06 : f.type === 'seed' ? .1 : .14); m.position.set(0, -.25, -.62); m.rotation.set(0, 0, 0);
    OW.carryMesh = m; VM.root.add(m);
    HUD.notice(`Tu portes ${f.type === 'beetle' ? 'un scarabée (lourd)' : f.type === 'seed' ? 'une graine' : 'du miellat'} : rapporte-le à la fourmilière`, 2.4);
  }
  function drop(deposit) {
    const f = P.carry; if (!f) return;
    if (OW.carryMesh) { if (OW.carryMesh.parent) OW.carryMesh.parent.remove(OW.carryMesh); OW.carryMesh = null; }
    P.carry = null;
    if (deposit) {
      const c = COL.player; c.food = Math.min(COL.foodCap(c), c.food + f.value); COL.stats.deposits += f.value;
      f.ch.group.remove(f.g); OW.surface.food = OW.surface.food.filter(x => x !== f); f.ch.food = f.ch.food.filter(x => x !== f);
      SFX.pick(); HUD.notice(`+${f.value} nourriture pour la colonie`, 1.8);
    } else { f.x = P.pos.x; f.z = P.pos.z; f.g.position.set(f.x, world.floorAt(f.x, f.z) + .05, f.z); f.g.visible = true; f.taken = false; }
  }
  OW.dropCarry = () => drop(false);

  // --- interactions (touche E)
  let promptKind = null, promptData = null;
  function interactions() {
    promptKind = null; promptData = null; let txt = '';
    if (OW.mode === 'surface') {
      for (const c of COL.list) {
        const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
        if (c.player && P.carry && d < c.r * .7) { drop(true); continue; }
        if (d > 5) continue;
        if (c.player) { promptKind = 'enter'; promptData = c; txt = 'E : entrer dans ta fourmilière'; }
        else if (!c.alive) txt = `Ruines de la colonie des ${c.name}`;
        else if (c.status === 'guerre') { promptKind = 'assault'; promptData = c; txt = `E : lancer l'assaut contre les ${c.name}${ALLY.list.length ? ` (avec ${ALLY.list.length} soldates)` : ' (seule !)'}`; }
        else txt = `Fourmilière des ${c.name} (${c.status === 'alliee' ? 'alliée' : 'neutre'}) · Tab, Diplomatie`;
      }
      if (!promptKind && !P.carry) {
        let best = null, bd = 1.9;
        for (const f of OW.surface.food) { if (f.taken) continue; const d = Math.hypot(f.x - P.pos.x, f.z - P.pos.z); if (d < bd && Math.abs(world.floorAt(f.x, f.z) - P.pos.y) < 1.5) { bd = d; best = f; } }
        if (best) { promptKind = 'pick'; promptData = best; txt = `E : prendre ${best.type === 'beetle' ? 'le scarabée (+15)' : best.type === 'seed' ? 'la graine (+3)' : 'le miellat (+6)'}`; }
      }
      if (!promptKind && P.carry) txt = '';
    } else if (OW.mode === 'nest') {
      const c = OW.nestCol;
      if (Math.hypot(P.pos.x - 0, P.pos.z + 46) < 4.5) { promptKind = 'exit'; txt = c.player ? 'E : sortir à la surface' : 'E : battre en retraite'; }
      else if (c.player && OW.queen && Math.hypot(P.pos.x, P.pos.z - 30) < 9) { promptKind = 'queen'; txt = 'E : parler à la Reine (nourrir, pondre)'; }
    }
    HUD.prompt(txt);
  }
  OW.interact = () => {
    if (G.mode !== 'open' || G.state !== 'play') return;
    if (promptKind === 'pick') pick(promptData);
    else if (promptKind === 'enter') OW.enterNest(promptData);
    else if (promptKind === 'assault') OW.enterNest(promptData);
    else if (promptKind === 'exit') OW.exitNest();
    else if (promptKind === 'queen') UI.open('reine');
    else if (P.carry) drop(false);
  };

  // --- surface ⇄ souterrain
  function stashSurface() {
    OW.stash = { en: EN.list, pk: PK.list };
    for (const e of EN.list) scene.remove(e.ant.root); for (const p of PK.list) scene.remove(p.g);
    EN.list = []; PK.list = []; FX.clear(); clearAmb();
    OW.surface.show(false);
  }
  OW.enterNest = c => {
    if (P.carry) drop(false);
    if (!c.player && c.status !== 'guerre') return;
    stashSurface();
    OW.nestCol = c; OW.mode = 'nest';
    OW.nestWorld = new World(scene); OW.nestWorld.build(COL.nestLevel(c)); world = OW.nestWorld;
    setEnv(true);
    P.spawn(world.L);
    for (const a of ALLY.list) { a.pos.set(P.pos.x + rand(-2, 2), 0, P.pos.z + rand(1, 3)); a.pos.y = world.groundAt(a.pos.x, a.pos.z, 99); a.ant.resetFeet(); }
    if (c.player) {
      const q = buildAnt({ body: '#141210', gaster: '#0b0a09', head: 1.1, gasterScale: 2 }); q.root.scale.setScalar(4.2); q.root.position.set(0, world.floorAt(0, 32), 32); q.root.rotation.y = Math.PI; scene.add(q.root); OW.queen = q;
      for (let i = 0; i < Math.min(8, Math.ceil(c.workers / 3)); i++) spawnAmb(rand(-4, 4), -6 + rand(-4, 4));
      HUD.level('Ta fourmilière', `${c.chambers.length} chambres`);
    } else {
      EN.spawn('queen', 0, 32, { col: c.id, body: c.species.body, gaster: c.species.gaster }).max *= c.queenMax / 1300;
      const q = EN.list[EN.list.length - 1]; q.hp = q.max = Math.round(c.queenHp);
      const rooms = world.L.shapes.filter(s => !s.b && s.z > -40);
      for (let i = 0; i < Math.min(14, c.soldiers); i++) { const r = rooms[i % rooms.length]; EN.spawn(Math.random() < .25 ? 'spitter' : 'soldier', r.x + rand(-3, 3), r.z + rand(-3, 3), { col: c.id, body: c.species.body, gaster: c.species.gaster }); }
      for (let i = 0; i < Math.min(5, Math.ceil(c.workers / 5)); i++) EN.spawn('worker', rand(-4, 4), -6 + rand(-4, 4), { col: c.id, body: c.species.body, gaster: c.species.gaster });
      HUD.level('Assaut', `Fourmilière des ${c.name}`); HUD.boss('Reine des ' + c.name, 1);
      HUD.say(WHO.nyx, `Nous sommes dans leur fourmilière. Leur reine est au fond : abats-la et la colonie des ${c.name} tombera.`);
    }
    SFX.ambient('cave'); OW.save();
  };
  OW.exitNest = () => {
    const c = OW.nestCol;
    if (!c.player) {
      const q = EN.list.find(e => e.d.queen);
      if (q && !q.dead) c.queenHp = Math.max(1, q.hp);
      c.soldiers = Math.max(0, Math.min(c.soldiers, EN.list.filter(e => !e.dead && e.type !== 'worker' && !e.d.queen).length + Math.max(0, c.soldiers - 14)));
    }
    EN.clear(); PK.clear(); FX.clear(); clearAmb(); HUD.boss(null, null);
    OW.nestWorld.clear(); OW.nestWorld = null; world = OW.surface; OW.surface.show(true);
    EN.list = OW.stash.en.filter(e => !e.dead && (c.alive || e.col !== c.id)); for (const e of EN.list) scene.add(e.ant.root);
    PK.list = OW.stash.pk; for (const p of PK.list) scene.add(p.g);
    OW.mode = 'surface'; setEnv(false);
    P.spawn({ start: { x: c.x, z: c.z + 3, yaw: Math.PI } });
    for (const a of ALLY.list) { a.pos.set(P.pos.x + rand(-2, 2), 0, P.pos.z + rand(2, 4)); a.pos.y = world.groundAt(a.pos.x, a.pos.z, 99); a.ant.resetFeet(); }
    HUD.level('Monde ouvert', 'Surface'); SFX.ambient('surface'); OW.save();
  };
  OW.rebuildNest = () => {
    if (OW.mode !== 'nest') return; const p = P.pos.clone(), c = OW.nestCol;
    clearAmb(); OW.nestWorld.clear(); OW.nestWorld = new World(scene); OW.nestWorld.build(COL.nestLevel(c)); world = OW.nestWorld; setEnv(true);
    P.pos.copy(p); P.pos.y = world.groundAt(p.x, p.z, 99); P.up.set(0, 1, 0); P.onGround = true;
    const q = buildAnt({ body: '#141210', gaster: '#0b0a09', head: 1.1, gasterScale: 2 }); q.root.scale.setScalar(4.2); q.root.position.set(0, world.floorAt(0, 32), 32); q.root.rotation.y = Math.PI; scene.add(q.root); OW.queen = q;
    for (let i = 0; i < Math.min(8, Math.ceil(c.workers / 3)); i++) spawnAmb(rand(-4, 4), -6 + rand(-4, 4));
  };
  // un raid arrive : si la joueuse est sur place, bataille réelle
  OW.defendHere = a => {
    if (G.mode !== 'open' || G.state === 'title') return false;
    const p = COL.player, n = Math.min(14, a.n);
    if (OW.mode === 'surface' && Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 85) {
      const ang = Math.atan2(a.from.z - p.z, a.from.x - p.x);
      for (let i = 0; i < n; i++) { const r = 38 + rand(0, 8), b = ang + rand(-.4, .4), e = EN.spawn(Math.random() < .25 ? 'spitter' : 'soldier', p.x + Math.cos(b) * r, p.z + Math.sin(b) * r, { col: a.from.id, body: a.from.species.body, gaster: a.from.species.gaster, raid: true }); e.home.set(p.x, e.pos.y, p.z); EN.alert(e); }
      HUD.say(WHO.nyx, `Les ${a.from.name} attaquent la fourmilière ! Défends-la !`); return true;
    }
    if (OW.mode === 'nest' && OW.nestCol === p) {
      for (let i = 0; i < n; i++) { const e = EN.spawn('soldier', rand(-4, 4), -44 + rand(-2, 2), { col: a.from.id, body: a.from.species.body, gaster: a.from.species.gaster, raid: true }); EN.alert(e); }
      HUD.say(WHO.nyx, `Les ${a.from.name} sont entrées dans la fourmilière !`); return true;
    }
    return false;
  };

  // --- propositions des autres colonies (accepter / refuser)
  OW.propose = (c, kind, extra) => {
    if (OW.props.length >= 3 || OW.props.some(p => p.c === c)) return;
    OW.props.push({ c, kind, extra, t: 60 }); drawProps(); SFX.chitter(0);
  };
  function drawProps() {
    const box = $('props'); box.innerHTML = '';
    for (const p of OW.props) {
      const d = document.createElement('div'); d.className = 'prop';
      const txt = p.kind === 'alliance' ? `Les ${p.c.name} proposent une alliance.` : p.kind === 'treve' ? `Les ${p.c.name} demandent une trêve.` : `Les ${p.c.name}, tes alliées, demandent de l'aide contre les ${p.extra.name}.`;
      const t = document.createElement('p'); t.textContent = txt; d.append(t);
      const yes = document.createElement('button'); yes.textContent = 'Accepter'; const no = document.createElement('button'); no.textContent = 'Refuser';
      yes.onclick = () => { if (p.kind === 'alliance') { p.c.status = 'alliee'; p.c.rel = Math.max(p.c.rel, 50); COL.log(`Alliance signée avec les ${p.c.name} !`, 'good'); } else if (p.kind === 'treve') { p.c.status = 'neutre'; p.c.rel = Math.max(p.c.rel, -20); COL.log(`Trêve signée avec les ${p.c.name}`, 'good'); } else { COL.declare(p.extra); p.c.rel += 15; } OW.props.splice(OW.props.indexOf(p), 1); drawProps(); };
      no.onclick = () => { p.c.rel -= p.kind === 'aide' ? 15 : 5; OW.props.splice(OW.props.indexOf(p), 1); drawProps(); };
      d.append(yes, no); box.append(d);
    }
    box.hidden = !OW.props.length;
  }

  // --- minicarte
  const mc = $('mini').getContext ? $('mini') : null;
  function minimap() {
    const cv = $('mini'), g = cv.getContext('2d'), W = cv.width, s = W / 220;
    g.clearRect(0, 0, W, W); g.fillStyle = 'rgba(11,9,7,.72)'; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 7); g.clip();
    const X = x => W / 2 + (x - P.pos.x) * s, Z = z => W / 2 + (z - P.pos.z) * s;
    if (OW.mode === 'surface') {
      g.fillStyle = '#f2a93b'; for (const f of OW.surface.food) if (!f.taken) g.fillRect(X(f.x) - 1.5, Z(f.z) - 1.5, 3, 3);
      for (const c of COL.list) { if (!c.known && !c.player) continue; g.fillStyle = c.player ? '#a6ff3d' : !c.alive ? '#555' : c.status === 'guerre' ? '#ff4a2a' : c.status === 'alliee' ? '#6ab8ff' : c.species.color; g.beginPath(); g.arc(X(c.x), Z(c.z), Math.max(4, c.r * s * .6), 0, 7); g.fill(); }
      for (const a of COL.armies) { if (!a.own && !a.to.player) continue; g.fillStyle = a.own ? '#a6ff3d' : '#ff4a2a'; g.beginPath(); g.arc(X(a.x), Z(a.z), 3, 0, 7); g.fill(); }
      g.fillStyle = '#ff4a2a'; for (const e of EN.list) if (!e.dead && !e.neutral) g.fillRect(X(e.pos.x) - 1, Z(e.pos.z) - 1, 2, 2);
      g.fillStyle = '#d8cdb8'; for (const a of ALLY.list) g.fillRect(X(a.pos.x) - 1, Z(a.pos.z) - 1, 2, 2);
    }
    g.restore();
    g.save(); g.translate(W / 2, W / 2); g.rotate(-P.yaw + Math.PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.restore();
  }
  OW.bigMap = () => {
    const cv = $('mapCv'), g = cv.getContext('2d'), W = cv.width = Math.min(innerWidth - 40, 900), H = cv.height = Math.min(innerHeight - 140, 640);
    const known = COL.list.filter(c => c.known || c.player);
    let minx = P.pos.x, maxx = P.pos.x, minz = P.pos.z, maxz = P.pos.z;
    for (const c of known) { minx = Math.min(minx, c.x); maxx = Math.max(maxx, c.x); minz = Math.min(minz, c.z); maxz = Math.max(maxz, c.z); }
    const pad = 60, s = Math.min(W / (maxx - minx + pad * 2), H / (maxz - minz + pad * 2)), X = x => (x - minx + pad) * s, Z = z => (z - minz + pad) * s;
    g.fillStyle = '#16120d'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.06)'; for (let x = Math.floor(minx / REGION) * REGION; x < maxx + pad; x += REGION) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (const a of COL.armies) { if (!(a.from.known || a.from.player) || !(a.to.known || a.to.player)) continue; g.strokeStyle = a.own ? '#a6ff3d' : a.to.player ? '#ff4a2a' : 'rgba(255,200,120,.5)'; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(X(a.x), Z(a.z)); g.lineTo(X(a.to.x), Z(a.to.z)); g.stroke(); g.setLineDash([]); }
    g.font = '600 13px Chakra Petch, sans-serif'; g.textAlign = 'center';
    for (const c of known) {
      g.fillStyle = c.player ? '#a6ff3d' : !c.alive ? '#555' : c.status === 'guerre' ? '#ff4a2a' : c.status === 'alliee' ? '#6ab8ff' : c.species.color;
      g.beginPath(); g.arc(X(c.x), Z(c.z), 8, 0, 7); g.fill();
      g.fillStyle = '#f3ead8'; g.fillText(c.player ? 'Ta colonie' : c.name + (c.alive ? '' : ' (vaincue)'), X(c.x), Z(c.z) - 13);
    }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(P.pos.x), Z(P.pos.z), 4, 0, 7); g.fill();
  };

  // --- boucle du monde ouvert
  OW.update = dt => {
    COL.ensure(P.pos.x, P.pos.z); COL.tick(dt); COL.questTick();
    if (OW.mode === 'surface') OW.surface.stream(false);
    OW.unitsT -= dt; if (OW.unitsT <= 0) { OW.unitsT = 1; if (OW.mode === 'surface') units(); else if (OW.mode === 'nest' && OW.nestCol.player) { /* calme */ } }
    ambUpdate(dt);
    if (OW.queen) OW.queen.anim(dt, 0);
    interactions();
    // victoire d'un assaut : la reine ennemie est morte
    if (OW.mode === 'nest' && !OW.nestCol.player && OW.nestCol.alive) { const q = EN.list.find(e => e.d.queen); if (q && q.dead) { COL.destroy(OW.nestCol); HUD.boss(null, null); HUD.say(WHO.reine, `La reine des ${OW.nestCol.name} est morte. Leur colonie est à nous.`); } else if (q) HUD.boss('Reine des ' + OW.nestCol.name, Math.max(0, q.hp / q.max)); }
    for (const p of OW.props) { p.t -= dt; if (p.t <= 0) { OW.props.splice(OW.props.indexOf(p), 1); drawProps(); break; } }
    OW.mapT -= dt; if (OW.mapT <= 0) { OW.mapT = .15; minimap(); colbar(); }
    OW.saveT -= dt; if (OW.saveT <= 0) { OW.saveT = 20; OW.save(); }
  };
  function colbar() {
    const c = COL.player;
    $('colbar').innerHTML = `<span><b>${Math.floor(c.food)}</b>/${COL.foodCap(c)} nourriture</span><span><b>${c.workers}</b> ouvrières</span><span><b>${c.soldiers}</b> soldates</span><span><b>${c.scouts}</b> éclaireuses</span>${c.eggs.length ? `<span><b>${c.eggs.length}</b> œufs</span>` : ''}${COL.armies.some(a => a.to.player) ? '<span class="warn">Raid en approche</span>' : ''}`;
  }
})();
