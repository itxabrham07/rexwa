import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filesToMigrate = [
    'Core/logger.js',
    'Core/message-handler.js',
    'Core/module-loader.js',
    'Core/rate-limiter.js',
    'config.js',
    'utils/db.js',
    'utils/helpers.js',
    'utils/mongoAuthState.js',
    'telegram/bridge.js',
    'telegram/commands.js'
];

function convertRequireToImport(content) {
    content = content.replace(/const\s+(\{[^}]+\})\s*=\s*require\(['"]([^'"]+)['"]\);?/g, 'import $1 from \'$2\';');

    content = content.replace(/const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g, 'import $1 from \'$2\';');

    content = content.replace(/require\(['"]([^'"]+)['"]\)/g, "import('$1')");

    content = content.replace(/module\.exports\s*=\s*\{([^}]+)\};?/g, 'export { $1 };');
    content = content.replace(/module\.exports\s*=\s*(\w+);?/g, 'export default $1;');
    content = content.replace(/exports\.(\w+)\s*=\s*(.+);?/g, 'export const $1 = $2;');

    content = content.replace(/from\s+['"](\w+)['"]/g, (match, pkg) => {
        if (pkg === 'fs' || pkg === 'path' || pkg === 'crypto' || pkg === 'events' || pkg === 'url' || pkg === 'util') {
            return `from 'node:${pkg}'`;
        }
        return match;
    });

    content = content.replace(/import\s+(.+)\s+from\s+['"](\.[^'"]+)(?<!\.js)['"]/g, (match, imports, modulePath) => {
        if (!modulePath.endsWith('.js') && !modulePath.includes('?')) {
            return `import ${imports} from '${modulePath}.js'`;
        }
        return match;
    });

    const lines = content.split('\n');
    const lastRequireIndex = lines.findLastIndex(line => line.trim().startsWith('const') && line.includes('require'));
    if (lastRequireIndex !== -1) {
        lines.splice(lastRequireIndex + 1, 0, '');
    }
    content = lines.join('\n');

    return content;
}

function migrateFile(filePath) {
    const fullPath = path.join(__dirname, filePath);

    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return;
    }

    console.log(`🔄 Migrating: ${filePath}`);

    let content = fs.readFileSync(fullPath, 'utf8');

    content = convertRequireToImport(content);

    fs.writeFileSync(fullPath, content, 'utf8');

    console.log(`✅ Migrated: ${filePath}`);
}

console.log('🚀 Starting ESM migration...\n');

for (const file of filesToMigrate) {
    try {
        migrateFile(file);
    } catch (error) {
        console.error(`❌ Error migrating ${file}:`, error.message);
    }
}

console.log('\n✅ ESM migration complete!');
console.log('\n⚠️  Please manually review the following:');
console.log('1. Check all relative imports have .js extension');
console.log('2. Verify dynamic imports are handled correctly');
console.log('3. Test the bot to ensure everything works');
