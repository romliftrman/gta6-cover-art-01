// Neon Shore Cover Studio — the editor.
// Wires the page: photos in (upload / drop / paste / samples), a live cover
// preview with click-to-select panels, drag to crop, 9 grades, 3 layouts,
// undo/redo, hash-shareable state and PNG export in 3 post sizes.
// A `?shot=` query sets up a fixed scene for a screenshot (./shots.js).
import { drawCover, panelAt, GRADES, LAYOUTS, EXPORT_SIZES, defaultDoc, gradeById } from './cover.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const auditEl = document.getElementById('audit');
const titleInput = document.getElementById('title');
const subtitleInput = document.getElementById('subtitle');
const captionInput = document.getElementById('caption');
const layoutBox = document.getElementById('layouts');
const gradeBox = document.getElementById('grades');
const scopeSelect = document.getElementById('gradeScope');
const zoomRange = document.getElementById('zoom');
const panelLabel = document.getElementById('panelLabel');
const photoSelect = document.getElementById('panelPhoto');
const panelGradeSelect = document.getElementById('panelGrade');
const sizeSelect = document.getElementById('exportSize');
const previewSizeBox = document.getElementById('previewSizes');

let doc = defaultDoc();
let photos = []; // { img: HTMLImageElement, name: string }
let selected = 0; // selected panel index
let previewSize = EXPORT_SIZES[0]; // square preview by default
let undoStack = [];
let redoStack = [];
let drag = null; // { x, y, dx, dy } while panning a panel photo

/* ---- state ------------------------------------------------------------ */

function snapshot() {
  return JSON.stringify(doc);
}

function commit(label) {
  undoStack.push(snapshot());
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  saveHash();
  redraw();
  refreshUndoButtons();
  if (label) setStatus(label);
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  doc = JSON.parse(undoStack.pop());
  clampSelection();
  saveHash();
  redraw();
  refreshUndoButtons();
  setStatus('Undid one step.');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  doc = JSON.parse(redoStack.pop());
  clampSelection();
  saveHash();
  redraw();
  refreshUndoButtons();
  setStatus('Redid one step.');
}

function refreshUndoButtons() {
  document.getElementById('undo').disabled = !undoStack.length;
  document.getElementById('redo').disabled = !redoStack.length;
}

function clampSelection() {
  const count = doc.layout === 'nine' ? 9 : doc.layout === 'hero' ? 4 : 1;
  if (selected >= count) selected = 0;
}

function saveHash() {
  try {
    const slim = { ...doc, panels: doc.panels };
    history.replaceState(null, '', `#${encodeURIComponent(JSON.stringify(slim))}`);
  } catch (e) { /* hash too long or unavailable: state still works in-memory */ }
}

function loadHash() {
  try {
    if (!location.hash || location.hash.length < 3) return false;
    const parsed = JSON.parse(decodeURIComponent(location.hash.slice(1)));
    if (parsed && typeof parsed.title === 'string' && Array.isArray(parsed.panels)) {
      doc = { ...defaultDoc(), ...parsed };
      return true;
    }
  } catch (e) { /* corrupt hash: fall through to the default doc */ }
  return false;
}

/* ---- photos ------------------------------------------------------------ */

/** Loads an image from a URL, resolving to the image once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/* A procedural stand-in photo (sunset boulevard) used only if a sample
 * file cannot be loaded — the studio still opens with photos in it. */
function proceduralPhoto(kind) {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 700;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 700);
  if (kind === 'pier') {
    sky.addColorStop(0, '#12083a');
    sky.addColorStop(0.5, '#c2337f');
    sky.addColorStop(1, '#ff9a5c');
  } else {
    sky.addColorStop(0, '#2b1055');
    sky.addColorStop(0.5, '#ff7e5f');
    sky.addColorStop(1, '#feb47b');
  }
  x.fillStyle = sky;
  x.fillRect(0, 0, 900, 700);
  x.fillStyle = '#fff3c4';
  x.beginPath();
  x.arc(kind === 'pier' ? 640 : 300, 250, 90, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(20,8,40,0.9)';
  for (let i = 0; i < 6; i++) {
    const px = 60 + i * 150;
    x.fillRect(px, 420, 14, 280);
    x.beginPath();
    x.arc(px + 7, 410, 70, Math.PI, 0);
    x.fill();
  }
  x.fillStyle = '#1b0b33';
  x.fillRect(0, 560, 900, 140);
  const img = new Image();
  img.src = c.toDataURL('image/png');
  return img;
}

