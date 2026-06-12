import { gsap } from 'gsap';

export const messageContent = document.querySelector('#message-content');
export const projectViewTitle = document.querySelector('#project-view-title');

const messageBoxAnimDuration = 0.5;


// Divider Animation
gsap.from('.divider', { delay: 0, width: 0, duration: 0.5, ease: 'power1.out' });


// Hidden Part Animation
['.projects-container', 'header', 'footer'].forEach((sel) => {
  gsap.from(sel, { delay: 0.5, height: 0, minHeight: 0, duration: 0.75, ease: 'power1.out' });
});
gsap.from('header', { delay: 0.5, ease: 'power1.out', paddingTop: 0 });
gsap.from('.projects-container', { delay: 0.5, paddingBottom: 0, ease: 'power1.out' });
gsap.from('.william-ty', { delay: 1.25, opacity: 0, ease: 'power1.out' });


// Horizontal Appear Animation
gsap.from('.logo', { delay: 1.25, width: 0, duration: 1, ease: 'power1.out' });
export const coverTitleAnim = gsap.to('.cover-title', { delay: 1.25, width: 0, duration: 1, ease: 'power1.out' });
gsap.to('.cover', { delay: 1.25, width: 0, duration: 1, ease: 'power1.out' });
gsap.to('.cover-william-ty', { delay: 1.25, width: 0, duration: 0.5, ease: 'power1.out' });
gsap.to('.cover-mode', { delay: 1.25, width: 0, duration: 0.5, ease: 'power1.out' });


/** Wipe reveal — cover slides off to the right, content appears left → right. */
export function revealCoverElement(coverEl, contentEl, { delay = 1.25, duration = 0.5, fade = false } = {}) {
  if (!coverEl) return;
  if (fade && contentEl) {
    gsap.from(contentEl, { delay, opacity: 0, ease: 'power1.out' });
  }
  gsap.set(coverEl, { x: 0 });
  gsap.to(coverEl, { delay, x: '100%', duration, ease: 'power1.out' });
}


// MessageBox Appear
gsap.from('.projects', { delay: 1.25, opacity: 0, duration: 0.2, ease: 'power1.out' });
gsap.from('.border-message-wrapper', { delay: 1.25, width: 0, duration: 1, ease: 'power1.out' });

const messageBoxAnim = gsap.from('.project-message', {
  delay: 2,
  y: 400,
  ease: 'power1.out',
  duration: messageBoxAnimDuration,
});


// MessageBox Text Animation
// Fresh timeline per call — avoids stacking tweens across project switches
let letterAnimTl = null;
const skipTextAnimBtn = document.getElementById('skipTextAnimBtn');

let autoScrollFollow = false;
let suppressScrollEvent = false;
const scrollInterruptBound = new WeakSet();

function findScrollParent(el) {
  let node = el?.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

function bindScrollInterrupt(container) {
  if (!container || scrollInterruptBound.has(container)) return;
  scrollInterruptBound.add(container);

  const stopFollow = () => {
    if (autoScrollFollow) autoScrollFollow = false;
  };

  container.addEventListener('scroll', () => {
    if (suppressScrollEvent || !autoScrollFollow) return;
    autoScrollFollow = false;
  }, { passive: true });

  container.addEventListener('wheel', stopFollow, { passive: true });
  container.addEventListener('touchstart', stopFollow, { passive: true });
}

function followLetterIntoView(letterEl, container) {
  if (!autoScrollFollow || !letterEl || !container) return;

  const margin = 28;
  const elRect = letterEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (elRect.bottom <= containerRect.bottom - margin) return;

  suppressScrollEvent = true;
  container.scrollTop += elRect.bottom - containerRect.bottom + margin;
  requestAnimationFrame(() => {
    suppressScrollEvent = false;
  });
}

function setSkipTextBtnVisible(visible) {
  if (skipTextAnimBtn) skipTextAnimBtn.hidden = !visible;
}

function revealAllLetters() {
  if (!messageContent) return;
  messageContent.querySelectorAll('.text-wrapper').forEach(wrapper => {
    wrapper.textContent = wrapper.textContent;
  });
}

export function skipTextAnimation() {
  if (!letterAnimTl) return;
  letterAnimTl.kill();
  letterAnimTl = null;
  autoScrollFollow = false;
  revealAllLetters();
  setSkipTextBtnVisible(false);
}

if (skipTextAnimBtn) {
  skipTextAnimBtn.addEventListener('click', skipTextAnimation);
}

export const textAnimation = (wrappers, { stagger = 0.03, fadeDuration = 0.1, colorDuration = 1.2, delay = 0.3 } = {}) => {
  if (letterAnimTl) {
    letterAnimTl.kill();
    letterAnimTl = null;
  }

  const scrollContainer = findScrollParent(wrappers[0]) || messageContent;
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    bindScrollInterrupt(scrollContainer);
  }
  autoScrollFollow = true;

  wrappers.forEach(e => {
    e.innerHTML = e.textContent.replace(/\S/g, "<span class='letter'>$&</span>");
  });

  setSkipTextBtnVisible(true);

  const staggerConfig = {
    each: stagger,
    onStart() {
      followLetterIntoView(this.targets()[0], scrollContainer);
    },
  };

  letterAnimTl = gsap.timeline({
    onComplete: () => {
      letterAnimTl = null;
      autoScrollFollow = false;
      setSkipTextBtnVisible(false);
    },
  });
  letterAnimTl
    .from(wrappers.flatMap(w => [...w.querySelectorAll('.letter')]), {
      duration: fadeDuration,
      opacity: 0,
      ease: 'power1.out',
      stagger: staggerConfig,
    }, delay)
    .from(wrappers.flatMap(w => [...w.querySelectorAll('.letter')]), {
      duration: colorDuration,
      color: 'black',
      ease: 'power1.out',
      stagger,
    }, delay);
};

