const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiModule {
    constructor(sock) {
        this.sock = sock;
        this.name = 'gemini';
        this.metadata = {
            description: 'Gemini AI image + text generation',
            version: '1.1.0',
            author: 'Bot Developer',
            category: 'ai'
        };

        // Put your Gemini API key here
        this.GEMINI_API_KEY = "AIzaSyAipn0J_8OzXfZWLt2l_Pn0jb28lkzAtZ0";
        this.genAI = null;
        this.model = null;

        this.commands = [
            {
                name: 'gimg',
                description: 'Generate text/images with Gemini AI or edit replied images',
                usage: '.gimg <prompt> or reply with .gimg',
                permissions: 'public',
                execute: this.gimgCommand.bind(this)
            }
        ];
    }

    async init() {
        if (!this.GEMINI_API_KEY || this.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
            throw new Error("❌ Gemini API key not configured");
        }
        this.genAI = new GoogleGenerativeAI(this.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        console.log("✅ Gemini AI module initialized");
    }

    async runSubprocess(cmd, timeout = null) {
        return new Promise((resolve, reject) => {
            const proc = spawn(cmd[0], cmd.slice(1));
            let stdout = '', stderr = '';

            proc.stdout.on('data', d => stdout += d.toString());
            proc.stderr.on('data', d => stderr += d.toString());

            const timeoutId = timeout ? setTimeout(() => {
                proc.kill();
                reject(new Error("Process timeout"));
            }, timeout * 1000) : null;

            proc.on('close', code => {
                if (timeoutId) clearTimeout(timeoutId);
                resolve({ returncode: code, stdout, stderr });
            });

            proc.on('error', err => {
                if (timeoutId) clearTimeout(timeoutId);
                reject(err);
            });
        });
    }

    async gimgCommand(msg, args) {
        const chatId = msg.key.remoteJid;
        if (!this.model) return "❌ Gemini not initialized. Check API key.";

        let prompt = args.length > 0 ? args.join(" ") : null;
        let imageData = null;

        // handle quoted msg
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!prompt && quoted?.conversation) prompt = quoted.conversation;
        if (!prompt && quoted?.imageMessage?.caption) prompt = quoted.imageMessage.caption;

        if (quoted?.imageMessage) {
            try {
                const buffer = await this.sock.downloadMediaMessage({ message: quoted });
                imageData = buffer;
                if (!prompt) prompt = "Edit this image";
            } catch (e) {
                return "❌ Failed to download quoted image.";
            }
        }

        if (!prompt) {
            return "❌ Usage: .gimg <prompt> or reply with .gimg\nExample: `.gimg draw a cyberpunk city`";
        }

        try {
            // build content
            const contentParts = [{ text: prompt }];
            if (imageData) {
                let mimeType = "image/jpeg";
                if (imageData[0] === 0x89 && imageData[1] === 0x50) mimeType = "image/png";
                else if (imageData[0] === 0xff && imageData[1] === 0xd8) mimeType = "image/jpeg";

                contentParts.push({
                    inlineData: {
                        data: imageData.toString("base64"),
                        mimeType
                    }
                });
            }

            const result = await this.model.generateContent(contentParts);
            const response = await result.response;
            const parts = response.candidates?.[0]?.content?.parts || [];

            let sentText = false;
            let sentImages = 0;

            for (const part of parts) {
                if (part.text) {
                    sentText = true;
                    const cleanText = part.text.trim();
                    const maxLength = 3500;

                    if (cleanText.length > maxLength) {
                        for (let i = 0; i < cleanText.length; i += maxLength) {
                            const chunk = cleanText.substring(i, i + maxLength);
                            await this.sock.sendMessage(chatId, { text: `🤖 Gemini:\n\n${chunk}` }, { quoted: msg });
                        }
                    } else {
                        await this.sock.sendMessage(chatId, { text: `🤖 Gemini:\n\n${cleanText}` }, { quoted: msg });
                    }
                }

                if (part.inlineData?.data) {
                    const buffer = Buffer.from(part.inlineData.data, "base64");
                    await this.sock.sendMessage(chatId, {
                        image: buffer,
                        caption: "🤖 Gemini Generated Image"
                    }, { quoted: msg });
                    sentImages++;
                }
            }

            if (!sentText && sentImages === 0) {
                return "⚠️ Gemini returned no output.";
            }

            return `✅ Generation Complete\nSent ${sentText ? "text" : ""}${sentText && sentImages ? " + " : ""}${sentImages ? `${sentImages} image(s)` : ""}.`;

        } catch (err) {
            const msgErr = err.message || err.toString();
            if (msgErr.includes("API_KEY")) return "❌ Invalid Gemini API key.";
            if (msgErr.includes("QUOTA")) return "❌ API quota exceeded.";
            if (msgErr.includes("TIMEOUT")) return "⏰ Request timeout.";
            return `❌ Error: ${msgErr}`;
        }
    }

    async destroy() {
        console.log("🛑 Gemini module destroyed");
    }
}

module.exports = GeminiModule;
