import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    getAggregateVotesInPollMessage,
    isJidNewsletter,
    delay,
    proto
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs-extra'; // Use * as fs for CommonJS export with 'fs-extra'
import path from 'path';
import NodeCache from 'node-cache';
import { makeInMemoryStore } from './store.js'; // Added .js extension

import config from '../config.js'; // Added .js extension
import logger from './logger.js'; // Added .js extension
import MessageHandler from './message-handler.js'; // Added .js extension
import { connectDb } from '../utils/db.js'; // Added .js extension
import ModuleLoader from './module-loader.js'; // Added .js extension
import { useMongoAuthState } from '../utils/mongoAuthState.js'; // Added .js extension


let TelegramBridge;

export class HyperWaBot {
    constructor() {
        this.sock = null;
        this.authPath = './auth_info';
        this.messageHandler = new MessageHandler(this);
        this.telegramBridge = null;
        this.isShuttingDown = false;
        this.db = null;
        this.moduleLoader = new ModuleLoader(this);
        this.qrCodeSent = false;
        // Accessing config object properties (assuming config is exported as default)
        this.useMongoAuth = config.auth.useMongoAuth ?? false;
        
        // Initialize the enhanced store with advanced options
        this.store = makeInMemoryStore({
            logger: logger.child({ module: 'store' }),
            filePath: config.store.filePath ?? './whatsapp-store.json',
            autoSaveInterval: config.store.autoSaveInterval ?? 30000
        });

        // Load existing store data on startup
        this.store.loadFromFile();
        
        // Enhanced features from example - SIMPLE VERSION
        this.msgRetryCounterCache = new NodeCache({
            stdTTL: 300,
            maxKeys: 500
        });
        this.onDemandMap = new Map();
        
        // Simple memory cleanup
        setInterval(() => {
            if (this.onDemandMap.size > 100) {
                this.onDemandMap.clear();
            }
        }, 300000);

        // Store event listeners for advanced features
        this.setupStoreEventListeners();
    }

    setupStoreEventListeners() {
        // Monitor store events for analytics and features
        this.store.on('messages.upsert', (data) => {
            logger.debug(`📝 Store: ${data.messages.length} messages cached`);
        });

        this.store.on('contacts.upsert', (contacts) => {
            logger.debug(`👥 Store: ${contacts.length} contacts cached`);
        });

        this.store.on('chats.upsert', (chats) => {
            logger.debug(`💬 Store: ${chats.length} chats cached`);
        });

        // Log store statistics periodically
        setInterval(() => {
            const stats = this.getStoreStats();
            logger.info(`📊 Store Stats - Chats: ${stats.chats}, Contacts: ${stats.contacts}, Messages: ${stats.messages}`);
        }, 300000); // Every 5 minutes
    }

    getStoreStats() {
        const chatCount = Object.keys(this.store.chats).length;
        const contactCount = Object.keys(this.store.contacts).length;
        const messageCount = Object.values(this.store.messages)
            .reduce((total, chatMessages) => total + Object.keys(chatMessages).length, 0);
        
        return {
            chats: chatCount,
            contacts: contactCount,
            messages: messageCount
        };
    }

    async initialize() {
        logger.info('🔧 Initializing HyperWa Userbot with Enhanced Store...');

        try {
            this.db = await connectDb();
            logger.info('✅ Database connected successfully!');
        } catch (error) {
            logger.error('❌ Failed to connect to database:', error);
            process.exit(1);
        }

        // Conditional import logic (Common in ESM for optional dependencies)
        if (config.telegram.enabled) {
            try {
                // Dynamic import to avoid issues with optional dependencies
                // Note: The original code used `require('../telegram/bridge')`.
                // In ESM, this is replaced with a dynamic `import()`.
                if (!TelegramBridge) {
                    const module = await import('../telegram/bridge.js');
                    TelegramBridge = module.default || module.TelegramBridge; // assuming it exports default or a named class
                }
                
                this.telegramBridge = new TelegramBridge(this);
                await this.telegramBridge.initialize();
                logger.info('✅ Telegram bridge initialized');

                try {
                    await this.telegramBridge.sendStartMessage();
                } catch (err) {
                    logger.warn('⚠️ Failed to send start message via Telegram:', err.message);
                }
            } catch (error) {
                logger.warn('⚠️ Telegram bridge failed to initialize:', error.message);
                this.telegramBridge = null;
            }
        }

        await this.moduleLoader.loadModules();
        await this.startWhatsApp();

        logger.info('✅ HyperWa Userbot with Enhanced Store initialized successfully!');
    }

