/* Load Packs HTML card view after desk-needs defines filesHtml. */
(function () {
  function go() {
    if (document.querySelector('script[data-aia-desk-html-view]')) return;
    var el = document.createElement('script');
    el.src = '/desk-html-view.js';
    el.setAttribute('data-aia-desk-html-view', '1');
    document.body.appendChild(el);
  }
  function wait() {
    if (document.querySelector('script[data-aia-desk-needs]')) { go(); return; }
    if ((wait.n = (wait.n || 0) + 1) > 80) { go(); return; }
    setTimeout(wait, 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wait);
  else wait();
})();
