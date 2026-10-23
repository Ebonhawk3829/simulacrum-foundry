/* eslint-disable complexity */
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MarkdownRenderer');
/**
 * Text that *is* an HTML fragment, rather than merely mentioning something tag-shaped.
 *
 * Anchored to the start on purpose. Models write things like `</verb>` or `<spirit>` in
 * prose, and the unanchored version let one stray closing tag mark a whole chunk as HTML —
 * which skipped markdown for that chunk entirely and put literal `##` and `**` into the
 * log alongside the stray tag.
 */
const HTML_PATTERN = /^\s*<\/?[a-z][^>]*>/i;
const MARKDOWN_PATTERN = new RegExp(
  /(\*\*|__|[_*]{1}|`{1,3}|~~|^>\s|\n>\s|\n[-*+]\s|\n\d+\.\s|^#{1,6}\s|```)/.source,
  'm'
);
const IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi;

function resolveShowdownOptions() {
  const foundryOptions =
    globalThis?.foundry?.constants?.SHOWDOWN_OPTIONS ??
    globalThis?.foundry?.common?.constants?.SHOWDOWN_OPTIONS ??
    globalThis?.SHOWDOWN_OPTIONS ??
    {};
  return foundryOptions;
}

function stripImages(html) {
  return html.replace(IMAGE_TAG_PATTERN, '');
}

/**
 * Sanitize HTML to ensure all tags are properly closed.
 * Uses DOMParser to parse and re-serialize, which automatically fixes unclosed tags.
 * This prevents malformed HTML from breaking the DOM structure (e.g., unclosed <em> tags
 * causing subsequent elements to be nested inside them).
 * @param {string} html - The HTML string to sanitize
 * @returns {string} Well-formed HTML string
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return html;

  try {
    // Use DOMParser to parse HTML - it automatically closes unclosed tags
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');

    // Extract the content from the wrapper div
    const wrapper = doc.body.querySelector('div');
    return wrapper ? wrapper.innerHTML : html;
  } catch (err) {
    // If parsing fails for any reason, return original HTML
    logger.warn('HTML sanitization failed; returning original content', err);
    return html;
  }
}

/**
 * Escape text that was meant to be rendered, so a failed render still reads as the
 * text it is: HTML-safe, with line breaks kept, rather than a wall of raw `##`/`**`
 * collapsed onto one line. Markdown markers are left in place — inventing a second
 * renderer here would only disagree with Showdown elsewhere.
 * @param {string} text
 * @returns {string}
 */
function plainTextFallback(text) {
  const escaped = String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
}

export class MarkdownRenderer {
  static #converter;

  /**
   * Earliest time to wait for showdown again after it was missing. Without this a
   * genuinely absent library would cost every render a full timeout.
   */
  static #converterWaitUntil = 0;

  static reset() {
    MarkdownRenderer.#converter = undefined;
    MarkdownRenderer.#converterWaitUntil = 0;
  }

  static looksLikeHtml(text) {
    return HTML_PATTERN.test(text);
  }

  static looksLikeMarkdown(text) {
    return MARKDOWN_PATTERN.test(text);
  }

  static #ensureConverter() {
    // Only return if we have a valid converter instance
    if (MarkdownRenderer.#converter) return MarkdownRenderer.#converter;

    const showdown = globalThis?.window?.showdown;
    if (!showdown?.Converter) {
      // Do not cache null/failure, allowing retry on next render attempt
      // This prevents permanent breakage if accessed before Showdown library loads
      logger.warn('Showdown converter unavailable (yet?); leaving markdown unconverted');
      return null;
    }

    try {
      const options = resolveShowdownOptions();
      if (showdown.setOption) {
        for (const [key, value] of Object.entries(options)) {
          showdown.setOption(key, value);
        }
      }
      MarkdownRenderer.#converter = new showdown.Converter();
    } catch (err) {
      logger.error('Failed to initialize Showdown converter', err);
      // Do not cache failure to allow recovery
      return null;
    }

    return MarkdownRenderer.#converter;
  }

  /**
   * Wait for Foundry to attach showdown to `window`.
   *
   * The library is looked up as `window.showdown`; if a render happens before that
   * exists, returning the message text unrendered leaves raw `##`/`**` in the log for
   * good, because a message's display is computed once and cached. Wait briefly rather
   * than giving up at the first miss.
   * @param {number} timeoutMs
   * @returns {Promise<object|null>} The showdown library, or null if it never arrived
   */
  static async #waitForShowdown(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const showdown = globalThis?.window?.showdown;
      if (showdown?.Converter) return showdown;
      if (Date.now() >= deadline) return null;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * The converter, waiting for showdown to load when it is not there yet.
   * @returns {Promise<object|null>}
   */
  static async #ensureConverterAsync() {
    const existing = MarkdownRenderer.#ensureConverter();
    if (existing) return existing;
    if (Date.now() < MarkdownRenderer.#converterWaitUntil) return null;

    const showdown = await MarkdownRenderer.#waitForShowdown(1500);
    if (!showdown) {
      // Do not keep paying the timeout on every render while it is genuinely absent.
      MarkdownRenderer.#converterWaitUntil = Date.now() + 30_000;
      return null;
    }
    return MarkdownRenderer.#ensureConverter();
  }

  static async render(raw, options = {}) {
    const {
      disable = false,
      allowHtml = true,
      stripImages: removeImages = false,
      force = false,
    } = options;
    const text = typeof raw === 'string' ? raw : String(raw ?? '');

    if (!text.trim()) return '';
    if (disable) return text;

    if (!force && MarkdownRenderer.looksLikeHtml(text)) {
      return allowHtml ? text : text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // If force is true, bypass the markdown detection heuristic
    if (!force && !MarkdownRenderer.looksLikeMarkdown(text)) {
      return text;
    }

    const converter = await MarkdownRenderer.#ensureConverterAsync();
    if (!converter) {
      logger.warn('Showdown unavailable; showing the markdown as plain text');
      return plainTextFallback(text);
    }

    try {
      let html = converter.makeHtml(text);

      // Sanitize HTML to ensure all tags are properly closed
      // This prevents DOM corruption from unclosed <em>/<strong> tags
      html = sanitizeHtml(html);

      if (!allowHtml) {
        html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      if (removeImages) {
        html = stripImages(html);
      }
      return html;
    } catch (err) {
      logger.warn('Markdown conversion failed; showing the text unrendered', err);
      return plainTextFallback(text);
    }
  }
}

export default MarkdownRenderer;
