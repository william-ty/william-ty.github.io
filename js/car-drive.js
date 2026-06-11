import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  RACE,
  StartGate,
  RaceWorld,
  beginRace,
  endRace,
  updateRacePhysics,
  updateRaceCamera,
  isRaceActive,
  invalidateStartZone,
  showGameOver,
  hideGameOver,
} from './race-mode.js';
import { revealCoverElement } from './gsap/gsap_main.js';

const GLTF_URL = new URL('./honda_prelude_1997_free/scene.gltf', import.meta.url).href;

// ─── Spawn layout (tuned beside logo) ─────────────────────────────────────────
const SPAWN = {
  gapPx: -26,
  offsetX: -113,
  offsetZ: 0,
  scaleMul: 0.78,
};

const CAR_TUNE = {
  sizeExtra: 1,
  bodyHue: 0,
};

/** Phares désactivés temporairement — rendu trop pété */
const HEADLIGHTS_ENABLED = false;

/** Feux arrière désactivés temporairement */
const TAILLIGHTS_ENABLED = false;

/** Dev helper — tune via Prelude Controls, then paste values back. */
const HEADLIGHT_TUNE = {
  frontFactor: 0.545,
  sideFactor: 0.35,
  y: 0.25,
  offsetX: 0.045,
  offsetY: 0.18,
  offsetZ: 0.11,
  meshX: -0.01,
  meshY: 0.005,
  meshZ: 0.07,
};

const TAILLIGHT_TUNE = {
  rearFactor: 0.48,
  sideFactor: 0.35,
  y: 0.18,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  meshX: 0,
  meshY: 0,
  meshZ: 0,
};

const LIGHT_SOFT = {
  headPenumbra: 0.9,
  headAngle: 0.46,
  headDistance: 26,
  headBeamLen: 9,
  headIntensity: 3.8,
  tailPenumbra: 0.92,
  tailAngle: 0.4,
  tailDistance: 16,
  tailBeamLen: 5.5,
  tailIntensity: 3.2,
  headGlowLen: 0.19,
  headGlowW: 0.085,
  tailGlowLen: 0.14,
  tailGlowW: 0.075,
  headGlowOpacity: 0.3,
  tailGlowOpacity: 0.26,
};

const BASE_BODY_COLOR = new THREE.Color(0x90a6bb);
const _tuneColor = new THREE.Color();
let _carScene = null;
let _carPivot = null;
let _baseScale = 1;
let _bodyMats = [];
let _headMeshes = [];
let _tailMeshes = [];
let _lightsOn = false;
let _lightRig = null;
let _glowRig = null;
let _headGlowMeshes = [];
let _tailGlowMeshes = [];
let _glowShared = null;
let _headPointLights = [];
let _tailPointLights = [];
let _lightsBtn = null;
let _headlightTuneDumpEl = null;
let _lastCarLength = 3;
let _lastCarWidth = 1.5;
let _raceCarShrink = false;
const _tailAnchorBox = new THREE.Box3();
const _tailAnchorCenter = new THREE.Vector3();
const _tailAnchorAvg = new THREE.Vector3();

// ─── Input ────────────────────────────────────────────────────────────────────
const KEYS = new Set();

