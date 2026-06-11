import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PALM_GLB = new URL('./stylized_palm_tree_1/scene.gltf', import.meta.url).href;

export const RACE = {
  mode: 'free',   // free | intro | racing | gameover
  introT: 0,
  introDur: 2.2,
  baseSpeed: 22,   // vitesse initiale (augmente avec RACE.distance)
  speed: 22,       // vitesse courante (recalculée chaque frame)
  maxSpeed: 55,    // plafond vitesse
  distance: 0,
  score: 0,
  steer: 10,
  roadHalf: 5.2,   // demi-largeur route = moitié du floor (32/2 = 16 → on prend 5.2 world units)
  lastSpawnZ: 0,
  palms: [],
  carScaleMul: 0.52,
  lives: 3,
  fadeT: 0,
  fadeDur: 0.45,
  introStartX: 0,
  introStartZ: 0,
  steerAngle: 0,   // angle de roulis/virage visuel voiture
};

const _chaseFrom = new THREE.Vector3();
const _chaseTo   = new THREE.Vector3();
const _lookTo    = new THREE.Vector3();
const _box       = new THREE.Box3();
const _size      = new THREE.Vector3();
const _center    = new THREE.Vector3();

// ─── Cached start zone ─────────────────────────────────────────────────────────
let _cachedZone = null;

export function invalidateStartZone() { _cachedZone = null; }

export function getStartZoneWorld(worldDims, pxToWorldX, pxToWorldZ) {
  if (_cachedZone) return _cachedZone;
  const el = document.getElementById('startRacerTrigger')
    || document.querySelector('.projects-lists')
    || document.querySelector('.projects-wrapper');
  if (!el) {
    const { w, h } = worldDims();
    _cachedZone = { x: w * 0.28, z: h * 0.22, w: 2.6, d: 5.8 };
    return _cachedZone;
  }
  const r = el.getBoundingClientRect();
  _cachedZone = {
    x: pxToWorldX(r.left + r.width * 0.5),
    z: pxToWorldZ(r.top + r.height * 0.5),
    w: 2.6,
    d: 5.8,
  };
  return _cachedZone;
}

export function isCarInStartZone(CAR, zone) {
  const dx = Math.abs(CAR.x - zone.x);
  const dz = Math.abs(CAR.z - zone.z);
  return dx < zone.w * 0.68 && dz < zone.d * 0.68;
}

// ─── Start gate ────────────────────────────────────────────────────────────────
// Seul le rectangle 3D au sol est géré ici.
// Le countdown est uniquement CSS/HTML (.start-racer-countdown).
// Pas de countMesh 3D pour éviter le doublon.
export class StartGate {
  constructor(scene, worldDims, pxToWorldX, pxToWorldZ) {
    this.worldDims    = worldDims;
    this.pxToWorldX   = pxToWorldX;
    this.pxToWorldZ   = pxToWorldZ;
    this.zone         = { x: 0, z: 0, w: 2.6, d: 5.8 };
    this._trigger     = document.getElementById('startRacerTrigger');
    this._countdownEl = this._trigger?.querySelector('.start-racer-countdown') ?? null;

    this.staging  = false;
    this.count    = 3;
    this.timer    = 0;

    this.group = new THREE.Group();
    this._buildHoldZone();

    this.group.renderOrder = 8;
    this.group.traverse(o => { if (o.isMesh) o.renderOrder = 8; });
    scene.add(this.group);
    // Pas de reposition() à la construction : DOM pas encore rendu.
    // La première synchro se fera dans update().
    this.group.visible = false;
  }

