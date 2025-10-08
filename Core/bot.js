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
import NodeCache from 'node-cache';
import P from 'pino';
import { makeInMemoryStore } from './store.js';
import config from '../config.js';
import MessageHandler from './message-handler.js';
import { connectDb } from '../utils/db.js';
import ModuleLoader from './module-loader.js';
import { useMongoAuthState, clearMongoAuthState } from '../utils/mongoAuthState.js';

// Initialize logger
const logger = P({
    level: config.get('log.level', 'info'),
    transport: config.get('log.pretty', false) ? {
        target: 'pino-pretty',
        options: { colorize: true }
    } : undefined
});

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
        
        // Initialize the enhanced store
        this.store = makeInMemoryStore({
            logger: logger.child({ module: 'store' }),
            filePath: config.get('store.filePath', './whatsapp-store.json'),
            autoSaveInterval: config.get('store.autoSaveInterval', 30000)
        });

        // Load existing store data on startup
        this.store.loadFromFile();
        
        // Message retry cache (prevents decryption loops)
        this.msgRetryCounterCache = new NodeCache({
            stdTTL: 300,
            maxKeys: 500
        });
        
        // On-demand history sync tracking
        this.onDemandMap = new Map();
        
        // Memory cleanup for on-demand map
        setInterval(() => {
            if (this.onDemandMap.size > 100) {
                logger.debug('🧹 Clearing on-demand history map');
                this.onDemandMap.clear();
            }
        }, 300000); // Every 5 minutes

        // Store event listeners
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

        // Log store statistics periodically
        setInterval(() => {
            const stats = this.getStoreStats();
            logger.info(`📊 Store Stats - Chats: ${stats.chats}, Contacts: ${stats.contacts}, Messages: ${stats.messages}`);
        }, 300000); // Every 5 minutes
    }

    getStoreStats() {
        const chatCount = Object.keys(this.store.chats || {}).length;
        const contactCount = Object.keys(this.store.contacts || {}).length;
        const messageCount = Object.values(this.store.messages || {})
            .reduce((total, chatMessages) => total + Object.keys(chatMessages).length, 0);
        
        return {
            chats: chatCount,
            contacts: contactCount,
            messages: messageCount
        };
    }

    async initialize() {
        logger.info('🔧 Initializing HyperWa Userbot...');

        try {
            this.db = await connectDb();
            logger.info('✅ Database connected successfully!');
        } catch (error) {
            logger.error('❌ Failed to connect to database:', error);
            process.exit(1);
        }

        // Initialize Telegram bridge if enabled
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

        logger.info('✅ HyperWa Userbot initialized successfully!');
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
                syncFullHistory: false,
                markOnlineOnConnect: true,
                firewall: false
            });

            // CRITICAL: Bind store to socket events
            this.store.bind(this.sock.ev);
            logger.info('🔗 Store bound to WhatsApp socket events');

            this.setupEnhancedEventHandlers(saveCreds);
        } catch (error) {
            logger.error('❌ Failed to initialize WhatsApp socket:', error);
            logger.info('🔄 Retrying in 5 seconds...');
            setTimeout(() => this.startWhatsApp(), 5000);
        }
    }

    /**
     * Enhanced getMessage with store lookup
     * Returns message content for decryption/verification
     */
    async getMessage(key) {
        try {
            if (key?.remoteJid && key?.id) {
                const storedMessage = this.store.loadMessage(key.remoteJid, key.id);
                if (storedMessage) {
                    logger.debug(`📨 Retrieved message from store: ${key.id}`);
                    return storedMessage.message;
                }
            }
            
            // Return undefined to let Baileys handle missing messages
            return undefined;
        } catch (error) {
            logger.warn('⚠️ Error retrieving message:', error.message);
            return undefined;
        }
    }

    /**
     * Setup enhanced event handlers with ev.process pattern
     */
    setupEnhancedEventHandlers(saveCreds) {
        this.sock.ev.process(async (events) => {
            try {
                // Connection updates
                if (events['connection.update']) {
                    await this.handleConnectionUpdate(events['connection.update']);
                }

                // Credentials updated
                if (events['creds.update']) {
                    await saveCreds();
                }

                // New messages
                if (events['messages.upsert']) {
                    await this.handleMessagesUpsert(events['messages.upsert']);
                }

                // Label association
                if (events['labels.association']) {
                    logger.debug('🏷️ Label association update:', events['labels.association']);
                }

                // Label edit
                if (events['labels.edit']) {
                    logger.debug('✏️ Label edit update:', events['labels.edit']);
                }

                // Call events
                if (events.call) {
                    logger.info('📞 Call event received:', events.call);
                }

                // History sync
                if (events['messaging-history.set']) {
                    const { chats, contacts, messages, isLatest, progress, syncType } = events['messaging-history.set'];
                    if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
                        logger.info('📥 Received on-demand history sync, messages:', messages.length);
                    }
                    logger.info(`📊 History sync: ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (latest: ${isLatest}, progress: ${progress}%)`);
                }

                // Message updates (delivery, read, delete)
                if (events['messages.update']) {
                    for (const { key, update } of events['messages.update']) {
                        if (update.pollUpdates) {
                            logger.info('📊 Poll update received for message:', key.id);
                        }
                    }
                }

                // Message receipts
                if (events['message-receipt.update']) {
                    logger.debug('📨 Message receipt update');
                }

                // Reactions
                if (events['messages.reaction']) {
                    logger.info(`😀 Message reactions: ${events['messages.reaction'].length}`);
                }

                // Presence updates
                if (events['presence.update']) {
                    logger.debug('👤 Presence updates:', events['presence.update']);
                }

                // Chat updates
                if (events['chats.update']) {
                    logger.debug('💬 Chats updated:', events['chats.update'].length);
                }

                // Contact updates
                if (events['contacts.update']) {
                    for (const contact of events['contacts.update']) {
                        if (typeof contact.imgUrl !== 'undefined') {
                            logger.info(`👤 Contact ${contact.id} profile pic updated`);
                        }
                    }
                }

                // Chat deletions
                if (events['chats.delete']) {
                    logger.info('🗑️ Chats deleted:', events['chats.delete']);
                }
            } catch (error) {
                logger.error('⚠️ Event processing error:', error);
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
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn(`🔌 Connection closed. Status: ${statusCode}`);

            if (shouldReconnect && !this.isShuttingDown) {
                logger.warn('🔄 Connection closed, reconnecting...');
                this.store.saveToFile();
                setTimeout(() => this.startWhatsApp(), 5000);
            } else {
                logger.error('❌ Connection closed permanently (logged out).');

                if (this.useMongoAuth) {
                    try {
                        await clearMongoAuthState();
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
        logger.debug(`📬 Messages upsert: type=${upsert.type}, count=${upsert.messages.length}`);

        if (upsert.requestId) {
            logger.info(`📋 Placeholder message received for request: ${upsert.requestId}`);
        }

        // Process messages
        if (upsert.type === 'notify') {
            for (const msg of upsert.messages) {
                try {
                    await this.processIncomingMessage(msg, upsert);
                } catch (error) {
                    logger.warn('⚠️ Message processing error:', error.message);
                }
            }
        }

        // Pass to message handler
        try {
            await this.messageHandler.handleMessages({ 
                messages: upsert.messages, 
                type: upsert.type 
            });
        } catch (error) {
            logger.warn('⚠️ Message handler error:', error.message);
        }
    }

    async processIncomingMessage(msg, upsert) {
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        
        if (!text) return;

        // Handle special debug commands
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
                logger.warn('⚠️ Failed to setup Telegram handlers:', err.message);
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
                              `• 🔧 Custom Modules: ${config.get('features.customModules') ? '✅' : '❌'}\n` +
                              `Type *${config.get('bot.prefix')}help* for available commands!`;

        try {
            await this.sendMessage(owner, { text: startupMessage });
        } catch (err) {
            logger.warn('⚠️ Failed to send startup message:', err.message);
        }

        if (this.telegramBridge) {
            try {
                await this.telegramBridge.logToTelegram('🚀 HyperWa Bot Started', startupMessage);
            } catch (err) {
                logger.warn('⚠️ Telegram log failed:', err.message);
            }
        }
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

        // Save and cleanup store
        this.store.saveToFile();
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

    // Store-powered helper methods
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

    getGroupInfo(jid) {
        const metadata = this.store.groupMetadata[jid];
        const chat = this.store.chats[jid];
        return {
            metadata,
            chat,
            participants: metadata?.participants || []
        };
    }
}

export { HyperWaBot };
export default HyperWaBot;
