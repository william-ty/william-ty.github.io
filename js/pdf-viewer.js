const PDF_URL = 'resume_william_trahay_light.pdf';
const PDFJS_VERSION = '4.8.69';

const section = document.getElementById('simplePortfolio');
const canvas = document.getElementById('pdfCanvas');
const loadingEl = document.getElementById('pdfLoading');
const pageLabel = document.getElementById('pdfPageNum');
const viewportEl = document.getElementById('pdfViewport');
const prevBtn = document.getElementById('pdfPrev');
const nextBtn = document.getElementById('pdfNext');
const zoomOutBtn = document.getElementById('pdfZoomOut');
const zoomInBtn = document.getElementById('pdfZoomIn');

let pdfjsLib = null;
let pdfDoc = null;
let pageNum = 1;
let scale = 1;
let renderTask = null;
let initialized = false;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import(`https://esm.sh/pdfjs-dist@${PDFJS_VERSION}`);
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  return pdfjsLib;
}

function setLoading(isLoading, message) {
  if (!loadingEl) return;
  loadingEl.hidden = !isLoading;
  if (message) loadingEl.textContent = message;
}

function updateControls() {
  if (!pdfDoc || !pageLabel) return;
  pageLabel.textContent = `${pageNum} / ${pdfDoc.numPages}`;
  if (prevBtn) prevBtn.disabled = pageNum <= 1;
  if (nextBtn) nextBtn.disabled = pageNum >= pdfDoc.numPages;
}

async function renderPage() {
  if (!pdfDoc || !canvas || !viewportEl) return;

  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }

  const page = await pdfDoc.getPage(pageNum);
  const unscaled = page.getViewport({ scale: 1 });
  const fitScale = Math.max(0.5, (viewportEl.clientWidth - 8) / unscaled.width);
  scale = fitScale;

  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') throw err;
    return;
  }
  renderTask = null;
  updateControls();
}

async function renderAtScale(targetScale) {
  if (!pdfDoc || !canvas) return;
  scale = targetScale;
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  if (renderTask) {
    renderTask.cancel();
    renderTask = null;
  }
  renderTask = page.render({ canvasContext: ctx, viewport });
  try {
    await renderTask.promise;
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') throw err;
  }
  renderTask = null;
}

async function loadDocument() {
  setLoading(true, 'Chargement du PDF…');
  try {
    const lib = await loadPdfJs();
    pdfDoc = await lib.getDocument(PDF_URL).promise;
    pageNum = 1;
    setLoading(false);
    await renderPage();
  } catch (err) {
    console.error(err);
    setLoading(true, 'Impossible de charger le PDF.');
  }
}

async function ensureReady() {
  if (initialized) {
    if (pdfDoc) await renderPage();
    return;
  }
  initialized = true;
  await loadDocument();
}

export async function showPdfViewer() {
  section?.removeAttribute('hidden');
  await ensureReady();
}

export function hidePdfViewer() {
  section?.setAttribute('hidden', '');
}

prevBtn?.addEventListener('click', async () => {
  if (!pdfDoc || pageNum <= 1) return;
  pageNum -= 1;
  await renderPage();
});

nextBtn?.addEventListener('click', async () => {
  if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
  pageNum += 1;
  await renderPage();
});

zoomInBtn?.addEventListener('click', async () => {
  if (!pdfDoc) return;
  await renderAtScale(scale * 1.15);
});

zoomOutBtn?.addEventListener('click', async () => {
  if (!pdfDoc) return;
  await renderAtScale(Math.max(0.4, scale / 1.15));
});

window.addEventListener('keydown', async (e) => {
  if (section?.hasAttribute('hidden') || !pdfDoc) return;
  if (e.key === 'ArrowLeft' && pageNum > 1) {
    pageNum -= 1;
    await renderPage();
  }
  if (e.key === 'ArrowRight' && pageNum < pdfDoc.numPages) {
    pageNum += 1;
    await renderPage();
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  if (section?.hasAttribute('hidden') || !pdfDoc) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderPage(), 150);
});
