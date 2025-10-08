class Helpers {
  static async smartErrorRespond(bot, originalMsg, options = {}) {
    const {
      actionFn = () => { throw new Error('No action provided'); },
      processingText = '⏳ Processing...',
      errorText = '❌ Something went wrong.'
    } = options;

    if (!bot?.sock?.sendMessage || !originalMsg?.key?.remoteJid) return;

    const jid = originalMsg.key.remoteJid;
    const isMe = originalMsg.key.fromMe === true;
    let procKey = originalMsg.key;

    // Edit own message or send temporary processing message
    if (isMe) {
      await bot.sock.sendMessage(jid, {
        text: processingText,
        edit: originalMsg.key
      });
    } else {
      const m = await bot.sock.sendMessage(jid, { text: processingText });
      procKey = m.key;
    }

    try {
      const result = await actionFn();

      await bot.sock.sendMessage(jid, {
        text: typeof result === 'string'
          ? result
          : JSON.stringify(result, null, 2),
        edit: procKey
      });

      return result;

    } catch (error) {
      await bot.sock.sendMessage(jid, {
        text: `${errorText}${error.message ? `\n\n🔍 ${error.message}` : ''}`,
        edit: procKey
      });

      error._handledBySmartError = true;
      throw error;
    }


  }

  static async sendCommandResponse(bot, originalMsg, responseText) {
    await this.smartErrorRespond(bot, originalMsg, {
      processingText: '⏳ Checking command...',
      errorText: responseText,
      actionFn: async () => {
        throw new Error(responseText);
      }
    });
  }

  static formatUptime(startTime) {
    if (typeof startTime !== 'number') return '0s';
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (secs || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
  }

  static formatFileSize(bytes) {
    if (typeof bytes !== 'number' || bytes <= 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  static cleanPhoneNumber(phone) {
    return typeof phone === 'string' ? phone.replace(/[^\d]/g, '') : '';
  }

  static isOwner(participant) {
    const owner = config.get('bot.owner');
    return participant === owner;
  }

  static generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
  }
}

export default Helpers;
