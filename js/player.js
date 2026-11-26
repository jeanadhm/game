'use strict';
// Colonie Noire · la joueuse (Sergent Obsidienne) : déplacements, armes, vue à la première personne, objets à ramasser
const WEAPONS = [null,
  { name: 'Mandibules', desc: 'Morsure puissante au corps à corps' },
  { name: 'Acide formique', desc: 'Jet rapide, la tête prend double' },
  { name: 'Graine explosive', desc: 'Lancer en cloche, dégâts de zone' },
  { name: 'Dard', desc: 'Maintiens pour charger, relâche pour tirer' },
];
const P = {
  pos: new T.Vector3(), vel: new T.Vector3(), up: new T.Vector3(0, 1, 0), fwd: new T.Vector3(0, 0, -1), camQ: new T.Quaternion(), yaw: 0, pitch: 0, hp: 100, armor: 50, onGround: true,
  weapon: 2, acid: 100, seeds: 3, darts: 4, charge: 0, maxHp: 100, shieldT: 0, shieldCd: 0, shieldHp: 0, landT: 0, cd: 0, biteT: 0, bobT: 0, stepS: 0, dead: false, regen: 0, switchT: 0, recoil: 0, sens: 1, glowT: 0,
};
const VM = { scene: new T.Scene(), cam: new T.PerspectiveCamera(62, 1, .01, 20), root: new T.Group(), mand: [], antn: [] };
(() => {
  const V = new T.Vector3(), D = new T.Vector3(), E = new T.Euler(0, 0, 0, 'YXZ');

  P.initVM = () => {
    VM.scene.add(new T.HemisphereLight('#ffffff', '#3a2a1a', .8));
    const dl = new T.DirectionalLight('#fff0dd', 1.3); dl.position.set(.4, 1, .5); VM.scene.add(dl);
    VM.scene.add(VM.root);
    const mat = new T.MeshPhysicalMaterial({ color: '#1b120b', roughness: .38, metalness: 0, clearcoat: .7, clearcoatRoughness: .3, envMapIntensity: .35 });
    for (const s of [-1, 1]) {
      // mandibles courbes, vues depuis la tête
      const md = new T.Vector3(-s * .55, .08, -1).normalize();
      const pv = new T.Group(); pv.position.set(s * .15, -.3, -.5); VM.root.add(pv);
      const m1 = new T.Mesh(limbGeo(.26, .034), mat); aim(m1, md); pv.add(m1);
      const tip = new T.Group(); tip.position.copy(md).multiplyScalar(.24); pv.add(tip);
      const m2 = new T.Mesh(limbGeo(.12, .026), mat); aim(m2, new T.Vector3(-s, .02, -.45)); tip.add(m2);
      for (let k = 0; k < 3; k++) { const t = new T.Mesh(limbGeo(.035, .012), mat); t.position.copy(md).multiplyScalar(.08 + k * .06); aim(t, new T.Vector3(-s, -.15, -.2)); pv.add(t); }
      VM.mand.push(pv);
      // antennes : seul le fouet est visible, il part du haut de l'écran
      const el = new T.Group(); el.position.set(s * .34, .3, -.45); VM.root.add(el);
      const a2 = new T.Mesh(limbGeo(.95, .007), mat); aim(a2, new T.Vector3(-s * .14, -.13, -1)); el.add(a2);
      VM.antn.push(el);
    }
    VM.glow = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#a6ff3d', transparent: true, opacity: .0, depthWrite: false, blending: T.AdditiveBlending }));
    VM.glow.position.set(0, -.24, -.6); VM.glow.scale.set(.22, .22, 1); VM.root.add(VM.glow);
    // bouclier de phéromones : coque hexagonale translucide devant la tête
    const hex = canvasTex(256, 256, (g, w) => {
      g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(160,255,220,.95)'; g.lineWidth = 3;
      const r = 22, hh = r * Math.sqrt(3);
      for (let y = -1; y < 8; y++) for (let x = -1; x < 8; x++) { const cx = x * r * 3 + (y % 2 ? r * 1.5 : 0), cy = y * hh / 2; g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 6 * Math.PI * 2; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke(); }
    }, true);
    hex.encoding = T.LinearEncoding; hex.repeat.set(3, 2);
    VM.shield = new T.Mesh(new T.SphereGeometry(.75, 40, 20, Math.PI * .2, Math.PI * .6, Math.PI * .28, Math.PI * .44),
      new T.MeshBasicMaterial({ map: hex, color: '#7dffd0', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    VM.shield.rotation.y = Math.PI; VM.shield.position.set(0, -.05, .1); VM.shield.visible = false; VM.root.add(VM.shield);
    VM.dart = new T.Mesh(new T.ConeGeometry(.012, .3, 8), new T.MeshStandardMaterial({ color: '#ffcf6a', emissive: '#ff9a1a', emissiveIntensity: 1.2, roughness: .3 }));
    VM.dart.rotation.x = -Math.PI / 2; VM.dart.position.set(0, -.22, -.62); VM.root.add(VM.dart);
    VM.seed = new T.Mesh(ANT.sph, new T.MeshStandardMaterial({ color: '#7a4f24', roughness: .5 })); VM.seed.scale.set(.08, .06, .06); VM.seed.position.set(0, -.235, -.6); VM.root.add(VM.seed);
  };

  // remplace les mandibles de la vue par celles modélisées dans Blender (models/vm.glb)
  P.useVMModel = () => {
    const mat = new T.MeshPhysicalMaterial({ color: '#1b120b', roughness: .35, clearcoat: .8, clearcoatRoughness: .25, envMapIntensity: .4 });
    VM.mand.forEach((pv, k) => {
      const src = ANT.vm.scene.getObjectByName(k === 0 ? 'vm_mand_R' : 'vm_mand_L'); if (!src) return;
      pv.clear(); const m = src.clone(); m.material = mat; m.position.set(0, 0, 0); m.rotation.set(-.28, Math.PI, 0); m.scale.setScalar(.85); pv.add(m);
    });
    VM.mBase = .12;
  };
  P.spawn = L => {
    const s = L.start; P.pos.set(s.x, world.groundAt(s.x, s.z, 99), s.z); P.vel.set(0, 0, 0); P.yaw = s.yaw; P.pitch = 0;
    P.up.set(0, 1, 0); P.fwd.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)); P.onGround = true;
    P.camQ.setFromEuler(new T.Euler(0, s.yaw, 0, 'YXZ'));
    P.dead = false; P.cd = 0; P.biteT = 0;
  };
  P.reset = () => { P.wing = 100; P.flying = false; P.shieldT = 0; P.shieldCd = 0; P.maxHp = 100 + 10 * UP.lv.chitine; P.hp = P.maxHp; P.armor = 50 + 15 * UP.lv.chitine; P.acid = 100; P.seeds = 3; P.darts = 4; P.charge = 0; P.weapon = 2; };

  P.damage = (amt, from) => {
    if (P.dead || G.state !== 'play') return;
    if (P.shieldT > 0) { P.block(amt, from); return; }
    amt *= diff().dmg;
    const a = Math.min(P.armor, amt * .6); P.armor -= a; P.hp -= amt - a;
    SFX.hurt(); FX.shake = Math.max(FX.shake, .35);
    let ang = null;
    if (from) { const t = Math.atan2(from.x - P.pos.x, from.z - P.pos.z); ang = t - (P.yaw + Math.PI); }
    HUD.hurt(ang, amt);
    if (P.hp <= 0) { P.hp = 0; P.dead = true; G.die(); }
  };

  P.block = (amt, from) => {
    P.shieldHp -= amt; SFX.block(); P.shieldHit = 1; FX.shake = Math.max(FX.shake, .15);
    if (P.shieldHp <= 0) { P.shieldT = 0; P.shieldCd = 10; SFX.shield(false); HUD.notice('Bouclier brisé', 1.2); }
  };
  P.select = w => { if (w === P.weapon || w < 1 || w > 4) return; P.weapon = w; P.switchT = .25; P.charge = 0; P.cd = Math.max(P.cd, .2); };

  P.update = dt => {
    // visée
    const yawD = -IN.dx * .0022 * P.sens; P.pitch -= IN.dy * .0022 * P.sens; IN.dx = IN.dy = 0;
    if (yawD) P.fwd.applyAxisAngle(P.up, yawD);
    P.pitch = clamp(P.pitch, -1.45, 1.45);
    if (IN.wsel) { P.select(IN.wsel); IN.wsel = 0; }
    if (IN.wheel) { P.select(((P.weapon - 1 + IN.wheel % 4 + 4) % 4) + 1); IN.wheel = 0; }
    // déplacement
    let f = (IN.k.f ? 1 : 0) - (IN.k.b ? 1 : 0) + IN.my, st = (IN.k.r ? 1 : 0) - (IN.k.l ? 1 : 0) + IN.mx;
    const ml = Math.hypot(f, st); if (ml > 1) { f /= ml; st /= ml; }
    // bouclier temporaire (clic droit) : 4 s ou jusqu'à rupture, puis recharge
    if (IN.shieldPress) {
      IN.shieldPress = false;
      if (P.shieldT <= 0 && P.shieldCd <= 0) { P.shieldT = 4; P.shieldHp = 90 * (1 + .15 * UP.lv.chitine); SFX.shield(true); P.charge = 0; }
      else if (P.shieldT <= 0) HUD.notice(`Bouclier en recharge : ${Math.ceil(P.shieldCd)} s`, 1);
    }
    if (P.shieldT > 0) { P.shieldT -= dt; if (P.shieldT <= 0) { P.shieldCd = 9; SFX.shield(false); } } else P.shieldCd = Math.max(0, P.shieldCd - dt);
    const run = (IN.k.run || IN.mrun) && f > .3, spd = (run ? 7.8 : 4.6) * (1 + .07 * UP.lv.pattes) * (P.charge > 0 ? .6 : 1) * (P.shieldT > 0 ? .75 : 1) * (P.carry ? (P.carry.heavy ? .55 : .8) : 1);
    const wasGround = P.onGround, vy0 = P.vel.dot(WUP);
    walk(dt, f, st, spd);
    if (P.onGround && !wasGround && vy0 < -4) { P.landT = Math.min(.14, -vy0 * .013); SFX.land(); }
    // cap de la boussole et des alliées : direction du regard projetée à l'horizontale
    if (Math.abs(P.fwd.y) < .97) P.yaw = Math.atan2(-P.fwd.x, -P.fwd.z);
    // pas : la tête plonge à chaque appui et se balance d'un côté à l'autre
    const hs = P.onGround ? P.vel.length() : 0;
    if (P.flying) VM.root.position.y = Math.sin(G.time * 3) * .01;
    if (P.onGround && hs > .3) { P.bobT += hs * dt / .5 * Math.PI; const s = Math.floor(P.bobT / Math.PI); if (s !== P.stepS) { P.stepS = s; SFX.step(); if (run) SFX.tap(1.2); } }
    else P.bobT = Math.round(P.bobT / Math.PI) * Math.PI * .1 + P.bobT * .9;
    const bob = P.onGround ? Math.min(1, hs / 5) : 0;
    P.landT = Math.max(0, P.landT - dt * .9);
    const dip = -Math.abs(Math.sin(P.bobT)) * .045 * bob - P.landT, sway = Math.sin(P.bobT * .5) * .025 * bob;
    RT.crossVectors(P.fwd, P.up).normalize();
    { const hu = world.raycast(O.copy(P.pos).addScaledVector(P.up, .1), RD.copy(P.up), .8); P.eye = lerp(P.eye || .66, hu ? clamp(hu.d - .1, .2, .66) : .66, Math.min(1, dt * 10)); }
    P.camLag = Math.max(0, (P.camLag || 0) - dt * 3);
    const camT = O.copy(P.pos).addScaledVector(P.up, P.eye + dip - P.camLag).addScaledVector(RT, sway);
    if (!P.camP || P.camP.distanceToSquared(camT) > 4) P.camP = camT.clone(); else P.camP.lerp(camT, Math.min(1, dt * 20));
    cam.position.copy(P.camP);
    const fov = run && hs > 5 ? 82 : 74; if (Math.abs(cam.fov - fov) > .05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 6); cam.updateProjectionMatrix(); FX.setScale(renderer.domElement.height, cam.fov); }
    // orientation de la caméra : repère de la surface (droite, normale, avant), lissé, puis tangage
    const kc = P.up.y > .6 ? 0 : G.climb === 'free' ? 1 : P.up.y >= 0 ? .5 : .5 + .5 * Math.min(1, -P.up.y * 1.6);
    const cu = RD2.copy(WUP).lerp(P.up, kc).normalize(), cf = O.copy(P.fwd).addScaledVector(cu, -P.fwd.dot(cu)).normalize(), cr = RD.crossVectors(cf, cu).normalize();
    Mb.makeBasis(cr, cu, cf.negate()); Qb.setFromRotationMatrix(Mb);
    P.camQ.slerp(Qb, Math.min(1, dt * 12));
    E.set(P.pitch + (Math.random() - .5) * FX.shake * .03 + P.landT * .3, (Math.random() - .5) * FX.shake * .03, Math.sin(P.bobT * .5) * .01 * bob);
    cam.quaternion.copy(P.camQ).multiply(Qc.setFromEuler(E));
    // armes
    P.cd -= dt; P.regen -= dt; P.switchT = Math.max(0, P.switchT - dt);
    if (P.regen <= 0) P.acid = Math.min(100, P.acid + 16 * (1 + .25 * UP.lv.acide) * dt);
    cam.getWorldDirection(D);
    if (P.switchT <= 0 && P.shieldT <= 0) {
      if (P.weapon === 1 && IN.fire && P.cd <= 0) bite();
      else if (P.weapon === 2 && IN.fire && P.cd <= 0) {
        if (P.acid >= 1.5) {
          P.cd = .11; P.acid -= 1.6; P.regen = .9; P.recoil = 1; P.glowT = 1; G.stats.shots++;
          V.copy(cam.position).addScaledVector(D, .45).y -= .14;
          const sp = .018; D.x += rand(-sp, sp); D.y += rand(-sp, sp); D.z += rand(-sp, sp); D.normalize();
          FX.fire('acid', V, D.clone().multiplyScalar(44), 'p', 12 * (1 + .2 * UP.lv.acide)); SFX.acid();
          EN.noise(P.pos, 14);
        } else if (IN.firePress) HUD.notice('Glande à acide vide : attends qu\'elle se recharge', 1.4);
      } else if (P.weapon === 3 && IN.firePress && P.cd <= 0) {
        if (P.seeds > 0) {
          P.cd = .8; P.seeds--; P.recoil = 1.5;
          V.copy(cam.position).addScaledVector(D, .5).y -= .1;
          FX.fire('seed', V, D.clone().multiplyScalar(17).add(new T.Vector3(0, 4, 0)).add(new T.Vector3(P.vel.x * .5, 0, P.vel.z * .5)), 'p', 0); SFX.throwIt();
        } else HUD.notice('Plus de graines : fouille les cadavres et les réserves', 1.4);
      } else if (P.weapon === 4) {
        if (IN.fire && P.cd <= 0 && P.darts > 0) P.charge = Math.min(1, P.charge + dt / .9);
        else if (P.charge > 0) { if (P.charge > .1) dart(); P.charge = 0; }
        if (IN.firePress && P.darts <= 0) HUD.notice('Plus de dards : ramasse-en sur le terrain', 1.4);
      }
    }
    IN.firePress = false;
    animVM(dt, bob, hs);
  };

  // --- marche sur toutes les surfaces : sol, pentes, murs, plafonds, cailloux, feuilles, champignons
  const WUP = new T.Vector3(0, 1, 0), RD = new T.Vector3(), RD2 = new T.Vector3(), O = new T.Vector3(), RT = new T.Vector3(), Mb = new T.Matrix4(), Qa = new T.Quaternion(), Qb = new T.Quaternion(), Qc = new T.Quaternion();
  // en mode assisté, les surfaces raides (murs, plafonds) ne se grimpent qu'en maintenant C
  const canClimb = n => n.y > .42 || G.climb === 'free' || IN.k.climb;
  // sur le sol, les pentes et les objets bosselés, la fourmi reste droite ; seuls les vrais murs la font pivoter
  const upFor = n => n.y > .42 ? WUP : n;
  function setUp(n, k) {
    const nu = O.copy(P.up).lerp(n, k).normalize();
    if (nu.lengthSq() < .5) return;
    Qa.setFromUnitVectors(P.up, nu); P.up.copy(nu); P.fwd.applyQuaternion(Qa);
    P.fwd.addScaledVector(P.up, -P.fwd.dot(P.up)).normalize();
  }
  function walk(dt, f, st, spd) {
    RT.crossVectors(P.fwd, P.up).normalize();
    if (IN.fly) { IN.fly = false; if (P.flying) P.flying = false; else if (P.wing > 10) { P.flying = true; P.onGround = false; P.vel.y = Math.max(P.vel.y, 3); setUp(WUP, 1); SFX.wings(); } else HUD.notice('Ailes fatiguées : repose-toi au sol', 1.6); }
    if (P.flying) {
      P.wing = Math.max(0, P.wing - dt * 9); if (P.wing <= 0) { P.flying = false; HUD.notice('Plus d\'énergie : tu planes jusqu\'au sol', 2); }
      setUp(WUP, Math.min(1, dt * 4)); RT.crossVectors(P.fwd, P.up).normalize();
      const look = RD2.copy(P.fwd).applyAxisAngle(RT, P.pitch), v = (IN.k.jump ? 1 : 0) - (IN.k.climb ? 1 : 0);
      const want = O.copy(look).multiplyScalar(f * 9).addScaledVector(RT, st * 7); want.y += v * 6;
      P.vel.lerp(want, Math.min(1, dt * 3)); P.vel.y += Math.sin(G.time * 18) * .02;
      const d = P.vel.length() * dt;
      if (d > 1e-6) {
        RD.copy(P.vel).normalize();
        const h = world.raycast(O.copy(P.pos).addScaledVector(P.up, .3), RD, d + .35);
        if (h) { if (h.n.y > .5 && P.vel.y < 1) { P.pos.copy(h.p); P.flying = false; P.onGround = true; setUp(WUP, 1); P.vel.multiplyScalar(.3); } else { const vn = P.vel.dot(h.n); P.vel.addScaledVector(h.n, -vn * 1.2); } }
        else P.pos.addScaledVector(P.vel, dt);
      }
      IN.jump = false;
      const lim = world.half - 3; P.pos.x = clamp(P.pos.x, -lim, lim); P.pos.z = clamp(P.pos.z, -lim, lim);
      if (world.cave) P.pos.y = Math.min(P.pos.y, world.ceilAt(P.pos.x, P.pos.z) - .8);
      if (P.pos.y < world.floorAt(P.pos.x, P.pos.z)) P.pos.y = world.floorAt(P.pos.x, P.pos.z);
      return;
    }
    if (P.onGround) P.wing = Math.min(100, (P.wing ?? 100) + dt * 14);
    if (P.onGround) {
      const want = RD2.copy(P.fwd).multiplyScalar(f).addScaledVector(RT, st).multiplyScalar(spd);
      P.vel.lerp(want, Math.min(1, dt * 11));
      if (IN.jump || P.vel.dot(P.up) > 2.5) {
        if (IN.jump) { P.vel.addScaledVector(P.up, 6.9 * (1 + .05 * UP.lv.pattes)); SFX.step(); }
        IN.jump = false; P.onGround = false; return;
      }
      P.vel.addScaledVector(P.up, -P.vel.dot(P.up));
      const step = P.vel.length() * dt;
      let climbed = false;
      if (step > 1e-5) {
        RD.copy(P.vel).normalize();
        // paroi devant (mur, caillou, bord de feuille) : on grimpe dessus au lieu de la traverser
        const h = world.raycast(O.copy(P.pos).addScaledVector(P.up, .22), RD, step + .36);
        if (h && h.n.dot(P.up) < .8) {
          if (canClimb(h.n)) { P.pos.copy(h.p); setUp(upFor(h.n), 1); climbed = true; }
          else {
            // paroi trop raide sans grimper : on glisse le long, sans la traverser
            // bordure de feuille, caillou bosselé, brindille : on l'enjambe si le dessus est à portée
            const q = RD2.copy(P.pos).addScaledVector(RD, .5), top = world.groundAt(q.x, q.z, P.pos.y + 1.9);
            if (top > P.pos.y + .02 && top - P.pos.y < 1.9 && !world.solidPt(q.x, top + .6, q.z)) { P.pos.set(q.x, top, q.z); P.camLag = Math.min(.6, top - P.pos.y + .3); climbed = true; }
            else { const vn = P.vel.dot(h.n); if (vn < 0) P.vel.addScaledVector(h.n, -vn); }
            if (!P.climbHint) { P.climbHint = true; HUD.notice(IN.touch ? 'Maintiens « Grimper » pour escalader les murs' : 'Maintiens C pour grimper aux murs et au plafond', 2.6); }
          }
        }
        else P.pos.addScaledVector(RD, step);
      }
      // rester collée à la surface sous les pattes
      let g = world.raycast(O.copy(P.pos).addScaledVector(P.up, .45), RD2.copy(P.up).negate(), 1.05);
      if (g) { P.pos.copy(g.p); setUp(upFor(g.n), climbed ? 1 : Math.min(1, dt * 8)); }
      else {
        // arête : on bascule de l'autre côté (comme une fourmi qui passe le bord d'une feuille)
        RD.copy(P.vel.lengthSq() > 1e-6 ? P.vel : P.fwd).normalize().negate();
        g = world.raycast(O.copy(P.pos).addScaledVector(P.up, -.32), RD, .9);
        if (g && g.n.dot(P.up) < .95 && canClimb(g.n)) { P.pos.copy(g.p); setUp(upFor(g.n), 1); }
        else P.onGround = false;
      }
      // sur un mur sans maintenir l'escalade : on se détache
      if (P.onGround && !canClimb(P.up)) { P.onGround = false; P.vel.addScaledVector(P.up, 1.5); }
      if (P.up.y > .6) world.pushOut(P.pos, .38);
    } else {
      // en l'air : gravité du monde, la tête se redresse peu à peu
      IN.jump = false;
      P.vel.y -= 16 * dt;
      const d = P.vel.length() * dt;
      RD.copy(P.vel).normalize();
      const h = d > 1e-6 ? world.raycast(O.copy(P.pos).addScaledVector(P.up, .3), RD, d + .32) : null;
      if (h && canClimb(h.n)) { P.pos.copy(h.p); setUp(upFor(h.n), 1); P.onGround = true; P.vel.addScaledVector(P.up, -P.vel.dot(P.up)).multiplyScalar(.5); }
      else if (h) { P.pos.copy(h.p).addScaledVector(h.n, .06); const vn = P.vel.dot(h.n); if (vn < 0) P.vel.addScaledVector(h.n, -vn * 1.2); }
      else { P.pos.addScaledVector(P.vel, dt); setUp(WUP, Math.min(1, dt * 3)); }
    }
    // filets de sécurité : jamais dans la roche, jamais hors de la carte
    const lim = world.half - 3; P.pos.x = clamp(P.pos.x, -lim, lim); P.pos.z = clamp(P.pos.z, -lim, lim);
    const cx = P.pos.x + P.up.x * .3, cy = P.pos.y + P.up.y * .3, cz = P.pos.z + P.up.z * .3;
    if (world.solidPt(cx, cy, cz)) {
      const fl = world.floorAt(P.pos.x, P.pos.z);
      if (world.cave && cy > world.ceilAt(P.pos.x, P.pos.z) && Math.abs(cy - world.ceilAt(P.pos.x, P.pos.z)) < Math.abs(cy - fl)) { P.pos.y = world.ceilAt(P.pos.x, P.pos.z) - .02; }
      else P.pos.y = fl + .02;
      setUp(world.terrNormal(P.pos), 1); P.onGround = true; P.vel.set(0, 0, 0);
    }
  }

  function dart() {
    const k = P.charge; P.darts--; P.cd = .55; P.recoil = 2; G.stats.shots++;
    const o = cam.position.clone(), d = D.clone().normalize();
    const wb = world.rayBlock(o, d, 90), h = EN.rayHit(o, d, wb + .8);
    const end = o.clone().addScaledVector(d, h ? h.dist : wb);
    FX.tracer(V.copy(o).addScaledVector(d, .5).setY(o.y - .15), end);
    SFX.dart(k);
    if (h) { G.stats.ahits++; EN.damage(h.e, 40 + 110 * k, h.head, P.pos); h.e.stun = h.e.d.boss ? .5 * k : 1.6 * k; FX.hemo(end); }
    else FX.splash(end, FX.COL.spark, 8);
    EN.noise(P.pos, 10);
  }

  function bite() {
    P.cd = .55; P.biteT = .3; SFX.bite();
    let best = null, bd = 2.6;
    V.copy(cam.position);
    for (const e of EN.list) {
      if (e.dead) continue; const s = e.d.scale; e.ant.root.updateMatrixWorld();
      for (const h of e.ant.hit) {
        const hp = h.p.clone().applyMatrix4(e.ant.root.matrixWorld), to = hp.clone().sub(V), d = to.length() - h.r * s;
        if (d < bd && to.normalize().dot(D) > .55) { bd = d; best = { e, head: h.head, p: hp }; }
      }
    }
    if (best) { EN.damage(best.e, 58 * (1 + .3 * UP.lv.mandibules), best.head, P.pos); FX.hemo(best.p); FX.shake = Math.max(FX.shake, .25); }
  }

  function animVM(dt, bob, hs) {
    P.recoil = Math.max(0, P.recoil - dt * 9); P.glowT = Math.max(0, P.glowT - dt * 6);
    const t = performance.now() / 1000;
    VM.root.position.set(Math.cos(P.bobT) * .012 * bob, -Math.abs(Math.sin(P.bobT)) * .016 * bob - P.switchT * .6, P.recoil * .02);
    let o = .08;
    if (P.biteT > 0) { P.biteT -= dt; const k = 1 - P.biteT / .3; o = k < .35 ? .08 + k / .35 * .35 : .43 - (k - .35) / .65 * .7; }
    else if (P.weapon === 3) o = -.02;
    else if (P.weapon === 2) o = .14 + P.glowT * .05;
    const mb = VM.mBase || 0;
    VM.mand[0].rotation.y = lerp(VM.mand[0].rotation.y, -mb + o, Math.min(1, dt * 30));
    VM.mand[1].rotation.y = lerp(VM.mand[1].rotation.y, mb - o, Math.min(1, dt * 30));
    for (const a of VM.antn) a.visible = false;
    for (const m of VM.mand) m.visible = P.weapon === 1 || P.biteT > 0;
    for (let k = 0; k < 2; k++) { VM.antn[k].rotation.x = Math.sin(t * 2.1 + k) * .06 + hs * .006; VM.antn[k].rotation.y = Math.sin(t * 1.4 + k * 2) * .05; }
    VM.glow.material.opacity = P.weapon === 2 ? .25 + P.glowT * .75 + Math.sin(t * 5) * .05 : 0;
    VM.seed.visible = P.weapon === 3 && P.seeds > 0 && P.cd < .3;
    P.shieldHit = Math.max(0, (P.shieldHit || 0) - dt * 4);
    VM.shield.visible = P.shieldT > 0; if (P.shieldT > 0) { VM.shield.material.opacity = .22 + P.shieldHit * .6 + Math.sin(t * 9) * .04 - (P.shieldT < 1 ? (Math.sin(t * 30) > 0 ? .15 : 0) : 0); VM.shield.material.map.offset.x = t * .05; }
    VM.dart.visible = P.weapon === 4 && P.darts > 0 && P.cd < .3;
    VM.dart.scale.set(1, 1 + P.charge * 1.4, 1); VM.dart.position.z = -.62 - P.charge * .06;
    if (P.weapon === 4) { VM.glow.material.color.set('#ffb03a'); VM.glow.material.opacity = P.charge * .9; } else VM.glow.material.color.set('#a6ff3d');
  }
})();

