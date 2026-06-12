import { gsap } from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { textAnimationFast } from './gsap/gsap_main.js';

let scene, camera, renderer, orbitControls, pointCloud, imagePlane, imageData, sourceCanvas;
let hideWhite = false;
let step = 20;
let pointSize = 10;
let depthLayers = 0.3;
let isRotating = true;
let showReferenceImage = true;
let colorSensitivity = 73;
let viewMode = 'points';
let parallaxBound = false;
let pendingRecapParagraphs = null;
let loadProgressTimer = null;
let loaderHideTimer = null;
let loaderFinishTimer = null;
let loaderShownAt = 0;
let loadGeneration = 0;
let slideImages = [];
let slideIndex = 0;
let currentProject = null;
let slidesBound = false;

const FILL_MAX_Z = 120;
const FILL_LAYER_STEP = 4;
const MIN_LOADER_MS = 850;

export function initVisualizer() {
  const canvasWrapper = document.getElementById('canvasWrapper');
  const previewVisual = document.getElementById('previewVisual');
  if (!canvasWrapper || !previewVisual) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, previewVisual.clientWidth / previewVisual.clientHeight, 0.1, 5000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

  _resizeRenderer();
  previewVisual.appendChild(renderer.domElement);

  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enablePan = false;
  camera.position.set(-5, 200, 2200);

  window.addEventListener('resize', () => {
    _resizeRenderer();
    if (pointCloud && viewMode === 'points') _updatePointCloud();
  });

  _bindControls();
  _initParallax();
  _initSlides();
  document.getElementById('controls')?.addEventListener('click', (e) => e.stopPropagation());
  document.querySelector('.preview-recap-wrapper')?.addEventListener('click', (e) => e.stopPropagation());
  _initExpansion();
  _animate();
}

const loaderBar = () => document.getElementById('previewLoaderBar');
const loaderEl = () => document.getElementById('previewLoader');

