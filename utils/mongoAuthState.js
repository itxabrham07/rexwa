const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const fs = require("fs-extra");
const path = require("path");
const tar = require("tar");
const { connectDb } = require("./db");

const AUTH_DIR = "./auth_info";
const AUTH_TAR = "auth_backup.tar";
const KEYS_DIR = path.join(AUTH_DIR, "keys");
const CREDS_PATH = path.join(AUTH_DIR, "creds.json");

async function useMongoAuthState() {
    const db = await connectDb();
    const coll = db.collection("auth");

    await fs.ensureDir(AUTH_DIR);

    const session = await coll.findOne({ _id: "session" });
    const archiveBuffer = session?.archive?.buffer || session?.archive;

    if (archiveBuffer && Buffer.isBuffer(archiveBuffer)) {
        try {
            // Write tar and extract
            await fs.writeFile(AUTH_TAR, archiveBuffer);
            await tar.x({ file: AUTH_TAR, C: ".", strict: true });

            // ✅ Validate critical files
            if (!(await fs.pathExists(CREDS_PATH))) {
                console.warn("⚠️ creds.json missing after restore. Clearing session.");
                await coll.deleteOne({ _id: "session" });
                await fs.emptyDir(AUTH_DIR);
            } else {
                // ✅ Ensure keys/ exists and has content
                if (!(await fs.pathExists(KEYS_DIR))) {
                    await fs.ensureDir(KEYS_DIR);
                    console.warn("⚠️ keys/ directory was missing — created empty. This will cause decryption failures.");
                } else {
                    const keyFiles = await fs.readdir(KEYS_DIR);
                    console.log(`📁 Restored keys/ with ${keyFiles.length} session files`);
                }
                console.log("✅ Auth session (creds + keys) restored from MongoDB.");
            }
        } catch (err) {
            console.error("❌ Failed to restore session from MongoDB:", err);
            await coll.deleteOne({ _id: "session" });
            await fs.emptyDir(AUTH_DIR);
        } finally {
            await fs.remove(AUTH_TAR).catch(() => {});
        }
    } else {
        console.log("ℹ️ No session found in DB. New pairing required.");
    }

    // ✅ Wait for file system to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState(AUTH_DIR);

    // ✅ Debounced save to avoid I/O flood
    let saveTimer;
    async function saveCreds() {
        await originalSaveCreds();

        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
            try {
                // Only backup auth_info (keys + creds)
                await tar.c(
                    { file: AUTH_TAR, cwd: ".", portable: true },
                    ["auth_info"]
                );
                const data = await fs.readFile(AUTH_TAR);

                await coll.updateOne(
                    { _id: "session" },
                    { $set: { archive: data, timestamp: new Date() } },
                    { upsert: true }
                );
                console.log("💾 Session saved to MongoDB.");
            } catch (err) {
                console.error("❌ Failed to save session to MongoDB:", err);
            } finally {
                await fs.remove(AUTH_TAR).catch(() => {});
            }
        }, 10000); // Save max every 10s
    }

    return { state, saveCreds };
}

module.exports = { useMongoAuthState };
