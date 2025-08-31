import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class GeminiImageModule {
    constructor(sock) {
        this.sock = sock;

        // 🔑 Enter your API key here
        this.ai = new GoogleGenAI({
            apiKey: "AIzaSyAipn0J_8OzXfZWLt2l_Pn0jb28lkzAtZ0",
        });

        this.commands = {
            gimg: {
                description: "Generate an image using Gemini",
                usage: "!gimg <prompt>",
                example: "!gimg a cyberpunk cat riding a neon bike",
                execute: this.gimgCommand.bind(this),
            },
        };
    }

    async gimgCommand(msg, args) {
        const prompt = args.join(" ").trim();
        if (!prompt) {
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: "⚠️ Please provide a prompt.\n\nExample: !gimg a cyberpunk cat riding a neon bike",
            });
            return "❌ No prompt given";
        }

        try {
            // Generate image from prompt
            const response = await this.ai.models.generateContent({
                model: "gemini-2.5-flash-image-preview",
                contents: [{ text: prompt }],
            });

            const parts = response.candidates?.[0]?.content?.parts || [];
            let sentImages = 0;

            for (const part of parts) {
                if (part.inlineData) {
                    const buffer = Buffer.from(part.inlineData.data, "base64");
                    const filePath = path.join(__dirname, `gimg_${Date.now()}.png`);
                    fs.writeFileSync(filePath, buffer);

                    await this.sock.sendMessage(msg.key.remoteJid, {
                        image: { url: filePath },
                        caption: `🤖 Gemini Image\nPrompt: ${prompt}`,
                    });

                    fs.unlinkSync(filePath);
                    sentImages++;
                }
            }

            if (sentImages === 0) {
                await this.sock.sendMessage(msg.key.remoteJid, {
                    text: "⚠️ Gemini didn’t return an image.",
                });
                return "⚠️ No image generated";
            }

            return `✅ Gemini complete → Sent ${sentImages} image(s)`;

        } catch (err) {
            console.error("Gemini error:", err);
            await this.sock.sendMessage(msg.key.remoteJid, {
                text: "❌ Error while generating image from Gemini.",
            });
            return "❌ Error";
        }
    }
}