  // ─── rectangle d'attente au sol ───────────────────────────────────────────
  _buildHoldZone() {
    this.holdGroup = new THREE.Group();
    this.holdGroup.visible = false;

    this.holdFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false }),
    );
    this.holdFill.rotation.x = -Math.PI / 2;
    this.holdFill.position.y = 0.04;
    this.holdGroup.add(this.holdFill);

    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffd450, transparent: true, opacity: 0.95, toneMapped: false });
    this.holdEdges = [];
    for (let i = 0; i < 4; i++) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 0.08), edgeMat);
      e.position.y = 0.06;
      this.holdEdges.push(e);
      this.holdGroup.add(e);
    }
    this.group.add(this.holdGroup);
  }

  _layoutHoldZone() {
    const { w, d } = this.zone;
    this.holdFill.scale.set(w, d, 1);
    const hw = w * 0.5, hd = d * 0.5;
    [[w, 0.08, 0, -hd],[w, 0.08, 0, hd],[0.08, d, -hw, 0],[0.08, d, hw, 0]]
      .forEach(([ew, ed, ex, ez], i) => {
        this.holdEdges[i].scale.set(ew, 1, ed);
        this.holdEdges[i].position.set(ex, 0.06, ez);
      });
  }

  // ─── synchro position 3D ↔ DOM ─────────────────────────────────────────────
  _syncPosition() {
    // Recalcul frais à chaque appel (getBoundingClientRect → world coords)
    invalidateStartZone();
    this.zone = getStartZoneWorld(this.worldDims, this.pxToWorldX, this.pxToWorldZ);
    this.group.position.set(this.zone.x, 0, this.zone.z);
    this._layoutHoldZone();
    this.group.visible = RACE.mode === 'free';
  }

  // ─── staging HTML ─────────────────────────────────────────────────────────
  _setCountdown(n) {
    this.count = n;
    if (this._countdownEl) this._countdownEl.textContent = String(n);
  }

  _showStaging() {
    this.holdGroup.visible = true;
    this._trigger?.classList.add('staging');
    this._setCountdown(3);
  }

  _hideStaging() {
    this.holdGroup.visible = false;
    this._trigger?.classList.remove('staging');
    if (this._countdownEl) this._countdownEl.textContent = '3';
  }

  _setCarHover(inside) {
    this._trigger?.classList.toggle('car-hover', inside);
  }

  // ─── public ───────────────────────────────────────────────────────────────
  reposition() {
    this._syncPosition();
  }

  setVisible(v) {
    this._syncPosition();
    this.group.visible = v && RACE.mode === 'free';
    if (!v) this.resetStaging();
  }

  resetStaging() {
    this.staging = false;
    this.count   = 3;
    this.timer   = 0;
    this._hideStaging();
    this._setCarHover(false);
  }

  update(dt, CAR) {
    if (RACE.mode !== 'free') return false;

    // Synchro position 3D avec le DOM à chaque frame (appel léger)
    this._syncPosition();

    const inside = isCarInStartZone(CAR, this.zone);
    this._setCarHover(inside);

    if (!inside) {
      if (this.staging) this.resetStaging();
      return false;
    }

    if (!this.staging) {
      this.staging = true;
      this.timer   = 0;
      this._showStaging();
    }

    this.timer += dt;
    if (this.timer < 1) return false;
    this.timer = 0;
    this.count -= 1;

    if (this.count > 0) {
      this._setCountdown(this.count);
      return false;
    }

    this.resetStaging();
    return true;
  }
}