function _setLoadProgress(percent) {
  const bar = loaderBar();
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function _showLoader() {
  const loader = loaderEl();
  if (!loader) return;

  if (loaderHideTimer) {
    clearTimeout(loaderHideTimer);
    loaderHideTimer = null;
  }

  const alreadyActive = loader.classList.contains('is-active');
  loader.classList.add('is-active');
  loader.setAttribute('aria-hidden', 'false');

  if (loadProgressTimer) clearInterval(loadProgressTimer);

  if (!alreadyActive) {
    loaderShownAt = Date.now();
    _setLoadProgress(6);
  } else {
    const current = parseFloat(loaderBar()?.style.width);
    _setLoadProgress(Number.isFinite(current) ? Math.max(6, current) : 12);
  }

  let fake = alreadyActive ? 18 : 6;
  loadProgressTimer = setInterval(() => {
    fake = Math.min(fake + Math.random() * 7, 86);
    _setLoadProgress(fake);
  }, 140);
}

function _hideLoader() {
  if (loadProgressTimer) {
    clearInterval(loadProgressTimer);
    loadProgressTimer = null;
  }
  if (loaderFinishTimer) {
    clearTimeout(loaderFinishTimer);
    loaderFinishTimer = null;
  }
  if (loaderHideTimer) {
    clearTimeout(loaderHideTimer);
    loaderHideTimer = null;
  }
  _setLoadProgress(100);
  const loader = loaderEl();
  if (!loader) return;
  loader.classList.remove('is-active');
  loader.setAttribute('aria-hidden', 'true');
  _setLoadProgress(0);
  loaderShownAt = 0;
}

function _clearSceneVisual() {
  if (pointCloud && scene) {
    scene.remove(pointCloud);
    pointCloud.geometry?.dispose();
    pointCloud.material?.dispose();
    pointCloud = null;
  }
  if (imagePlane && scene) {
    scene.remove(imagePlane);
    imagePlane.geometry?.dispose();
    imagePlane.material?.map?.dispose();
    imagePlane.material?.dispose();
    imagePlane = null;
  }
  imageData = null;
  sourceCanvas = null;

  const parallaxImg = document.getElementById('parallaxImage');
  if (parallaxImg) {
    parallaxImg.removeAttribute('src');
    parallaxImg.alt = '';
  }

  renderer?.render(scene, camera);
}

function _beginPreviewLoad() {
  _showLoader();
  _clearSceneVisual();
  const cw = document.getElementById('canvasWrapper');
  cw?.classList.add('is-loading', 'visible');
}

function _finishPreviewLoad(generation) {
  if (loaderFinishTimer) clearTimeout(loaderFinishTimer);
  if (loaderHideTimer) clearTimeout(loaderHideTimer);

  const run = () => {
    if (generation !== loadGeneration) return;

    if (loadProgressTimer) {
      clearInterval(loadProgressTimer);
      loadProgressTimer = null;
    }
    _setLoadProgress(100);

    loaderHideTimer = setTimeout(() => {
      if (generation !== loadGeneration) return;
      document.getElementById('canvasWrapper')?.classList.remove('is-loading');
      _hideLoader();
    }, 400);
  };

  const elapsed = Date.now() - (loaderShownAt || Date.now());
  const wait = Math.max(0, MIN_LOADER_MS - elapsed);
  loaderFinishTimer = setTimeout(run, wait);
}

/** Affiche le loader immédiatement (appelé au clic, avant les animations texte). */
export function startPreviewLoad() {
  loadGeneration++;
  _beginPreviewLoad();
}

function _createWebsiteLink(website) {
  if (!website) return null;
  const url = website.startsWith('http') ? website : `https://${website}`;
  const link = document.createElement('a');
  link.className = 'project-website-link preview-website-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Visit website →';
  return link;
}

function _prepareRecap(project) {
  const titleEl = document.getElementById('previewRecapTitle');
  const contentEl = document.getElementById('preview-recap-content');
  if (!titleEl || !contentEl || !project) return;

  titleEl.textContent = project.name;
  titleEl.style.opacity = '0';
  titleEl.style.visibility = 'hidden';
  contentEl.replaceChildren();

  pendingRecapParagraphs = (project.descriptions || []).map(text => {
    const p = document.createElement('p');
    p.className = 'text-wrapper preview-text-wrapper';
    p.style.visibility = 'hidden';
    p.appendChild(document.createTextNode(text));
    return p;
  });

  pendingRecapParagraphs.forEach(p => contentEl.appendChild(p));

  const websiteLink = _createWebsiteLink(project.website);
  if (websiteLink) {
    websiteLink.style.visibility = 'hidden';
    contentEl.appendChild(websiteLink);
  }
}

function _playRecapAnimation() {
  const titleEl = document.getElementById('previewRecapTitle');
  const contentEl = document.getElementById('preview-recap-content');
  if (!pendingRecapParagraphs?.length && !titleEl) return;

  if (titleEl) {
    titleEl.style.visibility = '';
    gsap.fromTo(titleEl, { opacity: 0, y: 14 }, {
      opacity: 1,
      y: 0,
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => {
        if (!pendingRecapParagraphs?.length) return;
        pendingRecapParagraphs.forEach(p => {
          p.style.visibility = '';
        });
        const websiteLink = contentEl?.querySelector('.preview-website-link');
        if (websiteLink) websiteLink.style.visibility = '';
        textAnimationFast(pendingRecapParagraphs);
      },
    });
  }
}

function _updateSlideUI() {
  const slidesEl = document.getElementById('previewSlides');
  const counterEl = document.getElementById('previewSlideCounter');
  const prevBtn = document.getElementById('previewSlidePrev');
  const nextBtn = document.getElementById('previewSlideNext');
  const hasSlides = slideImages.length > 1;

  if (slidesEl) {
    slidesEl.hidden = !hasSlides;
    slidesEl.classList.toggle('is-active', hasSlides);
  }
  if (counterEl && hasSlides) {
    counterEl.textContent = `${slideIndex + 1} / ${slideImages.length}`;
  }
  if (prevBtn) prevBtn.disabled = !hasSlides;
  if (nextBtn) nextBtn.disabled = !hasSlides;
}

function _initSlides() {
  if (slidesBound) return;
  const prevBtn = document.getElementById('previewSlidePrev');
  const nextBtn = document.getElementById('previewSlideNext');
  const slidesEl = document.getElementById('previewSlides');

  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slideImages.length <= 1) return;
    slideIndex = (slideIndex - 1 + slideImages.length) % slideImages.length;
    _loadSlideImage(slideImages[slideIndex]);
  });

  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slideImages.length <= 1) return;
    slideIndex = (slideIndex + 1) % slideImages.length;
    _loadSlideImage(slideImages[slideIndex]);
  });

  slidesEl?.addEventListener('click', (e) => e.stopPropagation());
  slidesBound = true;
}