// --- objets à ramasser
const PK = { list: [] };
(() => {
  const mk = {
    heal: () => { const g = new T.Group(); const m = new T.Mesh(ANT.sph, new T.MeshPhysicalMaterial({ color: '#ffb02a', emissive: '#7a3d00', roughness: .05, clearcoat: 1, transparent: true, opacity: .85 })); m.scale.set(.32, .38, .32); g.add(m); return g; },
    seed: () => { const g = new T.Group(); const m = new T.Mesh(ANT.sph, new T.MeshStandardMaterial({ color: '#7a4f24', roughness: .45 })); m.scale.set(.3, .2, .2); g.add(m); return g; },
    armor: () => { const g = new T.Group(); const m = new T.Mesh(new T.OctahedronGeometry(.32, 0), chitinMat('#1a1714', .15)); m.scale.y = 1.4; g.add(m); return g; },
    dart: () => { const g = new T.Group(); const m = new T.Mesh(new T.ConeGeometry(.05, .6, 8), new T.MeshStandardMaterial({ color: '#ffcf6a', emissive: '#ff9a1a', emissiveIntensity: .8 })); m.rotation.z = .5; g.add(m); return g; },
    nectar: () => { const g = new T.Group(); const m = new T.Mesh(ANT.sph, new T.MeshPhysicalMaterial({ color: '#ff5fc8', emissive: '#a0167a', roughness: .05, clearcoat: 1, transparent: true, opacity: .85 })); m.scale.set(.3, .36, .3); g.add(m); return g; },
    cocoon: () => { const nm = natMesh('cocoon', 'soft'); if (nm) { const g = new T.Group(); nm.scale.setScalar(1.7); g.add(nm); return g; } const g = new T.Group(); const m = new T.Mesh(ANT.sph, new T.MeshPhysicalMaterial({ color: '#f1e6c8', emissive: '#4a3a10', roughness: .6 })); m.scale.set(.45, .45, .85); g.add(m); return g; },
  };
  const glowCol = { heal: '#ffb02a', seed: '#d9a066', armor: '#9fb8ff', cocoon: '#fff3c4', dart: '#ffb03a', nectar: '#ff5fc8' };
  PK.clear = () => { for (const p of PK.list) scene.remove(p.g); PK.list = []; };
  PK.spawn = (type, x, z, o = {}) => {
    const g = mk[type](), y = world.groundAt(x, z, 99);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: glowCol[type], transparent: true, opacity: .55, depthWrite: false, blending: T.AdditiveBlending }));
    sp.scale.setScalar(type === 'cocoon' ? 3.2 : 1.5); g.add(sp);
    g.position.set(x, y + .6, z); scene.add(g);
    const p = Object.assign({ type, g, x, z, y, t: Math.random() * 6 }, o); PK.list.push(p); return p;
  };
  PK.update = dt => {
    for (let i = PK.list.length - 1; i >= 0; i--) {
      const p = PK.list[i]; p.t += dt;
      p.g.position.y = p.y + .55 + Math.sin(p.t * 2) * .12; p.g.children[0].rotation.y += dt * 1.5;
      const d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z);
      if (d > (p.type === 'cocoon' ? 1.9 : 1.3) || Math.abs(P.pos.y - p.y) > 2) continue;
      if (p.type === 'heal') { if (P.hp >= P.maxHp) continue; P.hp = Math.min(P.maxHp, P.hp + 35); HUD.notice('+35 vie · miellat'); }
      else if (p.type === 'dart') { if (P.darts >= 8) continue; P.darts = Math.min(8, P.darts + 2); HUD.notice('+2 dards'); }
      else if (p.type === 'nectar') { addNectar(3); HUD.notice('+3 nectar'); }
      else if (p.type === 'seed') { if (P.seeds >= 6) continue; P.seeds++; HUD.notice('+1 graine explosive'); }
      else if (p.type === 'armor') { if (P.armor >= 100) continue; P.armor = Math.min(100, P.armor + 25); HUD.notice('+25 chitine'); }
      else if (p.type === 'cocoon') { G.cocoons++; G.taken.push(p.idx); G.event('cocoon', p); }
      SFX.pick(); scene.remove(p.g); PK.list.splice(i, 1);
    }
  };
})();
