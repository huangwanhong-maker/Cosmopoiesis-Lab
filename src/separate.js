// Figures that leave their display (decision 0009): a figure separated is moved, as it is, into a window
// of its own over the world, and docked back into the place it left.
//
// It is moved, not copied, so that it keeps its state, its listeners and its updates: the field's cube
// still turns and is filled again when the field is read again, the rover's map still follows the rover.
// Its place keeps a note with a key to bring it back. A window is dragged by its bar, resized from its
// corner, enlarged to the stage between the two displays and back, and brought to the front when touched;
// it is not a pop-up: it opens only when asked and stays until docked. Where each window was is
// remembered in the browser, and a page whose figure is out counts as shown, so that it keeps it current.
//
// The geometry is pure (placement), so that it can be checked: a window is kept on the screen with at
// least its bar reachable, and a new one is placed beside the display it came from.

const STORE = 'cosmopoiesis-separate';
const ICON_OUT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M13.5 2.5 8 8M6.5 3.5h-3v9h9v-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Where a window of size (w, h) may stand on a screen of (W, H): its bar always reachable.
export function clampPlacement({ x, y, w, h }, W, H, { bar = 36, margin = 8 } = {}) {
  const width = Math.max(260, Math.min(w, W - 2 * margin));
  const height = Math.max(180, Math.min(h, H - 2 * margin));
  return {
    x: Math.min(Math.max(x, margin - width + 120), W - 120),
    y: Math.min(Math.max(y, margin), H - bar - margin),
    w: width,
    h: height,
  };
}

// A first placement beside a display (its rectangle), on the side of the world, within the free height
// (top to bottom), level with the figure where it can be (a figure scrolled out of sight is not followed
// off the screen), the n-th window open cascaded by 40 px (more than its bar) so that none hides another's
// bar. Given the room between the displays (room: { left, right }) and room enough for a window (300 px),
// it stays within it.
export function besidePlacement(from, W, H, { w = 520, h = 460, gap = 14, top = 120, bottom = H - 130, n = 0, room = null } = {}) {
  const onLeft = from.left < W / 2;
  const step = 40 * (n % 5);
  const within = room && room.right - room.left >= 300;
  const width = within ? Math.min(w, room.right - room.left) : w;
  const height = Math.max(180, Math.min(h, bottom - top));
  // level with the figure, or as near as the free height allows; the cascade goes up where it cannot go down
  const base = Math.max(top, Math.min(Math.max(from.top, top), bottom - height));
  const y = base + step + height <= bottom ? base + step : Math.max(top, base - step);
  let x = (onLeft ? from.right + gap : from.left - gap - width) + (onLeft ? step : -step);
  if (within) x = Math.min(Math.max(x, room.left), room.right - width);
  return clampPlacement({ x, y, w: width, h: height }, W, H);
}

// The room between the two displays, where the world is seen (null if they are not there).
function stageRoom() {
  const l = document.querySelector('.mfd.left')?.getBoundingClientRect(), r = document.querySelector('.mfd.right')?.getBoundingClientRect();
  return l && r ? { left: l.right + 10, right: r.left - 10 } : null;
}

