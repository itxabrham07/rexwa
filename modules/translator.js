import axios from 'axios';

/**
 * TranslateModule: A simple translator module using Google Translate API.
 * Supports translation with a configurable default language and minimal UI.
 */
class TranslateModule {
  constructor(bot) {
    this.bot = bot;
    this.name = 'translator';
    this.metadata = {
      description: 'Simple text translator',
      version: '2.2.0',
      author: 'HyperWa Team',
      category: 'utility',
    };

    // Default target language (can be changed with .setlang)
    this.defaultLanguage = 'en';

    // Command definitions
    this.commands = [
      {
        name: 'tr',
        description: 'Translates text or a replied message to the default or specified language.',
        usage: '.tr [lang] <text> OR reply with .tr [lang]',
        aliases: ['translate'],
        permissions: 'public',
        ui: {
          processingText: '🌐 Translating...',
          errorText: '❌ Translation Failed',
        },
        execute: this.translateCommand.bind(this),
      },
      {
        name: 'setlang',
        description: 'Sets the default language for translations.',
        usage: '.setlang <lang>',
        permissions: 'public',
        ui: {
          processingText: '⚙️ Setting language...',
          errorText: '❌ Failed to set language',
        },
        execute: this.setLanguage.bind(this),
      },
    ];

    // Message hook for potential auto-translation (no-op for now)
    this.messageHooks = {
      pre_process: this.handleAutoTranslate.bind(this),
    };
  }

  /**
   * Translates text or a replied message to the specified or default language.
   * @param {object} msg - The message object from Baileys.
   * @param {string[]} params - Command parameters.
   * @param {object} context - Additional context.
   * @returns {Promise<string>} The translated text.
   */
  async translateCommand(msg, params, context) {
    let targetLanguage;
    let textToTranslate;

    // Check if replying to a message
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quotedMsg) {
      textToTranslate =
        quotedMsg.conversation ||
        quotedMsg.extendedTextMessage?.text ||
        quotedMsg.imageMessage?.caption ||
        quotedMsg.videoMessage?.caption;

      if (!textToTranslate) {
        return '❌ No text found in the replied message.';
      }

      targetLanguage = params[0] || this.defaultLanguage;
    } else if (params.length >= 1) {
      // If first param isn't a language code, treat it as text
      const possibleLang = params[0].toLowerCase();
      if (params.length === 1 || possibleLang.length > 2) {
        textToTranslate = params.join(' ');
        targetLanguage = this.defaultLanguage;
      } else {
        targetLanguage = params.shift();
        textToTranslate = params.join(' ');
      }
    } else {
      return '❌ Usage: .tr [lang] <text> or reply with .tr [lang]';
    }

    try {
      const result = await this.translateText(textToTranslate, 'auto', targetLanguage.toLowerCase());
      return `Translation: ${result.translatedText}`;
    } catch (error) {
      return `❌ Translation failed: ${error.message}`;
    }
  }

  /**
   * Sets the default translation language.
   * @param {object} msg - The message object from Baileys.
   * @param {string[]} params - Command parameters (language code).
   * @param {object} context - Additional context.
   * @returns {string} Confirmation message.
   */
  async setLanguage(msg, params, context) {
    if (params.length !== 1) {
      return '❌ Usage: .setlang <lang> (e.g., .setlang es)';
    }

    const langCode = params[0].toLowerCase();
    this.defaultLanguage = langCode;
    return ` Default language set to ${langCode}.`;
  }

  /**
   * Translates text using Google Translate API.
   * @param {string} text - Text to translate.
   * @param {string} fromLang - Source language (default: 'auto').
   * @param {string} toLang - Target language.
   * @returns {Promise<object>} Translation result.
   */
  async translateText(text, fromLang = 'auto', toLang = 'en') {
    try {
      const response = await axios.get('https://translate.googleapis.com/translate_a/single', {
        params: {
          client: 'gtx',
          sl: fromLang,
          tl: toLang,
          dt: 't',
          q: text,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = response.data;
      const translatedText = result[0].map((item) => item[0]).join('');

      return {
        translatedText,
        originalText: text,
      };
    } catch (error) {
      throw new Error(`Translation service error: ${error.message}`);
    }
  }

  /**
   * Placeholder for auto-translation hook (no-op for now).
   * @param {object} msg - The message object.
   * @param {string} text - The message text.
   * @param {object} bot - The bot instance.
   */
  async handleAutoTranslate(msg, text, bot) {
    return;
  }
}

export default TranslateModule;