/** Faster letter reveal — used in expanded preview recap. */
export const textAnimationFast = (wrappers) =>
  textAnimation(wrappers, { stagger: 0.012, fadeDuration: 0.05, colorDuration: 0.45, delay: 0.12 });

let welcomeIntroCallback = null;
const pageLoadT = performance.now();

export function setWelcomeIntroCallback(fn) {
  welcomeIntroCallback = fn;
  const remaining = Math.max(0, 2500 - (performance.now() - pageLoadT)) / 1000;
  gsap.delayedCall(remaining || 0.01, () => welcomeIntroCallback?.());
}


// Title Cover Revert
export const revertCover = () => {
  if (!projectViewTitle?.querySelector('.cover-title')) {
    projectViewTitle?.querySelectorAll('h1').forEach(e => e.remove());
    return Promise.resolve();
  }

  return coverTitleAnim.reverse(0.2).then(() => {
    projectViewTitle.querySelectorAll('h1').forEach(e => e.remove());
    // Orphan trailing covers (outside h1) would block the next title at full width
    [...projectViewTitle.children]
      .filter(el => el.classList.contains('cover-title'))
      .forEach(el => el.remove());
  });
};


// MessageBox Revert & Replace
// Fresh timeline per call — avoids stacking stutter tweens
export const revertMessageBox = () => {
  if (letterAnimTl) {
    letterAnimTl.kill();
    letterAnimTl = null;
  }
  autoScrollFollow = false;
  setSkipTextBtnVisible(false);

  return revertCover()
    .then(() => messageBoxAnim.reverse())
    .then(() => {
      messageContent.innerHTML = '';
      const stutterTl = gsap.timeline();
      return stutterTl
        .to('.border-message-wrapper', {
          duration: 0.1,
          opacity: 0.2,
          repeat: 3,
          stagger: 0.1,
        })
        .to('.border-message-wrapper', { opacity: 1 })
        .then(() => messageBoxAnim.play(0.1));
    });
};


// Preview Box Lines Animation
export const previewBox = document.querySelector('.project-view-preview');
const diagLine = document.querySelector('.diag-line');
const topLine = document.querySelector('.top-line');
const leftLine = document.querySelector('.left-line');
const diagLine2 = document.querySelector('.diag-line2');
const rightLine = document.querySelector('.right-line');
const bottomLine = document.querySelector('.bottom-line');
const backgroundPreview = document.querySelector('.background-preview');
const linesDuration = 0.2;

export const linesAnimation = (delayLines = 0) => {
  const lines = [leftLine, rightLine, topLine, bottomLine, diagLine, diagLine2];
  const flickerTl = gsap.timeline();

  const tl4 = gsap.timeline({
    onComplete() {
      // Release pixel values so CSS percentages take over (layout-responsive)
      gsap.set(lines, { clearProps: 'width,height' });
    },
  });

  tl4
    .from(leftLine, { delay: delayLines, height: 0, duration: linesDuration, ease: 'power1.out' })
    .from(rightLine, { height: 0, duration: linesDuration, ease: 'power1.out' }, `>-${linesDuration}`)
    .from(topLine, { width: 0, duration: linesDuration, ease: 'power1.out' })
    .from(bottomLine, { width: 0, duration: linesDuration, ease: 'power1.out' }, `>-${linesDuration}`)
    .from(diagLine, { width: 0, duration: linesDuration, ease: 'power1.out' })
    .from(diagLine2, { width: 0, duration: linesDuration, ease: 'power1.out' })
    .to(previewBox, { backgroundColor: 'white', duration: 0.3 })
    .add(() => {
      flickerTl
        .to(previewBox, { duration: 0.1, opacity: 0.9, repeat: 3 })
        .to(previewBox, { opacity: 1, duration: 0.5 });
    })
    .to(backgroundPreview, { opacity: 1, duration: 0.3 }, `>${0.8}`);

  return tl4;
};

linesAnimation(2.5);


// Flying Banner — vertical ticker (desktop) ou horizontal ticker (mobile ≤ 767px)
const bannerEl = document.querySelector('.flying-banner');
const BANNER_SCROLL_SPEED = 78; // px/s

requestAnimationFrame(() => {
  const isMobile = window.matchMedia('(max-width: 767px)').matches;

  if (isMobile) {
    // Bandeau horizontal : on anime x
    const loopW = Math.ceil(bannerEl.scrollWidth / 2);
    const duration = loopW / BANNER_SCROLL_SPEED;

    gsap.to(bannerEl, { delay: 0.5, opacity: 1, duration: 1.5 });
    gsap.set(bannerEl, { x: 0 });
    gsap.to(bannerEl, {
      delay: 0.5,
      x: -loopW,
      duration,
      ease: 'none',
      repeat: -1,
    });
  } else {
    // Bandeau vertical (writing-mode: vertical-rl) : on anime y
    const loopH = Math.ceil(bannerEl.scrollHeight / 2);
    const duration = loopH / BANNER_SCROLL_SPEED;

    gsap.to(bannerEl, { delay: 2, opacity: 1, duration: 2.5 });
    gsap.set(bannerEl, { y: 0 });
    gsap.to(bannerEl, {
      delay: 2,
      y: -loopH,
      duration,
      ease: 'none',
      repeat: -1,
    });
  }
});
