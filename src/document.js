import JSZip from 'jszip';

export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;
export const DOCUMENT_FORMAT = 'lesson-presenter';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_OBJECTS = new Set(['Textbox', 'IText', 'Text', 'Rect', 'Circle', 'Ellipse', 'Triangle', 'Line', 'Path', 'Polygon', 'Polyline', 'Group', 'Image', 'textbox', 'i-text', 'text', 'rect', 'circle', 'ellipse', 'triangle', 'line', 'path', 'polygon', 'polyline', 'group', 'image']);
export function youtubeId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    let id;
    if (url.hostname === 'youtu.be') id = url.pathname.split('/')[1];
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.searchParams.get('v') || (/^\/(embed|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : null);
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
}
export function fitSlide(width, height = Infinity) {
  const scale = Math.max(.05, Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT));
  return {scale, width: Math.round(SLIDE_WIDTH * scale), height: Math.round(SLIDE_HEIGHT * scale)};
}
export function validateDocument(doc, {assetsAllowed=false}={}) {
  if (doc?.format !== DOCUMENT_FORMAT || doc.version !== 1) throw new Error('This editable lesson format is not supported.');
  if (!doc.lesson || !Array.isArray(doc.lesson.pages) || !doc.lesson.pages.length || doc.lesson.pages.length > 300) throw new Error('The lesson must contain 1–300 slides.');
  if (doc.lesson.pages.some(page => !page || typeof page.title !== 'string' || !Array.isArray(page.questions) || page.questions.some(question => !question || typeof question.prompt !== 'string'))) throw new Error('The lesson stage metadata is invalid.');
  if (doc.lesson.pages.some(page=>page.hidden!==undefined&&typeof page.hidden!=='boolean')) throw new Error('Slide visibility must be true or false.');
  if (!Array.isArray(doc.slides) || doc.slides.length !== doc.lesson.pages.length) throw new Error('The slide data does not match the lesson stages.');
  const inspect = (object) => {
    if (!object || !ALLOWED_OBJECTS.has(object.type)) throw new Error('The lesson contains an unsupported canvas object.');
    if (object.lpVideoId && !/^[a-zA-Z0-9_-]{11}$/.test(object.lpVideoId)) throw new Error('A video link is invalid.');
    if ((object.fill && typeof object.fill !== 'string') || (object.stroke && typeof object.stroke !== 'string')) throw new Error('Unsupported canvas fill or stroke.');
    if (object.src && !/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(object.src) && !(assetsAllowed && object.src.startsWith('assets/'))) throw new Error('Images must be included inside the lesson file.');
    ['left','top','width','height','scaleX','scaleY','angle'].forEach(key => {
      if (object[key] !== undefined && !Number.isFinite(object[key])) throw new Error('A canvas object has invalid geometry.');
    });
    if (object.objects) object.objects.forEach(inspect);
    if (object.clipPath) inspect(object.clipPath);
  };
  doc.slides.forEach(slide => {
    if (!slide || !Array.isArray(slide.objects) || slide.objects.length > 5000) throw new Error('A slide is invalid or too large.');
    slide.objects.forEach(inspect);
    // Fabric can load images from these properties too; they are never part of our document format.
    if (slide.backgroundImage || slide.overlayImage || slide.clipPath) throw new Error('Unsupported slide background.');
  });
  return doc;
}
export async function packLesson(document) {
  const doc = structuredClone(document);
  validateDocument(doc);
  const zip = new JSZip();
  const seen = new Map();
  let imageIndex = 0;
  const visit = object => {
    if (object.src?.startsWith('data:image/')) {
      const original = object.src;
      if (!seen.has(original)) {
        const [, mime, bytes] = original.match(/^data:(image\/[\w+.-]+);base64,(.+)$/s) || [];
        if (!bytes) throw new Error('An image could not be packaged.');
        const filename = `assets/image-${++imageIndex}.${mime.split('/')[1].replace('svg+xml','svg')}`;
        zip.file(filename, bytes, {base64: true});
        seen.set(original, filename);
      }
      object.src = seen.get(original);
    }
    object.objects?.forEach(visit);
    if (object.clipPath) visit(object.clipPath);
  };
  doc.slides.forEach(slide => slide.objects.forEach(visit));
  zip.file('lesson.json', JSON.stringify(doc));
  return zip.generateAsync({type:'blob', compression:'DEFLATE'});
}
export async function unpackLesson(file) {
  if (file.size > MAX_FILE_SIZE) throw new Error('Choose a lesson file smaller than 100 MB.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file('lesson.json');
  if (!entry) throw new Error('This package has no lesson.json document.');
  const text = await entry.async('string');
  if (text.length > MAX_FILE_SIZE) throw new Error('The lesson document is too large.');
  const doc = validateDocument(JSON.parse(text),{assetsAllowed:true});
  const imageCache = new Map();
  let decodedSize = text.length;
  const visit = async object => {
    if (object.src?.startsWith('assets/')) {
      const filename = object.src;
      if (!imageCache.has(filename)) {
        const asset = zip.file(filename);
        if (!asset) throw new Error(`Missing image: ${filename}`);
        const data = await asset.async('base64');
        decodedSize += data.length;
        if (decodedSize > MAX_FILE_SIZE * 2) throw new Error('The unpacked lesson is too large.');
        const extension = filename.split('.').pop().toLowerCase();
        const mime = {png:'image/png',jpeg:'image/jpeg',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml'}[extension];
        if (!mime) throw new Error('Unsupported image format in lesson package.');
        imageCache.set(filename, `data:${mime};base64,${data}`);
      }
      object.src = imageCache.get(filename);
    }
    for (const child of object.objects || []) await visit(child);
    if (object.clipPath) await visit(object.clipPath);
  };
  for (const slide of doc.slides) for (const object of slide.objects) await visit(object);
  return doc;
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function saveSession(value) {
  const db = await openDatabase();
  await new Promise((resolve,reject) => {
    const transaction = db.transaction('sessions','readwrite');
    transaction.objectStore('sessions').put(value,'current');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Save interrupted.'));
  }).finally(() => db.close());
}
export async function readSession() {
  const db = await openDatabase();
  return new Promise((resolve,reject) => {
    const transaction = db.transaction('sessions','readonly');
    const request = transaction.objectStore('sessions').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
function openDatabase() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open('lessonPresenter.fabric.v1',1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other lesson tabs and retry.'));
  });
}
