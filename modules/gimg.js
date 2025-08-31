const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'gemini';
        this.metadata = {
            description: 'Gemini AI image and text generation',
            version: '1.0.0',
            author: 'Bot Developer',
            category: 'ai'
        };
        
        // Add your Gemini API key here
        this.GEMINI_API_KEY = "AIzaSyAipn0J_8OzXfZWLt2l_Pn0jb28lkzAtZ0";
        this.genAI = null;
        this.model = null;
        
        this.commands = [
            {
                name: 'gimg',
                description: 'Generate images/text with Gemini AI or edit replied images',
                usage: '.gimg <prompt> or reply to image/message with .gimg',
                permissions: 'public',
                ui: {
                    processingText: '🤖 *Generating with Gemini AI...*\n\n🔄 Processing your request...',
                    errorText: '❌ *Gemini Generation Failed*'
                },
                execute: this.gimgCommand.bind(this)
            }
        ];
    }

    async init() {
        if (!this.GEMINI_API_KEY || this.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
            console.error('❌ Gemini API key is missing');
            throw new Error('Gemini API key not configured');
        }
        
        this.genAI = new GoogleGenerativeAI(this.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        console.log('Gemini AI module initialized');
    }

    async runSubprocess(cmd, timeout = null) {
        return new Promise((resolve, reject) => {
            const proc = spawn(cmd[0], cmd.slice(1));
            let stdout = '';
            let stderr = '';
            
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            const timeoutId = timeout ? setTimeout(() => {
                proc.kill();
                reject(new Error('Process timeout'));
            }, timeout * 1000) : null;
            
            proc.on('close', (code) => {
                if (timeoutId) clearTimeout(timeoutId);
                resolve({ returncode: code, stdout, stderr });
            });
            
            proc.on('error', (error) => {
                if (timeoutId) clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    async gimgCommand(msg, params, context) {
        if (!this.model) {
            return "❌ *Configuration Error*\n\nGemini AI is not properly initialized. Please check the API key.";
        }
        
        // Get prompt and check for replied content
        let prompt = null;
        const reply = msg.reply_to_message;
        let imageData = null;
        
        // Extract prompt from command arguments
        if (params.length > 0) {
            prompt = params.join(' ');
        } else if (reply && reply.text) {
            prompt = reply.text;
        } else if (reply && reply.caption) {
            prompt = reply.caption;
        }
        
        // Check if replying to an image for editing
        if (reply && (reply.photo || reply.document)) {
            if (!prompt) {
                prompt = "Edit this image";
            }
            
            try {
                const imagePath = await this.bot.downloadMedia(reply);
                if (imagePath) {
                    imageData = fs.readFileSync(imagePath);
                    fs.unlinkSync(imagePath); // Clean up downloaded file
                }
            } catch (error) {
                return "❌ *Download Failed*\n\nFailed to download the replied image.";
            }
        }
        
        if (!prompt) {
            return "❌ *Usage Error*\n\n**Usage:** `.gimg [prompt]` or reply to a message/image with `.gimg`\n\n**Examples:**\n• `.gimg create a sunset landscape`\n• Reply to image: `.gimg make it more colorful`";
        }
        
        const generatedFiles = [];
        try {
            // Prepare content parts
            const contentParts = [{ text: prompt }];
            
            // Add image data if replying to an image
            if (imageData) {
                // Detect mime type
                let mimeType = "image/jpeg"; // Default
                if (imageData.subarray(0, 8).toString('hex').startsWith('89504e47')) {
                    mimeType = "image/png";
                } else if (imageData.subarray(0, 6).toString() === 'GIF87a' || imageData.subarray(0, 6).toString() === 'GIF89a') {
                    mimeType = "image/gif";
                } else if (imageData.subarray(0, 2).toString('hex') === 'ffd8') {
                    mimeType = "image/jpeg";
                }
                
                contentParts.push({
                    inlineData: {
                        data: imageData.toString('base64'),
                        mimeType: mimeType
                    }
                });
            }
            
            const result = await this.model.generateContent(contentParts);
            const response = await result.response;
            const textResponse = response.text();
            
            let responseText = "";
            
            // Send text response if available
            if (textResponse) {
                const cleanText = textResponse.trim();
                // Split long messages to avoid Telegram limits
                const maxLength = 4000;
                if (cleanText.length > maxLength) {
                    for (let i = 0; i < cleanText.length; i += maxLength) {
                        const chunk = cleanText.substring(i, i + maxLength);
                        await this.bot.sendMessage(msg.chat.id, `🤖 **Gemini Response** (Part ${Math.floor(i/maxLength) + 1}):\n\n${chunk}`);
                    }
                } else {
                    await this.bot.sendMessage(msg.chat.id, `🤖 **Gemini Response:**\n\n${cleanText}`);
                }
                responseText = "✅ *Generation Complete*\n\nText response sent!";
            } else {
                responseText = "⚠️ *No Content Generated*\n\nGemini didn't generate any content for this prompt.";
            }
            
            return responseText;
            
        } catch (error) {
            const errorMsg = error.message || error.toString();
            if (errorMsg.toUpperCase().includes("API_KEY")) {
                return "❌ *Authentication Error*\n\nInvalid Gemini API key. Please check your configuration.";
            } else if (errorMsg.toUpperCase().includes("QUOTA") || errorMsg.toUpperCase().includes("LIMIT")) {
                return "❌ *Quota Exceeded*\n\nAPI quota exceeded. Please try again later.";
            } else if (errorMsg.toUpperCase().includes("TIMEOUT")) {
                return "⏰ *Request Timeout*\n\nRequest timed out. Try a simpler prompt.";
            } else {
                return `❌ *Generation Error*\n\n${errorMsg}`;
            }
        } finally {
            // Cleanup generated files
            for (const filePath of generatedFiles) {
                try {
                    if (filePath && fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        }
    }

    getFileExtension(mimeType) {
        const extensions = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/bmp': '.bmp'
        };
        return extensions[mimeType] || '.png';
    }

    async destroy() {
        console.log('Gemini AI module destroyed');
    }
}

module.exports = GeminiModule;