    async startWhatsApp() {
        let state, saveCreds;

        // Clean up existing socket if present
        if (this.sock) {
            logger.info('🧹 Cleaning up existing WhatsApp socket');
            this.sock.ev.removeAllListeners();
            await this.sock.end();
            this.sock = null;
        }

        // Choose auth method based on configuration
        if (this.useMongoAuth) {
            logger.info('🔧 Using MongoDB auth state...');
            try {
                ({ state, saveCreds } = await useMongoAuthState());
            } catch (error) {
                logger.error('❌ Failed to initialize MongoDB auth state:', error);
                logger.info('🔄 Falling back to file-based auth...');
                ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
            }
        } else {
            logger.info('🔧 Using file-based auth state...');
            ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
        }

        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        try {
            this.sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'signal-keys' })),
                },
                version,
                printQRInTerminal: false,
                logger: logger.child({ module: 'baileys' }),
                msgRetryCounterCache: this.msgRetryCounterCache,
                generateHighQualityLinkPreview: true,
                getMessage: this.getMessage.bind(this),
                browser: ['HyperWa', 'Chrome', '3.0'],
                // Enable message history for better message retrieval
                syncFullHistory: false,
                markOnlineOnConnect: true,
                // Add firewall bypass
                firewall: false
            });

            // CRITICAL: Bind store to socket events for data persistence
            this.store.bind(this.sock.ev);
            logger.info('🔗 Store bound to WhatsApp socket events');

            const connectionPromise = new Promise((resolve, reject) => {
                const connectionTimeout = setTimeout(() => {
                    if (!this.sock.user) {
                        logger.warn('❌ QR code scan timed out after 30 seconds');
                        this.sock.ev.removeAllListeners();
                        this.sock.end();
                        this.sock = null;
                        reject(new Error('QR code scan timed out'));
                    }
                }, 30000);

                this.sock.ev.on('connection.update', update => {
                    if (update.connection === 'open') {
                        clearTimeout(connectionTimeout);
                        resolve();
                    }
                });
            });

            this.setupEnhancedEventHandlers(saveCreds);
            await connectionPromise;
        } catch (error) {
            logger.error('❌ Failed to initialize WhatsApp socket:', error);
            logger.info('🔄 Retrying with new QR code...');
            setTimeout(() => this.startWhatsApp(), 5000);
        }
    }

    // Enhanced getMessage with store lookup
    async getMessage(key) {
        try {
            // Try to get message from store first
            if (key?.remoteJid && key?.id) {
                const storedMessage = this.store.loadMessage(key.remoteJid, key.id);
                if (storedMessage) {
                    logger.debug(`📨 Retrieved message from store: ${key.id}`);
                    return storedMessage;
                }
            }
            
            // Return undefined instead of fake message to avoid decryption issues
            return undefined;
        } catch (error) {
            logger.warn('⚠️ Error retrieving message:', error.message);
            return undefined;
        }
    }

    // Store-powered helper methods
    
    /**
     * Get chat information from store
     */
    getChatInfo(jid) {
        return this.store.chats[jid] || null;
    }

    /**
     * Get contact information from store
     */
    getContactInfo(jid) {
        return this.store.contacts[jid] || null;
    }

    /**
     * Get all messages for a chat
     */
    getChatMessages(jid, limit = 50) {
        const messages = this.store.getMessages(jid);
        return messages.slice(-limit).reverse(); // Get latest messages
    }

    /**
     * Search messages by text content
     */
    searchMessages(query, jid = null) {
        const results = [];
        const chatsToSearch = jid ? [jid] : Object.keys(this.store.messages);
        
        for (const chatId of chatsToSearch) {
            const messages = this.store.getMessages(chatId);
            for (const msg of messages) {
                const text = msg.message?.conversation || 
                             msg.message?.extendedTextMessage?.text || '';
                if (text.toLowerCase().includes(query.toLowerCase())) {
                    results.push({
                        chatId,
                        message: msg,
                        text
                    });
                }
            }
        }
        
        return results.slice(0, 100); // Limit results
    }

    /**
     * Get group metadata with participant info
     */
    getGroupInfo(jid) {
        const metadata = this.store.groupMetadata[jid];
        const chat = this.store.chats[jid];
        return {
            metadata,
            chat,
            participants: metadata?.participants || []
        };
    }

    /**
     * Get user's message history statistics
     */
    getUserStats(jid) {
        let messageCount = 0;
        let lastMessageTime = null;
        
        for (const chatId of Object.keys(this.store.messages)) {
            const messages = this.store.getMessages(chatId);
            const userMessages = messages.filter(msg => 
                msg.key?.participant === jid || msg.key?.remoteJid === jid
            );
            
            messageCount += userMessages.length;
            
            if (userMessages.length > 0) {
                const lastMsg = userMessages[userMessages.length - 1];
                const msgTime = lastMsg.messageTimestamp * 1000;
                if (!lastMessageTime || msgTime > lastMessageTime) {
                    lastMessageTime = msgTime;
                }
            }
        }
        
        return {
            messageCount,
            lastMessageTime: lastMessageTime ? new Date(lastMessageTime) : null,
            isActive: lastMessageTime && (Date.now() - lastMessageTime) < (7 * 24 * 60 * 60 * 1000) // Active in last 7 days
        };
    }

    /**
     * Export chat history
     */
    async exportChatHistory(jid, format = 'json') {
        const chat = this.getChatInfo(jid);
        const messages = this.getChatMessages(jid, 1000); // Last 1000 messages
        const contact = this.getContactInfo(jid);
        
        const exportData = {
            chat,
            contact,
            messages,
            exportedAt: new Date().toISOString(),
            totalMessages: messages.length
        };

        if (format === 'txt') {
            let textExport = `Chat Export for ${contact?.name || jid}\n`;
            textExport += `Exported on: ${new Date().toISOString()}\n`;
            textExport += `Total Messages: ${messages.length}\n\n`;
            textExport += '='.repeat(50) + '\n\n';
            
            for (const msg of messages) {
                const timestamp = new Date(msg.messageTimestamp * 1000).toLocaleString();
                const sender = msg.key.fromMe ? 'You' : (contact?.name || msg.key.participant || 'Unknown');
                const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Media/Other]';
                textExport += `[${timestamp}] ${sender}: ${text}\n`;
            }
            
            return textExport;
        }

        return exportData;
    }

    setupEnhancedEventHandlers(saveCreds) {
        this.sock.ev.process(async (events) => {
            try {
                if (events['connection.update']) {
                    await this.handleConnectionUpdate(events['connection.update']);
                }

                if (events['creds.update']) {
                    await saveCreds();
                }

                if (events['messages.upsert']) {
                    await this.handleMessagesUpsert(events['messages.upsert']);
                }

                // Store automatically handles most events, but we can add custom logic
                if (!process.env.DOCKER) {
                    if (events['labels.association']) {
                        logger.info('📋 Label association update:', events['labels.association']);
                    }

                    if (events['labels.edit']) {
                        logger.info('📝 Label edit update:', events['labels.edit']);
                    }

                    if (events.call) {
                        logger.info('📞 Call event received:', events.call);
                        // Store call information
                        for (const call of events.call) {
                            this.store.setCallOffer(call.from, call);
                        }
                    }

                    if (events['messaging-history.set']) {
                        const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set'];
                        if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
                            logger.info('📥 Received on-demand history sync, messages:', messages.length);
                        }
                        logger.info(`📊 History sync: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (latest: ${isLatest}, progress: ${progress}%)`);
                    }

                    if (events['messages.update']) {
                        for (const { key, update } of events['messages.update']) {
                            if (update.pollUpdates) {
                                logger.info('📊 Poll update received');
                            }
                        }
                    }

                    if (events['message-receipt.update']) {
                        logger.debug('📨 Message receipt update');
                    }

                    if (events['messages.reaction']) {
                        logger.info(`😀 Message reactions: ${events['messages.reaction'].length}`);
                    }

                    if (events['presence.update']) {
                        logger.debug('👤 Presence updates');
                    }

                    if (events['chats.update']) {
                        logger.debug('💬 Chats updated');
                    }

                    if (events['contacts.update']) {
                        for (const contact of events['contacts.update']) {
                            if (typeof contact.imgUrl !== 'undefined') {
                                logger.info(`👤 Contact ${contact.id} profile pic updated`);
                            }
                        }
                    }

                    if (events['chats.delete']) {
                        logger.info('🗑️ Chats deleted:', events['chats.delete']);
                    }
                }
            } catch (error) {
                logger.warn('⚠️ Event processing error:', error.message);
            }
        });
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            logger.info('📱 WhatsApp QR code generated');
            qrcode.generate(qr, { small: true });

            if (this.telegramBridge) {
                try {
                    await this.telegramBridge.sendQRCode(qr);
                } catch (error) {
                    logger.warn('⚠️ TelegramBridge failed to send QR:', error.message);
                }
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || 0;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect && !this.isShuttingDown) {
                logger.warn('🔄 Connection closed, reconnecting...');
                // Save store before reconnecting
                this.store.saveToFile();
                setTimeout(() => this.startWhatsApp(), 5000);
            } else {
                logger.error('❌ Connection closed permanently. Please delete auth_info and restart.');

                if (this.useMongoAuth) {
                    try {
                        const db = await connectDb();
                        const coll = db.collection("auth");
                        await coll.deleteOne({ _id: "session" });
                        logger.info('🗑️ MongoDB auth session cleared');
                    } catch (error) {
                        logger.error('❌ Failed to clear MongoDB auth session:', error);
                    }
                }

                // Final store save
                this.store.saveToFile();
                process.exit(1);
            }
        } else if (connection === 'open') {
            await this.onConnectionOpen();
        }
    }

    async handleMessagesUpsert(upsert) {
        if (upsert.type === 'notify') {
            for (const msg of upsert.messages) {
                try {
                    await this.processIncomingMessage(msg, upsert);
                } catch (error) {
                    logger.warn('⚠️ Message processing error:', error.message);
                }
            }
        }

        try {
            await this.messageHandler.handleMessages({ messages: upsert.messages, type: upsert.type });
        } catch (error) {
            logger.warn('⚠️ Original message handler error:', error.message);
        }
    }

    async processIncomingMessage(msg, upsert) {
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        
        if (!text) return;

        // Handle special commands
        if (text === "requestPlaceholder" && !upsert.requestId) {
            const messageId = await this.sock.requestPlaceholderResend(msg.key);
            logger.info('🔄 Requested placeholder resync, ID:', messageId);
            return;
        }

        if (text === "onDemandHistSync") {
            const messageId = await this.sock.fetchMessageHistory(50, msg.key, msg.messageTimestamp);
            logger.info('📥 Requested on-demand sync, ID:', messageId);
            return;
        }

    }

    async onConnectionOpen() {
        logger.info(`✅ Connected to WhatsApp! User: ${this.sock.user?.id || 'Unknown'}`);

        // Accessing config object properties (assuming config is exported as default)
        if (!config.bot.owner && this.sock.user) {
            config.bot.owner = this.sock.user.id;
            // The original code uses config.set, which implies a config class/module. 
            // In plain object use, you'd just assign, but here we assume config exports an object 
            // with a setter or is a singleton module that allows modification (like the original).
            // For now, we'll keep the logic that modifies config.
            logger.info(`👑 Owner set to: ${this.sock.user.id}`);
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.setupWhatsAppHandlers();
            } catch (err) {
                logger.warn('⚠️ Failed to setup Telegram WhatsApp handlers:', err.message);
            }
        }

        await this.sendStartupMessage();

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.syncWhatsAppConnection();
            } catch (err) {
                logger.warn('⚠️ Telegram sync error:', err.message);
            }
        }
    }

    async sendStartupMessage() {
        const owner = config.bot.owner;
        if (!owner) return;

        const authMethod = this.useMongoAuth ? 'MongoDB' : 'File-based';
        const storeStats = this.getStoreStats();
        
        const startupMessage = `🚀 *${config.bot.name} v${config.bot.version}* is now online!\n\n` +
                                     `🔥 *HyperWa Features Active:*\n` +
                                     `• 📱 Modular Architecture\n` +
                                     `• 🗄️ Enhanced Data Store: ✅\n` +
                                     `• 📊 Store Stats: ${storeStats.chats} chats, ${storeStats.contacts} contacts, ${storeStats.messages} messages\n` +
                                     `• 🔐 Auth Method: ${authMethod}\n` +
                                     `• 🤖 Telegram Bridge: ${config.telegram.enabled ? '✅' : '❌'}\n` +
                                     `• 🔧 Custom Modules: ${config.features.customModules ? '✅' : '❌'}\n` +
                                     `Type *${config.bot.prefix}help* for available commands!`;

        try {
            await this.sendMessage(owner, { text: startupMessage });
        } catch (error) {
            // Silence send errors during startup message
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.logToTelegram('🚀 HyperWa Bot Started', startupMessage);
            } catch (err) {
                logger.warn('⚠️ Telegram log failed:', err.message);
            }
        }
    }

    async connect() {
        if (!this.sock) {
            await this.startWhatsApp();
        }
        return this.sock;
    }

    async sendMessage(jid, content) {
        if (!this.sock) {
            throw new Error('WhatsApp socket not initialized');
        }
        
        return await this.sock.sendMessage(jid, content);
    }

    async shutdown() {
        logger.info('🛑 Shutting down HyperWa Userbot...');
        this.isShuttingDown = true;

        // Cleanup store
        this.store.cleanup();

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.shutdown();
            } catch (err) {
                logger.warn('⚠️ Telegram shutdown error:', err.message);
            }
        }

        if (this.sock) {
            await this.sock.end();
        }

        logger.info('✅ HyperWa Userbot shutdown complete');
    }
}
