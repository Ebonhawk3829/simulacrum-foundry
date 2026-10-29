/**
 * Icon Service — generate a square item icon and save it into the world.
 *
 * WHAT THIS IS
 *
 * One job: given a short subject (an ability's noun), ask OpenRouter's Image API
 * for a square icon and write the bytes into the user data directory under
 * `icons/simulacrum/`. It returns the Foundry path, which is exactly what an
 * item's `img` field wants.
 *
 * WHY IT IS A SERVICE AND NOT JUST THE TOOL
 *
 * The tool is the model-facing surface; this is the mechanism. Keeping the request
 * shape, the style prompt and the persistence in one place means the tool — and any
 * future caller — produce identical images.
 *
 * TUNED FOR ICONS, NOT GENERAL ART
 *
 * The style and the request parameters are deliberately fixed. The point of a set of
 * item icons is that they look like a set, so the only thing that varies per call is
 * the subject. Output is a full-bleed opaque square tile: there is no transparency to
 * key out, which also means the model's missing `background` parameter is irrelevant.
 *
 * SAME KEY, SAME ENDPOINT HOST
 *
 * This is the sibling of the chat call in `ai-client.js`: same base URL, same Bearer
 * key, same browser fetch path, so no new configuration or networking is involved.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('IconService');

/** Base URL, matching the one endpoint this fork talks to. */
const BASE_URL = 'https://openrouter.ai/api/v1';

/** Data-directory folder generated icons are written to. */
export const ICON_DIR = 'icons/simulacrum';

/**
 * Default image model. Gemini 3.1 Flash Image ("Nano Banana 2") is chosen for icons
 * because it accepts an explicit `resolution: "512"` and `aspect_ratio: "1:1"` — the
 * exact size and square a dnd5e item sheet displays — and it is cheap per image.
 * Overridable by the `iconModel` setting; any OpenRouter image model will do.
 */
export const DEFAULT_ICON_MODEL = 'google/gemini-3.1-flash-image';

/**
 * Request parameters, fixed for icons. No `background` is sent: the tile is
 * full-bleed, so there is nothing to make transparent. No `seed`: this model does not
 * accept one.
 */
const ICON_PARAMS = Object.freeze({ resolution: '512', aspect_ratio: '1:1' });

/**
 * The style clause. Constant by design — this is what makes a generated set cohere.
 * The subject is the only variable, and it is appended by `buildIconPrompt`.
 */
const ICON_STYLE = [
  'kind: single object icon for a tabletop RPG item',
  'composition: full-bleed square tile, the subject fills the frame edge to edge, no margin',
  'style: bold clean vector shapes, strong readable silhouette, flat shading, high contrast',
  'rules: exactly one subject; no text, no letters, no numbers, no border, no frame, no watermark',
].join('; ');

/**
 * Build the full prompt for one subject.
 * @param {string} subject - Short concrete noun phrase, e.g. "cloud of biting flies"
 * @returns {string}
 */
export function buildIconPrompt(subject) {
  return `${ICON_STYLE}. Subject: ${String(subject ?? '').trim()}.`;
}

/** FilePicker, across the v13/v14 namespacing change. */
function getFilePicker() {
  return (
    globalThis.foundry?.applications?.apps?.FilePicker?.implementation ??
    globalThis.FilePicker ??
    null
  );
}

/** File extension for a returned media type. */
function extensionFor(mediaType) {
  if (mediaType?.includes('jpeg')) return 'jpg';
  if (mediaType?.includes('webp')) return 'webp';
  if (mediaType?.includes('svg')) return 'svg';
  return 'png';
}

/**
 * Ask OpenRouter for one icon. Does not touch the filesystem.
 * @param {{apiKey: string, model: string, subject: string, signal?: AbortSignal}} opts
 * @returns {Promise<{b64: string, mediaType: string, cost: number|null}>}
 */
export async function requestIcon({ apiKey, model, subject, signal }) {
  const res = await fetch(`${BASE_URL}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://fvtt.ebonhawk.dev',
      'X-Title': 'Simulacrum (Ebonhawk fork)',
    },
    body: JSON.stringify({ model, prompt: buildIconPrompt(subject), ...ICON_PARAMS }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Image request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const image = json?.data?.[0];
  if (!image?.b64_json) {
    throw new Error('Image response contained no image data.');
  }

  return {
    b64: image.b64_json,
    mediaType: image.media_type ?? 'image/png',
    cost: json?.usage?.cost ?? null,
  };
}

/**
 * Write base64 image bytes into the data directory and return the Foundry path.
 * @param {{b64: string, mediaType: string, identifier: string}} opts
 * @returns {Promise<{path: string, bytes: number}>}
 */
export async function saveIcon({ b64, mediaType, identifier }) {
  const picker = getFilePicker();
  if (!picker?.upload) throw new Error('Foundry FilePicker is unavailable in this context.');

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  try {
    await picker.createDirectory('data', ICON_DIR, {});
  } catch {
    // already exists, or the source is read-only; the upload reports a real problem
  }

  const name = `${identifier}.${extensionFor(mediaType)}`;
  const file = new File([bytes], name, { type: mediaType });
  const result = await picker.upload('data', ICON_DIR, file, {}, false);
  return { path: result?.path ?? `${ICON_DIR}/${name}`, bytes: bytes.length };
}

/**
 * Generate one icon and save it, end to end.
 * @param {{apiKey: string, model: string, subject: string, identifier: string,
 *          signal?: AbortSignal}} opts
 * @returns {Promise<{path: string, bytes: number, cost: number|null, model: string}>}
 */
export async function generateIcon({ apiKey, model, subject, identifier, signal }) {
  const { b64, mediaType, cost } = await requestIcon({ apiKey, model, subject, signal });
  const { path, bytes } = await saveIcon({ b64, mediaType, identifier });
  logger.info(`Generated icon ${path} (${bytes} bytes) via ${model}`);
  return { path, bytes, cost, model };
}
