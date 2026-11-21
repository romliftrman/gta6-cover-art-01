/* Neon Shore Cover Studio — cover rendering engine.
 * Draws a GTA-poster-style multi-panel cover on any canvas: photo panels
 * with per-panel crop + grade, a sunset sky, palm silhouettes, a halftone
 * title block and gradient lettering. Everything is drawn locally; no
 * network, no fonts shipped — the lettering uses system heavy sans. */

'use strict';

/* Nine colour grades. Each grade is a canvas filter plus a tint overlay
 * (two colours, top to bottom) and a vignette strength. */
export const GRADES = [
  { id: 'sunset',   name: 'Sunset',      filter: 'saturate(1.35) contrast(1.08) sepia(0.18)',  tint: ['rgba(255,94,58,0.20)', 'rgba(124,42,140,0.22)'],  vig: 0.34 },
  { id: 'neon',     name: 'Neon Vice',   filter: 'saturate(1.7) contrast(1.12) hue-rotate(-18deg)', tint: ['rgba(255,0,128,0.22)', 'rgba(0,229,255,0.16)'],  vig: 0.38 },
  { id: 'dusk',     name: 'Palm Dusk',   filter: 'saturate(1.15) contrast(1.05) brightness(0.92)', tint: ['rgba(64,20,110,0.28)', 'rgba(255,110,60,0.14)'], vig: 0.42 },
  { id: 'haze',     name: 'Heat Haze',   filter: 'saturate(1.25) contrast(0.98) sepia(0.32)',     tint: ['rgba(255,190,90,0.20)', 'rgba(255,120,40,0.10)'], vig: 0.26 },
  { id: 'night',    name: 'Night Drive', filter: 'saturate(1.4) contrast(1.18) brightness(0.82)', tint: ['rgba(10,10,60,0.34)', 'rgba(255,0,110,0.18)'],  vig: 0.48 },
  { id: 'pastel',   name: 'Pastel Bay',  filter: 'saturate(1.05) contrast(0.95) brightness(1.06)', tint: ['rgba(255,170,200,0.16)', 'rgba(120,220,255,0.14)'], vig: 0.20 },
  { id: 'noir',     name: 'Mono Noir',   filter: 'grayscale(1) contrast(1.22) brightness(0.96)',  tint: ['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.22)'],        vig: 0.44 },
  { id: 'gold',     name: 'Gold Hour',   filter: 'saturate(1.45) contrast(1.06) sepia(0.42)',     tint: ['rgba(255,200,80,0.22)', 'rgba(180,80,20,0.12)'],  vig: 0.30 },
  { id: 'aqua',     name: 'Aqua Neon',   filter: 'saturate(1.6) contrast(1.1) hue-rotate(140deg)', tint: ['rgba(0,255,200,0.16)', 'rgba(0,80,255,0.20)'],   vig: 0.36 },
];

export const LAYOUTS = [
  { id: 'nine',   name: 'Nine Panel',   blurb: '3 x 3 grid, title block bottom-right' },
  { id: 'hero',   name: 'Hero + Strip', blurb: 'One big hero, 3 panels, title band' },
  { id: 'single', name: 'Single Shot',  blurb: 'One photo full-bleed, title band' },
];

export const EXPORT_SIZES = [
  { id: 'square',   name: 'Square 1080 x 1080',   w: 1080, h: 1080 },
  { id: 'portrait', name: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
  { id: 'wide',     name: 'Wide 1920 x 1080',     w: 1920, h: 1080 },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) || GRADES[0];
}

/* A panel: which photo it shows, how that photo is cropped inside it, and
 * an optional grade override (null = the cover grade). */
export function defaultPanels() {
  const panels = [];
  for (let i = 0; i < 9; i++) {
    panels.push({
      photo: i % 2, // alternate the two sample photos
      scale: 1.15 + (i % 3) * 0.12,
      dx: ((i * 37) % 60) - 30, // pan offsets in px at 1080 width
      dy: ((i * 53) % 50) - 25,
      grade: null,
    });
  }
  return panels;
}

