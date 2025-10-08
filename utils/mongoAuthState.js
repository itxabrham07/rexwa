const { BufferJSON, initAuthCreds } = require('@whiskeysockets/baileys');
const { connectDb } = require('./db');
const logger = require('../core/logger');

/**
 * MongoDB-based authentication state for Baileys
 * Stores credentials and signal keys in MongoDB instead of files
 */
async function useMongoAuthState() {
    const db = await connectDb();
    const collection = db.collection('auth');

    // Helper to serialize/deserialize buffers
    const fixBuffers = (obj) => {
        if (!obj) return obj;
        return JSON.parse(JSON.stringify(obj), BufferJSON.reviver);
    };

    // Load existing session from MongoDB
    const loadSession = async () => {
        try {
            const doc = await collection.findOne({ _id: 'session' });
            
            if (!doc) {
                logger.info('📝 No existing MongoDB session found, creating new one...');
                return null;
            }

            logger.info('📂 Loading session from MongoDB...');
            
            // Validate session structure
            if (!doc.creds || !doc.keys) {
                logger.warn('⚠️ Invalid session structure in MongoDB');
                return null;
            }

            // Count keys for validation
            const keysCount = Object.keys(doc.keys).length;
            logger.info(`📊 Session loaded: ${keysCount} keys found`);

            return {
                creds: fixBuffers(doc.creds),
                keys: fixBuffers(doc.keys)
            };
        } catch (error) {
            logger.error('❌ Error loading session from MongoDB:', error);
            return null;
        }
    };

    // Save session to MongoDB
    const saveSession = async (creds, keys) => {
        try {
            const doc = {
                _id: 'session',
                creds: JSON.parse(JSON.stringify(creds, BufferJSON.replacer)),
                keys: JSON.parse(JSON.stringify(keys, BufferJSON.replacer)),
                updatedAt: new Date()
            };

            await collection.replaceOne(
                { _id: 'session' },
                doc,
                { upsert: true }
            );

            const keysCount = Object.keys(keys).length;
            logger.debug(`💾 Session saved to MongoDB (${keysCount} keys)`);
        } catch (error) {
            logger.error('❌ Error saving session to MongoDB:', error);
        }
    };

    // Load existing session or initialize new one
    let session = await loadSession();
    
    if (!session) {
        logger.info('🔧 Initializing new auth credentials...');
        const creds = initAuthCreds();
        session = {
            creds,
            keys: {}
        };
        await saveSession(session.creds, session.keys);
        logger.info('✅ New session initialized and saved to MongoDB');
    } else {
        // Validate loaded session
        if (!session.creds.registrationId) {
            logger.warn('⚠️ Loaded session missing registration ID, reinitializing...');
            const creds = initAuthCreds();
            session = {
                creds,
                keys: {}
            };
            await saveSession(session.creds, session.keys);
        } else {
            logger.info('✅ Auth session (creds + keys) restored from MongoDB.');
        }
    }

    // Log session info for debugging
    console.log(`📁 Restored keys/ with ${Object.keys(session.keys).length} session files`);

    return {
        state: {
            creds: session.creds,
            keys: session.keys
        },
        saveCreds: async () => {
            await saveSession(session.creds, session.keys);
        }
    };
}

module.exports = { useMongoAuthState };
