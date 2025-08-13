const { proto } = require("@whiskeysockets/baileys");
const { connectDb } = require("./db");

// Default authentication credentials structure
function initAuthCreds() {
    return {
        noiseKey: null,
        signedIdentityKey: null,
        signedPreKey: null,
        registrationId: 0,
        advSecretKey: null,
        processedHistoryMessages: [],
        nextPreKeyId: 0,
        firstUnuploadedPreKeyId: 0,
        accountSettings: {},
        accountSyncCounter: 0,
        platform: 'web',
        phoneId: null,
        deviceId: null,
        identityId: null,
        registered: false,
        backupToken: null,
        registration: {}
    };
}

/**
 * Pure MongoDB Authentication State
 * Stores all session data directly in MongoDB without any file system dependencies
 */
async function useMongoAuthState() {
    let db;
    
    try {
        db = await connectDb();
        console.log("✅ Connected to MongoDB for auth state");
    } catch (error) {
        console.error("❌ Failed to connect to MongoDB:", error.message);
        throw error;
    }
    
    // Collections for different types of auth data
    let credsCollection, keysCollection, sessionsCollection;
    
    try {
        credsCollection = db.collection("auth_creds");
        keysCollection = db.collection("auth_keys");
        sessionsCollection = db.collection("auth_sessions");
        console.log("✅ MongoDB collections initialized");
    } catch (error) {
        console.error("❌ Failed to initialize collections:", error.message);
        throw error;
    }

    console.log("🔧 Using pure MongoDB auth state...");

    // Load credentials from MongoDB
    async function loadCreds() {
        try {
            const credsDoc = await credsCollection.findOne({ _id: "main" });
            if (credsDoc && credsDoc.creds) {
                console.log("✅ Credentials loaded from MongoDB");
                return credsDoc.creds;
            }
            console.log("ℹ️ No credentials found in MongoDB - new session required");
            return initAuthCreds(); // Return default creds instead of undefined
        } catch (error) {
            console.error("❌ Failed to load credentials from MongoDB:", error.message);
            return initAuthCreds(); // Return default creds on error
        }
    }

    // Save credentials to MongoDB
    async function saveCreds(creds) {
        try {
            await credsCollection.updateOne(
                { _id: "main" },
                { 
                    $set: { 
                        creds: creds,
                        updatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
            console.log("💾 Credentials saved to MongoDB");
        } catch (error) {
            console.error("❌ Failed to save credentials to MongoDB:", error.message);
        }
    }

    // Load all keys from MongoDB
    async function loadKeys() {
        try {
            const keyDocs = await keysCollection.find({}).toArray();
            const keys = {};
            
            for (const doc of keyDocs) {
                keys[doc._id] = doc.keyData;
            }
            
            console.log(`🔑 Loaded ${Object.keys(keys).length} keys from MongoDB`);
            return keys;
        } catch (error) {
            console.error("❌ Failed to load keys from MongoDB:", error.message);
            return {};
        }
    }

    // Save a single key to MongoDB
    async function saveKey(keyId, keyData) {
        try {
            await keysCollection.updateOne(
                { _id: keyId },
                { 
                    $set: { 
                        keyData: keyData,
                        updatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
            // Removed excessive logging for individual keys
        } catch (error) {
            console.error(`❌ Failed to save key ${keyId} to MongoDB:`, error.message);
        }
    }

    // Remove a key from MongoDB
    async function removeKey(keyId) {
        try {
            await keysCollection.deleteOne({ _id: keyId });
            console.log(`🗑️ Key ${keyId} removed from MongoDB`);
        } catch (error) {
            console.error(`❌ Failed to remove key ${keyId} from MongoDB:`, error.message);
        }
    }

    // Load initial state
    const creds = await loadCreds();
    const keys = await loadKeys();

    // Create state object
    const state = {
        creds: creds,
        keys: keys
    };

    // Debounce save operations to prevent excessive DB writes
    let saveCredsTimer;
    let saveKeysQueue = new Map();
    let saveKeysTimer;

    // Debounced credentials save
    const debouncedSaveCreds = () => {
        if (saveCredsTimer) clearTimeout(saveCredsTimer);
        saveCredsTimer = setTimeout(async () => {
            await saveCreds(state.creds);
        }, 2000); // Save after 2 seconds of inactivity
    };

    // Debounced keys save
    const debouncedSaveKeys = () => {
        if (saveKeysTimer) clearTimeout(saveKeysTimer);
        saveKeysTimer = setTimeout(async () => {
            // Process all queued key operations
            for (const [keyId, operation] of saveKeysQueue) {
                if (operation.type === 'save') {
                    await saveKey(keyId, operation.data);
                } else if (operation.type === 'remove') {
                    await removeKey(keyId);
                }
            }
            saveKeysQueue.clear();
        }, 1000); // Save after 1 second of inactivity
    };

    // Create a proxy for the keys object to intercept changes
    const keysProxy = new Proxy(state.keys, {
        set(target, keyId, keyData) {
            target[keyId] = keyData;
            saveKeysQueue.set(keyId, { type: 'save', data: keyData });
            debouncedSaveKeys();
            return true;
        },
        deleteProperty(target, keyId) {
            delete target[keyId];
            saveKeysQueue.set(keyId, { type: 'remove' });
            debouncedSaveKeys();
            return true;
        }
    });

    // Replace the keys object with the proxy
    state.keys = keysProxy;

    // Create saveCreds function that will be called by Baileys
    const saveCredsFunction = () => {
        debouncedSaveCreds();
    };

    // Clear session function for logout
    const clearSession = async () => {
        try {
            console.log("🗑️ Clearing MongoDB auth session...");
            await Promise.all([
                credsCollection.deleteMany({}),
                keysCollection.deleteMany({}),
                sessionsCollection.deleteMany({})
            ]);
            console.log("✅ MongoDB auth session cleared");
        } catch (error) {
            console.error("❌ Failed to clear MongoDB auth session:", error.message);
        }
    };

    // Add session management
    const saveSession = async (sessionData) => {
        try {
            await sessionsCollection.updateOne(
                { _id: "main" },
                { 
                    $set: { 
                        ...sessionData,
                        updatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
            console.log("💾 Session data saved to MongoDB");
        } catch (error) {
            console.error("❌ Failed to save session to MongoDB:", error.message);
        }
    };

    const loadSession = async () => {
        try {
            const sessionDoc = await sessionsCollection.findOne({ _id: "main" });
            if (sessionDoc) {
                console.log("✅ Session data loaded from MongoDB");
                return sessionDoc;
            }
            return null;
        } catch (error) {
            console.error("❌ Failed to load session from MongoDB:", error.message);
            return null;
        }
    };

    console.log("✅ MongoDB auth state initialized successfully");

    return {
        state,
        saveCreds: saveCredsFunction,
        clearSession,
        saveSession,
        loadSession
    };
}

/**
 * Create a cacheable signal key store that works with MongoDB
 */
function makeCacheableSignalKeyStore(keys, logger) {
    return {
        get: (type, ids) => {
            const data = {};
            for (const id of ids) {
                let item = keys[`${type}:${id}`];
                if (type === 'app-state-sync-key' && item) {
                    item = JSON.parse(item);
                }
                if (item) {
                    data[id] = item;
                }
            }
            return data;
        },
        
        set: (data) => {
            for (const category in data) {
                for (const id in data[category]) {
                    let value = data[category][id];
                    if (category === 'app-state-sync-key') {
                        value = JSON.stringify(value);
                    }
                    keys[`${category}:${id}`] = value;
                }
            }
        },
        
        clear: () => {
            for (const key in keys) {
                delete keys[key];
            }
        }
    };
}

module.exports = { 
    useMongoAuthState,
    makeCacheableSignalKeyStore
};
