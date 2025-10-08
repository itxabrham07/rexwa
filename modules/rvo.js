import fs from 'fs';
import path from 'path';
import {  tmpdir  } from 'os';
import {  exec  } from 'child_process';
import {  downloadMediaMessage  } from '@whiskeysockets/baileys';
import helpers from '../utils/helpers.js';

export default {
   name: 'rvo',
   metadata: {
      description: 'Reveal view-once media (image/video/audio) by replying to it.',
      version: '1.0.0',
      author: 'HyperWaBot',
      category: 'media',
   },
   commands: [
      {
         name: 'rvo',
         description: 'Reply to a view-once media message to extract and resend it.',
         usage: '.rvo',
         permissions: 'public',
         async execute(msg, args, { bot }) {
            const sock = bot.sock;

            const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = contextInfo?.quotedMessage;

            if (!quoted) {
               return sock.sendMessage(msg.key.remoteJid, {
                  text: '⚠️ Please *reply* to a view-once image, video, or audio message to use this command.'
               }, { quoted: msg });
            }

            try {
               const rawType = Object.keys(quoted)[0];
               const content = quoted[rawType];

               const typeMap = {
                  imageMessage: 'image',
                  videoMessage: 'video',
                  audioMessage: 'audio'
               };

               const mappedType = typeMap[rawType];
               if (!mappedType) {
                  return sock.sendMessage(msg.key.remoteJid, {
                     text: '❌ Unsupported media type. Only image, video, or audio are supported.'
                  }, { quoted: msg });
               }

               const buffer = await downloadMediaMessage(
                  { key: contextInfo, message: quoted },
                  'buffer',
                  {}
               );

               if (mappedType === 'audio') {
                  const inputPath = path.join(tmpdir(), `input-${Date.now()}.mp3`);
                  const outputPath = path.join(tmpdir(), `output-${Date.now()}.mp3`);
                  fs.writeFileSync(inputPath, buffer);

                  exec(`ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 128k "${outputPath}"`, async (err) => {
                     fs.unlinkSync(inputPath);
                     if (err) {
                        return sock.sendMessage(msg.key.remoteJid, {
                           text: '❌ Audio conversion failed.'
                        }, { quoted: msg });
                     }

                     const outBuffer = fs.readFileSync(outputPath);
                     fs.unlinkSync(outputPath);

                     await sock.sendMessage(msg.key.remoteJid, {
                        audio: outBuffer,
                        mimetype: 'audio/mp4'
                     }, { quoted: msg });
                  });
               } else {
                  await sock.sendMessage(msg.key.remoteJid, {
                     [mappedType]: buffer,
                     caption: content?.caption || ''
                  }, { quoted: msg });
               }

            } catch (error) {
               console.error('RVO Error:', error);
               await sock.sendMessage(msg.key.remoteJid, {
                  text: `❌ Failed to reveal media.\n\nError: ${error.message}`
               }, { quoted: msg });
            }
         }
      }
   ]
};
