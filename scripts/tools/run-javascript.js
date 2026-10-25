/* eslint-disable no-new-func */
import { BaseTool } from './base-tool.js';

/**
 * A caution for the empty result that reads like a finding: a script that returned nothing and
 * logged nothing is the absence of a result from THIS script, not evidence that the thing does
 * not exist. Attached at the moment it would otherwise be misread.
 * @param {*} result
 * @param {Array} logs
 * @returns {string}
 */
function emptyResultCaution(result, logs) {
  if (logs.length) return '';
  const empty =
    result === undefined ||
    result === null ||
    (Array.isArray(result) && result.length === 0) ||
    (typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === 0);
  if (!empty) return '';
  return '\n\nNothing was returned and nothing was logged. That is the absence of a result from THIS script, not evidence that the thing does not exist. If the question was how a mechanism works or whether it is present, this was the wrong tool - read the reference with read_reference and read the file that owns it before concluding anything.';
}

/**
 * Tool to execute arbitrary JavaScript code.
 * WARNING: This tool allows full code execution.
 */
export class RunJavascriptTool extends BaseTool {
  constructor() {
    super(
      'run_javascript',
      'Execute JavaScript code in the FoundryVTT browser context. The script runs with full access to the Foundry API (`game`, `canvas`, `CONFIG`, `ui`, etc.) and can interact with any game data or UI element. Use `return` to send a value back. Console output is captured and included in the result. This runs code in THIS WORLD and cannot read the shipped reference: for a "how does this work" or "does this exist" question use read_reference, not a script.',
      {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description:
              'The JavaScript code to execute. Runs as an async function body — use `await` for async operations and `return` to return a value. `console.log`, `console.warn`, and `console.error` output is captured and returned alongside the result.',
          },
        },
        required: ['script'],
      }
    );
  }

  /**
   * @param {object} args
   * @param {string} args.script
   * @returns {Promise<Object>} Result with content and display
   */
  async execute({ script }) {
    const logs = [];
    const originalConsole = console;

    // Create a proxy console to capture logs
    // We bind to original console methods to ensure they still work in the browser console
    const capturedConsole = {
      log: (...args) => {
        logs.push({ type: 'log', message: args.map(a => String(a)).join(' ') });
        originalConsole.log(...args);
      },
      warn: (...args) => {
        logs.push({ type: 'warn', message: args.map(a => String(a)).join(' ') });
        originalConsole.warn(...args);
      },
      error: (...args) => {
        logs.push({ type: 'error', message: args.map(a => String(a)).join(' ') });
        originalConsole.error(...args);
      },
      info: (...args) => {
        logs.push({ type: 'info', message: args.map(a => String(a)).join(' ') });
        originalConsole.info(...args);
      },
      debug: (...args) => {
        logs.push({ type: 'debug', message: args.map(a => String(a)).join(' ') });
        originalConsole.debug(...args);
      },
    };

    const formatLogs = () =>
      logs.length > 0
        ? '\nConsole output:\n' + logs.map(l => `[${l.type}] ${l.message}`).join('\n')
        : '';

    try {
      // Use AsyncFunction
      // We pass 'console' as an argument to shadow the global console within the script scope
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('console', script);

      const result = await fn(capturedConsole);

      const resultStr = result !== undefined ? JSON.stringify(result) : 'undefined';
      const content = `Result: ${resultStr}${formatLogs()}${emptyResultCaution(result, logs)}`;
      const display = `Script executed successfully`;
      return this.createSuccessResponse(content, display);
    } catch (err) {
      const message = `Script error: ${err.message}${formatLogs()}`;
      return this.handleError(message, err.constructor.name);
    }
  }
}
