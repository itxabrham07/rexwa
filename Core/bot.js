import { Boom } from '@hapi/boom';
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    getAggregateVotesInPollMessage,
    isJidNewsletter,
    delay
} from '@whiskeysockets/baileys';

import * as WA from '@whiskeysockets/baileys';
const proto = WA.proto; 

import qrcode from 'qrcode-terminal';
import fs from 'fs-extra';
import path from 'path';
import NodeCache from '@cacheable/node-cache';
import { makeInMemoryStore } from './store.js';
import config from '../config.js';
import logger from './logger.js';
import MessageHandler from './message-handler.js';
import { connectDb } from '../utils/db.js';
import ModuleLoader from './module-loader.js';
import { useMongoAuthState } from '../utils/mongoAuthState.js';

class HyperWaBot {
    constructor() {
        this.sock = null;
        this.authPath = './auth_info';
        this.messageHandler = new MessageHandler(this);
        this.telegramBridge = null;
        this.isShuttingDown = false;
        this.db = null;
        this.moduleLoader = new ModuleLoader(this);
        this.qrCodeSent = false;
        this.useMongoAuth = config.get('auth.useMongoAuth', false);

        this.store = makeInMemoryStore({
            logger: logger.child({ module: 'store' }),
            filePath: config.get('store.filePath', './whatsapp-store.json'),
            autoSaveInterval: config.get('store.autoSaveInterval', 30000)
        });

        this.store.loadFromFile();

        this.msgRetryCounterCache = new NodeCache({
            stdTTL: 300,
            maxKeys: 500
        });
        this.onDemandMap = new Map();

        setInterval(() => {
            if (this.onDemandMap.size > 100) {
                this.onDemandMap.clear();
            }
        }, 300000);

        this.setupStoreEventListeners();
    }

    setupStoreEventListeners() {
        this.store.on('messages.upsert', (data) => {
            logger.debug(`📝 Store: ${data.messages.length} messages cached`);
        });

        this.store.on('contacts.upsert', (contacts) => {
            logger.debug(`👥 Store: ${contacts.length} contacts cached`);
        });

        this.store.on('chats.upsert', (chats) => {
            logger.debug(`💬 Store: ${chats.length} chats cached`);
        });

        setInterval(() => {
            const stats = this.getStoreStats();
            logger.info(`📊 Store Stats - Chats: ${stats.chats}, Contacts: ${stats.contacts}, Messages: ${stats.messages}`);
        }, 300000);
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
        logger.info('🔧 Initializing HyperWa Userbot v3.0 with Baileys 7.x...');

        try {
            this.db = await connectDb();
            logger.info('✅ Database connected successfully!');
        } catch (error) {
            logger.error('❌ Failed to connect to database:', error);
            process.exit(1);
        }

        if (config.get('telegram.enabled')) {
            try {
                const { default: TelegramBridge } = await import('../telegram/bridge.js');
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

        logger.info('✅ HyperWa Userbot v3.0 initialized successfully!');
    }

 async startWhatsApp() {
    let state, saveCreds;

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
            
            // CRITICAL: Validate MongoDB auth state
            if (!state || !state.creds || !state.keys) {
                logger.warn('⚠️ MongoDB auth state is incomplete or empty!');
                logger.info('📋 State validation:', {
                    hasState: !!state,
                    hasCreds: !!state?.creds,
                    hasKeys: !!state?.keys,
                    credsRegistrationId: state?.creds?.registrationId,
                    keysCount: state?.keys ? Object.keys(state.keys).length : 0
                });
                
                // If MongoDB state is invalid, clear it and use file-based
                logger.warn('🗑️ Clearing invalid MongoDB session...');
                try {
                    const db = await connectDb();
                    await db.collection("auth").deleteOne({ _id: "session" });
                    logger.info('✅ Invalid MongoDB session cleared');
                } catch (cleanError) {
                    logger.error('❌ Failed to clear MongoDB session:', cleanError);
                }
                
                logger.info('🔄 Switching to file-based auth to generate new session...');
                ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
                this.useMongoAuth = false; // Temporarily disable until new session is created
            } else {
                logger.info('✅ MongoDB auth state validated successfully');
            }
        } catch (error) {
            logger.error('❌ Failed to initialize MongoDB auth state:', error);
            logger.info('🔄 Falling back to file-based auth...');
            ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
            this.useMongoAuth = false;
        }
    } else {
        logger.info('🔧 Using file-based auth state...');
        ({ state, saveCreds } = await useMultiFileAuthState(this.authPath));
    }

    // Final validation before creating socket
    if (!state?.creds?.registrationId) {
        logger.error('❌ Auth state is invalid - missing registration ID');
        logger.info('🔄 This appears to be a fresh session, will generate QR code...');
    }

    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    try {
        // Wrap socket creation in detailed try-catch
        logger.info('🔨 Creating WhatsApp socket...');
        
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
            syncFullHistory: false,
            markOnlineOnConnect: true,
            firewall: false
        });

        logger.info('✅ WhatsApp socket created successfully');

        // Bind store to socket events
        this.store.bind(this.sock.ev);
        logger.info('🔗 Store bound to WhatsApp socket events');

        // Setup event handlers BEFORE waiting for connection
        this.setupEnhancedEventHandlers(saveCreds);

