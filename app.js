const menu = document.querySelector('.mobile-menu');
const nav = document.querySelector('#primary-nav');
if (menu && nav) {
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) {
      menu.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
    }
  });
}
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();