function _initInput(onEscapeRace) {
  document.addEventListener('keydown', e => {
    KEYS.add(e.code);
    if (HEADLIGHTS_ENABLED && e.code === 'KeyH' && !e.repeat) {
      toggleHeadlights();
    }
    if (e.code === 'Escape' && !e.repeat && isRaceActive()) {
      onEscapeRace();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', e => KEYS.delete(e.code));
  window.addEventListener('blur', () => KEYS.clear());
}

const isUp    = () => KEYS.has('ArrowUp');
const isDown  = () => KEYS.has('ArrowDown');
const isLeft  = () => KEYS.has('ArrowLeft');
const isRight = () => KEYS.has('ArrowRight');

// ─── Car state ────────────────────────────────────────────────────────────────
const CAR = {
  x: 0,
  z: 0,
  heading: Math.PI / 2,   // where the car points (screen-right)
  velAngle: Math.PI / 2,    // where momentum actually goes
  speed: 0,
  drift: 0,                 // 0–1 slide amount
  maxVel: 16,
  accel: 34,
  decel: 26,
  drag: 3.2,
  steer: 1.35,
};

function _normAngle(a) {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ─── Camera ───────────────────────────────────────────────────────────────────
const VIEW_HEIGHT = 26;
const CAM_Y = 50;

function worldDims() {
  const aspect = window.innerWidth / window.innerHeight;
  return { w: VIEW_HEIGHT * aspect, h: VIEW_HEIGHT };
}

function applyOrtho(cam) {
  const { w, h } = worldDims();
  cam.left = -w / 2;
  cam.right = w / 2;
  cam.top = h / 2;
  cam.bottom = -h / 2;
  cam.updateProjectionMatrix();
}

function getLogoRect() {
  const glide = document.querySelector('#glide');
  if (glide) {
    const r = glide.getBoundingClientRect();
    if (r.width > 5 && r.height > 5) return r;
  }

  // Fallback: SVG height is reliable, width from viewBox aspect (not container 100%)
  const svg = document.querySelector('.logo-svg');
  if (!svg) return null;
  const sr = svg.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal;
  if (sr.height < 5 || !vb?.width || !vb.height) return null;

  const w = sr.height * (vb.width / vb.height);
  return {
    left: sr.left,
    top: sr.top,
    right: sr.left + w,
    bottom: sr.bottom,
    width: w,
    height: sr.height,
  };
}

function pxToWorldX(px) {
  return (px / window.innerWidth - 0.5) * worldDims().w;
}

function pxToWorldZ(px) {
  return (px / window.innerHeight - 0.5) * worldDims().h;
}

function logoWorldHeight() {
  const r = getLogoRect();
  if (!r) return 3;
  return (r.height / window.innerHeight) * worldDims().h;
}

function _meshLabel(obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  const matNames = mats.map(m => m?.name || '').join(' ');
  return `${obj.name || ''} ${matNames}`.toLowerCase();
}

function _isGlass(obj) {
  const label = _meshLabel(obj);
  return /glass|glaaa/.test(label);
}

function _isTrim(obj) {
  const label = _meshLabel(obj);
  if (_isGlass(obj)) return false;
  // "Black_Metal_Paint" = main body panels in this GLTF, NOT trim
  if (/black_metal_paint/.test(label) && !/mirror/.test(label)) return false;
  return /black4|leather|mirrors/.test(label);
}

function _isHeadLensLabel(label) {
  return /material_8|\.002|\.008/.test(label);
}

function _isTailLensLabel(label) {
  return /material\.004|\.005|\.006|\.007/.test(label);
}

/** GLTF rear cluster = mesh names containing "0.001" or body.001 bumper group. */
function _meshLightSide(obj) {
  const n = (obj.name || '').toLowerCase();
  if (n.includes('0.001') || n.includes('body.001')) return 'rear';
  return 'front';
}

function _meshLocalX(obj, pivot) {
  const pos = new THREE.Vector3();
  obj.getWorldPosition(pos);
  pivot.worldToLocal(pos);
  return pos.x;
}

function _makeHeadLensMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x707078,
    metalness: 0.15,
    roughness: 0.38,
    emissive: 0x000000,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });
}

function _makeTailLensMat() {
  return new THREE.MeshStandardMaterial({
    color: 0x3a0808,
    metalness: 0.05,
    roughness: 0.65,
    emissive: 0x000000,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });
}

function _makeHeadOnMat() {
  return new THREE.MeshBasicMaterial({
    color: 0xf8f8ff,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function _makeTailOnMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xff2244,
    emissive: 0xff1133,
    emissiveIntensity: 2.2,
    metalness: 0.08,
    roughness: 0.4,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function _createPointBeamTexture(rgb, anchorRight = false) {
  const W = 48;
  const H = 24;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const beamGrad = anchorRight
    ? ctx.createLinearGradient(W, 0, 0, 0)
    : ctx.createLinearGradient(0, 0, W, 0);
  beamGrad.addColorStop(0, `rgba(${rgb}, 0.82)`);
  beamGrad.addColorStop(0.12, `rgba(${rgb}, 0.38)`);
  beamGrad.addColorStop(0.38, `rgba(${rgb}, 0.1)`);
  beamGrad.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = beamGrad;
  ctx.fillRect(0, 0, W, H);

  const latGrad = ctx.createLinearGradient(0, 0, 0, H);
  latGrad.addColorStop(0, 'rgba(0,0,0,0.55)');
  latGrad.addColorStop(0.28, 'rgba(0,0,0,0)');
  latGrad.addColorStop(0.72, 'rgba(0,0,0,0)');
  latGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = latGrad;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _makeGlowMaterial(tex, opacity = 0.3) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function _disposeGlowRig(pivot) {
  if (!_glowRig) return;
  _glowShared?.geo?.dispose();
  _glowShared?.headMat?.map?.dispose();
  _glowShared?.headMat?.dispose();
  _glowShared?.tailMat?.map?.dispose();
  _glowShared?.tailMat?.dispose();
  pivot.remove(_glowRig);
  _glowRig = null;
  _headGlowMeshes = [];
  _tailGlowMeshes = [];
  _glowShared = null;
}

function _placePointGlow(mesh, anchorX, anchorY, z, beamLen, beamW, forward = true) {
  mesh.scale.set(beamLen, beamW, 1);
  const mid = forward ? anchorX - beamLen * 0.5 : anchorX + beamLen * 0.5;
  mesh.position.set(mid, anchorY, z);
}

function _getTailMeshCenters(pivot) {
  pivot.updateMatrixWorld(true);
  const centers = [];
  for (const mesh of _tailMeshes) {
    _tailAnchorBox.setFromObject(mesh);
    _tailAnchorBox.getCenter(_tailAnchorCenter);
    pivot.worldToLocal(_tailAnchorCenter);
    centers.push(_tailAnchorCenter.clone());
  }
  return centers;
}

function _averageTailPoints(points, tune) {
  _tailAnchorAvg.set(0, 0, 0);
  for (const p of points) _tailAnchorAvg.add(p);
  _tailAnchorAvg.divideScalar(points.length);
  return {
    x: _tailAnchorAvg.x + tune.offsetX,
    y: _tailAnchorAvg.y + tune.offsetY,
    z: _tailAnchorAvg.z + tune.offsetZ,
  };
}

/** 3 slots: gauche (−Z), droite (+Z), centre — dérivés des lentilles arrière réelles. */
function _getTailLightPositions(pivot, carLength, carWidth) {
  const tune = TAILLIGHT_TUNE;
  const fallback = () => {
    const { rearX, sideZ, y } = _tailLightCoords(carLength, carWidth);
    return [
      { x: rearX + tune.offsetX, y: y + tune.offsetY, z: -sideZ + tune.offsetZ },
      { x: rearX + tune.offsetX, y: y + tune.offsetY, z: sideZ + tune.offsetZ },
      { x: rearX + tune.offsetX, y: y + tune.offsetY, z: tune.offsetZ },
    ];
  };

  const centers = _getTailMeshCenters(pivot);
  if (!centers.length) return fallback();

  const sorted = [...centers].sort((a, b) => a.z - b.z);
  if (sorted.length === 1) {
    const slot = _averageTailPoints(sorted, tune);
    return [slot, slot, slot];
  }

  const midZ = sorted.reduce((sum, p) => sum + p.z, 0) / sorted.length;
  const leftCluster = sorted.filter(p => p.z <= midZ);
  const rightCluster = sorted.filter(p => p.z > midZ);

  return [
    _averageTailPoints(leftCluster.length ? leftCluster : [sorted[0]], tune),
    _averageTailPoints(rightCluster.length ? rightCluster : [sorted[sorted.length - 1]], tune),
    _averageTailPoints(sorted, tune),
  ];
}

function _updateGlowPositions(pivot, carLength, carWidth) {
  const tailAnchors = _getTailLightPositions(pivot, carLength, carWidth);
  const tailLen = carLength * LIGHT_SOFT.tailGlowLen;
  const tailW = carWidth * LIGHT_SOFT.tailGlowW;

  if (HEADLIGHTS_ENABLED) {
    const { frontX, sideZ, y: headY } = _headLightCoords(carLength, carWidth);
    const headLen = carLength * LIGHT_SOFT.headGlowLen;
    const headW = carWidth * LIGHT_SOFT.headGlowW;
    const headPts = [
      [frontX, headY, -sideZ, headLen, headW],
      [frontX, headY, sideZ, headLen, headW],
      [frontX, headY, 0, headLen * 0.82, headW * 1.05],
    ];
    headPts.forEach(([x, y, z, len, w], i) => {
      const mesh = _headGlowMeshes[i];
      if (mesh) _placePointGlow(mesh, x, y, z, len, w, true);
    });
  }

  tailAnchors.forEach((anchor, i) => {
    if (!TAILLIGHTS_ENABLED) return;
    const mesh = _tailGlowMeshes[i];
    if (mesh) _placePointGlow(mesh, anchor.x, anchor.y, anchor.z, tailLen, tailW, false);
  });
}

function _buildGlowRig(pivot, carLength, carWidth) {
  _disposeGlowRig(pivot);

  _glowRig = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  const headMat = _makeGlowMaterial(
    _createPointBeamTexture('255, 244, 220', true),
    LIGHT_SOFT.headGlowOpacity,
  );
  const tailMat = _makeGlowMaterial(
    _createPointBeamTexture('255, 40, 60', false),
    LIGHT_SOFT.tailGlowOpacity,
  );
  _glowShared = { geo, headMat, tailMat };

  for (let i = 0; i < 3; i++) {
    if (HEADLIGHTS_ENABLED) {
      const head = new THREE.Mesh(geo, headMat);
      head.rotation.x = -Math.PI / 2;
      head.renderOrder = -4;
      head.visible = _lightsOn;
      _headGlowMeshes.push(head);
      _glowRig.add(head);
    }

    if (TAILLIGHTS_ENABLED) {
      const tail = new THREE.Mesh(geo, tailMat);
      tail.rotation.x = -Math.PI / 2;
      tail.renderOrder = -4;
      tail.visible = _lightsOn;
      _tailGlowMeshes.push(tail);
      _glowRig.add(tail);
    }
  }

  _updateGlowPositions(pivot, carLength, carWidth);
  pivot.add(_glowRig);
}

function _headLightCoords(carLength, carWidth) {
  const t = HEADLIGHT_TUNE;
  const frontX = -carLength * t.frontFactor + t.offsetX;
  const sideZ = carWidth * t.sideFactor + t.offsetZ;
  const y = t.y + t.offsetY;
  return { frontX, sideZ, y };
}

function _applyMeshOffsets(meshes, tune) {
  const { meshX, meshY, meshZ } = tune;
  for (const obj of meshes) {
    if (!obj.userData._baseLocalPos) {
      obj.userData._baseLocalPos = obj.position.clone();
    }
    const base = obj.userData._baseLocalPos;
    obj.position.set(base.x + meshX, base.y + meshY, base.z + meshZ);
  }
}

function _applyHeadMeshOffsets() {
  _applyMeshOffsets(_headMeshes, HEADLIGHT_TUNE);
}

function _applyTailMeshOffsets() {
  _applyMeshOffsets(_tailMeshes, TAILLIGHT_TUNE);
}

function _tailLightCoords(carLength, carWidth) {
  const t = TAILLIGHT_TUNE;
  const rearX = carLength * t.rearFactor + t.offsetX;
  const sideZ = carWidth * t.sideFactor + t.offsetZ;
  const y = t.y + t.offsetY;
  return { rearX, sideZ, y };
}

function _placeBeamLight(entry, x, y, z, dirX, dirY, dirZ) {
  entry.light.position.set(x, y, z);
  if (entry.target) {
    entry.target.position.set(
      x + dirX * entry.beamLen,
      y + dirY * entry.beamLen,
      z + dirZ * entry.beamLen,
    );
  }
}

function _updateHeadLightPositions(carLength, carWidth) {
  const { frontX, sideZ, y } = _headLightCoords(carLength, carWidth);
  const positions = [
    [frontX, y, -sideZ],
    [frontX, y, sideZ],
    [frontX, y, 0],
  ];
  positions.forEach((pos, i) => {
    const entry = _headPointLights[i];
    if (entry) _placeBeamLight(entry, ...pos, -1, -0.18, 0);
  });
}

function _updateTailLightPositions(pivot, carLength, carWidth) {
  const anchors = _getTailLightPositions(pivot, carLength, carWidth);
  anchors.forEach((anchor, i) => {
    const entry = _tailPointLights[i];
    if (entry) _placeBeamLight(entry, anchor.x, anchor.y, anchor.z, 1, -0.08, 0);
  });
}

function _updateHeadlightTuneDump() {
  if (!_headlightTuneDumpEl) return;
  _headlightTuneDumpEl.textContent = JSON.stringify(
    { HEADLIGHT_TUNE, TAILLIGHT_TUNE },
    null,
    2,
  );
}

function _applyHeadlightTune() {
  if (!HEADLIGHTS_ENABLED || !_carPivot) return;
  _updateHeadLightPositions(_lastCarLength, _lastCarWidth);
  _updateGlowPositions(_carPivot, _lastCarLength, _lastCarWidth);
  _applyHeadMeshOffsets();
  _updateHeadlightTuneDump();
}

function _applyTailLightTune() {
  if (!TAILLIGHTS_ENABLED || !_carPivot) return;
  _applyTailMeshOffsets();
  _updateTailLightPositions(_carPivot, _lastCarLength, _lastCarWidth);
  _updateGlowPositions(_carPivot, _lastCarLength, _lastCarWidth);
  _updateHeadlightTuneDump();
}

function _addBeamSpot(arr, x, y, z, color, onIntensity, dirX, dirY, dirZ, soft) {
  const light = new THREE.SpotLight(
    color,
    0,
    soft.distance,
    soft.angle,
    soft.penumbra,
    1.8,
  );
  light.position.set(x, y, z);
  const target = new THREE.Object3D();
  target.position.set(
    x + dirX * soft.beamLen,
    y + dirY * soft.beamLen,
    z + dirZ * soft.beamLen,
  );
  light.target = target;
  _lightRig.add(light);
  _lightRig.add(target);
  arr.push({ light, target, onIntensity, beamLen: soft.beamLen });
}

function _buildLightRig(pivot, carLength, carWidth) {
  _lastCarLength = carLength;
  _lastCarWidth = carWidth;

  if (_lightRig) pivot.remove(_lightRig);
  _headPointLights = [];
  _tailPointLights = [];

  _lightRig = new THREE.Group();
  const { frontX, sideZ, y } = _headLightCoords(carLength, carWidth);

  const headSpecs = [
    [frontX, y, -sideZ, LIGHT_SOFT.headIntensity],
    [frontX, y, sideZ, LIGHT_SOFT.headIntensity],
    [frontX, y, 0, LIGHT_SOFT.headIntensity * 0.72],
  ];
  if (HEADLIGHTS_ENABLED) {
    for (const [x, lightY, z, intensity] of headSpecs) {
      _addBeamSpot(_headPointLights, x, lightY, z, 0xfff4e8, intensity, -1, -0.18, 0, {
        distance: LIGHT_SOFT.headDistance,
        angle: LIGHT_SOFT.headAngle,
        penumbra: LIGHT_SOFT.headPenumbra,
        beamLen: LIGHT_SOFT.headBeamLen,
      });
    }
  }

  if (TAILLIGHTS_ENABLED) {
    const tailAnchors = _getTailLightPositions(pivot, carLength, carWidth);
    const tailIntensities = [
      LIGHT_SOFT.tailIntensity,
      LIGHT_SOFT.tailIntensity,
      LIGHT_SOFT.tailIntensity * 0.8,
    ];
    for (let i = 0; i < tailAnchors.length; i++) {
      const anchor = tailAnchors[i];
      _addBeamSpot(_tailPointLights, anchor.x, anchor.y, anchor.z, 0xff2244, tailIntensities[i], 1, -0.08, 0, {
        distance: LIGHT_SOFT.tailDistance,
        angle: LIGHT_SOFT.tailAngle,
        penumbra: LIGHT_SOFT.tailPenumbra,
        beamLen: LIGHT_SOFT.tailBeamLen,
      });
    }
  }

  pivot.add(_lightRig);
}

function _finalizeCarLights(pivot, carLength, carWidth) {
  _headMeshes = [];
  _tailMeshes = [];

  pivot.traverse(obj => {
    if (!obj.isMesh || !obj.userData.lightKind) return;

    delete obj.userData._baseLocalPos;
    delete obj.userData._onMatHead;
    delete obj.userData._onMatTail;

    const kind = obj.userData.lightKind;
    let side = obj.userData.lightSide || _meshLightSide(obj);
    if (_meshLocalX(obj, pivot) > carLength * 0.08) side = 'rear';
    if (_meshLocalX(obj, pivot) < -carLength * 0.08) side = 'front';
    obj.userData.lightSide = side;

    if (TAILLIGHTS_ENABLED && side === 'rear' && kind === 'tail') {
      _tailMeshes.push(obj);
      obj.userData._offMat = _makeTailLensMat();
      if (!_lightsOn) obj.material = obj.userData._offMat;
      obj.renderOrder = 3;
    } else if (HEADLIGHTS_ENABLED && (kind === 'head' || kind === 'head-candidate')) {
      _headMeshes.push(obj);
    }
  });

  _buildLightRig(pivot, carLength, carWidth);
  _buildGlowRig(pivot, carLength, carWidth);
  if (HEADLIGHTS_ENABLED) _applyHeadMeshOffsets();
  if (TAILLIGHTS_ENABLED) {
    _applyTailMeshOffsets();
    _updateTailLightPositions(pivot, carLength, carWidth);
  }
  _updateGlowPositions(pivot, carLength, carWidth);
  setHeadlights(_lightsOn);
  if (HEADLIGHTS_ENABLED) _updateHeadlightTuneDump();
}

function setHeadlights(on) {
  _lightsOn = on;

  if (HEADLIGHTS_ENABLED) {
    for (const obj of _headMeshes) {
      if (on) {
        if (!obj.userData._onMatHead) obj.userData._onMatHead = _makeHeadOnMat();
        obj.material = obj.userData._onMatHead;
      } else {
        obj.material = obj.userData._offMat;
      }
    }
    for (const entry of _headPointLights) {
      entry.light.intensity = on ? entry.onIntensity : 0;
    }
    for (const mesh of _headGlowMeshes) mesh.visible = on;
  }

  if (TAILLIGHTS_ENABLED) {
    for (const obj of _tailMeshes) {
      if (on) {
        if (!obj.userData._onMatTail) obj.userData._onMatTail = _makeTailOnMat();
        obj.material = obj.userData._onMatTail;
      } else {
        obj.material = obj.userData._offMat;
      }
    }
    for (const entry of _tailPointLights) {
      entry.light.intensity = on ? entry.onIntensity : 0;
    }
    for (const mesh of _tailGlowMeshes) mesh.visible = on;
  }

  if (HEADLIGHTS_ENABLED && _lightsBtn) {
    _lightsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    _lightsBtn.textContent = on ? 'Headlights on' : 'Headlights off';
  }
}

function toggleHeadlights() {
  if (!HEADLIGHTS_ENABLED) return;
  setHeadlights(!_lightsOn);
}

function _applyBodyHue(mat) {
  _tuneColor.copy(BASE_BODY_COLOR);
  _tuneColor.offsetHSL(CAR_TUNE.bodyHue, 0, 0);
  mat.color.copy(_tuneColor);
}

/** Light grey metallic body + black glass windows. */
function applyCarMaterials(root) {
  const GLASS = { color: 0x08080c, metalness: 0.85, roughness: 0.06 };
  const TRIM  = { color: 0x3a3e44, metalness: 0.65, roughness: 0.45 };
  _bodyMats = [];

  root.traverse(obj => {
    if (!obj.isMesh) return;

    const oldMats = Array.isArray(obj.material) ? obj.material : [obj.material];
    oldMats.forEach(m => m.dispose?.());

    const label = _meshLabel(obj);

    if (_isHeadLensLabel(label)) {
      obj.userData.lightKind = 'head';
      obj.userData.lightSide = _meshLightSide(obj);
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.material = _makeHeadLensMat();
      obj.userData._offMat = obj.material;
      return;
    }
    if (_isTailLensLabel(label)) {
      if (!TAILLIGHTS_ENABLED) {
        obj.visible = false;
        return;
      }
      obj.userData.lightKind = 'tail';
      obj.userData.lightSide = _meshLightSide(obj);
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.material = _meshLightSide(obj) === 'rear' ? _makeTailLensMat() : _makeHeadLensMat();
      obj.userData._offMat = obj.material;
      return;
    }
    if (/material\.001/.test(label)) {
      const side = _meshLightSide(obj);
      if (!TAILLIGHTS_ENABLED && side === 'rear') {
        obj.visible = false;
        return;
      }
      obj.userData.lightSide = side;
      obj.userData.lightKind = side === 'rear' ? 'tail' : 'head-candidate';
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.material = side === 'rear' ? _makeTailLensMat() : _makeHeadLensMat();
      obj.userData._offMat = obj.material;
      return;
    }

    const isBody = !_isGlass(obj) && !_isTrim(obj);
    const spec = _isGlass(obj) ? GLASS : _isTrim(obj) ? TRIM : {
      color: BASE_BODY_COLOR.clone(),
      metalness: 0.62,
      roughness: 0.29,
    };

    obj.castShadow = false;
    obj.receiveShadow = false;
    obj.material = new THREE.MeshStandardMaterial({
      ...spec,
      side: THREE.DoubleSide,
    });

    if (isBody) {
      _applyBodyHue(obj.material);
      _bodyMats.push(obj.material);
    }
  });
}

function _measureCarSize() {
  if (!_carPivot) return { length: 3, width: 1.5 };
  _carPivot.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(_carPivot).getSize(new THREE.Vector3());
  return { length: Math.max(size.x, size.z), width: Math.min(size.x, size.z) };
}

function _measureCarLength() {
  return _measureCarSize().length;
}

function applyCarScale() {
  if (!_carScene) return;
  const base = _baseScale * SPAWN.scaleMul * CAR_TUNE.sizeExtra;
  _carScene.scale.setScalar(_raceCarShrink ? base * RACE.carScaleMul : base);
}

function _setRaceCarShrink(on) {
  _raceCarShrink = on;
  applyCarScale();
}

function _restoreFreeRoamCar() {
  CAR.heading = Math.PI / 2;
  CAR.velAngle = Math.PI / 2;
  CAR.speed = 0;
  CAR.drift = 0;
  applySpawn(_measureCarLength());
}

/** Scale so car width (smaller footprint axis) = logo height; pivot centred on ground. */
function buildCarPivot(scene) {
  const targetH = logoWorldHeight() * SPAWN.scaleMul;

  scene.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(scene);
  let size = box.getSize(new THREE.Vector3());

  const rawWidth = Math.min(size.x, size.z);
  const baseScale = targetH / Math.max(rawWidth, 0.001);
  scene.scale.setScalar(baseScale);

  applyCarMaterials(scene);

  scene.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(scene);
  size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const pivot = new THREE.Group();
  scene.position.set(-center.x, -box.min.y, -center.z);
  pivot.add(scene);

  const carLength = Math.max(size.x, size.z);
  const carWidth = Math.min(size.x, size.z);
  _finalizeCarLights(pivot, carLength, carWidth);

  return {
    pivot,
    scene,
    baseScale,
    carLength,
    carWidth,
  };
}

// ─── Drift smoke : puffs (sprites) + carrés plats rotatifs (planes) ──────────
function _createPixelSmokeTextures() {
  const palettes = [
    ['rgba(0,0,0,0)', 'rgba(210,216,228,0.55)', 'rgba(175,184,200,1)', 'rgba(130,140,158,1)'],
    ['rgba(0,0,0,0)', 'rgba(200,208,222,0.5)',  'rgba(160,170,188,1)', 'rgba(115,125,145,1)'],
    ['rgba(0,0,0,0)', 'rgba(220,224,232,0.45)', 'rgba(185,192,206,1)', 'rgba(145,154,170,1)'],
  ];

  return palettes.map(pal => {
    const S = 16;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d');
    const mid = S / 2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - mid + 0.5, y - mid + 0.5);
        const band = d < 2 ? 3 : d < 4.5 ? 2 : d < 7 ? 1 : -1;
        if (band >= 0) {
          ctx.fillStyle = pal[band];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

function _createSquareSmokeTexture() {
  const S = 8;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  // corps semi-opaque + bord légèrement plus sombre
  ctx.fillStyle = 'rgba(195,204,218,0.9)';
  ctx.fillRect(1, 1, S - 2, S - 2);
  ctx.fillStyle = 'rgba(140,152,170,0.6)';
  ctx.fillRect(0, 0, S, 1);
  ctx.fillRect(0, S - 1, S, 1);
  ctx.fillRect(0, 0, 1, S);
  ctx.fillRect(S - 1, 0, 1, S);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class DriftSmoke {
  constructor(scene) {
    this.scene      = scene;
    this.textures   = _createPixelSmokeTextures();
    this.sqTex      = _createSquareSmokeTexture();
    this.puffPool   = [];
    this.squarePool = [];
    this.spawnCD    = 0;
    this.anchorGroup = null;
    this.anchors     = [];
    this._worldPos   = new THREE.Vector3();

    // ── Puffs (sprites billboard) ────────────────────────────────────────────
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.textures[i % this.textures.length],
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.center.set(0.5, 0.5);
      scene.add(sprite);
      this.puffPool.push({ sprite, life: 0, maxLife: 1, vx: 0, vz: 0, grow: 0.4 });
    }

    // ── Carrés plats rotatifs (planes) ────────────────────────────────────────
    const sqGeo = new THREE.PlaneGeometry(1, 1);
    sqGeo.rotateX(-Math.PI / 2); // allongé à plat sur XZ
    for (let i = 0; i < 32; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.sqTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(sqGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.squarePool.push({ mesh, life: 0, maxLife: 1, vx: 0, vz: 0, rotSpeed: 0, grow: 0 });
    }
  }

  _acquirePuff() {
    return this.puffPool.find(x => x.life <= 0)
      ?? this.puffPool.reduce((a, b) => (a.life < b.life ? a : b));
  }

  _acquireSquare() {
    return this.squarePool.find(x => x.life <= 0)
      ?? this.squarePool.reduce((a, b) => (a.life < b.life ? a : b));
  }

  bind(carPivot, carLength, carWidth) {
    if (this.anchorGroup) {
      carPivot.remove(this.anchorGroup);
      this.anchorGroup = null;
    }
    this.anchorGroup = new THREE.Group();
    // capot = local −X → roues arrière à +X
    const rearX = carLength * 0.46;
    const sideZ = carWidth * 0.36;
    const y = 0.07;
    const layouts = [
      [rearX, y, -sideZ],
      [rearX, y,  sideZ],
      [rearX * 1.03, y, 0],
    ];
    this.anchors = layouts.map(([x, py, z]) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, py, z);
      this.anchorGroup.add(anchor);
      return anchor;
    });
    carPivot.add(this.anchorGroup);
  }

  _emitPuff(pos, intensity) {
    const p = this._acquirePuff();
    const s = 0.32 + Math.random() * 0.22 + intensity * 0.3;
    p.sprite.position.copy(pos);
    p.sprite.position.y = 0.09;
    p.sprite.scale.set(s, s, 1);
    p.sprite.material.opacity = 0.72 + intensity * 0.22;
    p.sprite.material.rotation = Math.random() * Math.PI * 2;
    p.life = p.maxLife = 0.6 + Math.random() * 0.55;
    p.vx = (Math.random() - 0.5) * 0.4;
    p.vz = (Math.random() - 0.5) * 0.4;
    p.grow = 0.45 + intensity * 0.55;
    p.sprite.visible = true;
  }

  _emitSquare(pos, intensity) {
    const p = this._acquireSquare();
    const s = 0.1 + Math.random() * 0.14 + intensity * 0.1;
    p.mesh.position.copy(pos);
    p.mesh.position.y = 0.04 + Math.random() * 0.05;
    p.mesh.scale.set(s, 1, s);
    p.mesh.rotation.y = Math.random() * Math.PI * 2;
    p.mesh.material.opacity = 0.65 + intensity * 0.28;
    p.life = p.maxLife = 0.4 + Math.random() * 0.4;
    p.vx = (Math.random() - 0.5) * 0.7;
    p.vz = (Math.random() - 0.5) * 0.7;
    p.rotSpeed = (Math.random() - 0.5) * 14;  // rad/s — spinning debris
    p.grow = 0.18 + intensity * 0.22;
    p.mesh.visible = true;
  }

  update(dt) {
    const drifting = isUp() && isDown() && Math.abs(CAR.speed) > 1.2;
    const slip      = Math.abs(_normAngle(CAR.heading - CAR.velAngle));
    // Émet aussi lors d'un virage appuyé à vitesse, pas seulement en mode drift
    const turning   = (isLeft() || isRight()) && Math.abs(CAR.speed) > 3.5;
    const intensity = drifting
      ? Math.min(1, CAR.drift * 0.85 + slip * 0.45) * Math.min(Math.abs(CAR.speed) / 7, 1)
      : turning
        ? slip * 0.4 * Math.min(Math.abs(CAR.speed) / 10, 1)
        : CAR.drift * 0.3 * slip;

    if (intensity > 0.05 && this.anchors.length) {
      this.spawnCD -= dt;
      const rate = 0.042 - intensity * 0.028;
      if (this.spawnCD <= 0) {
        this.spawnCD = Math.max(0.012, rate);

        this.anchors[0].getWorldPosition(this._worldPos);
        this._emitPuff(this._worldPos, intensity);
        this._emitSquare(this._worldPos, intensity);

        this.anchors[1].getWorldPosition(this._worldPos);
        this._emitPuff(this._worldPos, intensity);
        this._emitSquare(this._worldPos, intensity);

        if (intensity > 0.4) {
          this.anchors[2].getWorldPosition(this._worldPos);
          this._emitPuff(this._worldPos, intensity * 0.8);
          this._emitSquare(this._worldPos, intensity * 0.7);
        }
      }
    } else {
      this.spawnCD = 0;
    }

    const driftVX = Math.sin(CAR.velAngle) * CAR.speed * 0.04;
    const driftVZ = -Math.cos(CAR.velAngle) * CAR.speed * 0.04;

    for (const p of this.puffPool) {
      if (p.life <= 0) { p.sprite.visible = false; continue; }
      p.life -= dt;
      p.sprite.position.x += (p.vx - driftVX * 0.55) * dt;
      p.sprite.position.z += (p.vz - driftVZ * 0.55) * dt;
      const t = 1 - p.life / p.maxLife;
      const sc = p.sprite.scale.x + p.grow * dt;
      p.sprite.scale.set(sc, sc, 1);
      p.sprite.material.opacity = Math.pow(1 - t, 0.55) * (0.6 + intensity * 0.3);
      if (p.life <= 0) p.sprite.visible = false;
    }

    for (const p of this.squarePool) {
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      p.life -= dt;
      p.mesh.position.x += (p.vx - driftVX * 0.5) * dt;
      p.mesh.position.z += (p.vz - driftVZ * 0.5) * dt;
      p.mesh.rotation.y += p.rotSpeed * dt;
      const t = 1 - p.life / p.maxLife;
      const sc = p.mesh.scale.x + p.grow * dt;
      p.mesh.scale.set(sc, 1, sc);
      p.mesh.material.opacity = Math.pow(1 - t, 0.5) * (0.55 + intensity * 0.28);
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}

// ─── Tire marks (canvas ground layer) ─────────────────────────────────────────
class TireMarks {
  constructor(scene) {
    this.scene = scene;
    this.res = 1024;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.res;
    this.canvas.height = this.res;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.clearRect(0, 0, this.res, this.res);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        opacity: 0.92,
      }),
    );
    this.plane.rotation.x = -Math.PI / 2;
    this.plane.position.y = -0.04;
    this.plane.renderOrder = -10;
    scene.add(this.plane);

    this.spawnCD = 0;
    this.anchorGroup = null;
    this.anchors = [];
    this._worldPos = new THREE.Vector3();
    this.worldW = 1;
    this.worldH = 1;
    this.resize();
  }

  resize() {
    const { w, h } = worldDims();
    this.worldW = w;
    this.worldH = h;
    this.plane.scale.set(w, h, 1);
  }

  bind(carPivot, carLength, carWidth) {
    if (this.anchorGroup) {
      carPivot.remove(this.anchorGroup);
      this.anchorGroup = null;
    }

    this.anchorGroup = new THREE.Group();
    const rearX = carLength * 0.46;
    const sideZ = carWidth * 0.36;
    const y = 0.07;

    this.anchors = [
      [rearX, y, -sideZ],
      [rearX, y, sideZ],
    ].map(([x, py, z]) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(x, py, z);
      this.anchorGroup.add(anchor);
      return anchor;
    });

    carPivot.add(this.anchorGroup);
  }

  _worldToCanvas(x, z) {
    return {
      px: (x / this.worldW + 0.5) * this.res,
      py: (z / this.worldH + 0.5) * this.res,
    };
  }

  _stamp(x, z, intensity) {
    const { px, py } = this._worldToCanvas(x, z);
    const scale = this.res / this.worldW;
    const len = (0.3 + intensity * 0.42) * scale;
    const wid = (0.05 + intensity * 0.04) * scale;
    const angle = Math.atan2(-Math.cos(CAR.velAngle), Math.sin(CAR.velAngle));
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.32 + intensity * 0.55;
    ctx.fillStyle = '#08080a';
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = (0.18 + intensity * 0.28) * 0.45;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.38, wid * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  update(dt) {
    const drifting = isUp() && isDown() && Math.abs(CAR.speed) > 1.2;
    const slip = Math.abs(_normAngle(CAR.heading - CAR.velAngle));
    const turning = (isLeft() || isRight()) && Math.abs(CAR.speed) > 3.5;
    const intensity = drifting
      ? Math.min(1, CAR.drift * 0.85 + slip * 0.45) * Math.min(Math.abs(CAR.speed) / 7, 1)
      : turning
        ? slip * 0.45 * Math.min(Math.abs(CAR.speed) / 10, 1)
        : slip * 0.22 * Math.min(Math.abs(CAR.speed) / 12, 1);

    if (intensity < 0.04 || !this.anchors.length || Math.abs(CAR.speed) < 0.6) {
      this.spawnCD = 0;
      return;
    }

    this.spawnCD -= dt;
    const rate = 0.034 - intensity * 0.024;
    if (this.spawnCD > 0) return;
    this.spawnCD = Math.max(0.007, rate);

    for (const anchor of this.anchors) {
      anchor.getWorldPosition(this._worldPos);
      this._stamp(this._worldPos.x, this._worldPos.z, intensity);
    }
  }
}

/** Spawn beside logo using pixel offsets from SPAWN config. */
function applySpawn(carLength) {
  const r = getLogoRect();
  if (!r) {
    CAR.x = -21.181;
    CAR.z = -8.857;
    return false;
  }

  const { w } = worldDims();
  const carLengthPx = (carLength / w) * window.innerWidth;
  const centerScreenX = r.right + SPAWN.gapPx + carLengthPx * 0.5 + SPAWN.offsetX;
  const centerScreenY = r.top + r.height * 0.5 + SPAWN.offsetZ;

  CAR.x = pxToWorldX(centerScreenX);
  CAR.z = pxToWorldZ(centerScreenY);
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function initCarDrive() {
  const canvas = document.getElementById('car-canvas');
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();

  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  orthoCam.up.set(0, 0, -1);
  orthoCam.position.set(0, CAM_Y, 0);
  orthoCam.lookAt(0, 0, 0);
  applyOrtho(orthoCam);

  const chaseCam = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    220,
  );
  let activeCam = orthoCam;

  scene.add(new THREE.AmbientLight(0xe8eaef, 1.35));
  scene.add(new THREE.HemisphereLight(0xf0f2f6, 0x3a424c, 0.55));

  const sun = new THREE.DirectionalLight(0xffffff, 1.45);
  sun.position.set(4, 18, 6);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xd8dce6, 0.65);
  fill.position.set(-5, 14, 8);
  scene.add(fill);

  let carRoot = null;
  let carLength = 3;
  let driftSmoke = null;
  let tireMarks = null;
  let startGate = null;
  let raceWorld = null;
  const FADE_DELAY = 6;
  const FADE_DURATION = 1.2;

  const _rebindCarExtras = () => {
    if (!_carPivot) return;
    const size = _measureCarSize();
    driftSmoke?.bind(_carPivot, size.length, size.width);
    tireMarks?.bind(_carPivot, size.length, size.width);
    _finalizeCarLights(_carPivot, size.length, size.width);
  };

  const _removeIntroFade = () => {
    const f = document.getElementById('race-intro-fade');
    if (f) f.remove();
  };

  const _startRaceWithFade = () => {
    let fade = document.getElementById('race-intro-fade');
    if (!fade) {
      fade = document.createElement('div');
      fade.id = 'race-intro-fade';
      document.body.appendChild(fade);
    }
    fade.classList.remove('fade-out');

    beginRace(CAR, raceWorld, startGate);
    _setRaceCarShrink(true);
    _rebindCarExtras();
    raceWorld.applyAtmosphere(scene, renderer, true);
    setHeadlights(true);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      fade.classList.add('fade-out');
      setTimeout(() => { if (fade.parentNode) fade.style.pointerEvents = 'none'; }, 900);
    }));
  };

  const _quitRace = () => {
    hideGameOver();
    _removeIntroFade();
    endRace(CAR, raceWorld, startGate);
    raceWorld?.applyAtmosphere(scene, renderer, false);
    _setRaceCarShrink(false);
    _restoreFreeRoamCar();
    _rebindCarExtras();
    activeCam = orthoCam;
    applyOrtho(orthoCam);
  };

  _initInput(_quitRace);

  canvas.style.opacity = '0';
  driftSmoke = new DriftSmoke(scene);
  tireMarks = new TireMarks(scene);
  startGate = new StartGate(scene, worldDims, pxToWorldX, pxToWorldZ);
  raceWorld = new RaceWorld(scene);
  _initStartRacerTrigger(startGate);

  function setupCar(gltf) {
    if (carRoot) return;

    const built = buildCarPivot(gltf.scene);
    carRoot = built.pivot;
    _carPivot = built.pivot;
    _carScene = built.scene;
    _baseScale = built.baseScale;
    carLength = built.carLength;
    scene.add(carRoot);
    _applyToMesh(carRoot);
    driftSmoke.bind(carRoot, built.carLength, built.carWidth);
    tireMarks.bind(carRoot, built.carLength, built.carWidth);

    const snap = () => applySpawn(carLength);
    snap();
    requestAnimationFrame(snap);
  }

  function _updateCarFade(now) {
    // `now` = ms since navigation start (same ref as performance.now())
    const elapsed = now / 1000;
    let opacity = 0;
    if (elapsed > FADE_DELAY) {
      opacity = Math.min((elapsed - FADE_DELAY) / FADE_DURATION, 1);
    }
    canvas.style.opacity = String(opacity);
    if (opacity >= 1 && !document.getElementById('car-hint')) {
      _showHint();
    }
  }

  const loader = new GLTFLoader();
  loader.load(
    GLTF_URL,
    gltf => {
      const trySpawn = () => setupCar(gltf);
      requestAnimationFrame(() => requestAnimationFrame(trySpawn));
      window.addEventListener('load', trySpawn, { once: true });
    },
    undefined,
    e => console.error('[CarDrive] GLTF load failed:', e),
  );

  let lastT = performance.now();

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (isRaceActive()) {
      updateRacePhysics(dt, CAR, isLeft, isRight, raceWorld, () => {
        showGameOver(
          () => { _quitRace(); requestAnimationFrame(_startRaceWithFade); },
          () => _quitRace(),
        );
      });
      raceWorld?.update(CAR.z, CAR.x);
    } else {
      _updatePhysics(dt);
      if (carRoot && startGate?.update(dt, CAR)) {
        _startRaceWithFade();
      }
    }

    if (carRoot) {
      _applyToMesh(carRoot);
      if (!isRaceActive()) {
        driftSmoke?.update(dt);
        tireMarks?.update(dt);
      }
      _updateCarFade(now);
      activeCam = updateRaceCamera(chaseCam, orthoCam, CAR, dt);
    }
    renderer.render(scene, activeCam);
  }
  requestAnimationFrame(animate);

  window.addEventListener('resize', () => {
    applyOrtho(orthoCam);
    chaseCam.aspect = window.innerWidth / window.innerHeight;
    chaseCam.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    tireMarks?.resize();
    invalidateStartZone();
    startGate?.reposition();
  });

  const wrapper = document.querySelector('.wrapper');
  wrapper?.addEventListener('scroll', () => {
    invalidateStartZone();
    startGate?.reposition();
  }, { passive: true });

  _initPreludeControls({
    onSize(v) {
      CAR_TUNE.sizeExtra = v;
      applyCarScale();
      const size = _measureCarSize();
      carLength = size.length;
      driftSmoke?.bind(_carPivot, size.length, size.width);
      tireMarks?.bind(_carPivot, size.length, size.width);
      _finalizeCarLights(_carPivot, size.length, size.width);
    },
    onHue(v) {
      CAR_TUNE.bodyHue = v;
      _bodyMats.forEach(_applyBodyHue);
    },
  });
}

// ─── Physics ─────────────────────────────────────────────────────────────────
function _updatePhysics(dt) {
  if (isRaceActive()) return;

  const gas      = isUp();
  const brake    = isDown();
  const drifting = gas && brake && CAR.speed > 1.2;

  if (drifting) {
    // Builds over ~2.5 s — progressive slide → donuts at full drift
    CAR.drift = Math.min(CAR.drift + dt * 0.4, 1);
    CAR.speed = Math.min(CAR.speed + CAR.accel * 0.38 * dt, CAR.maxVel * 0.82);
  } else {
    CAR.drift = Math.max(CAR.drift - dt * 3.5, 0);

    if (gas && !brake) {
      CAR.speed = Math.min(CAR.speed + CAR.accel * dt, CAR.maxVel);
    } else if (brake && !gas) {
      if (CAR.speed > 0.08) {
        CAR.speed = Math.max(CAR.speed - CAR.decel * dt, 0);
      } else {
        // Progressive reverse — ramps up like forward accel
        CAR.speed = Math.max(CAR.speed - CAR.accel * 0.88 * dt, -CAR.maxVel * 0.48);
      }
    } else {
      CAR.speed -= CAR.speed * CAR.drag * dt;
      if (Math.abs(CAR.speed) < 0.05) CAR.speed = 0;
    }
  }

  if (Math.abs(CAR.speed) > 0.12) {
    const dir = Math.sign(CAR.speed);
    const speedGrip = Math.min(Math.abs(CAR.speed) / (CAR.maxVel * 0.55), 1);
    const driftMul  = drifting ? 1.1 + CAR.drift * CAR.drift * 2.2 : 1;
    const turn      = CAR.steer * speedGrip * driftMul * dir * dt;

    if (isLeft())  CAR.heading -= turn;
    if (isRight()) CAR.heading += turn;
  }

  // Grip falls as drift builds → more slide; low drift stays tame
  const grip = drifting
    ? 9 - CAR.drift * 7
    : 14;
  const slip = _normAngle(CAR.heading - CAR.velAngle);
  CAR.velAngle += slip * Math.min(grip * dt, 1);

  if (drifting) {
    // Slip allowance grows with drift² — donuts only at sustained handbrake
    const maxSlip = CAR.drift * CAR.drift * 2.8;
    const postSlip = _normAngle(CAR.heading - CAR.velAngle);
    if (Math.abs(postSlip) > maxSlip) {
      CAR.velAngle = CAR.heading - Math.sign(postSlip) * maxSlip;
    }
  } else if (!isLeft() && !isRight()) {
    CAR.velAngle += _normAngle(CAR.heading - CAR.velAngle) * Math.min(8 * dt, 1);
  }

  if (Math.abs(CAR.speed) > 0.05) {
    CAR.x += Math.sin(CAR.velAngle) * CAR.speed * dt;
    CAR.z -= Math.cos(CAR.velAngle) * CAR.speed * dt;
  }

  const { w, h } = worldDims();
  const margin = 2;
  if (CAR.x >  w / 2 + margin) CAR.x = -w / 2 - margin;
  if (CAR.x < -w / 2 - margin) CAR.x =  w / 2 + margin;
  if (CAR.z >  h / 2 + margin) CAR.z = -h / 2 - margin;
  if (CAR.z < -h / 2 - margin) CAR.z =  h / 2 + margin;
}

function _applyToMesh(root) {
  root.position.set(CAR.x, 0, CAR.z);
  if (isRaceActive() && RACE.mode !== 'free') {
    // En mode course : lacet (Y) pour la direction, pas de roll/pitch
    root.rotation.order = 'YXZ';
    root.rotation.y = -Math.PI / 2 - RACE.steerAngle * 0.35; // tourne gauche/droite
    root.rotation.z = 0;
    root.rotation.x = 0;
  } else {
    root.rotation.order = 'YXZ';
    root.rotation.y = -Math.PI / 2 - CAR.heading;
    root.rotation.z = 0;
    root.rotation.x = 0;
  }
}

function _initPreludeControls({ onSize, onHue }) {
  if (document.getElementById('prelude-controls')) return;

  const root = document.createElement('div');
  root.id = 'prelude-controls';
  root.innerHTML = `
    <div class="prelude-controls-btn-wrap">
      <button type="button" class="prelude-controls-btn" id="preludeControlsBtn" aria-expanded="false">
        <span class="prelude-controls-label">Prelude Controls</span>
      </button>
      <div class="cover-prelude-controls"></div>
    </div>
    <div class="prelude-controls-panel" id="preludeControlsPanel" hidden>
      <div class="prelude-controls-title">*Prelude Controls</div>
      <p class="prelude-controls-copy">
        Drive my 1999 Honda Prelude with <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd>.
        Hold <kbd>↑</kbd>+<kbd>↓</kbd> to drift — smoke kicks in as you slide.
      </p>
      ${HEADLIGHTS_ENABLED ? `
      <button type="button" class="prelude-lights-btn" id="preludeLightsBtn" aria-pressed="false">
        Headlights off
      </button>
      ` : ''}
      <label class="prelude-range-label">
        <span>Car size</span>
        <span class="prelude-range-val" data-val="size">100%</span>
        <input class="prelude-range" type="range" data-size min="0.72" max="1.35" step="0.01" value="1">
      </label>
      <label class="prelude-range-label">
        <span>Body hue</span>
        <span class="prelude-range-val" data-val="hue">0°</span>
        <input class="prelude-range prelude-range--hue" type="range" data-hue min="0" max="1" step="0.005" value="0">
      </label>
      ${HEADLIGHTS_ENABLED ? `
      <details class="prelude-headlight-dev">
        <summary>Lights position (dev)</summary>
        <p class="prelude-headlight-dev-copy">Tune front + rear lights and lens meshes. Copy JSON below and send the values.</p>
        <p class="prelude-headlight-dev-heading">Headlights</p>
        <div class="prelude-headlight-sliders" data-headlight-sliders></div>
        <p class="prelude-headlight-dev-heading">Taillights</p>
        <div class="prelude-headlight-sliders" data-taillight-sliders></div>
        <pre class="prelude-headlight-dump" id="headlightTuneDump"></pre>
        <button type="button" class="prelude-headlight-copy-btn" id="headlightTuneCopy">Copy values</button>
      </details>
      ` : ''}
    </div>
  `;
  const footer = document.querySelector('footer');
  if (footer) footer.prepend(root);
  else document.body.appendChild(root);

  const btn = root.querySelector('#preludeControlsBtn');
  const panel = root.querySelector('#preludeControlsPanel');
  _lightsBtn = root.querySelector('#preludeLightsBtn');

  const toggle = () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    panel.hidden = open;
  };

  btn.addEventListener('click', toggle);
  if (HEADLIGHTS_ENABLED) {
    _lightsBtn.addEventListener('click', toggleHeadlights);
  }
  document.addEventListener('keydown', e => {
    if (e.code === 'Escape' && btn.getAttribute('aria-expanded') === 'true') toggle();
  });

  const sizeIn = root.querySelector('[data-size]');
  const hueIn = root.querySelector('[data-hue]');
  const sizeVal = root.querySelector('[data-val="size"]');
  const hueVal = root.querySelector('[data-val="hue"]');

  sizeIn.addEventListener('input', () => {
    const v = parseFloat(sizeIn.value);
    sizeVal.textContent = `${Math.round(v * 100)}%`;
    onSize(v);
  });

  hueIn.addEventListener('input', () => {
    const v = parseFloat(hueIn.value);
    hueVal.textContent = `${Math.round(v * 360)}°`;
    hueIn.style.setProperty('--hue', v);
    onHue(v);
  });

  const tuneSliderGroups = HEADLIGHTS_ENABLED ? [
    {
      host: root.querySelector('[data-headlight-sliders]'),
      tune: HEADLIGHT_TUNE,
      onInput: _applyHeadlightTune,
      specs: [
        { key: 'frontFactor', label: 'Front factor', min: 0.2, max: 0.65, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'sideFactor', label: 'Side factor', min: 0.1, max: 0.55, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'y', label: 'Light Y', min: 0, max: 0.45, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'offsetX', label: 'Offset X', min: -0.6, max: 0.6, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'offsetY', label: 'Offset Y', min: -0.25, max: 0.25, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'offsetZ', label: 'Offset Z', min: -0.6, max: 0.6, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'meshX', label: 'Lens mesh X', min: -0.35, max: 0.35, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'meshY', label: 'Lens mesh Y', min: -0.2, max: 0.2, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'meshZ', label: 'Lens mesh Z', min: -0.35, max: 0.35, step: 0.005, fmt: v => v.toFixed(3) },
      ],
    },
    {
      host: root.querySelector('[data-taillight-sliders]'),
      tune: TAILLIGHT_TUNE,
      onInput: _applyTailLightTune,
      specs: [
        { key: 'rearFactor', label: 'Rear factor', min: 0.2, max: 0.65, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'sideFactor', label: 'Side factor', min: 0.1, max: 0.55, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'y', label: 'Light Y', min: 0, max: 0.45, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'offsetX', label: 'Offset X', min: -0.6, max: 0.6, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'offsetY', label: 'Offset Y', min: -0.25, max: 0.25, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'offsetZ', label: 'Offset Z', min: -0.6, max: 0.6, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'meshX', label: 'Lens mesh X', min: -0.35, max: 0.35, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'meshY', label: 'Lens mesh Y', min: -0.2, max: 0.2, step: 0.005, fmt: v => v.toFixed(3) },
        { key: 'meshZ', label: 'Lens mesh Z', min: -0.35, max: 0.35, step: 0.005, fmt: v => v.toFixed(3) },
      ],
    },
  ] : [];

  for (const group of tuneSliderGroups) {
    for (const spec of group.specs) {
      const label = document.createElement('label');
      label.className = 'prelude-range-label';
      const valSpan = document.createElement('span');
      valSpan.className = 'prelude-range-val';
      valSpan.dataset.val = spec.key;
      const title = document.createElement('span');
      title.textContent = spec.label;
      const input = document.createElement('input');
      input.className = 'prelude-range';
      input.type = 'range';
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.value = String(group.tune[spec.key]);
      valSpan.textContent = spec.fmt(group.tune[spec.key]);
      label.append(title, valSpan, input);
      group.host.appendChild(label);
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        group.tune[spec.key] = v;
        valSpan.textContent = spec.fmt(v);
        group.onInput();
      });
    }
  }

  if (HEADLIGHTS_ENABLED) {
    _headlightTuneDumpEl = root.querySelector('#headlightTuneDump');
    _updateHeadlightTuneDump();
    root.querySelector('#headlightTuneCopy')?.addEventListener('click', async () => {
      const text = JSON.stringify({ HEADLIGHT_TUNE, TAILLIGHT_TUNE }, null, 2);
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* fallback: select pre text */
      }
      _headlightTuneDumpEl?.classList.add('is-copied');
      setTimeout(() => _headlightTuneDumpEl?.classList.remove('is-copied'), 1200);
    });
  }

  revealCoverElement(
    root.querySelector('.cover-prelude-controls'),
    root.querySelector('.prelude-controls-btn-wrap'),
  );
}