function _loadSlideImage(imagePath) {
  if (!imagePath || !scene) return;

  const generation = ++loadGeneration;
  _beginPreviewLoad();
  _updateSlideUI();
  _setViewMode('points');

  const parallaxImg = document.getElementById('parallaxImage');
  if (parallaxImg) {
    parallaxImg.src = imagePath;
    parallaxImg.alt = currentProject?.name || 'Project preview';
  }

  const img = new Image();
  img.onload = function () {
    if (generation !== loadGeneration) return;

    _setLoadProgress(42);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
    ctx.drawImage(img, 0, 0);
    sourceCanvas = canvas;
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    _setLoadProgress(58);
    _updateReferenceImage();
    _updatePointCloud();
    _setLoadProgress(95);
    _finishPreviewLoad(generation);
    _toggleCanvas(true);

    _whenPreviewReady(() => {
      if (generation !== loadGeneration) return;
      _syncPreviewLayout();
    });
  };

  img.onerror = () => {
    if (generation !== loadGeneration) return;
    _finishPreviewLoad(generation);
  };

  img.src = imagePath;
}

export function loadProject(images, project) {
  const paths = Array.isArray(images) ? images : [images];
  if (!paths.length || !scene) return;

  currentProject = project;
  slideImages = paths;
  slideIndex = 0;

  _prepareRecap(project);
  _loadSlideImage(paths[0]);
}

export function closePreview() {
  loadGeneration++;
  slideImages = [];
  slideIndex = 0;
  currentProject = null;
  _updateSlideUI();
  _toggleCanvas(false);
}

function _initParallax() {
  if (parallaxBound) return;
  const card = document.getElementById('originalParallax');
  const inner = card?.querySelector('.parallax-card-inner');
  if (!card || !inner) return;

  card.addEventListener('mousemove', (e) => {
    if (viewMode !== 'original') return;
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    inner.style.transform = `rotateY(${x * 22}deg) rotateX(${-y * 22}deg)`;
  });

  card.addEventListener('mouseleave', () => {
    inner.style.transform = 'rotateY(0deg) rotateX(0deg)';
  });

  parallaxBound = true;
}

function _setViewMode(mode) {
  viewMode = mode;
  const isOriginal = mode === 'original';
  const parallax = document.getElementById('originalParallax');
  const canvasEl = renderer?.domElement;
  const toggleBtn = document.getElementById('toggleViewMode');
  const controls = document.getElementById('controls');

  canvasEl?.classList.toggle('is-hidden', isOriginal);
  parallax?.classList.toggle('is-active', isOriginal);
  controls?.classList.toggle('points-only-hidden', isOriginal);

  if (toggleBtn) {
    toggleBtn.textContent = isOriginal ? 'Points View' : 'Original View';
    toggleBtn.setAttribute('aria-pressed', String(isOriginal));
  }

  if (pointCloud) pointCloud.visible = !isOriginal;
  if (imagePlane) imagePlane.visible = !isOriginal && showReferenceImage;

  _resizeRenderer();
}

function _syncPreviewLayout() {
  if (scene) scene.rotation.set(0, 0, 0);
  _resizeRenderer();
  if (imageData && viewMode === 'points') {
    _updatePointCloud();
  }
  renderer?.render(scene, camera);
}

/** Wait until the preview wrapper finished opening (CSS width transition + layout). */
function _whenPreviewReady(callback) {
  const cw = document.getElementById('canvasWrapper');
  const previewVisual = document.getElementById('previewVisual');
  if (!cw || !previewVisual) return;

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    requestAnimationFrame(() => requestAnimationFrame(callback));
  };

  if (!cw.classList.contains('visible')) {
    finish();
    return;
  }

  const onTransitionEnd = (e) => {
    if (e.target === cw && e.propertyName === 'width') finish();
  };

  cw.addEventListener('transitionend', onTransitionEnd);
  setTimeout(() => {
    cw.removeEventListener('transitionend', onTransitionEnd);
    finish();
  }, 520);

  requestAnimationFrame(() => {
    if (previewVisual.clientWidth > 80 && previewVisual.clientHeight > 24) finish();
  });
}

function _refreshViewport() {
  _whenPreviewReady(_syncPreviewLayout);
}