async function loadSamples() {
  const wanted = [
    { url: 'samples/boulevard.jpg', name: 'boulevard.jpg' },
    { url: 'samples/pier.jpg', name: 'pier.jpg' },
  ];
  for (const [i, w] of wanted.entries()) {
    try {
      const img = await loadImage(w.url);
      photos[i] = { img, name: w.name };
    } catch (e) {
      const img = proceduralPhoto(i === 1 ? 'pier' : 'boulevard');
      photos[i] = { img, name: `${w.name} (built-in)` };
    }
  }
  refreshPhotoSelect();
  redraw();
  setStatus('2 sample photos loaded — add your own to replace them.');
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) {
    setStatus('That was not an image — try a JPG or PNG photo.');
    return;
  }
  for (const file of files) {
    try {
      const img = await loadImage(URL.createObjectURL(file));
      photos.push({ img, name: file.name });
    } catch (e) {
      setStatus(`Could not read ${file.name}.`);
    }
  }
  // point the selected panel at the newest photo so the change is visible
  const panel = doc.panels[selected];
  if (panel) panel.photo = photos.length - 1;
  refreshPhotoSelect();
  commit(`${files.length} photo${files.length > 1 ? 's' : ''} added to panel ${selected + 1}.`);
}

/* ---- rendering ---------------------------------------------------------- */

function redraw() {
  const imgs = photos.map((p) => p.img);
  drawCover(canvas, doc, imgs, previewSize.w, previewSize.h);
  updateAudit();
  updatePanelLabel();
}

function updateAudit() {
  const filled = doc.panels.filter((p) => photos[p.photo]).length;
  const panelCount = doc.layout === 'nine' ? 9 : doc.layout === 'hero' ? 4 : 1;
  auditEl.textContent =
    `${panelCount} panels · ${filled} with photos · 9 grades · 3 export sizes · ` +
    `${undoStack.length} edits · 0 uploads — photos never leave this device`;
}

function updatePanelLabel() {
  const panel = doc.panels[selected];
  const name = panel && photos[panel.photo] ? photos[panel.photo].name : 'no photo';
  panelLabel.textContent = `Panel ${selected + 1} — ${name} · zoom ${panel ? panel.scale.toFixed(2) : '—'}x`;
  if (panel) {
    zoomRange.value = String(Math.round((panel.scale - 0.5) * 200));
    photoSelect.value = String(panel.photo);
    panelGradeSelect.value = panel.grade || '';
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

/* ---- controls ----------------------------------------------------------- */

function buildLayoutButtons() {
  layoutBox.innerHTML = '';
  for (const layout of LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${layout.name} — ${layout.blurb}`;
    b.setAttribute('aria-pressed', String(doc.layout === layout.id));
    b.addEventListener('click', () => {
      if (doc.layout === layout.id) return;
      doc.layout = layout.id;
      clampSelection();
      commit(`Layout: ${layout.name}.`);
      buildLayoutButtons();
    });
    layoutBox.appendChild(b);
  }
}

function buildGradeSwatches() {
  gradeBox.innerHTML = '';
  for (const grade of GRADES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.title = grade.name;
    b.setAttribute('aria-pressed', String(doc.grade === grade.id));
    b.style.background = `linear-gradient(135deg, ${grade.tint[0].replace(/[\d.]+\)$/, '0.85)')}, ${grade.tint[1].replace(/[\d.]+\)$/, '0.85)')})`;
    b.innerHTML = `<span>${grade.name}</span>`;
    b.addEventListener('click', () => {
      if (scopeSelect.value === 'panel') {
        doc.panels[selected].grade = grade.id;
        commit(`Grade ${grade.name} on panel ${selected + 1}.`);
      } else {
        doc.grade = grade.id;
        commit(`Cover grade: ${grade.name}.`);
      }
      buildGradeSwatches();
    });
    gradeBox.appendChild(b);
  }
}

function buildPreviewSizes() {
  previewSizeBox.innerHTML = '';
  for (const size of EXPORT_SIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = size.name;
    b.setAttribute('aria-pressed', String(previewSize.id === size.id));
    b.addEventListener('click', () => {
      previewSize = size;
      redraw();
      buildPreviewSizes();
    });
    previewSizeBox.appendChild(b);
  }
}

function refreshPhotoSelect() {
  photoSelect.innerHTML = '';
  photos.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${i + 1}. ${p.name}`;
    photoSelect.appendChild(o);
  });
  panelGradeSelect.innerHTML = '<option value="">Cover grade</option>';
  for (const g of GRADES) {
    const o = document.createElement('option');
    o.value = g.id;
    o.textContent = g.name;
    panelGradeSelect.appendChild(o);
  }
}

