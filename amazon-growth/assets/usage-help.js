(function () {
  function initialize() {
    var guide = document.querySelector('.usage-guide');
    if (!guide) return;
    var host = document.querySelector('.mast-actions') || document.querySelector('.masthead-in');
    if (!host) { guide.style.setProperty('display', 'block', 'important'); return; }
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'growth-usage-trigger';
    button.textContent = '? 使用说明';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'growth-usage-popover');
    button.setAttribute('aria-haspopup', 'dialog');
    var bubble = document.createElement('div');
    bubble.id = 'growth-usage-popover';
    bubble.className = 'growth-usage-popover';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-label', '使用说明');
    bubble.hidden = true;
    while (guide.firstChild) bubble.appendChild(guide.firstChild);
    guide.remove();
    host.appendChild(button);
    document.body.appendChild(bubble);
    var pinned = false, timer;
    function position() {
      var rect = button.getBoundingClientRect();
      var width = Math.min(380, window.innerWidth - 24);
      bubble.style.width = width + 'px';
      bubble.style.left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)) + 'px';
      var top = rect.bottom + 8;
      bubble.style.top = Math.max(12, Math.min(top, window.innerHeight - 100)) + 'px';
      bubble.style.maxHeight = Math.max(80, window.innerHeight - parseFloat(bubble.style.top) - 12) + 'px';
    }
    function show() { clearTimeout(timer); bubble.hidden = false; button.setAttribute('aria-expanded', 'true'); position(); }
    function hide() { clearTimeout(timer); pinned = false; bubble.hidden = true; button.setAttribute('aria-expanded', 'false'); }
    function leave() { clearTimeout(timer); timer = setTimeout(function () { if (!pinned && document.activeElement !== button && !bubble.contains(document.activeElement)) hide(); }, 160); }
    button.addEventListener('mouseenter', show);
    button.addEventListener('mouseleave', leave);
    bubble.addEventListener('mouseenter', function () { clearTimeout(timer); });
    bubble.addEventListener('mouseleave', leave);
    button.addEventListener('focus', show);
    button.addEventListener('blur', leave);
    button.addEventListener('click', function () { if (pinned) hide(); else { pinned = true; show(); } });
    document.addEventListener('click', function (event) { if (!button.contains(event.target) && !bubble.contains(event.target)) hide(); });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !bubble.hidden) { hide(); } });
    function resize() {
      if (!bubble.hidden) position();
      var frame = document.querySelector('.tool-frame');
      if (frame) frame.style.height = Math.max(320, window.innerHeight - frame.getBoundingClientRect().top) + 'px';
    }
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', function () { if (!bubble.hidden) position(); }, true);
    resize();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
