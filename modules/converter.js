import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url'; // ADDED: Required for ES Module __dirname equivalent
import { exec } from 'child_process';
import { promisify } from 'util';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import axios from 'axios';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';

const execAsync = promisify(exec);

class ConverterModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'converter';
        this.metadata = {
            description: 'Advanced media and unit converter with audio/video processing',
            version: '2.0.4',
            author: 'HyperWa Team',
            category: 'utility'
        };

        // FIX: Replaced CommonJS __dirname with ES Module method
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.tempDir = path.join(__dirname, '../temp');
        this.ensureTempDir();

        // Exchange rates cache
        this.exchangeRates = null;
        this.ratesLastUpdated = 0;
        this.ratesCacheTime = 3600000; // 1 hour

        this.commands = [
            // Media Converters
            {
                name: 'sticker',
                description: 'Convert image/text to sticker',
                usage: '.sticker (reply to image or provide text)',
                aliases: ['s'],
                permissions: 'public',
                execute: this.createStickerAuto.bind(this)
            },
            {
                name: 'toimg',
                description: 'Convert sticker to image',
                usage: '.toimg (reply to sticker)',
                permissions: 'public',
                execute: this.stickerToImage.bind(this)
            },
            {
                name: 'togif',
                description: 'Convert animated sticker to GIF',
                usage: '.togif (reply to animated sticker)',
                permissions: 'public',
                execute: this.stickerToGif.bind(this)
            },
            {
                name: 'tovn',
                description: 'Convert audio to WhatsApp voice note',
                usage: '.tovn (reply to audio)',
                permissions: 'public',
                execute: this.audioToVoiceNote.bind(this)
            },
            {
                name: 'tomp3',
                description: 'Convert audio/video to MP3',
                usage: '.tomp3 (reply to media)',
                permissions: 'public',
                execute: this.toMp3.bind(this)
            },
            {
                name: 'tomp4',
                description: 'Convert video to MP4',
                usage: '.tomp4 (reply to video)',
                permissions: 'public',
                execute: this.toMp4.bind(this)
            },
            {
                name: 'denoise',
                description: 'Remove noise from audio',
                usage: '.denoise (reply to audio)',
                permissions: 'public',
                execute: this.denoiseAudio.bind(this)
            },
            {
                name: 'mutevideo',
                description: 'Remove audio from video',
                usage: '.mutevideo (reply to video)',
                permissions: 'public',
                execute: this.muteVideo.bind(this)
            },

            // Currency Converter
            {
                name: 'currency',
                description: 'Convert currency',
                usage: '.currency <amount> <from> <to>',
                aliases: ['cur', 'exchange'],
                permissions: 'public',
                execute: this.convertCurrency.bind(this)
            }
        ];
    }

    async ensureTempDir() {
        try {
            await fs.ensureDir(this.tempDir);
            const testFile = path.join(this.tempDir, 'test.txt');
            await fs.writeFile(testFile, 'test');
            await fs.remove(testFile);
        } catch (error) {
            console.error(`Failed to ensure temp directory: ${error.message}`);
            throw new Error('Cannot create or write to temporary directory');
        }
    }

    async createStickerAuto(msg, params, context) {
        try {
            let mediaBuffer;
            let isTextSticker = false;
            let stickerOptions = {
                pack: 'HyperWa Stickers',
                author: 'HyperWa Bot',
                categories: ['🤖', '💬'],
                id: `hyperwa-${Date.now()}`,
                quality: 50,
                type: StickerTypes.DEFAULT
            };

            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            // CASE 1: Text Sticker
            if (!quotedMsg && params.length > 0) {
                const text = params.join(' ');
                if (text.length > 100) {
                    return await context.bot.sendMessage(context.sender, { text: '❌ Text is too long. Please use up to 100 characters.' });
                }
                mediaBuffer = await this.createTextImage(text);
                stickerOptions.pack = 'HyperWa Text Stickers';
                stickerOptions.categories = ['📝', '💬'];
                isTextSticker = true;
            }

            // CASE 2: Image Sticker
            if (!isTextSticker) {
                if (!quotedMsg) {
                    return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to an image to create a sticker.' });
                }

                if (quotedMsg.videoMessage) {
                    return await context.bot.sendMessage(context.sender, { text: '❌ Video stickers are not supported. Use .togif2 to convert a video to GIF.' });
                }

                if (quotedMsg.imageMessage) {
                    const stream = await downloadContentFromMessage(quotedMsg.imageMessage, 'image');
                    const chunks = [];
                    for await (const chunk of stream) chunks.push(chunk);
                    mediaBuffer = Buffer.concat(chunks);
                } else {
                    return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to a valid image.' });
                }
            }

            if (!mediaBuffer) {
                return await context.bot.sendMessage(context.sender, { text: '❌ No valid image or text provided for sticker creation.' });
            }

            if (mediaBuffer.length > 1000000) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Image is too large. Please use an image smaller than 1MB.' });
            }

            const sticker = new Sticker(mediaBuffer, stickerOptions);
            const stickerBuffer = await sticker.toBuffer();

            if (!stickerBuffer || stickerBuffer.length === 0) {
                throw new Error('Generated sticker buffer is empty or invalid');
            }

            await context.bot.sendMessage(context.sender, { sticker: stickerBuffer });

        } catch (error) {
            console.error(`Sticker creation failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to create sticker: ${error.message}` });
        }
    }

    async createTextImage(text) {
        try {
            const sharp = require('sharp');
            const svg = `
                <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
                    <rect width="512" height="512" fill="#ffffff"/>
                    <text x="256" y="256" font-family="Arial, sans-serif" font-size="40"
                          text-anchor="middle" dominant-baseline="middle" fill="#000000">
                        ${text}
                    </text>
                </svg>
            `;
            return await sharp(Buffer.from(svg)).png().toBuffer();
        } catch (error) {
            console.warn('Sharp not available, using placeholder for text sticker');
            throw new Error('Text sticker creation requires image processing library (sharp)');
        }
    }

    async stickerToImage(msg, params, context) {
        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg?.stickerMessage) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to a sticker to convert it to image.' });
            }

            const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const inputFile = path.join(this.tempDir, `sticker_${Date.now()}.webp`);
            const outputFile = path.join(this.tempDir, `image_${Date.now()}.png`);

            await fs.writeFile(inputFile, buffer);
            await execAsync(`ffmpeg -i "${inputFile}" "${outputFile}"`);

            const imageBuffer = await fs.readFile(outputFile);

            await context.bot.sendMessage(context.sender, {
                image: imageBuffer,
                caption: '🖼️ Sticker converted to image'
            });

            await Promise.all([
                fs.remove(inputFile).catch(() => {}),
                fs.remove(outputFile).catch(() => {})
            ]);
        } catch (error) {
            console.error(`Sticker to image conversion failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to convert sticker: ${error.message}` });
        }
    }

    async stickerToGif(msg, params, context) {
        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg?.stickerMessage) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to an animated sticker to convert it to GIF.' });
            }

            const stream = await downloadContentFromMessage(quotedMsg.stickerMessage, 'sticker');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const inputFile = path.join(this.tempDir, `sticker_${Date.now()}.webp`);
            const outputFile = path.join(this.tempDir, `gif_${Date.now()}.gif`);

            await fs.writeFile(inputFile, buffer);
            await execAsync(`ffmpeg -i "${inputFile}" -vf "fps=10,scale=320:320:force_original_aspect_ratio=decrease,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=#00000000" -an -q:v 50 -f gif "${outputFile}"`);

            let gifBuffer = await fs.readFile(outputFile);

            if (gifBuffer.length > 1000000) {
                await execAsync(`ffmpeg -i "${inputFile}" -vf "fps=8,scale=240:240:force_original_aspect_ratio=decrease,pad=240:240:(ow-iw)/2:(oh-ih)/2:color=#00000000" -an -q:v 75 -f gif "${outputFile}"`);
                gifBuffer = await fs.readFile(outputFile);
                if (gifBuffer.length > 1000000) {
                    await Promise.all([
                        fs.remove(inputFile).catch(() => {}),
                        fs.remove(outputFile).catch(() => {})
                    ]);
                    return await context.bot.sendMessage(context.sender, { text: '❌ Generated GIF is too large. Please try a smaller sticker.' });
                }
                await context.bot.sendMessage(context.sender, {
                    video: gifBuffer,
                    gifPlayback: true,
                    caption: '🎭 Sticker converted to GIF (compressed)'
                });
            } else {
                await context.bot.sendMessage(context.sender, {
                    video: gifBuffer,
                    gifPlayback: true,
                    caption: '🎭 Sticker converted to GIF'
                });
            }

            await Promise.all([
                fs.remove(inputFile).catch(() => {}),
                fs.remove(outputFile).catch(() => {})
            ]);
        } catch (error) {
            console.error(`Sticker to GIF conversion failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to convert sticker to GIF: ${error.message}` });
        }
    }

    async audioToVoiceNote(msg, params, context) {
        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg?.audioMessage && !quotedMsg?.videoMessage) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to an audio or video file to convert to voice note.' });
            }

            const mediaType = quotedMsg.audioMessage ? 'audio' : 'video';
            const mediaMessage = quotedMsg[`${mediaType}Message`];
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const inputFile = path.join(this.tempDir, `input_${Date.now()}.${mediaType === 'audio' ? 'mp3' : 'mp4'}`);
            const outputFile = path.join(this.tempDir, `voice_${Date.now()}.ogg`);

            await fs.writeFile(inputFile, buffer);
            await execAsync(`ffmpeg -i "${inputFile}" -c:a libopus -b:a 32k -vn "${outputFile}"`);

            const voiceBuffer = await fs.readFile(outputFile);

            await context.bot.sendMessage(context.sender, {
                audio: voiceBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            });

            await Promise.all([
                fs.remove(inputFile).catch(() => {}),
                fs.remove(outputFile).catch(() => {})
            ]);
        } catch (error) {
            console.error(`Voice note conversion failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to convert to voice note: ${error.message}` });
        }
    }

    async toMp3(msg, params, context) {
        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg?.audioMessage && !quotedMsg?.videoMessage) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to an audio or video file to convert to MP3.' });
            }

            const mediaType = quotedMsg.audioMessage ? 'audio' : 'video';
            const mediaMessage = quotedMsg[`${mediaType}Message`];
            const stream = await downloadContentFromMessage(mediaMessage, mediaType);
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const inputFile = path.join(this.tempDir, `input_${Date.now()}.${mediaType === 'audio' ? 'ogg' : 'mp4'}`);
            const outputFile = path.join(this.tempDir, `mp3_${Date.now()}.mp3`);

            await fs.writeFile(inputFile, buffer);
            await execAsync(`ffmpeg -i "${inputFile}" -c:a libmp3lame -q:a 2 "${outputFile}"`);

            const mp3Buffer = await fs.readFile(outputFile);

            await context.bot.sendMessage(context.sender, {
                audio: mp3Buffer,
                mimetype: 'audio/mpeg'
            });

            await Promise.all([
                fs.remove(inputFile).catch(() => {}),
                fs.remove(outputFile).catch(() => {})
            ]);
        } catch (error) {
            console.error(`MP3 conversion failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to convert to MP3: ${error.message}` });
        }
    }

    async toMp4(msg, params, context) {
        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg?.videoMessage) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to a video file to convert to MP4.' });
            }

            const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const inputFile = path.join(this.tempDir, `input_${Date.now()}.mp4`);
            const outputFile = path.join(this.tempDir, `mp4_${Date.now()}.mp4`);

            await fs.writeFile(inputFile, buffer);
            await execAsync(`ffmpeg -i "${inputFile}" -c copy "${outputFile}"`);

            const mp4Buffer = await fs.readFile(outputFile);

            await context.bot.sendMessage(context.sender, {
                video: mp4Buffer,
                caption: '🎥 Converted to MP4'
            });

            await Promise.all([
                fs.remove(inputFile).catch(() => {}),
                fs.remove(outputFile).catch(() => {})
            ]);
        } catch (error) {
            console.error(`MP4 conversion failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to convert to MP4: ${error.message}` });
        }
    }


    async denoiseAudio(msg, params, context) {
        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg?.audioMessage) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to an audio file to remove noise.' });
            }

            const stream = await downloadContentFromMessage(quotedMsg.audioMessage, 'audio');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const inputFile = path.join(this.tempDir, `input_${Date.now()}.ogg`);
            const outputFile = path.join(this.tempDir, `denoised_${Date.now()}.mp3`);

            await fs.writeFile(inputFile, buffer);
            await execAsync(`ffmpeg -i "${inputFile}" -af "highpass=f=200,lowpass=f=3000,afftdn" -c:a libmp3lame -b:a 128k "${outputFile}"`);

            const denoisedBuffer = await fs.readFile(outputFile);

            await context.bot.sendMessage(context.sender, {
                audio: denoisedBuffer,
                mimetype: 'audio/mpeg',
                caption: '🔇 Noise removed from audio'
            });

            await Promise.all([
                fs.remove(inputFile).catch(() => {}),
                fs.remove(outputFile).catch(() => {})
            ]);
        } catch (error) {
            console.error(`Audio denoising failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to denoise audio: ${error.message}` });
        }
    }

    async muteVideo(msg, params, context) {
        try {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg?.videoMessage) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Please reply to a video file to mute.' });
            }

            const stream = await downloadContentFromMessage(quotedMsg.videoMessage, 'video');
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const inputFile = path.join(this.tempDir, `input_${Date.now()}.mp4`);
            const outputFile = path.join(this.tempDir, `muted_${Date.now()}.mp4`);

            await fs.writeFile(inputFile, buffer);
            await execAsync(`ffmpeg -i "${inputFile}" -c:v copy -an "${outputFile}"`);

            const mutedBuffer = await fs.readFile(outputFile);

            await context.bot.sendMessage(context.sender, {
                video: mutedBuffer,
                caption: '🔇 Video muted (audio removed)'
            });

            await Promise.all([
                fs.remove(inputFile).catch(() => {}),
                fs.remove(outputFile).catch(() => {})
            ]);
        } catch (error) {
            console.error(`Video muting failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to mute video: ${error.message}` });
        }
    }

  
    async convertCurrency(msg, params, context) {
        try {
            if (params.length < 3) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Usage: .currency <amount> <from> <to>\nExample: .currency 100 USD EUR' });
            }

            const amount = parseFloat(params[0]);
            const fromCurrency = params[1].toUpperCase();
            const toCurrency = params[2].toUpperCase();

            if (isNaN(amount)) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Invalid amount. Please provide a valid number.' });
            }

            await this.updateExchangeRates();
            if (!this.exchangeRates[fromCurrency] || !this.exchangeRates[toCurrency]) {
                return await context.bot.sendMessage(context.sender, { text: '❌ Invalid currency code. Please use valid 3-letter currency codes (e.g., USD, EUR, GBP).' });
            }

            const fromRate = this.exchangeRates[fromCurrency];
            const toRate = this.exchangeRates[toCurrency];
            const convertedAmount = (amount / fromRate) * toRate;

            await context.bot.sendMessage(context.sender, {
                text: `💱 **Currency Conversion**\n\n` +
                      `${amount} ${fromCurrency} = ${convertedAmount.toFixed(2)} ${toCurrency}\n\n` +
                      `📊 Exchange Rate: 1 ${fromCurrency} = ${(toRate / fromRate).toFixed(4)} ${toCurrency}\n` +
                      `⏰ Updated: ${new Date(this.ratesLastUpdated).toLocaleString()}`
            });
        } catch (error) {
            console.error(`Currency conversion failed: ${error.message}`);
            await context.bot.sendMessage(context.sender, { text: `❌ Failed to convert currency: ${error.message}` });
        }
    }

    async updateExchangeRates() {
        const now = Date.now();
        if (this.exchangeRates && (now - this.ratesLastUpdated) < this.ratesCacheTime) {
            return;
        }

        try {
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
            this.exchangeRates = { USD: 1, ...response.data.rates };
            this.ratesLastUpdated = now;
        } catch (error) {
            throw new Error('Failed to fetch exchange rates');
        }
    }
}

export default ConverterModule;