titleInput.addEventListener('input', () => {
  doc.title = titleInput.value.toUpperCase().slice(0, 18) || 'NEON SHORE';
  redraw();
  saveHash();
});
subtitleInput.addEventListener('input', () => {
  doc.subtitle = subtitleInput.value.slice(0, 40);
  redraw();
  saveHash();
});
captionInput.addEventListener('input', () => {
  doc.caption = captionInput.value.slice(0, 90);
  redraw();
  saveHash();
});
titleInput.addEventListener('change', () => commit('Title updated.'));
subtitleInput.addEventListener('change', () => commit('Subtitle updated.'));
captionInput.addEventListener('change', () => commit('Caption updated.'));

zoomRange.addEventListener('input', () => {
  const panel = doc.panels[selected];
  if (!panel) return;
  panel.scale = 0.5 + Number(zoomRange.value) / 200;
  redraw();
  updatePanelLabel();
});
zoomRange.addEventListener('change', () => commit(`Zoom panel ${selected + 1} to ${doc.panels[selected].scale.toFixed(2)}x.`));

photoSelect.addEventListener('change', () => {
  doc.panels[selected].photo = Number(photoSelect.value);
  commit(`Panel ${selected + 1} now shows photo ${Number(photoSelect.value) + 1}.`);
});
panelGradeSelect.addEventListener('change', () => {
  doc.panels[selected].grade = panelGradeSelect.value || null;
  commit(`Panel ${selected + 1} grade: ${panelGradeSelect.value ? gradeById(panelGradeSelect.value).name : 'cover grade'}.`);
});

document.getElementById('undo').addEventListener('click', undo);
document.getElementById('redo').addEventListener('click', redo);
document.getElementById('reset').addEventListener('click', () => {
  doc = defaultDoc();
  selected = 0;
  commit('Reset to the fresh Neon Shore cover.');
  buildLayoutButtons();
  buildGradeSwatches();
  titleInput.value = doc.title;
  subtitleInput.value = doc.subtitle;
  captionInput.value = doc.caption;
});
document.getElementById('shuffle').addEventListener('click', () => {
  doc.panels.forEach((p, i) => {
    p.photo = (p.photo + 1) % Math.max(1, photos.length);
    p.scale = 1.1 + ((i * 29) % 40) / 100;
    p.dx = ((i * 41) % 70) - 35;
    p.dy = ((i * 59) % 60) - 30;
  });
  const grades = GRADES.map((g) => g.id);
  doc.grade = grades[Math.floor(Math.random() * grades.length)];
  commit('Shuffled the panels and picked a fresh grade.');
  buildGradeSwatches();
});

