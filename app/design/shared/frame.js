/*
 * iPhone 17 Pro Max chrome for static artboards (430×932 CSS px).
 * Geometry adapted from huashu-design assets/ios_frame.jsx (status bar, Dynamic Island 124×36 at top 12,
 * home indicator 140×5 at bottom 10), with Pro Max safe areas: top 59 px, bottom 34 px.
 * Do NOT hand-draw these elements in the direction files — add class "screen" + data-shot and this script
 * injects them.  data-chrome="dark" → white status text/indicator (for dark or photo/map backgrounds).
 *
 * Exposes CSS custom properties on every .screen:  --safe-top: 59px; --safe-bottom: 34px.
 * Without ?shot, artboards are laid out side by side for browsing; render.mjs isolates each one.
 */
(function () {
  const css = `
  .screen{position:relative;width:430px;height:932px;overflow:hidden;--safe-top:59px;--safe-bottom:34px;flex:none}
  .ios-status{position:absolute;top:0;left:0;right:0;height:54px;display:flex;align-items:center;justify-content:space-between;
    padding:0 34px 0 40px;font:600 17px/1 -apple-system,"SF Pro Text",system-ui,sans-serif;z-index:90;pointer-events:none;color:#000}
  .ios-island{position:absolute;top:12px;left:50%;transform:translateX(-50%);width:124px;height:36px;background:#000;border-radius:999px;z-index:91}
  .ios-icons{display:flex;align-items:center;gap:6px}
  .ios-sig{display:flex;align-items:flex-end;gap:2px;height:12px}.ios-sig i{width:3px;background:currentColor;border-radius:1px;display:block}
  .ios-sig i.off{opacity:.3}
  .ios-bat{width:26px;height:12px;border:1.5px solid currentColor;border-radius:3px;padding:1px;position:relative;opacity:.85}
  .ios-bat b{display:block;height:100%;background:currentColor;border-radius:1px}
  .ios-bat:after{content:"";position:absolute;top:3px;right:-3.5px;width:2px;height:5px;background:currentColor;border-radius:0 1px 1px 0}
  .ios-home{position:absolute;bottom:9px;left:50%;transform:translateX(-50%);width:140px;height:5px;background:rgba(0,0,0,.55);border-radius:999px;z-index:92;pointer-events:none}
  .screen[data-chrome=dark] .ios-status{color:#fff}.screen[data-chrome=dark] .ios-home{background:rgba(255,255,255,.75)}
  html:not(.shooting) body{display:flex;flex-wrap:wrap;gap:28px;padding:28px;background:#888}
  html:not(.shooting) .screen{border-radius:44px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
  html.shooting body{margin:0;padding:0}`;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  function chrome() {
    document.querySelectorAll('section.screen').forEach((s) => {
      if (s.querySelector('.ios-status')) return;
      const off = s.dataset.signal === 'off'; // offline in the mountains: no bars
      s.insertAdjacentHTML('beforeend',
        `<div class="ios-status"><span>10:42</span><div class="ios-icons">` +
        `<div class="ios-sig"><i style="height:4px"></i><i style="height:6px" class="${off ? 'off' : ''}"></i><i style="height:9px" class="off"></i><i style="height:11px" class="off"></i></div>` +
        `<div class="ios-bat"><b style="width:${s.dataset.battery || 64}%"></b></div></div></div>` +
        `<div class="ios-island"></div><div class="ios-home"></div>`);
    });
    const q = new URLSearchParams(location.search).get('shot');
    if (q) {
      document.documentElement.classList.add('shooting');
      document.querySelectorAll('section.screen').forEach((e) => { e.style.display = e.dataset.shot === q ? '' : 'none'; });
    }
    document.querySelectorAll('section.screen[data-scroll]').forEach((sec) => {
      const sc = sec.querySelector('.scroll'); if (sc) sc.scrollTop = +sec.dataset.scroll;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chrome); else chrome();
})();
