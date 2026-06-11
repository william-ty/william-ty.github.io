import { gsap } from 'gsap';
import './cursor.js';
import { initCarDrive } from './car-drive.js';
import {
  textAnimation,
  messageContent,
  revertMessageBox,
  projectViewTitle,
  coverTitleAnim,
} from './gsap/gsap_main.js';
import portfolioData from './projects.json';
import { initVisualizer, loadProject, closePreview } from './three-visualizer.js';

const cursorEl = document.querySelector('[data-custom-cursor]');

// Flat lookup of every item (projects + experiences) by id
const itemsById = new Map();
[...(portfolioData.projects || []), ...(portfolioData.experiences || [])].forEach(item => {
  itemsById.set(String(item.id), item);
});

// Build the clickable buttons for one list from JSON
const renderList = (items, container) => {
  if (!container) return;
  container.replaceChildren();
  (items || []).filter(item => !item.hidden).forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.type = 'button';
    btn.dataset.projectId = String(item.id);
    if (item.images?.length) btn.dataset.images = JSON.stringify(item.images);
    else if (item.image) btn.dataset.image = item.image;
    btn.textContent = item.name;
    container.appendChild(btn);
  });
};

renderList(portfolioData.projects, document.querySelector('[data-list="projects"]'));
renderList(portfolioData.experiences, document.querySelector('[data-list="experience"]'));

const buttons = document.querySelectorAll('.btn');

const createWebsiteLink = website => {
  if (!website) return null;
  const url = website.startsWith('http') ? website : `https://${website}`;
  const link = document.createElement('a');
  link.className = 'project-website-link';
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Visit website →';
  return link;
};

const getItemImages = item => {
  if (item?.images?.length) return item.images;
  if (item?.image) return [item.image];
  return null;
};

const showItem = async button => {
  button.classList.toggle('active');
  buttons.forEach(b => {
    if (b !== button) b.classList.remove('active');
  });

  const item = itemsById.get(button.dataset.projectId);
  if (!item) return;

  const descs = await revertMessageBox().then(() => {
    const h1 = document.createElement('h1');
    h1.appendChild(document.createTextNode(item.name));
    projectViewTitle.appendChild(h1);

    const paragraphs = item.descriptions.map(text => {
      const p = document.createElement('p');
      p.setAttribute('class', 'text-wrapper');
      p.appendChild(document.createTextNode(text));
      return p;
    });

    paragraphs.forEach(p => messageContent.appendChild(p));

    const websiteLink = createWebsiteLink(item.website);
    if (websiteLink) messageContent.appendChild(websiteLink);

    return paragraphs;
  });

  textAnimation(descs);

  const images = getItemImages(item);
  if (images?.length) loadProject(images, item);
  else closePreview();
};

buttons.forEach(button => {
  button.addEventListener('click', () => showItem(button));
});

// Tabs: slide Projects ↔ Experience
const tabs = document.querySelectorAll('.projects-tab');
const projectsList = document.querySelector('[data-list="projects"]');
const experienceList = document.querySelector('[data-list="experience"]');

let activeTab = 'projects';
let tabAnimating = false;

const setListActive = tab => {
  projectsList?.classList.toggle('is-active', tab === 'projects');
  experienceList?.classList.toggle('is-active', tab === 'experience');
};

if (projectsList && experienceList) {
  gsap.set(projectsList, { xPercent: 0, opacity: 1, scale: 1 });
  gsap.set(experienceList, { xPercent: 100, opacity: 0, scale: 0.98 });
  setListActive('projects');
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (!target || target === activeTab || tabAnimating) return;

    const goingToExperience = activeTab === 'projects';
    const outgoing = goingToExperience ? projectsList : experienceList;
    const incoming = goingToExperience ? experienceList : projectsList;
    if (!outgoing || !incoming) return;

    tabAnimating = true;
    tabs.forEach(t => t.classList.toggle('active', t === tab));

    const outX = goingToExperience ? -100 : 100;
    const inFromX = goingToExperience ? 100 : -100;

    gsap.timeline({
      onComplete: () => {
        activeTab = target;
        setListActive(target);
        tabAnimating = false;
      },
    })
      .to(outgoing, {
        xPercent: outX,
        opacity: 0,
        scale: 0.97,
        duration: 0.52,
        ease: 'power3.inOut',
      }, 0)
      .fromTo(
        incoming,
        { xPercent: inFromX, opacity: 0, scale: 0.97 },
        { xPercent: 0, opacity: 1, scale: 1, duration: 0.52, ease: 'power3.inOut' },
        0,
      )
      .from(incoming.querySelectorAll('.btn'), {
        x: 18,
        opacity: 0,
        stagger: 0.022,
        duration: 0.32,
        ease: 'power2.out',
      }, 0.18);
  });
});

const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;

// Sur mobile : ni voiture ni visualizer 3D (économie mémoire/batterie)
// Le visualizer thumbnail est masqué par CSS sur mobile, pas besoin de le charger.
if (!isMobileViewport) {
  initVisualizer();
  initCarDrive();
}

// Bascule Home ↔ Simple au survol + clic sur → Simple ? / → Home
const modeToggleBtn = document.getElementById('modeToggleBtn');
const modeToggleLabel = document.getElementById('modeToggleLabel');
const modeName = document.getElementById('modeName');

const blinkModeName = () => {
  modeName.classList.remove('is-blinking');
  void modeName.offsetWidth;
  modeName.classList.add('is-blinking');
  modeName.addEventListener('animationend', () => {
    modeName.classList.remove('is-blinking');
  }, { once: true });
};

const setSiteMode = (mode) => {
  const isSimple = mode === 'simple';
  modeName.textContent = isSimple ? 'Simple' : 'Home';
  modeToggleLabel.innerHTML = isSimple ? 'Home' : 'Simple&nbsp;?';
  modeToggleBtn.title = isSimple
    ? 'Revenir au mode Home'
    : 'Passer en mode portfolio simple';
  document.body.classList.toggle('simple-mode', isSimple);
  blinkModeName();
};

if (modeToggleBtn && modeName && modeToggleLabel) {
  modeToggleBtn.addEventListener('click', () => {
    setSiteMode(document.body.classList.contains('simple-mode') ? 'home' : 'simple');
  });
}


// Hide/show custom cursor when hovering project buttons
buttons.forEach(b => {
  b.addEventListener('mouseenter', () => {
    if (cursorEl) {
      cursorEl.style.transform = 'scale(0)';
      cursorEl.style.opacity = '0';
    }
  });

  b.addEventListener('mouseleave', () => {
    if (cursorEl) {
      cursorEl.style.transform = 'scale(1)';
      cursorEl.style.opacity = '1';
    }
  });
});