/* Canvas: click to select a panel, drag to pan its photo, wheel to zoom. */
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * canvas.width;
  const y = ((e.clientY - r.top) / r.height) * canvas.height;
  return { x, y };
}

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = canvasPoint(e);
  const hit = panelAt(doc, x, y, canvas.width, canvas.height);
  if (hit < 0) return;
  selected = hit;
  const panel = doc.panels[selected];
  drag = { x, y, dx: panel.dx, dy: panel.dy, moved: false };
  canvas.setPointerCapture(e.pointerId);
  updatePanelLabel();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { x, y } = canvasPoint(e);
  const panel = doc.panels[selected];
  const scale = 1080 / canvas.width;
  panel.dx = drag.dx + (x - drag.x) * scale;
  panel.dy = drag.dy + (y - drag.y) * scale;
  if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 4) drag.moved = true;
  redraw();
});

canvas.addEventListener('pointerup', () => {
  if (drag && drag.moved) commit(`Cropped panel ${selected + 1} by dragging.`);
  drag = null;
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const panel = doc.panels[selected];
  if (!panel) return;
  panel.scale = Math.min(3, Math.max(0.5, panel.scale * (e.deltaY < 0 ? 1.06 : 0.94)));
  redraw();
  updatePanelLabel();
}, { passive: false });

canvas.addEventListener('keydown', (e) => {
  const panel = doc.panels[selected];
  if (!panel) return;
  const step = e.shiftKey ? 20 : 5;
  if (e.key === 'ArrowLeft') { panel.dx -= step; e.preventDefault(); }
  else if (e.key === 'ArrowRight') { panel.dx += step; e.preventDefault(); }
  else if (e.key === 'ArrowUp') { panel.dy -= step; e.preventDefault(); }
  else if (e.key === 'ArrowDown') { panel.dy += step; e.preventDefault(); }
  else return;
  redraw();
  updatePanelLabel();
});

/* Upload: file input, drag-and-drop onto the canvas, and paste. */
document.getElementById('photoFile').addEventListener('change', (e) => {
  addFiles(e.target.files);
  e.target.value = '';
});
canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  addFiles(e.dataTransfer.files);
});
document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) addFiles(files);
});

/* ---- export -------------------------------------------------------------- */

function exportCover(size, done) {
  const off = document.createElement('canvas');
  const imgs = photos.map((p) => p.img);
  drawCover(off, doc, imgs, size.w, size.h);
  off.toBlob((blob) => {
    if (!blob) {
      setStatus('Export failed — try again.');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neon-shore-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus(`Saved neon-shore-${size.w}x${size.h}.png`);
    if (done) done();
  }, 'image/png');
}

document.getElementById('export').addEventListener('click', () => {
  const size = EXPORT_SIZES.find((s) => s.id === sizeSelect.value) || EXPORT_SIZES[0];
  exportCover(size);
});
document.getElementById('exportAll').addEventListener('click', () => {
  let i = 0;
  const next = () => {
    if (i >= EXPORT_SIZES.length) return;
    exportCover(EXPORT_SIZES[i], () => setTimeout(next, 350));
    i += 1;
  };
  next();
  setStatus('Exporting all 3 sizes…');
});

/* ---- boot ---------------------------------------------------------------- */

loadHash();
titleInput.value = doc.title;
subtitleInput.value = doc.subtitle;
captionInput.value = doc.caption;
sizeSelect.innerHTML = EXPORT_SIZES.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
buildLayoutButtons();
buildGradeSwatches();
buildPreviewSizes();
refreshUndoButtons();
refreshPhotoSelect();

const shot = new URLSearchParams(location.search).get('shot');
if (shot) {
  runShot(shot, new URLSearchParams(location.search), {
    setDoc(next) { doc = { ...defaultDoc(), ...next }; titleInput.value = doc.title; subtitleInput.value = doc.subtitle; captionInput.value = doc.caption; buildLayoutButtons(); buildGradeSwatches(); },
    setPreview(sizeId) { previewSize = EXPORT_SIZES.find((s) => s.id === sizeId) || previewSize; },
    photos,
    redraw,
  });
  loadSamples();
} else {
  loadSamples();
  redraw();
}