        // Wait for connection with better promise handling
        const connectionPromise = new Promise((resolve, reject) => {
            let isResolved = false;
            
            const connectionTimeout = setTimeout(() => {
                if (!isResolved && !this.sock.user) {
                    isResolved = true;
                    logger.warn('⏱️ QR code scan timed out after 30 seconds');
                    reject(new Error('QR code scan timed out'));
                }
            }, 30000);

            this.sock.ev.on('connection.update', update => {
                if (isResolved) return;
                
                if (update.connection === 'open') {
                    isResolved = true;
                    clearTimeout(connectionTimeout);
                    logger.info('✅ Connection established successfully');
                    resolve();
                } else if (update.connection === 'close') {
                    const statusCode = update.lastDisconnect?.error?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        isResolved = true;
                        clearTimeout(connectionTimeout);
                        reject(new Error('Logged out - please scan QR code again'));
                    }
                    // Let handleConnectionUpdate manage other close scenarios
                }
            });
        });

        logger.info('⏳ Waiting for WhatsApp connection...');
        await connectionPromise;
        
    } catch (error) {
        // Enhanced error logging with type checking
        logger.error('❌ Failed to initialize WhatsApp socket');
        
        // Log error details safely
        if (error) {
            logger.error('Error type:', typeof error);
            logger.error('Error name:', error.name || 'Unknown');
            logger.error('Error message:', error.message || 'No message');
            logger.error('Error stack:', error.stack || 'No stack trace');
            
            // Check if it's a Boom error
            if (error.isBoom) {
                logger.error('Boom error output:', error.output);
            }
            
            // Log the entire error object structure
            try {
                logger.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
            } catch (jsonError) {
                logger.error('Could not stringify error:', jsonError.message);
            }
        } else {
            logger.error('Error is null or undefined');
        }
        
        // Log auth state for debugging
        logger.error('Auth state debug:', {
            hasCreds: !!state?.creds,
            hasKeys: !!state?.keys,
            hasRegistrationId: !!state?.creds?.registrationId,
            credsKeys: state?.creds ? Object.keys(state.creds).slice(0, 10) : [],
            keysCount: state?.keys ? Object.keys(state.keys).length : 0
        });
        
        // Clean up before retry
        if (this.sock) {
            try {
                logger.info('🧹 Cleaning up failed socket...');
                this.sock.ev.removeAllListeners();
                await this.sock.end();
            } catch (cleanupError) {
                logger.warn('⚠️ Cleanup error:', cleanupError.message);
            }
            this.sock = null;
        }
        
        // If this was a MongoDB auth failure, switch to file-based for next attempt
        if (this.useMongoAuth && (!state?.creds?.registrationId)) {
            logger.warn('🔄 Switching to file-based auth due to invalid MongoDB state');
            this.useMongoAuth = false;
        }
        
        logger.info('🔄 Retrying with new QR code in 5 seconds...');
        setTimeout(() => this.startWhatsApp(), 5000);
    }
}
    async getMessage(key) {
        try {
            if (key?.remoteJid && key?.id) {
                const storedMessage = this.store.loadMessage(key.remoteJid, key.id);
                if (storedMessage) {
                    logger.debug(`📨 Retrieved message from store: ${key.id}`);
                    return storedMessage;
                }
            }

            return undefined;
        } catch (error) {
            logger.warn('⚠️ Error retrieving message:', error.message);
            return undefined;
        }
    }

    getChatInfo(jid) {
        return this.store.chats[jid] || null;
    }

    getContactInfo(jid) {
        return this.store.contacts[jid] || null;
    }

    getChatMessages(jid, limit = 50) {
        const messages = this.store.getMessages(jid);
        return messages.slice(-limit).reverse();
    }

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

        return results.slice(0, 100);
    }

    getGroupInfo(jid) {
        const metadata = this.store.groupMetadata[jid];
        const chat = this.store.chats[jid];
        return {
            metadata,
            chat,
            participants: metadata?.participants || []
        };
    }

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
            isActive: lastMessageTime && (Date.now() - lastMessageTime) < (7 * 24 * 60 * 60 * 1000)
        };
    }

    async exportChatHistory(jid, format = 'json') {
        const chat = this.getChatInfo(jid);
        const messages = this.getChatMessages(jid, 1000);
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

                if (!process.env.DOCKER) {
                    if (events['labels.association']) {
                        logger.info('📋 Label association update:', events['labels.association']);
                    }

                    if (events['labels.edit']) {
                        logger.info('📝 Label edit update:', events['labels.edit']);
                    }

                    if (events.call) {
                        logger.info('📞 Call event received:', events.call);
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

                    if (events['lid-mapping.update']) {
                        logger.info('🆔 LID mapping update:', events['lid-mapping.update']);
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

        if (!config.get('bot.owner') && this.sock.user) {
            config.set('bot.owner', this.sock.user.id);
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
        const owner = config.get('bot.owner');
        if (!owner) return;

        const authMethod = this.useMongoAuth ? 'MongoDB' : 'File-based';
        const storeStats = this.getStoreStats();

        const startupMessage = `🚀 *${config.get('bot.name')} v${config.get('bot.version')}* is now online!\n\n` +
                              `🔥 *HyperWa Features Active:*\n` +
                              `• 📱 Modular Architecture\n` +
                              `• 🗄️ Enhanced Data Store: ✅\n` +
                              `• 📊 Store Stats: ${storeStats.chats} chats, ${storeStats.contacts} contacts, ${storeStats.messages} messages\n` +
                              `• 🔐 Auth Method: ${authMethod}\n` +
                              `• 🤖 Telegram Bridge: ${config.get('telegram.enabled') ? '✅' : '❌'}\n` +
                              `• 🔧 Baileys v7.x: ✅\n` +
                              `Type *${config.get('bot.prefix')}help* for available commands!`;

        try {
            await this.sendMessage(owner, { text: startupMessage });
        } catch {}

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

export { HyperWaBot };