// ─── Mega Drive grid floor ─────────────────────────────────────────────────────
function _makeMegadriveGridMat() {
  const S = 512, cell = 32;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0018';
  ctx.fillRect(0, 0, S, S);

  for (let y = 0; y <= S; y += cell) {
    const t = y / S;
    const a = 0.12 + t * 0.55;
    const major = y % (cell * 2) === 0;
    ctx.strokeStyle = major ? `rgba(0,255,228,${a})` : `rgba(0,220,200,${a * 0.45})`;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
  }
  for (let x = 0; x <= S; x += cell) {
    const major = x % (cell * 2) === 0;
    ctx.strokeStyle = major ? 'rgba(255,0,170,0.42)' : 'rgba(255,0,150,0.16)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, color: 0xcc88ff, toneMapped: false });
}

// ─── Race world ────────────────────────────────────────────────────────────────
export class RaceWorld {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this._gridMat = _makeMegadriveGridMat();
    const roadW = RACE.roadHalf * 2; // largeur = exactement la zone de jeu
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(roadW, 160), this._gridMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.06;
    this.group.add(this.floor);

    this.palmPrototype = null;
    this.palmReady     = false;
    new GLTFLoader().load(PALM_GLB, gltf => {
      this.palmPrototype = this._normalizePalm(gltf.scene);
      this.palmReady = true;
    }, undefined, e => console.error('[RaceWorld] Palm load failed:', e));

    this.group.visible = false;
  }

  _normalizePalm(scene) {
    const root = new THREE.Group();
    root.add(scene);
    root.updateMatrixWorld(true);
    _box.setFromObject(root); _box.getSize(_size);
    root.scale.setScalar(2.8 / Math.max(_size.y, 0.001));
    root.updateMatrixWorld(true);
    _box.setFromObject(root); _box.getCenter(_center);
    root.position.set(-_center.x, -_box.min.y, -_center.z);
    root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return root;
  }

  _spawnPalm(z, x) {
    if (!this.palmReady || !this.palmPrototype) return;
    const palm = this.palmPrototype.clone(true);
    palm.position.set(x, 0, z);
    palm.rotation.y = Math.random() * Math.PI * 2;
    palm.scale.multiplyScalar(0.88 + Math.random() * 0.35);
    this.group.add(palm);
    RACE.palms.push({ mesh: palm, x, z, r: 0.65 });
  }

  removePalm(index) {
    const palm = RACE.palms[index];
    if (!palm) return;
    this.group.remove(palm.mesh);   // don't dispose — geometry/mat shared with prototype
    RACE.palms.splice(index, 1);
  }

  _clearPalms() { while (RACE.palms.length) this.removePalm(0); }

  _ensureObstacles(carZ) {
    const segLen = 16;
    const needZ = carZ - 110;
    while (RACE.lastSpawnZ > needZ) {
      RACE.lastSpawnZ -= segLen;
      const lanes = [-4.2, -2.2, 0.8, 2.8, 4.5];
      const count = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        const x = lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() - 0.5) * 0.6;
        this._spawnPalm(RACE.lastSpawnZ - Math.random() * segLen, x);
      }
    }
    for (let i = RACE.palms.length - 1; i >= 0; i--) {
      if (RACE.palms[i].mesh.position.z > carZ + 20) this.removePalm(i);
    }
  }

  activate(carX, carZ) {
    this.group.visible = true;
    this._clearPalms();
    RACE.lastSpawnZ = carZ + 10;
    this._ensureObstacles(carZ);
    // Centré sous la voiture au démarrage (pas 70 unités devant)
    this.floor.position.set(carX, -0.06, carZ);
  }

  deactivate() {
    this.group.visible = false;
    this._clearPalms();
  }

  update(carZ, carX = 0) {
    if (RACE.mode !== 'racing' && RACE.mode !== 'intro') return;
    // Pendant l'intro : suit la voiture (carX→0). En course : position standard.
    if (RACE.mode === 'intro') {
      this.floor.position.set(carX, -0.06, carZ);
    } else {
      this.floor.position.set(0, -0.06, carZ - 70);
    }
    this._gridMat.map.offset.y = (-carZ * 0.055) % 1;
    this._ensureObstacles(carZ);
  }

  applyAtmosphere(scene, renderer, active) {
    if (active) {
      scene.fog = new THREE.Fog(0x6a1a88, 35, 110);
      scene.background = new THREE.Color(0x180028);
      renderer.setClearColor(0x180028, 1);
    } else {
      scene.fog = null; scene.background = null;
      renderer.setClearColor(0x000000, 0);
    }
  }
}

// ─── HUD ───────────────────────────────────────────────────────────────────────
let _hud = null;

