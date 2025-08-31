
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

class GimgModule {
    constructor(bot) {
        this.bot = bot;
        this.name = "gimg";
        this.metadata = {
            description: "Generate images using Google Gemini",
            version: "1.0.0",
            author: "Rex",
            category: "ai"
        };

        // 🔑 Set your Gemini API Key here
        this.ai = new GoogleGenAI({
            apiKey: "AIzaSyAipn0J_8OzXfZWLt2l_Pn0jb28lkzAtZ0"
        });

        this.commands = [
            {
                name: "gimg",
                description: "Generate an AI image with Gemini",
                usage: ".gimg <prompt>",
                permissions: "public",
                ui: {
                    errorText: "❌ *Image Generation Failed*"
                },
                execute: this.gimgCommand.bind(this)
            }
        ];
    }

    async gimgCommand(msg, params, context) {
        const prompt = params.join(" ").trim();
        if (!prompt) {
            return "⚠️ Please provide a prompt.\n\nExample: `.gimg a cyberpunk cat riding a neon bike`";
        }

        try {
            const response = await this.ai.models.generateContent({
                model: "gemini-2.0-flash-preview-image-generation",
                contents: [{ text: prompt }],
            });

            const parts = response.candidates?.[0]?.content?.parts || [];
            let sentImages = 0;

            for (const part of parts) {
                if (part.inlineData) {
                    const buffer = Buffer.from(part.inlineData.data, "base64");
                    const filePath = path.join(__dirname, `gimg_${Date.now()}.png`);
                    fs.writeFileSync(filePath, buffer);

                    await this.bot.sendMessage(msg.key.remoteJid, {
                        image: { url: filePath },
                        caption: `🤖 Gemini Image\nPrompt: ${prompt}`,
                    });

                    fs.unlinkSync(filePath);
                    sentImages++;
                }
            }

            if (sentImages === 0) {
                return "⚠️ Gemini didn’t return an image.";
            }

            return `✅ Gemini generated ${sentImages} image(s)`;

        } catch (err) {
            console.error("Gemini error:", err);
            return "❌ Error while generating image from Gemini.";
        }
    }

    async init() {
        console.log("✅ GimgModule initialized");
    }

    async destroy() {
        console.log("🗑️ GimgModule destroyed");
    }
}

module.exports = GimgModule;
