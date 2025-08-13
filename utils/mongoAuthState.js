const { proto } = require('@whiskeysockets/baileys');
const { connectDb } = require('./db');
const logger = require('../Core/logger');

async function useMongoAuthState() {
    try {
        const db = await connectDb();
        const coll = db.collection("auth");
        
        logger.debug('✅ Successfully connected to MongoDB auth collection');

        // Initialize empty state if none exists
        let session;
        try {
            session = await coll.findOne({ _id: "session" });
            
            if (!session) {
                logger.info('ℹ️ No existing session found in MongoDB, creating new one');
                session = {
                    _id: "session",
                    creds: null,
                    keys: {},
                    timestamp: new Date()
                };
            } else {
                logger.debug('📁 Existing session found in MongoDB');
            }
        } catch (queryError) {
            logger.error('❌ Failed to query MongoDB for session:', queryError);
            throw new Error('MongoDB query failed');
        }

        // Validate session structure
        if (session && (!session.creds || typeof session.keys !== 'object')) {
            logger.warn('⚠️ Invalid session structure in MongoDB, resetting');
            session = {
                _id: "session",
                creds: proto.AuthState(),
                keys: {},
                timestamp: new Date()
            };
        }

        const state = {
            creds: session.creds || proto.AuthState(),
            keys: {
                get: (keyId, defaultValue) => {
                    const value = session.keys[keyId];
                    logger.debug(`🔑 Key lookup: ${keyId} - ${value ? 'found' : 'not found'}`);
                    return value || defaultValue;
                },
                set: (keyId, value) => {
                    session.keys[keyId] = value;
                    logger.debug(`🔑 Key updated: ${keyId}`);
                    return value;
                },
                clear: () => {
                    session.keys = {};
                    logger.debug('🔑 Keys cleared');
                }
            }
        };

        // Debounced save with better error handling
        let saveTimer;
        const saveCreds = async () => {
            if (saveTimer) clearTimeout(saveTimer);
            
            saveTimer = setTimeout(async () => {
                try {
                    session.creds = state.creds;
                    session.timestamp = new Date();
                    
                    logger.debug('💾 Attempting to save session to MongoDB');
                    await coll.updateOne(
                        { _id: "session" },
                        { $set: session },
                        { upsert: true }
                    );
                    logger.info('✅ Session state saved to MongoDB');
                } catch (saveError) {
                    logger.error('❌ Critical: Failed to save session to MongoDB:', saveError);
                    // Don't throw here to avoid crashing the app, but log prominently
                }
            }, 2000);
        };

        return { state, saveCreds };
    } catch (initError) {
        logger.error('❌ Critical error initializing MongoDB auth state:', initError);
        throw initError; // Re-throw to trigger fallback
    }
}

module.exports = { useMongoAuthState };