export class Separator {
  constructor() {
    this.figures = new Map();
    this.z = 40;
    try { this.saved = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { this.saved = {}; }
  }

  save() { try { localStorage.setItem(STORE, JSON.stringify(this.saved)); } catch { /* no storage */ } }

  // Make a figure separable. id: its name; title: its window's; page: the page it belongs to (counted as
  // shown while the figure is out); onChange(): called after it moves, to redraw at its new size; size:
  // the first window's { w, h }, for a figure that needs more room than the default.
  attach(figure, { id, title, page = null, onChange = () => {}, size = null }) {
    figure.classList.add('figure');
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'sep-key';
    key.title = 'Separate: show this figure in a window of its own over the world';
    key.setAttribute('aria-label', `Separate ${title}`);
    key.innerHTML = ICON_OUT;
    key.addEventListener('click', (e) => { e.stopPropagation(); this.separate(id); });
    figure.appendChild(key);
    this.figures.set(id, { figure, title, page, onChange, size, key, window: null, place: null });
    if (this.saved[id]?.open) requestAnimationFrame(() => this.separate(id));
  }

  isOut(id) { return !!this.figures.get(id)?.window; }
  // Whether a page has a figure out (it is then counted as shown).
  pageHasOut(page) { for (const f of this.figures.values()) if (f.page === page && f.window) return true; return false; }

  separate(id) {
    const f = this.figures.get(id);
    if (!f || f.window) { if (f?.window) this.front(f); return; }
    const from = f.figure.getBoundingClientRect();
    const place = document.createElement('div');
    place.className = 'figure-place';
    place.innerHTML = `<span>${f.title}: shown in its own window</span><button type="button" class="key small">Dock</button>`;
    place.querySelector('button').addEventListener('click', () => this.dock(id));
    f.figure.replaceWith(place);
    f.place = place;
    const win = document.createElement('section');
    win.className = 'float';
    win.setAttribute('aria-label', f.title);
    win.innerHTML = `<div class="float-bar"><span class="float-title"></span><span class="float-keys">
        <button type="button" class="key small icon" data-act="max" title="Enlarge to the stage between the displays, or back">⤢</button>
        <button type="button" class="key small" data-act="dock" title="Back into its display">Dock</button></span></div><div class="float-body"></div>`;
    win.querySelector('.float-title').textContent = f.title;
    win.querySelector('.float-body').appendChild(f.figure);
    document.body.appendChild(win);
    f.window = win;
    const saved = this.saved[id];
    const W = window.innerWidth, H = window.innerHeight;
    const open = [...this.figures.values()].filter((g) => g.window && g !== f).length;
    const p = saved?.place ? clampPlacement(saved.place, W, H) : besidePlacement(from.width ? from : { left: 0, right: 400, top: 120 }, W, H, { n: open, room: stageRoom(), ...(f.size || {}) });
    Object.assign(win.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
    if (saved?.max) win.classList.add('max');
    this.front(f);
    this.wire(id, f, win);
    this.saved[id] = { ...(this.saved[id] || {}), open: true };
    this.save();
    requestAnimationFrame(() => f.onChange());
  }

  dock(id) {
    const f = this.figures.get(id);
    if (!f?.window) return;
    f.resize?.disconnect();
    f.place.replaceWith(f.figure);
    f.window.remove();
    f.window = null;
    f.place = null;
    this.saved[id] = { ...(this.saved[id] || {}), open: false };
    this.save();
    requestAnimationFrame(() => f.onChange());
  }

  front(f) {
    for (const g of this.figures.values()) g.window?.classList.toggle('focus', g === f);
    f.window.style.zIndex = String(++this.z);
  }

  wire(id, f, win) {
    const remember = () => {
      if (win.classList.contains('max')) return;
      const r = win.getBoundingClientRect();
      this.saved[id] = { ...(this.saved[id] || {}), place: { x: r.left, y: r.top, w: r.width, h: r.height } };
      this.save();
    };
    win.addEventListener('pointerdown', () => this.front(f));
    win.querySelector('.float-keys').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'dock') this.dock(id);
      if (act === 'max') {
        win.classList.toggle('max');
        this.saved[id] = { ...(this.saved[id] || {}), max: win.classList.contains('max') };
        this.save();
        requestAnimationFrame(() => f.onChange());
      }
    });
    const bar = win.querySelector('.float-bar');
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || win.classList.contains('max')) return;
      const r = win.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      bar.setPointerCapture(e.pointerId);
      const move = (m) => {
        const p = clampPlacement({ x: m.clientX - dx, y: m.clientY - dy, w: r.width, h: r.height }, window.innerWidth, window.innerHeight);
        win.style.left = `${p.x}px`;
        win.style.top = `${p.y}px`;
      };
      const up = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); remember(); };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up);
    });
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) win.querySelector('[data-act="max"]').click(); });
    let pending = null;
    f.resize = new ResizeObserver(() => {
      clearTimeout(pending);
      pending = setTimeout(() => { remember(); f.onChange(); }, 60);
    });
    f.resize.observe(win);
  }
}
