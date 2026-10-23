/**
 * Event Handlers for Simulacrum Sidebar Tab
 * decoupling logic from the main application class
 */

import { ConversationCommands } from './conversation-commands.js';
import { createLogger } from '../utils/logger.js';
import { processMessageForDisplay } from './sidebar-state-syncer.js';
import { interimControl } from '../core/interim-report.js';

/** Reporter for the handlers below, so a refused action is visible instead of silent. */
const log = createLogger('SidebarEventHandlers');

export class SidebarEventHandlers {
  /**
   * Resolve the prompt for a send: queued replays carry it in target.message,
   * direct sends carry it in the textarea.
   * @param {object} target
   * @param {HTMLTextAreaElement|null} input
   * @returns {string} trimmed message (may be empty)
   */
  static _resolveMessage(target, input) {
    const fromTarget =
      (typeof target?.message === 'string' ? target.message : '').trim() ||
      (typeof target?.value === 'string' ? target.value : '').trim();
    return fromTarget || (input?.value ?? '').trim();
  }

  /**
   * Park a prompt in the visible queue while the agent is busy (#174).
   * @returns {boolean} true when the prompt was queued
   */
  static _queueWhileBusy(app, input, message) {
    const queue = app.messageQueue;
    if (!queue) return false;
    queue.attach(app, SidebarEventHandlers.handleSendMessage);
    const enqueued = queue.enqueue(message, () => {
      if (app.markAtBottom) app.markAtBottom(true);
    });
    if (enqueued) {
      if (input) input.value = '';
      if (app.setBusyFlag) app.setBusyFlag(true);
    }
    return !!enqueued;
  }

  /* eslint-disable-next-line max-lines-per-function */
  static async handleSendMessage(app, event, target) {
    const form = target.closest?.('form');
    const input = form?.querySelector('textarea[name="message"]') ?? null;
    const message = SidebarEventHandlers._resolveMessage(target, input);

    if (!message) return;

    // While the agent is busy, keep the prompt in the visible queue (FIFO)
    // instead of dropping it. The queue drains sequentially after the active
    // response completes.
    if (app.isProcessing()) {
      SidebarEventHandlers._queueWhileBusy(app, input, message);
      return;
    }

    // Clear input immediately
    if (input) input.value = '';

    // Record process ownership for this request
    const signal = app.startProcess();

    // Set processing state immediately and trigger render
    app.setProcessing(true);

    try {
      await SidebarEventHandlers._processMessageThroughHandler(app, message, signal);
    } catch (error) {
      if (signal.aborted) return;
      createLogger('SidebarEventHandlers').error('Error processing message', error);
      ui.notifications?.error(`Simulacrum: ${error.message}`, { permanent: false });
    } finally {
      app.finishProcess(signal);
      // A Stop aborts the signal: queued prompts survive it and wait for a
      // manual send. Natural completion (success or error) starts the next
      // queued prompt so the queue drains one at a time.
      if (app.messageQueue && !signal.aborted) {
        app.messageQueue.setBusy(app.isProcessing());
        await app.messageQueue.drain(app);
      }
    }
  }