export function defaultDoc() {
  return {
    title: 'NEON SHORE',
    subtitle: 'sunset · palms · neon',
    caption: 'Golden hour on the boulevard — my cover, my photos.',
    layout: 'nine',
    grade: 'sunset',
    panels: defaultPanels(),
  };
}

/* ---- drawing helpers -------------------------------------------------- */

function skyGradient(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, '#2b1055');
  g.addColorStop(0.35, '#7597de');
  g.addColorStop(0.55, '#ff7e5f');
  g.addColorStop(0.78, '#feb47b');
  g.addColorStop(1.0, '#ffcf8a');
  return g;
}

function sunDisc(ctx, cx, cy, r) {
  const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
  g.addColorStop(0, 'rgba(255,236,180,0.98)');
  g.addColorStop(0.55, 'rgba(255,170,90,0.92)');
  g.addColorStop(1, 'rgba(255,110,90,0.0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
  ctx.fill();
}

/* One palm silhouette, drawn from paths — no image assets needed. */
export function drawPalm(ctx, x, y, s, lean, colour) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate(lean);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineCap = 'round';
  // trunk: a gentle curve rising up
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(6, -52, -4, -96);
  ctx.stroke();
  // fronds: seven arcs fanning from the crown
  ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * (0.08 + i * 0.14);
    const len = 52 - Math.abs(i - 3) * 6;
    const ex = Math.cos(a) * len;
    const ey = -96 + Math.sin(a) * len * 0.9 + 14;
    ctx.beginPath();
    ctx.moveTo(-4, -96);
    ctx.quadraticCurveTo(ex * 0.5, -96 + ey * 0.28 - 16, ex, ey);
    ctx.stroke();
  }
  // coconuts
  ctx.beginPath();
  ctx.arc(-9, -90, 4, 0, Math.PI * 2);
  ctx.arc(1, -88, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

let grainTile = null;
function grainPattern(ctx) {
  if (grainTile) return grainTile;
  const t = document.createElement('canvas');
  t.width = 128;
  t.height = 128;
  const tc = t.getContext('2d');
  const img = tc.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.floor(Math.random() * 90);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tc.putImageData(img, 0, 0);
  grainTile = ctx.createPattern(t, 'repeat');
  return grainTile;
}

function halftone(ctx, x, y, w, h, colour) {
  ctx.save();
  ctx.fillStyle = colour;
  const step = 14;
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    for (let xx = x + step / 2; xx < x + w; xx += step) {
      const fade = 1 - (yy - y) / h; // dots shrink toward the bottom
      ctx.beginPath();
      ctx.arc(xx, yy, Math.max(0.6, 3.1 * fade), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function vignette(ctx, w, h, strength) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(10,4,24,0)');
  g.addColorStop(1, `rgba(10,4,24,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function tintOverlay(ctx, x, y, w, h, grade) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, grade.tint[0]);
  g.addColorStop(1, grade.tint[1]);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/* Draw one photo into a panel rect, cover-fit, with the panel's crop. */
function drawPhotoPanel(ctx, img, panel, rect, grade) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (img && img.naturalWidth > 0) {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const base = Math.max(w / iw, h / ih) * panel.scale;
    const dw = iw * base;
    const dh = ih * base;
    const dx = x + (w - dw) / 2 + (panel.dx * w) / 1080;
    let dy = y + (h - dh) / 2 + (panel.dy * w) / 1080;
    // Face-aware bias: a portrait photo in a landscape panel crops top and
    // bottom hardest, so favour the top third where faces usually are.
    if (ih > iw && w > h) dy += (dh - h) * 0.22;
    ctx.filter = grade.filter;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.filter = 'none';
  } else {
    // No photo yet: a procedural sunset placeholder so the grid still reads.
    ctx.fillStyle = skyGradient(ctx, w, h);
    ctx.fillRect(x, y, w, h);
    sunDisc(ctx, x + w * 0.62, y + h * 0.42, Math.min(w, h) * 0.22);
    drawPalm(ctx, x + w * 0.2, y + h, Math.min(w, h) / 260, -0.08, 'rgba(20,8,40,0.85)');
  }
  tintOverlay(ctx, x, y, w, h, grade);
  ctx.restore();
  // thin dark gutter edge so panels read as a poster grid
  ctx.strokeStyle = 'rgba(12,4,28,0.9)';
  ctx.lineWidth = Math.max(2, w * 0.008);
  ctx.strokeRect(x, y, w, h);
}

/* Big gradient lettering with a dark keyline — the poster's title.
 * `maxW` caps the drawn width: the size shrinks until the words fit. */
function drawTitleText(ctx, text, cx, y, size, maxW) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const setFont = (s) => {
    ctx.font = `900 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(s * 0.04)}px`; } catch (e) { /* older canvas */ }
  };
  setFont(size);
  if (maxW) {
    while (size > 14 && ctx.measureText(text).width > maxW) {
      size -= 2;
      setFont(size);
    }
  }
  const g = ctx.createLinearGradient(0, y - size, 0, y + size * 0.12);
  g.addColorStop(0, '#fff7d6');
  g.addColorStop(0.45, '#ffd166');
  g.addColorStop(0.75, '#ff5e78');
  g.addColorStop(1, '#b5179e');
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#160a2e';
  ctx.lineWidth = Math.max(3, size * 0.09);
  ctx.strokeText(text, cx, y);
  ctx.fillStyle = g;
  ctx.fillText(text, cx, y);
  ctx.restore();
}

function drawScriptText(ctx, text, cx, y, size) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `italic 700 ${size}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = '#ffe9f6';
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = size * 0.35;
  ctx.fillText(text, cx, y);
  ctx.restore();
}

function drawCaptionText(ctx, text, cx, y, size, maxW) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${size}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,244,230,0.94)';
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((ln, i) => {
    ctx.fillText(ln, cx, y + i * size * 1.35);
  });
  ctx.restore();
}

/* The title block: halftone corner, palms, title, script subtitle, caption. */
function drawTitleBlock(ctx, rect, doc) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#1b0533');
  g.addColorStop(0.55, '#4c1d95');
  g.addColorStop(1, '#0f0520');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  halftone(ctx, x + w * 0.62, y + h * 0.55, w * 0.38, h * 0.45, 'rgba(255,94,160,0.5)');
  drawPalm(ctx, x + w * 0.1, y + h * 0.98, h / 240, -0.1, 'rgba(8,2,20,0.9)');
  drawPalm(ctx, x + w * 0.24, y + h * 0.98, h / 330, 0.12, 'rgba(8,2,20,0.75)');
  sunDisc(ctx, x + w * 0.84, y + h * 0.2, Math.min(w, h) * 0.16);
  const titleSize = Math.min(h * 0.34, (w * 1.9) / Math.max(6, doc.title.length));
  drawTitleText(ctx, doc.title, x + w / 2, y + h * 0.44, titleSize, w * 0.9);
  drawScriptText(ctx, doc.subtitle, x + w / 2, y + h * 0.62, Math.max(13, h * 0.085));
  drawCaptionText(ctx, doc.caption, x + w / 2, y + h * 0.8, Math.max(12, h * 0.062), w * 0.86);
  ctx.restore();
  ctx.strokeStyle = 'rgba(12,4,28,0.9)';
  ctx.lineWidth = Math.max(2, w * 0.008);
  ctx.strokeRect(x, y, w, h);
}

