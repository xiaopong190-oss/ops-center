const globalPanel = document.getElementById('global-panel');
globalPanel.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const destination = document.getElementById(link.hash.slice(1));
  if (!destination) return;
  const practice = destination.closest('details');
  if (practice) practice.open = true;
  event.preventDefault();
  globalPanel.hidePopover();
  destination.focus({ preventScroll: true });
  destination.scrollIntoView({ block: 'start' });
});