function _resizeRenderer() {
  const previewVisual = document.getElementById('previewVisual');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const target = previewVisual || canvasWrapper;
  if (!target || !renderer || !camera) return;

  const w = Math.max(target.clientWidth, 1);
  const h = Math.max(target.clientHeight, 1);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function _bindControls() {
  document.getElementById('toggleViewMode')?.addEventListener('click', function () {
    _setViewMode(viewMode === 'original' ? 'points' : 'original');
  });

  document.getElementById('toggleWhite')?.addEventListener('click', function () {
    hideWhite = !hideWhite;
    this.textContent = hideWhite ? 'Show Original Colors' : 'Show All White Points';
    if (imageData) _updatePointCloud();
  });

  document.getElementById('stepSlider')?.addEventListener('input', function () {
    step = parseInt(this.value, 10);
    const el = document.getElementById('stepValue');
    if (el) el.textContent = step;
    if (imageData) _updatePointCloud();
  });

  document.getElementById('sizeSlider')?.addEventListener('input', function () {
    pointSize = parseFloat(this.value);
    const el = document.getElementById('sizeValue');
    if (el) el.textContent = pointSize;
    if (pointCloud?.material) {
      pointCloud.material.size = pointSize;
      pointCloud.material.needsUpdate = true;
    }
  });

  document.getElementById('depthLayersSlider')?.addEventListener('input', function () {
    depthLayers = parseFloat(this.value);
    const el = document.getElementById('depthLayersValue');
    if (el) el.textContent = depthLayers.toFixed(1);
    if (imageData) _updatePointCloud();
  });

  document.getElementById('colorSensitivitySlider')?.addEventListener('input', function () {
    colorSensitivity = parseInt(this.value, 10);
    const el = document.getElementById('colorSensitivityValue');
    if (el) el.textContent = colorSensitivity;
    if (imageData) _updatePointCloud();
  });

  document.getElementById('toggleRotate')?.addEventListener('click', function () {
    isRotating = !isRotating;
    this.textContent = isRotating ? 'Stop Rotation' : 'Start Rotation';
  });

  document.getElementById('toggleReferenceImage')?.addEventListener('click', function () {
    showReferenceImage = !showReferenceImage;
    this.textContent = showReferenceImage ? 'Hide Reference Image' : 'Show Reference Image';
    if (imagePlane) imagePlane.visible = showReferenceImage && viewMode === 'points';
  });
}

function _getFillParams() {
  const layerStep = Math.max(FILL_LAYER_STEP, step);
  const maxZ = Math.min(FILL_MAX_Z, layerStep * Math.max(3, Math.round(100 / step)));
  return { layerStep, maxZ };
}

function _getBrightnessThreshold() {
  return Math.round(255 * (1 - colorSensitivity / 100));
}

function _createBlurredCanvas(sourceCanvas, blurPx = 8) {
  const blurred = document.createElement('canvas');
  blurred.width = sourceCanvas.width;
  blurred.height = sourceCanvas.height;
  const ctx = blurred.getContext('2d');
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(sourceCanvas, 0, 0);
  return blurred;
}

function _updateReferenceImage() {
  if (!scene || !sourceCanvas) return;

  if (imagePlane) {
    scene.remove(imagePlane);
    imagePlane.geometry.dispose();
    imagePlane.material.map?.dispose();
    imagePlane.material.dispose();
    imagePlane = null;
  }

  const blurredCanvas = _createBlurredCanvas(sourceCanvas, 10);
  const texture = new THREE.CanvasTexture(blurredCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  const { maxZ } = _getFillParams();
  const geometry = new THREE.PlaneGeometry(sourceCanvas.width, sourceCanvas.height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  imagePlane = new THREE.Mesh(geometry, material);
  imagePlane.position.set(0, 0, maxZ * 0.5);
  imagePlane.visible = showReferenceImage && viewMode === 'points';
  scene.add(imagePlane);
}

function _updatePointCloud() {
  if (!scene || !imageData || viewMode !== 'points') return;
  if (pointCloud) scene.remove(pointCloud);

  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];
  const randomOffset = 0.4;
  const { layerStep, maxZ } = _getFillParams();
  const brightnessThreshold = _getBrightnessThreshold();

  for (let y = 0; y < imageData.height; y += step) {
    for (let x = 0; x < imageData.width; x += step) {
      const i = (y * imageData.width + x) * 4;
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      if (a < 40) continue;

      const brightness = (r + g + b) / 3;
      const z = -(brightness - 128) * depthLayers;

      if (brightness > brightnessThreshold) {
        for (let layer = 0; layer <= maxZ; layer += layerStep) {
          vertices.push(
            x - imageData.width / 2 + (Math.random() - 0.5) * randomOffset,
            y - imageData.height / 2 + (Math.random() - 0.5) * randomOffset,
            z + layer,
          );
          if (hideWhite) {
            colors.push(1, 1, 1);
          } else {
            colors.push(r / 255, g / 255, b / 255);
          }
        }
      }
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: pointSize,
    sizeAttenuation: true,
    vertexColors: true,
  });
  pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);

  if (imagePlane) {
    imagePlane.position.z = _getFillParams().maxZ * 0.5;
  }

  _adjustCamera();
}

function _adjustCamera() {
  if (!imageData || !camera || !orbitControls) return;

  const { maxZ } = _getFillParams();
  const width = imageData.width;
  const height = imageData.height;
  const depthExtent = maxZ + 128 * depthLayers;
  const center = new THREE.Vector3(0, 0, maxZ * 0.5);
  const maxDim = Math.max(width, height, depthExtent);
  const fitH = maxDim / (2 * Math.atan((Math.PI * camera.fov) / 360));
  const dist = Math.max(fitH, fitH / camera.aspect) * 1.15 * 0.85;

  orbitControls.target.copy(center);
  orbitControls.minDistance = dist;
  orbitControls.maxDistance = dist;
  camera.position.set(center.x, center.y * 0.15, center.z + dist);
  camera.lookAt(center);
  orbitControls.update();
}

function _animate() {
  requestAnimationFrame(_animate);
  orbitControls?.update();
  if (isRotating && scene && viewMode === 'points') {
    scene.rotation.y -= (Math.PI * 2) / (3 * 300);
  }
  renderer?.render(scene, camera);
}

let canvasPlaceholder = null;

function _moveCanvasToBody() {
  const cw = document.getElementById('canvasWrapper');
  if (!cw || cw.parentNode === document.body) return;
  canvasPlaceholder = document.createComment('canvasWrapper-anchor');
  cw.parentNode.insertBefore(canvasPlaceholder, cw);
  document.body.appendChild(cw);
}

function _restoreCanvasFromBody() {
  const cw = document.getElementById('canvasWrapper');
  if (!cw || !canvasPlaceholder?.parentNode) return;
  canvasPlaceholder.parentNode.insertBefore(cw, canvasPlaceholder);
  canvasPlaceholder.remove();
  canvasPlaceholder = null;
}

function _toggleCanvas(show) {
  const cw = document.getElementById('canvasWrapper');
  const overlay = document.querySelector('.overlay');
  if (!cw) return;
  if (show) {
    cw.classList.add('visible');
    _whenPreviewReady(_syncPreviewLayout);
  } else {
    cw.classList.remove('visible', 'expanded', 'is-loading');
    overlay?.classList.remove('active');
    _restoreCanvasFromBody();
    _hideLoader();
    _setViewMode('points');
  }
}

function _toggleExpansion() {
  const cw = document.getElementById('canvasWrapper');
  if (!cw) return;
  const willExpand = !cw.classList.contains('expanded');
  cw.classList.toggle('expanded');
  document.querySelector('.overlay')?.classList.toggle('active');
  if (willExpand) {
    _moveCanvasToBody();
    _resizeRenderer();
    _refreshViewport();
    setTimeout(() => _playRecapAnimation(), 420);
  } else {
    _restoreCanvasFromBody();
    const titleEl = document.getElementById('previewRecapTitle');
    if (titleEl) {
      titleEl.style.opacity = '0';
      titleEl.style.visibility = 'hidden';
    }
    pendingRecapParagraphs?.forEach(p => {
      p.style.visibility = 'hidden';
    });
    _resizeRenderer();
    _refreshViewport();
  }
}

function _initExpansion() {
  const cw = document.getElementById('canvasWrapper');
  const previewVisual = document.getElementById('previewVisual');
  if (!cw || !previewVisual) return;

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  document.body.appendChild(overlay);

  previewVisual.addEventListener('click', () => {
    const cw = document.getElementById('canvasWrapper');
    if (cw && !cw.classList.contains('expanded')) {
      _toggleExpansion();
    }
  });
  overlay.addEventListener('click', _toggleExpansion);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cw.classList.contains('expanded')) {
      _toggleExpansion();
      _toggleCanvas(false);
    }
  });
}