  /**
   * Run one prompt through the chat handler (commands, display, AI call).
   * @param {object} app
   * @param {string} message
   * @param {AbortSignal} signal
   */
  /* eslint-disable max-lines-per-function */
  static async _processMessageThroughHandler(app, message, signal) {
    await app.ensureChatHandler();

    if (!app.chatHandler) {
      throw new Error('ChatHandler not available');
    }

    // Handle conversation commands
    if (app.chatHandler.conversationManager) {
      const commandResult = await ConversationCommands.handleConversationCommand(
        message,
        app.chatHandler.conversationManager
      );

      if (commandResult.isCommand) {
        if (!app.isCurrentProcess(signal)) return;
        await app.addMessage('assistant', commandResult.message, commandResult.message);
        return;
      }
    }

    // Add user message to chat log
    await app.addMessage('user', message);

    // Define callbacks for ChatHandler
    /* eslint-disable no-unused-vars */
    const onUserMessage = ({ _content }) => {
      /* User message already added */
    };
    /* eslint-enable no-unused-vars */

    const onAssistantMessage = async response => {
      const isErrorResponse = !!response?.error;
      if (!isErrorResponse && !app.isCurrentProcess(signal)) return;
      // Apply markdown rendering and enrichment before display
      // processMessageForDisplay handles null/undefined content by defaulting to '&nbsp;'
      const processedDisplay = await processMessageForDisplay(response.display || response.content);
      if (!isErrorResponse && !app.isCurrentProcess(signal)) return;
      await app.addMessage('assistant', response.content, processedDisplay, response.noGroup);
    };

    // Process message through ChatHandler
    await app.chatHandler.processUserMessage(message, game.user, {
      onUserMessage,
      onAssistantMessage,
      onError: ({ originalMessage }) => {
        app.rollbackUserMessage();
        const appForm = app.element?.querySelector('form');
        const textarea = appForm?.querySelector('textarea[name="message"]');
        if (textarea) textarea.value = originalMessage;
      },
      signal,
      // Stopping hands the turn over rather than discarding it; the wrap-up runs on its
      // own signal so the stop cannot kill it, and a second press aborts that signal.
      getInterimSignal: () => interimControl.signal(),
      onInterimStart: () => SidebarEventHandlers._setSummarising(app, true),
      onInterimEnd: () => SidebarEventHandlers._setSummarising(app, false),
    });
  }
  /* eslint-enable max-lines-per-function */

  static async handleClearChat(app) {
    try {
      if (app.chatHandler) {
        await app.chatHandler.clearConversation();
      } else {
        const { SimulacrumCore } = await import('../core/simulacrum-core.js');
        await SimulacrumCore.clearConversation?.();
      }
    } catch (_e) {
      /* ignore */
    }
    await app.clearMessages();
    await app.addMessage('assistant', game.i18n.localize('SIMULACRUM.WelcomeMessage'));
  }

  static async handleJumpToBottom(app) {
    const log = app.element?.querySelector('.chat-scroll');
    if (log) {
      log.scrollTop = log.scrollHeight;
      app.markAtBottom(true);
    }
  }

  static async handleCancelProcess(app, _event, _target) {
    // A second press, while the wrap-up is being written, is a hard stop.
    if (interimControl.abort()) {
      SidebarEventHandlers._setSummarising(app, false);
      return;
    }
    if (!app.isProcessing()) return;

    interimControl.begin();
    const success = await app.cancelCurrentProcesses();
    if (success) {
      SidebarEventHandlers._setSummarising(app, true);
    }
  }

  /**
   * Show or clear the "summarising" state.
   *
   * Reuses the active-process map so the process-status line and the stop button stay
   * in place for the second press, without the sidebar having to know about any of it.
   * @param {object} app
   * @param {boolean} active
   */
  static _setSummarising(app, active) {
    if (active) {
      app._activeProcesses?.set('interim', { label: 'Summarising…' });
    } else {
      app._activeProcesses?.delete('interim');
      interimControl.reset();
    }
    app.render?.({ parts: ['log', 'input'] });
  }

  /**
   * Replace one of your own prompts and run the turn again from there.
   *
   * The turn the original prompt produced is no longer valid once the prompt changes, so
   * that turn is discarded and re-run — a rewind, not a branch. Only user messages are
   * editable, and only while nothing is running.
   * @param {object} app
   * @param {Event} _event
   * @param {HTMLElement} target
   */
  static async handleEditMessage(app, _event, target) {
    if (app.isProcessing()) return;

    const li = target.closest?.('.chat-message');
    const contentEl = li?.querySelector('.message-content');
    if (!li || !contentEl || li.querySelector('.simulacrum-message-edit')) return;

    // The chat handler is built lazily on the first send, but the log is synced straight
    // from SimulacrumCore on load — so it can still be null here even with messages on
    // screen. Build it before we need it, or every edit quietly does nothing.
    await app.ensureChatHandler();
    const conversation = await SidebarEventHandlers._resolveConversation(app);
    if (!conversation?.getMessages) {
      log.warn('Edit ignored: no conversation is available yet');
      return;
    }

    const messageId = li.dataset.messageId;
    const index = SidebarEventHandlers._conversationIndexOf(app, conversation, messageId);
    if (index < 0) {
      log.warn('Edit ignored: could not match that message to the conversation');
      return;
    }

    const original = conversation.getMessages()[index].content;
    SidebarEventHandlers._showMessageEditor(app, { conversation, contentEl, original, index });
  }

