# Baileys v7.x ESM Migration Guide

## Migration Status

### ✅ Completed
- ✅ package.json updated with Baileys 7.1.2 and ESM support
- ✅ Core/bot.js migrated to ESM with new event processing
- ✅ Core/store.js migrated to ESM
- ✅ Core/logger.js migrated to ESM
- ✅ config.js migrated to ESM

### 🔄 Remaining Files to Migrate

All remaining `.js` files need to be converted from CommonJS to ESM. Here's the systematic approach:

## ESM Conversion Rules

### 1. Import Statements
**CommonJS (Old):**
```javascript
const { default: makeWASocket } = require('@whiskeysockets/baileys');
const fs = require('fs');
const myModule = require('./myModule');
```

**ESM (New):**
```javascript
import makeWASocket from '@whiskeysockets/baileys';
import fs from 'fs';
import myModule from './myModule.js';  // Note: .js extension required for relative imports
```

### 2. Export Statements
**CommonJS (Old):**
```javascript
module.exports = MyClass;
module.exports = { func1, func2 };
exports.myFunc = () => {};
```

**ESM (New):**
```javascript
export default MyClass;
export { func1, func2 };
export const myFunc = () => {};
```

### 3. __dirname and __filename
**ESM requires:**
```javascript
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

### 4. Dynamic Imports
**CommonJS:**
```javascript
const module = require(dynamicPath);
```

**ESM:**
```javascript
const module = await import(dynamicPath);
```

## Files Priority List

### HIGH PRIORITY (Core Functionality)
1. **Core/message-handler.js** - Message processing
2. **Core/module-loader.js** - Module system
3. **Core/rate-limiter.js** - Rate limiting
4. **utils/db.js** - Database connection
5. **utils/mongoAuthState.js** - MongoDB auth
6. **utils/helpers.js** - Helper functions

### MEDIUM PRIORITY (Features)
7. **telegram/bridge.js** - Telegram integration
8. **telegram/commands.js** - Telegram commands
9. **modules/*.js** - All module files

### Example Migration Template

```javascript
// Before (CommonJS)
const logger = require('./logger');
const config = require('../config');
const fs = require('fs');

class MyClass {
    // ...
}

module.exports = MyClass;

// After (ESM)
import logger from './logger.js';
import config from '../config.js';
import fs from 'fs';

class MyClass {
    // ...
}

export default MyClass;
```

## Key Baileys v7.x Changes

### 1. New Event Processing
```javascript
sock.ev.process(async (events) => {
    if (events['connection.update']) {
        // Handle connection updates
    }

    if (events['messages.upsert']) {
        // Handle incoming messages
    }

    // Process other events...
});
```

### 2. LID/PN System
- WhatsApp now uses Local Identifiers (LID) alongside Phone Numbers (PN)
- Message keys now include `remoteJidAlt` and `participantAlt`
- Use `sock.signalRepository.lidMapping` for LID<->PN mappings

### 3. No More ACKs
- Don't send ACKs on message delivery (can cause bans)

### 4. New Imports
```javascript
import { Boom } from '@hapi/boom';
import NodeCache from '@cacheable/node-cache';
import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    useMultiFileAuthState,
    proto,
    delay
} from '@whiskeysockets/baileys';
```

### 5. Protobuf Changes
Only use: `.create()`, `.encode()`, `.decode()`
Removed: `.fromObject()`, `.toObject()`, etc.

## Testing Checklist

After migration, test:
- [ ] Bot starts without errors
- [ ] QR code generation works
- [ ] Message sending works
- [ ] Message receiving works
- [ ] Commands execute properly
- [ ] Modules load correctly
- [ ] Database operations work
- [ ] Telegram bridge functions (if enabled)
- [ ] Store persistence works
- [ ] Reconnection logic works

## Common Issues & Solutions

### Issue: "Cannot find module"
**Solution:** Add `.js` extension to all relative imports

### Issue: "require is not defined"
**Solution:** Convert all `require()` to `import`

### Issue: "__dirname is not defined"
**Solution:** Add the ESM __dirname polyfill at the top of the file

### Issue: "module.exports is not defined"
**Solution:** Convert to `export default` or `export {}`

### Issue: Dynamic require() not working
**Solution:** Use dynamic `import()` instead and make function async

## Installation

After migration, install dependencies:
```bash
npm install @whiskeysockets/baileys@7.1.2 @hapi/boom@10.0.1 @cacheable/node-cache@1.1.0
```

## Running the Bot

```bash
npm start
# or
node index.js
```

## Notes

- Keep QR code login (no pairing code needed as per your requirement)
- Maintain existing reconnection logic
- All existing features should work after migration
- Store system is already compatible with v7.x
