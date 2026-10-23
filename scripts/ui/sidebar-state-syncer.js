/**
 * Sidebar State Syncer - Handles conversation state synchronization
 * Extracted from SimulacrumSidebarTab to improve separation of concerns
 */

import { MarkdownRenderer } from '../lib/markdown-renderer.js';
import { transformThinkTags, hasThinkTags } from '../utils/content-processor.js';
import {
  formatToolCallDisplay,
  groupConsecutiveMessages,
  getToolDisplayContent,
} from '../utils/message-utils.js';
import { ChatHandler } from '../core/chat-handler.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SidebarSync');
const DISPLAY_ROLES = new Set(['user', 'assistant', 'tool']);
const HIDDEN_TOOL_NAMES = new Set(['end_loop', 'manage_task']);

export function getDisplayUser(user = game?.user) {
  if (!user) return null;

  return {
    id: user.id ?? user._id,
    _id: user.id ?? user._id,
    name: user.name ?? '',
    isGM: user.isGM === true,
    active: user.active === true,
    color: user.color ?? null,
  };
}

/**
 * Process a message for display (markdown, think tags, enrichment)
 * @param {string} content - Raw message content
 * @param {object} options - Processing options
 * @returns {Promise<string>} Processed HTML content
 */
export async function processMessageForDisplay(content, options = {}) {
  // The user's own input is echoed verbatim. Markdown (and plain HTML whitespace)
  // collapse a single newline, which squashed a multi-line prompt into one paragraph.
  if (options.role === 'user') return renderUserContent(content);

  let processedContent = String(content ?? '');

  // Transform <think></think> tags to collapsible spoilers
  if (hasThinkTags(processedContent)) {
    processedContent = transformThinkTags(processedContent);
  }

  // Apply markdown rendering first (Generates HTML structure)
  try {
    processedContent = await MarkdownRenderer.render(processedContent);
  } catch (err) {
    logger.warn('Markdown rendering failed; using original content', err);
  }

  // Apply FoundryVTT HTML enrichment second (Operates on TextNodes within HTML)
  try {
    const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    processedContent = await TextEditorImpl.enrichHTML(processedContent, {
      secrets: game.user?.isGM ?? false,
      documents: true,
      async: true,
    });
  } catch (err) {
    logger.warn('HTML enrichment failed', err);
  }

  return processedContent;
}

/**
 * Render the user's own chat input verbatim.
 *
 * The input is a plain textarea, so it is shown as plain text: escaped, with the
 * line breaks and indentation they typed left in the markup and preserved by CSS.
 *
 * It deliberately does NOT go through markdown. A single newline is a soft break in
 * markdown (and plain whitespace collapses in HTML), so a multi-line prompt was
 * arriving as one squashed paragraph. The agent still receives the original string
 * with its newlines — only the echo was collapsed — but the echo is what the user
 * reads back, so it has to match what they typed. Escaping also means a prompt that
 * happens to contain `<` or `&` cannot inject markup into the log.
 *
 * @param {string} content - Raw user input
 * @returns {string} Escaped HTML that preserves whitespace
 */
export function renderUserContent(content) {
  const text = String(content ?? '').replace(/\r\n?/g, '\n');
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div class="simulacrum-user-text">${escaped}</div>`;
}

/**
 * Resolve the HTML to show for a message.
 *
 * A caller-supplied `display` is used when it is HTML, or when it is text with nothing
 * to render. It is re-rendered from the message content only when it carries markdown
 * markers without being HTML — the case where a render was skipped somewhere upstream
 * and showing the display verbatim is what left literal `##` and `**` in the log.
 *
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - The message's own content
 * @param {string|null} [display] - A pre-processed display, if the caller has one
 * @returns {Promise<string>} HTML for the message
 */
export async function resolveDisplay(role, content, display = null) {
  if (role === 'user') return renderUserContent(content);
  if (typeof display === 'string' && display.trim()) {
    const isHtml = MarkdownRenderer.looksLikeHtml(display);
    if (isHtml || !MarkdownRenderer.looksLikeMarkdown(display)) return display;
  }
  return processMessageForDisplay(content, { role });
}

/**
 * Create a formatted message object for display
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Raw content
 * @param {string} [display] - Pre-processed display content
 * @returns {Promise<object>} Formatted message object
 */
export async function createDisplayMessage(role, content, display = null) {
  const processedDisplay = await resolveDisplay(role, content, display);

  return {
    id: foundry.utils.randomID(),
    role,
    content: String(content ?? ''),
    display: processedDisplay,
    timestamp: Date.now(),
    user: role === 'user' ? getDisplayUser() : null,
  };
}

function isCorrectionMessage(message) {
  if (message.role !== 'assistant') return false;
  if (typeof message.content !== 'string') return false;

  const content = message.content.trim();
  return (
    content.startsWith('(Response rejected:') ||
    (content.startsWith('Previous tool call') && content.includes('malformed arguments'))
  );
}

function isDisplayableMessage(message) {
  if (!message) return false;
  if (!DISPLAY_ROLES.has(message.role)) return false;
  if (message._internal === true) return false;
  return !isCorrectionMessage(message);
}

function getToolCallName(toolCall) {
  return toolCall.function?.name || toolCall.name || null;
}

function parseToolCallArguments(toolCall) {
  if (typeof toolCall.function?.arguments === 'string') {
    return JSON.parse(toolCall.function.arguments);
  }
  return toolCall.function?.arguments;
}

function cacheToolCallJustification(toolCall, toolCallJustifications) {
  if (!toolCall.id) return;

  try {
    const args = parseToolCallArguments(toolCall);
    if (args?.justification) {
      toolCallJustifications.set(toolCall.id, args.justification);
    }
  } catch (e) {
    // Ignore parsing errors for justification extraction
  }
}

function cacheToolCallMetadata(message, toolCallNames, toolCallJustifications) {
  if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) return;

  for (const toolCall of message.tool_calls) {
    const toolName = getToolCallName(toolCall);
    if (toolCall.id && toolName) {
      toolCallNames.set(toolCall.id, toolName);
    }
    cacheToolCallJustification(toolCall, toolCallJustifications);
  }
}

