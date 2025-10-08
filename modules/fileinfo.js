import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url'; // ADDED
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

class FileInfoModule {
    constructor(bot) {
        this.bot = bot;
        this.name = 'fileinfo';
        this.metadata = {
            description: 'Get detailed information about files and media',
            version: '1.0.0',
            author: 'HyperWa Team',
            category: 'utility',
            dependencies: ['fs-extra', '@whiskeysockets/baileys']
        };
        this.commands = [
            {
                name: 'fileinfo',
                description: 'Get file information',
                usage: '.fileinfo (reply to file/media)',
                permissions: 'public',
                ui: {
                    processingText: '📁 *Analyzing File...*\n\n⏳ Getting file information...',
                    errorText: '❌ *File Analysis Failed*'
                },
                execute: this.getFileInfo.bind(this)
            },
            {
                name: 'mediainfo',
                description: 'Get detailed media information',
                usage: '.mediainfo (reply to media)',
                permissions: 'public',
                ui: {
                    processingText: '🎬 *Analyzing Media...*\n\n⏳ Extracting media details...',
                    errorText: '❌ *Media Analysis Failed*'
                },
                execute: this.getMediaInfo.bind(this)
            }
        ];
        
        // FIX: Replaced __dirname with ES Module equivalent
        const __filename = fileURLToPath(import.meta.url); // ADDED
        const __dirname = path.dirname(__filename); // ADDED
        this.tempDir = path.join(__dirname, '../temp'); // USED FIXED __dirname
    }

// ... (rest of the class methods)
// ... (omitted for brevity)
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    getFileExtension(mimetype) {
        const extensions = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
            'audio/wav': 'wav',
            'application/pdf': 'pdf'
        };
        return extensions[mimetype] || 'bin';
    }

}

export default FileInfoModule;