  /**
   * The conversation manager, reachable either through the chat handler or through core.
   * @param {object} app
   * @returns {Promise<object|null>}
   */
  static async _resolveConversation(app) {
    if (app.chatHandler?.conversationManager) return app.chatHandler.conversationManager;
    const { SimulacrumCore } = await import('../core/simulacrum-core.js');
    return SimulacrumCore?.conversationManager ?? null;
  }

  /**
   * Conversation index of the prompt behind a UI message.
   *
   * UI messages are rebuilt from the conversation in order, so the ordinal of user
   * messages is stable between the two even though the message ids are not.
   * @param {object} app
   * @param {object} conversation
   * @param {string} messageId
   * @returns {number} Index into getMessages(), or -1
   */
  static _conversationIndexOf(app, conversation, messageId) {
    const uiIndex = app.messages.findIndex(message => message.id === messageId);
    const uiMessage = uiIndex >= 0 ? app.messages[uiIndex] : null;
    // Only prompts carry the ordinal mapping; anything else has no conversation position.
    if (uiMessage?.role !== 'user') return -1;

    const before = app.messages.slice(0, uiIndex);
    const ordinal = before.filter(message => message.role === 'user').length;

    const messages = conversation.getMessages() ?? [];
    let seen = 0;
    for (let index = 0; index < messages.length; index++) {
      if (messages[index].role !== 'user') continue;
      if (seen === ordinal) return index;
      seen++;
    }
    return -1;
  }

  /**
   * Swap a message's body for an inline editor. Save re-runs the turn from the edit;
   * Cancel just re-renders the log, so nothing has to be un-done.
   * @param {object} app
   * @param {object} edit - The conversation, its DOM body, the original text and the index
   */
  static _showMessageEditor(app, edit) {
    const { conversation, contentEl, original, index } = edit;
    const editor = document.createElement('div');
    editor.className = 'simulacrum-message-edit';

    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-input';
    textarea.value = original;

    const actions = document.createElement('div');
    actions.className = 'message-edit-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'message-edit-save';
    save.textContent = 'Save & resend';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'message-edit-cancel';
    cancel.textContent = 'Cancel';
    actions.append(save, cancel);
    editor.append(textarea, actions);

    const restore = () => app.render({ parts: ['log'] });
    cancel.addEventListener('click', restore);
    save.addEventListener('click', () => {
      const text = textarea.value.trim();
      if (!text || text === original) {
        restore();
        return;
      }
      SidebarEventHandlers._rewindAndResend(app, conversation, index, text);
    });

    contentEl.replaceChildren(editor);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  /**
   * Discard the turn from `index` onward and run it again with the edited prompt.
   * @param {object} app
   * @param {object} conversation
   * @param {number} index
   * @param {string} text
   */
  static async _rewindAndResend(app, conversation, index, text) {
    if (!conversation?.rewindFrom) return;

    // The edited prompt is dropped along with its turn; the send path below re-adds it
    // with the new text, so the log never shows the prompt twice.
    conversation.rewindFrom(index);
    await conversation.save();

    // Rebuild the log from the rewound conversation before the new turn starts.
    await app._syncFromCoreConversation?.();
    app.render({ parts: ['log', 'input'] });

    const signal = app.startProcess();
    app.setProcessing(true);
    try {
      await SidebarEventHandlers._processMessageThroughHandler(app, text, signal);
    } catch (error) {
      if (!signal.aborted) {
        log.error('Error resending edited message', error);
        ui.notifications?.error(`Simulacrum: ${error.message}`, { permanent: false });
      }
    } finally {
      app.finishProcess(signal);
    }
  }
}
