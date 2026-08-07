const { spawnSync } = require('child_process');
const logger = require('../core/logger').createServiceLogger('CLAUDE_CODE');
const config = require('../core/config');

// Reused for prompt building (buildGeminiRequest / buildIntelligentTranscriptionRequest /
// enforceProgrammingLanguage are provider-agnostic despite living on the Gemini service —
// they just produce a generic {systemInstruction, contents} shape). Safe to require here:
// this module is only ever pulled in lazily (from inside llm.service.js's dispatch methods,
// or from main.js at startup after llm.service.js has already fully loaded), so there is no
// circular-require ordering issue.
const llmService = require('./llm.service');

class ClaudeCodeService {
  constructor() {
    this.isInitialized = false;
    this.command = null;
    this.requestCount = 0;
    this.errorCount = 0;

    this.initializeClient();
  }

  _getCommand() {
    return (process.env.CLAUDE_CLI_COMMAND || config.get('llm.claudeCode.command') || 'claude').trim();
  }

  initializeClient() {
    const result = this.detect();
    this.isInitialized = result.found;
    this.command = result.command || this._getCommand();

    if (result.found) {
      logger.info('Claude Code CLI detected', { command: result.command, version: result.version });
    } else {
      logger.warn('Claude Code CLI not detected', { command: this._getCommand(), error: result.error });
    }

    return result;
  }

  /**
   * Probe the CLI with `--version`. Mirrors whisper-installer.detect()'s
   * {found, command, version, error} shape so onboarding/settings UI can
   * reuse the same status-pill rendering logic.
   */
  detect() {
    const command = this._getCommand();
    try {
      const result = spawnSync(command, ['--version'], {
        encoding: 'utf8',
        timeout: 8000,
        windowsHide: true
        // ponytail: no shell:true — matches the whisper CLI spawn pattern in
        // speech.service.js. Works for a real .exe (this app's tested case);
        // an npm-shim install (claude.cmd) would need shell:true to launch on
        // Windows. Revisit if users report ENOENT with an npm-installed CLI.
      });

      if (result.error || result.status !== 0) {
        return {
          found: false,
          command: null,
          version: null,
          error: result.error ? result.error.message : `exit code ${result.status}`
        };
      }

      const version = (result.stdout || '').trim().split(/\s+/)[0] || null;
      return { found: true, command, version, error: null };
    } catch (error) {
      return { found: false, command: null, version: null, error: error.message };
    }
  }

  /**
   * Run one headless, non-agentic Claude Code call. --allowedTools "" is the
   * safety boundary: without it the CLI can run Bash/Edit/Write, and a
   * transcribed voice snippet or screenshot-derived prompt must never be able
   * to trigger file edits or shell commands in the project directory.
   */
  runPrompt(systemPrompt, userText) {
    const command = this._getCommand();
    const timeout = config.get('llm.claudeCode.timeout') || 60000;
    const model = process.env.CLAUDE_MODEL || config.get('llm.claudeCode.model') || 'claude-sonnet-4-5';
    const args = ['-p', userText, '--model', model, '--output-format', 'text', '--allowedTools', ''];
    if (systemPrompt && systemPrompt.trim()) {
      args.push('--append-system-prompt', systemPrompt);
    }

    const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout,
      windowsHide: true
    });

    if (result.error) {
      throw new Error(`Claude Code CLI failed to start: ${result.error.message}`);
    }
    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim();
      throw new Error(`Claude Code CLI exited with code ${result.status}${stderr ? `: ${stderr}` : ''}`);
    }

    const text = (result.stdout || '').trim();
    if (!text) {
      throw new Error('Empty response from Claude Code CLI');
    }
    return text;
  }

  /**
   * Flatten the generic {systemInstruction, contents} request shape (built by
   * llmService's existing skill/history/language logic) into a single prompt
   * string, since the CLI takes one positional prompt rather than structured
   * turns.
   */
  flattenRequest(request) {
    const systemPrompt =
      (request.systemInstruction && request.systemInstruction.parts && request.systemInstruction.parts[0] && request.systemInstruction.parts[0].text) || '';

    const contents = Array.isArray(request.contents) ? request.contents : [];
    const turns = contents
      .map((turn) => {
        const roleLabel = turn.role === 'model' ? 'Assistant' : 'User';
        const text = (turn.parts || [])
          .map((p) => (typeof p.text === 'string' ? p.text : ''))
          .join(' ')
          .trim();
        return { roleLabel, text };
      })
      .filter((t) => t.text.length > 0);

    if (turns.length === 0) {
      throw new Error('No content to send to Claude Code CLI');
    }

    const last = turns[turns.length - 1];
    const history = turns.slice(0, -1);
    const historyBlock = history.length
      ? `Conversation so far:\n${history.map((t) => `${t.roleLabel}: ${t.text}`).join('\n')}\n\n`
      : '';

    return { systemPrompt, userText: `${historyBlock}${last.text}` };
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    const startTime = Date.now();
    this.requestCount++;

    try {
      const request = llmService.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const { systemPrompt, userText } = this.flattenRequest(request);
      let responseText = this.runPrompt(systemPrompt, userText);
      responseText = programmingLanguage
        ? llmService.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('Claude Code text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: responseText.length,
        requestId: this.requestCount
      });

      return {
        response: responseText,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Claude Code text processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });
      throw error;
    }
  }

  async processTextWithSkillStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    const result = await this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage);
    if (typeof onDelta === 'function' && result.response) {
      onDelta(result.response);
    }
    return { ...result, metadata: { ...result.metadata, streamed: true } };
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    const startTime = Date.now();
    this.requestCount++;

    try {
      const request = llmService.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const { systemPrompt, userText } = this.flattenRequest(request);
      let responseText = this.runPrompt(systemPrompt, userText);
      responseText = programmingLanguage
        ? llmService.enforceProgrammingLanguage(responseText, programmingLanguage)
        : responseText;

      logger.logPerformance('Claude Code transcription processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: responseText.length,
        requestId: this.requestCount
      });

      return {
        response: responseText,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Claude Code transcription processing failed', {
        error: error.message,
        activeSkill,
        requestId: this.requestCount
      });
      throw error;
    }
  }

  async processTranscriptionWithIntelligentResponseStream(text, activeSkill, sessionMemory = [], programmingLanguage = null, onDelta = null) {
    const result = await this.processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory, programmingLanguage);
    if (typeof onDelta === 'function' && result.response) {
      onDelta(result.response);
    }
    return { ...result, metadata: { ...result.metadata, streamed: true } };
  }

  // Scope cut: headless Claude Code image handling isn't a reliable, documented
  // API. Screenshot analysis stays Gemini-only; surface a clear, actionable
  // error instead of guessing at multimodal support.
  async processImageWithSkill() {
    throw new Error('Screenshot analysis needs the Gemini provider. Switch providers in Settings, or configure a Gemini key.');
  }

  async processImageWithSkillStream() {
    return this.processImageWithSkill();
  }

  async testConnection() {
    const detected = this.detect();
    if (!detected.found) {
      return {
        success: false,
        message: `Claude Code CLI not found (command: "${this._getCommand()}"). Install it from claude.com/code and make sure it's on PATH.`
      };
    }

    try {
      const text = this.runPrompt('You are a connection test.', 'Reply with exactly: OK');
      return {
        success: true,
        message: `Claude Code CLI works: ${detected.command} (v${detected.version || '?'}). Response: ${text.slice(0, 80)}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Claude Code CLI detected but probe failed: ${error.message}`
      };
    }
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: config.get('llm.claudeCode')
    };
  }
}

module.exports = new ClaudeCodeService();