/* A title band across the bottom (hero + single layouts). */
function drawTitleBand(ctx, rect, doc) {
  const { x, y, w, h } = rect;
  ctx.save();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(16,4,32,0.0)');
  g.addColorStop(0.25, 'rgba(16,4,32,0.88)');
  g.addColorStop(1, 'rgba(10,2,22,0.97)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  drawPalm(ctx, x + w * 0.06, y + h, h / 210, -0.08, 'rgba(6,2,16,0.9)');
  drawPalm(ctx, x + w * 0.94, y + h, h / 260, 0.1, 'rgba(6,2,16,0.9)');
  const titleSize = Math.min(h * 0.42, (w * 1.75) / Math.max(6, doc.title.length));
  drawTitleText(ctx, doc.title, x + w / 2, y + h * 0.5, titleSize, w * 0.88);
  drawScriptText(ctx, doc.subtitle, x + w / 2, y + h * 0.74, Math.max(13, h * 0.17));
  drawCaptionText(ctx, doc.caption, x + w / 2, y + h * 0.92, Math.max(11, h * 0.11), w * 0.8);
  ctx.restore();
}

/* ---- layout geometry --------------------------------------------------- */

function panelRects(layout, w, h) {
  const gut = Math.round(Math.min(w, h) * 0.012);
  if (layout === 'nine') {
    const cw = (w - gut * 4) / 3;
    const ch = (h - gut * 4) / 3;
    const rects = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        rects.push({ x: gut + c * (cw + gut), y: gut + r * (ch + gut), w: cw, h: ch });
      }
    }
    return { panels: rects, titleBlock: 8, band: null };
  }
  if (layout === 'hero') {
    const heroH = Math.round(h * 0.58);
    const stripY = heroH + gut;
    const bandH = Math.round(h * 0.2);
    const stripH = h - stripY - gut - bandH;
    const sw = (w - gut * 4) / 3;
    const rects = [
      { x: gut, y: gut, w: w - gut * 2, h: heroH },
      { x: gut, y: stripY, w: sw, h: stripH },
      { x: gut * 2 + sw, y: stripY, w: sw, h: stripH },
      { x: gut * 3 + sw * 2, y: stripY, w: sw, h: stripH },
    ];
    return { panels: rects, titleBlock: null, band: { x: 0, y: h - bandH, w, h: bandH } };
  }
  // single
  return {
    panels: [{ x: 0, y: 0, w, h }],
    titleBlock: null,
    band: { x: 0, y: Math.round(h * 0.66), w, h: Math.round(h * 0.34) },
  };
}

