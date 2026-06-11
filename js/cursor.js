const cursorEl = document.querySelector('[data-custom-cursor]');

if (cursorEl) {
  window.addEventListener('mousemove', (e) => {
    cursorEl.style.transform = `matrix(1, 0, 0, 1, ${e.clientX}, ${e.clientY})`;
  });

  document.querySelectorAll('img').forEach(img => {
    img.addEventListener('mouseenter', () => cursorEl.classList.add('custom-cursor-active-img'));
    img.addEventListener('mouseleave', () => cursorEl.classList.remove('custom-cursor-active-img'));
  });
}

export { cursorEl };
