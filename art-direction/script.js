const progress = document.querySelector('#progress-bar');
const nav = document.querySelector('#main-nav');
const toggle = document.querySelector('.nav-toggle');
const navLinks = [...document.querySelectorAll('#main-nav a')];
const links = [...document.querySelectorAll('.document-nav a[href^="#"]')];
const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);

function updateProgress() {
  const root = document.documentElement;
  const distance = root.scrollHeight - root.clientHeight;
  if (progress) progress.style.width = `${distance > 0 ? (root.scrollTop / distance) * 100 : 0}%`;
}

toggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});

navLinks.forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle?.setAttribute('aria-expanded', 'false');
}));

const observer = new IntersectionObserver(entries => {
  const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  links.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
}, { rootMargin: '-25% 0px -60% 0px', threshold: [0, .15, .5] });

sections.forEach(section => observer.observe(section));
window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);
updateProgress();