function _initStartRacerTrigger(_startGate) {
  // Le reveal se fait automatiquement quand la voiture s'approche (dans StartGate.update)
  // On garde juste le trigger HTML pour ses styles CSS
}

function _showHint() {
  if (document.getElementById('car-hint')) return;

  const el = document.createElement('div');
  el.id = 'car-hint';
  // el.innerHTML = 'drive my 1999 Honda Prelude <b>↑ ↓ ← →</b> drive &nbsp;·&nbsp; <b>↑+↓</b> drift &nbsp;·&nbsp; <b>H</b> lights';
  el.innerHTML = 'drive my 1999 Honda Prelude <b>↑ ↓ ← →</b> drive &nbsp;·&nbsp; <b>↑+↓</b> drift &nbsp;·&nbsp; tap <b>START RACE</b>';
  Object.assign(el.style, {
    position: 'fixed', bottom: '1.4rem', left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.11)',
    color: 'rgba(255,255,255,0.5)', padding: '0.3rem 0.9rem',
    borderRadius: '4px', fontFamily: 'Kanit, sans-serif',
    fontSize: '0.8rem', letterSpacing: '0.5px',
    zIndex: '50', pointerEvents: 'none', whiteSpace: 'nowrap',
  });
  document.body.appendChild(el);

  const style = document.createElement('style');
  style.textContent = `#car-hint{animation:_chf 1s ease 5s forwards}
    @keyframes _chf{to{opacity:0}}`;
  document.head.appendChild(style);

  setTimeout(() => { el.remove(); style.remove(); }, 7000);
}