function parseToolResultContent(content) {
  if (typeof content === 'string') {
    return JSON.parse(content);
  }
  return content;
}

function isSilentToolResult(message, toolName) {
  if (HIDDEN_TOOL_NAMES.has(toolName)) return true;

  try {
    return parseToolResultContent(message.content)?._silent === true;
  } catch (_e) {
    return false;
  }
}

async function enrichRenderedToolContent(content) {
  const TextEditorImpl = foundry?.applications?.ux?.TextEditor?.implementation ?? TextEditor;
  return TextEditorImpl.enrichHTML(content, {
    secrets: game.user?.isGM ?? false,
    documents: true,
    async: true,
  });
}

async function renderToolDisplayContent(message) {
  const rawDisplayContent = getToolDisplayContent(message);
  if (!rawDisplayContent) return null;

  try {
    const rendered = await MarkdownRenderer.render(rawDisplayContent);
    return enrichRenderedToolContent(rendered);
  } catch (e) {
    logger.warn('Failed to pre-render or enrich tool content', e);
    return null;
  }
}

async function createToolResultDisplayMessage(message, toolCallNames, toolCallJustifications) {
  const toolName = toolCallNames.get(message.tool_call_id);
  if (isSilentToolResult(message, toolName)) return null;

  const justification = toolCallJustifications.get(message.tool_call_id) || '';
  const preRendered = await renderToolDisplayContent(message);
  const displayHtml = formatToolCallDisplay(message, toolName, preRendered, justification);
  return createDisplayMessage('assistant', message.content, displayHtml);
}

async function createSyncedMessage(message, toolCallNames, toolCallJustifications) {
  cacheToolCallMetadata(message, toolCallNames, toolCallJustifications);

  if (message.role === 'tool') {
    return createToolResultDisplayMessage(message, toolCallNames, toolCallJustifications);
  }

  return createDisplayMessage(message.role, message.content);
}

/**
 * Sync messages from ConversationManager to UI format
 * @param {object} conversationManager - The conversation manager instance
 * @returns {Promise<Array>} Array of formatted messages for UI
 */
export async function syncMessagesFromCore(conversationManager) {
  if (!conversationManager?.messages || !Array.isArray(conversationManager.messages)) {
    return [];
  }

  const messages = [];
  const toolCallNames = new Map();
  const toolCallJustifications = new Map();

  for (const message of conversationManager.messages.filter(isDisplayableMessage)) {
    const displayMessage = await createSyncedMessage(
      message,
      toolCallNames,
      toolCallJustifications
    );
    if (displayMessage) messages.push(displayMessage);
  }

  // Apply grouping for consecutive assistant messages
  return groupConsecutiveMessages(messages);
}

/**
 * Initialize ChatHandler from SimulacrumCore
 * @returns {Promise<ChatHandler|null>} ChatHandler instance or null
 */
export async function initializeChatHandler() {
  try {
    const { SimulacrumCore } = await import('../core/simulacrum-core.js');
    if (SimulacrumCore?.conversationManager) {
      return new ChatHandler(SimulacrumCore.conversationManager);
    }
  } catch (err) {
    logger.error('Failed to initialize ChatHandler', err);
  }
  return null;
}

/**
 * Create welcome message
 * @returns {object} Welcome message object
 */
export function createWelcomeMessage() {
  return {
    id: foundry.utils.randomID(),
    role: 'assistant',
    content: game.i18n?.localize('SIMULACRUM.WelcomeMessage') ?? 'Welcome to Simulacrum!',
    display: null,
    timestamp: Date.now(),
    timestampLabel: game.i18n?.localize('SIMULACRUM.Welcome') ?? 'Welcome',
    user: null,
  };
}