/* ---- main entry -------------------------------------------------------- */

/* Draw the whole cover. `photos` is an array of HTMLImageElement (or null). */
export function drawCover(canvas, doc, photos, W, H) {
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;
  const coverGrade = gradeById(doc.grade);
  // sky base so gutters and the title block sit on a sunset
  ctx.fillStyle = skyGradient(ctx, W, H);
  ctx.fillRect(0, 0, W, H);
  sunDisc(ctx, W * 0.5, H * 0.24, Math.min(W, H) * 0.13);

  const geo = panelRects(doc.layout, W, H);
  geo.panels.forEach((rect, i) => {
    if (geo.titleBlock === i) return; // title block panel drawn below
    const panel = doc.panels[i] || defaultPanels()[i];
    const grade = panel.grade ? gradeById(panel.grade) : coverGrade;
    const img = photos[panel.photo] || null;
    drawPhotoPanel(ctx, img, panel, rect, grade);
  });
  if (geo.titleBlock !== null && geo.titleBlock !== undefined) {
    drawTitleBlock(ctx, geo.panels[geo.titleBlock], doc);
  }
  if (geo.band) drawTitleBand(ctx, geo.band, doc);

  // grain + vignette over everything, then a poster edge
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = grainPattern(ctx);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  vignette(ctx, W, H, coverGrade.vig);
  ctx.strokeStyle = 'rgba(255,210,120,0.55)';
  ctx.lineWidth = Math.max(2, W * 0.004);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
  return geo;
}

/* Hit-test: which panel index contains point (px, py) at size W x H. */
export function panelAt(doc, px, py, W, H) {
  const geo = panelRects(doc.layout, W, H);
  for (let i = 0; i < geo.panels.length; i++) {
    const r = geo.panels[i];
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}
