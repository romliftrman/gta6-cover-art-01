// Fixed scenes for screenshots: ?shot=editor shows the page with sample
// photos loaded; ?shot=cover / square / portrait shows the cover alone at
// that post size. `title`, `caption`, `grade` and `layout` query params
// override the scene's words. window.__shotReady is set once painted.
const SCENES = {
  cover:    { layout: 'nine', grade: 'neon',   preview: 'wide',     coverOnly: true },
  square:   { layout: 'nine', grade: 'sunset', preview: 'square',   coverOnly: true },
  portrait: { layout: 'hero', grade: 'gold',   preview: 'portrait', coverOnly: true },
  editor:   { layout: 'nine', grade: 'sunset', preview: 'square',   coverOnly: false },
};

export async function runShot(shot, query, api) {
  const scene = SCENES[shot] || SCENES.editor;
  if (scene.coverOnly) document.body.classList.add('shot-cover');
  const next = {
    layout: query.get('layout') || scene.layout,
    grade: query.get('grade') || scene.grade,
    title: (query.get('title') || 'NEON SHORE').toUpperCase().slice(0, 18),
    subtitle: query.get('subtitle') || 'sunset · palms · neon',
    caption: query.get('caption') || 'Golden hour on the boulevard — my cover, my photos.',
  };
  api.setDoc(next);
  api.setPreview(scene.preview);
  // Wait until at least one sample photo can be drawn (or give up after 5s),
  // then paint once more and signal readiness for the screenshot.
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const first = api.photos[0];
    if (first && first.img && first.img.naturalWidth > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  api.redraw();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__shotReady = true;
}