function _heartPixelTex() {
  const px = [
    0,1,1,0,0,0,1,1,0,
    1,1,1,1,0,1,1,1,1,
    1,1,1,1,1,1,1,1,1,
    1,1,1,1,1,1,1,1,1,
    0,1,1,1,1,1,1,1,0,
    0,0,1,1,1,1,1,0,0,
    0,0,0,1,1,1,0,0,0,
    0,0,0,0,1,0,0,0,0,
  ];
  const W = 9, H = 8, S = 6;
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const ctx = c.getContext('2d');
  for (let r = 0; r < H; r++) for (let col = 0; col < W; col++) {
    if (!px[r * W + col]) continue;
    ctx.fillStyle = '#ff2255';
    ctx.fillRect(col * S, r * S, S, S);
    ctx.fillStyle = 'rgba(255,80,120,0.55)';
    ctx.fillRect(col * S + S * 0.12, r * S + S * 0.12, S * 0.45, S * 0.45);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _ensureHud() {
  if (_hud) return _hud;
  _hud = document.createElement('div');
  _hud.id = 'race-hud';
  _hud.innerHTML = `
    <div class="race-hud-title">◈ OUTRUN MODE ◈</div>
    <div class="race-hud-dist">0000 M</div>
    <div class="race-hud-speed">000 KM/H</div>
    <div class="race-hud-lives" aria-label="Lives"></div>
    <div class="race-hud-hint">← → steer · smash palms · ESC quit</div>
  `;
  document.body.appendChild(_hud);
  return _hud;
}

function _renderHearts() {
  const hud = _ensureHud();
  const el = hud.querySelector('.race-hud-lives');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const span = document.createElement('span');
    span.className = 'race-heart' + (i >= RACE.lives ? ' race-heart--dead' : '');
    el.appendChild(span);
  }
}

function _updateHud() {
  const hud = _ensureHud();
  const active = RACE.mode === 'racing' || RACE.mode === 'intro';
  hud.classList.toggle('is-active', active);
  const dist = hud.querySelector('.race-hud-dist');
  if (dist) dist.textContent = `${Math.floor(RACE.distance).toString().padStart(4, '0')} M`;
  const spd = hud.querySelector('.race-hud-speed');
  if (spd) spd.textContent = `${Math.round(RACE.speed * 6.5).toString().padStart(3, '0')} KM/H`;
  _renderHearts();
}

// ─── Game over screen ──────────────────────────────────────────────────────────
let _gameOverEl = null;

function _showGameOver(onRestart, onQuit) {
  if (_gameOverEl) _gameOverEl.remove();
  _gameOverEl = document.createElement('div');
  _gameOverEl.id = 'race-gameover';
  _gameOverEl.innerHTML = `
    <div class="rgo-title">GAME OVER</div>
    <div class="rgo-dist">${Math.floor(RACE.distance)} M</div>
    <div class="rgo-actions">
      <span class="rgo-key">ENTER</span><span class="rgo-label"> restart</span>
      <span class="rgo-sep"> · </span>
      <span class="rgo-key">ESC</span><span class="rgo-label"> quit</span>
    </div>
  `;
  document.body.appendChild(_gameOverEl);

  const handler = (e) => {
    if (e.code === 'Enter') { cleanup(); onRestart(); }
    if (e.code === 'Escape') { cleanup(); onQuit(); }
  };
  const cleanup = () => {
    document.removeEventListener('keydown', handler);
    _gameOverEl?.remove(); _gameOverEl = null;
  };
  document.addEventListener('keydown', handler);
}

function _hideGameOver() {
  _gameOverEl?.remove();
  _gameOverEl = null;
}

// ─── Race flow ─────────────────────────────────────────────────────────────────
export function beginRace(CAR, raceWorld, startGate) {
  RACE.mode        = 'intro';
  RACE.introT      = 0;
  RACE.distance    = 0;
  RACE.score       = 0;
  RACE.lives       = 3;
  RACE.fadeT       = 0;
  RACE.camBobT     = 0;
  RACE.introStartX = CAR.x;   // mémorise position pour le cinématique
  RACE.introStartZ = CAR.z;
  CAR.drift        = 0;
  CAR.heading      = 0;
  CAR.velAngle     = 0;
  CAR.speed        = 0;

  startGate?.setVisible(false);
  raceWorld.activate(CAR.x, CAR.z);
  document.body.classList.add('race-active');
  _hideGameOver();
  _updateHud();
}

export function endRace(CAR, raceWorld, startGate) {
  RACE.mode       = 'free';
  RACE.steerAngle = 0;
  CAR.speed = 0; CAR.drift = 0;
  raceWorld.deactivate();
  startGate?.setVisible(true);
  startGate?.reposition();
  startGate?.resetStaging();
  document.body.classList.remove('race-active');
  _ensureHud().classList.remove('is-active');
}

function _hitPalm(CAR, palm) {
  return Math.hypot(CAR.x - palm.mesh.position.x, CAR.z - palm.mesh.position.z) < palm.r + 0.55;
}

export function updateRacePhysics(dt, CAR, isLeft, isRight, raceWorld, onGameOver) {
  if (RACE.mode !== 'racing' && RACE.mode !== 'intro') return;

  RACE.fadeT = Math.min(RACE.fadeT + dt / RACE.fadeDur, 1);

  // Pendant l'intro : pas de steering, la caméra gère le recentrage de CAR.x
  if (RACE.mode === 'intro') {
    CAR.heading  = 0;
    CAR.velAngle = 0;
    CAR.drift    = 0;
    CAR.speed    = THREE.MathUtils.lerp(CAR.speed, 0, dt * 4);
    return;
  }

  CAR.heading  = 0;
  CAR.velAngle = 0;
  CAR.drift    = 0;

  // Vitesse progressive : accélère avec la distance parcourue
  RACE.speed = Math.min(RACE.baseSpeed + RACE.distance * 0.018, RACE.maxSpeed);
  CAR.speed = THREE.MathUtils.lerp(CAR.speed, RACE.speed, dt * 2.5);

  // Steering avec clamping sur la grille visuelle (floor width 32 → roadHalf 5.2)
  const steerInput = (isLeft() ? -1 : 0) + (isRight() ? 1 : 0);
  RACE.steerAngle  = THREE.MathUtils.lerp(RACE.steerAngle, steerInput * 0.38, dt * 8);
  if (isLeft())  CAR.x -= RACE.steer * dt;
  if (isRight()) CAR.x += RACE.steer * dt;
  CAR.x = THREE.MathUtils.clamp(CAR.x, -RACE.roadHalf + 0.6, RACE.roadHalf - 0.6);

  CAR.z -= CAR.speed * dt;
  if (RACE.mode === 'racing') RACE.distance += CAR.speed * dt;

  if (RACE.mode === 'racing' && raceWorld) {
    for (let i = RACE.palms.length - 1; i >= 0; i--) {
      if (_hitPalm(CAR, RACE.palms[i])) {
        raceWorld.removePalm(i);
        RACE.score += 1;
        RACE.lives -= 1;
        _updateHud();
        if (RACE.lives <= 0) {
          RACE.mode = 'gameover';
          onGameOver?.();
          return;
        }
      }
    }
  }
}

// ─── Camera ─────────────────────────────────────────────────────────────────────
//
// Cinématique d'intro en 2 phases :
//   Phase 1 — DIVE  (0 → 40% du temps) :
//     La caméra plonge depuis la vue ortho (y=50, vue plongeante) droit vers la voiture.
//     FOV très serré (5°) qui s'ouvre légèrement. Effet "zoom rapide".
//   Phase 2 — SWEEP (40% → 100%) :
//     La caméra pivote progressivement derrière la voiture tout en recentrant
//     la voiture sur la route (CAR.x → 0). FOV s'ouvre jusqu'à 68°.
//
export function updateRaceCamera(chaseCam, orthoCam, CAR, dt) {
  if (RACE.mode === 'free') return orthoCam;

  if (RACE.mode === 'intro') {
    RACE.introT += dt;
    const t = Math.min(RACE.introT / RACE.introDur, 1);

    // ── Paramètres de phase ───────────────────────────────────────────────────
    // On utilise UN seul t continu, avec des easings décalés :
    //   dive   : t 0→SPLIT   (chute rapide de la cam depuis vue ortho)
    //   sweep  : t SPLIT→1   (pivote et recentre la voiture)
    const SPLIT = 0.42;
    const t1 = Math.min(t / SPLIT, 1);                       // 0→1 dive
    const t2 = t < SPLIT ? 0 : (t - SPLIT) / (1 - SPLIT);   // 0→1 sweep

    const eDive  = 1 - Math.pow(1 - t1, 2.8);               // ease-out fort (plonge vite)
    const eSweep = t2 < 0.5
      ? 2 * t2 * t2
      : 1 - Math.pow(-2 * t2 + 2, 2) / 2;                   // ease-in-out (sweep doux)

    const sx = RACE.introStartX;
    const sz = RACE.introStartZ;

    // ── Recentrage de la voiture pendant le sweep ──────────────────────────
    CAR.x = THREE.MathUtils.lerp(sx, 0, t2 > 0 ? eSweep : 0);

    // ── Position caméra : courbe continue sans cassure ─────────────────────
    // Y : 50 → 10 pendant dive, 10 → 3.2 pendant sweep
    const cy = t2 === 0
      ? THREE.MathUtils.lerp(50, 10, eDive)
      : THREE.MathUtils.lerp(10, 3.2, eSweep);

    // X : 0→sx pendant dive (suit la voiture), sx→0 pendant sweep (recentre)
    const cx = t2 === 0
      ? THREE.MathUtils.lerp(0, sx, eDive)
      : CAR.x;   // suit le recentrage

    // Z : 0→sz pendant dive, sz→(car.z+5.5) pendant sweep
    const cz = t2 === 0
      ? THREE.MathUtils.lerp(0, sz, eDive)
      : THREE.MathUtils.lerp(sz, CAR.z + 5.5, eSweep);

    chaseCam.position.set(cx, cy, cz);

    // ── Look-at continu : pas de coupure entre les deux phases ─────────────
    // Pendant le dive : regarde droit vers la voiture au sol
    // Pendant le sweep : pivote depuis la position voiture vers l'avant
    // Clé : au t=SPLIT, lz = sz dans les deux cas → pas de saut
    const lx = t2 === 0
      ? THREE.MathUtils.lerp(0, sx, eDive)   // suit le cam x pendant dive
      : CAR.x;                                // suit la voiture pendant sweep

    const ly = THREE.MathUtils.lerp(0, 0.35, eSweep);  // 0 au dive, 0.35 à la fin

    const lz = t2 === 0
      ? THREE.MathUtils.lerp(0, sz, eDive)              // regarde vers la voiture
      : THREE.MathUtils.lerp(sz, CAR.z - 14, eSweep);  // pivote vers l'avant (part de sz !)

    chaseCam.lookAt(lx, ly, lz);

    // ── Up vector : rotation sphérique (0,0,−1)→(0,1,0) sans gimbal lock ──
    const upAngle = t * t * (3 - 2 * t) * (Math.PI / 2);
    chaseCam.up.set(0, Math.sin(upAngle), -Math.cos(upAngle));

    // ── FOV : 5° (zoom téléobjectif) → 68° (course) ─────────────────────────
    chaseCam.fov = t2 === 0
      ? THREE.MathUtils.lerp(5, 28, eDive)
      : THREE.MathUtils.lerp(28, 68, eSweep);
    chaseCam.updateProjectionMatrix();

    if (t >= 1) {
      RACE.mode = 'racing';
      CAR.speed = RACE.speed;
      CAR.x     = 0;
      chaseCam.up.set(0, 1, 0);
    }
    _updateHud();
    return chaseCam;
  }

  if (RACE.mode === 'gameover' || RACE.mode === 'racing') {
    // Pas de bobbing — caméra fixe et stable derrière la voiture
    chaseCam.position.set(CAR.x, 3.2, CAR.z + 5.5);
    chaseCam.lookAt(CAR.x, 0.35, CAR.z - 12);
    chaseCam.up.set(0, 1, 0);
    chaseCam.fov = 68;
    chaseCam.updateProjectionMatrix();
    _updateHud();
    return chaseCam;
  }

  return orthoCam;
}

export function isRaceActive() { return RACE.mode !== 'free'; }

export function showGameOver(onRestart, onQuit) { _showGameOver(onRestart, onQuit); }
export function hideGameOver() { _hideGameOver(); }
