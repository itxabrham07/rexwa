import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import {  execSync  } from 'child_process';
import axios from 'axios';

class ServerInfo {
    constructor(bot) {
        this.bot = bot;
        this.name = 'server';
        this.metadata = {
            description: 'System monitoring and server information module',
            version: '2.0.0',
            author: 'Bot Developer',
            category: 'system',
            dependencies: []
        };
        this.commands = [
            {
                name: 'sysinfo',
                description: 'Get detailed system information',
                usage: '.sysinfo',
                permissions: 'owner',
                execute: this.getSystemInfo.bind(this)
            },
            {
                name: 'performance',
                description: 'Get system performance metrics',
                usage: '.performance',
                permissions: 'owner',
                execute: this.getPerformance.bind(this)
            },
            {
                name: 'disk',
                description: 'Get disk usage information',
                usage: '.disk',
                permissions: 'owner',
                execute: this.getDiskUsage.bind(this)
            },
            {
                name: 'memory',
                description: 'Get memory usage details',
                usage: '.memory',
                permissions: 'owner',
                execute: this.getMemoryUsage.bind(this)
            },
            {
                name: 'network',
                description: 'Get network information',
                usage: '.network',
                permissions: 'owner',
                execute: this.getNetworkInfo.bind(this)
            },
            {
                name: 'processes',
                description: 'List running processes',
                usage: '.processes [count]',
                permissions: 'owner',
                execute: this.getProcesses.bind(this)
            },
            {
                name: 'uptime',
                description: 'Get system and bot uptime',
                usage: '.uptime',
                permissions: 'public',
                execute: this.getUptime.bind(this)
            },
            {
                name: 'temperature',
                description: 'Get system temperature (if available)',
                usage: '.temperature',
                permissions: 'owner',
                execute: this.getTemperature.bind(this)
            },
            {
                name: 'services',
                description: 'Check system services status',
                usage: '.services',
                permissions: 'owner',
                execute: this.getServices.bind(this)
            },
            {
                name: 'speedtest',
                description: 'Run internet speed test',
                usage: '.speedtest',
                permissions: 'owner',
                execute: this.runSpeedTest.bind(this)
            }
        ];
        
        this.startTime = Date.now();
        this.performanceHistory = [];
        this.maxHistorySize = 100;
        
        // Start performance monitoring
        this.startPerformanceMonitoring();
    }

    startPerformanceMonitoring() {
        setInterval(() => {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            
            this.performanceHistory.push({
                timestamp: Date.now(),
                memory: memUsage,
                cpu: cpuUsage
            });
            
            // Keep only recent history
            if (this.performanceHistory.length > this.maxHistorySize) {
                this.performanceHistory.shift();
            }
        }, 30000); // Every 30 seconds
    }

    async getSystemInfo(msg, params, context) {
        try {
            const platform = os.platform();
            const arch = os.arch();
            const hostname = os.hostname();
            const release = os.release();
            const version = os.version();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const cpus = os.cpus();
            const loadAvg = os.loadavg();
            
            let sysInfo = `🖥️ *System Information*\n\n`;
            sysInfo += `💻 *Platform:* ${platform} ${arch}\n`;
            sysInfo += `🏷️ *Hostname:* ${hostname}\n`;
            sysInfo += `📋 *Release:* ${release}\n`;
            sysInfo += `📝 *Version:* ${version}\n`;
            sysInfo += `🧠 *CPU:* ${cpus[0].model}\n`;
            sysInfo += `⚡ *Cores:* ${cpus.length}\n`;
            sysInfo += `📊 *Load Average:* ${loadAvg.map(l => l.toFixed(2)).join(', ')}\n`;
            sysInfo += `💾 *Total Memory:* ${this.formatBytes(totalMem)}\n`;
            sysInfo += `🆓 *Free Memory:* ${this.formatBytes(freeMem)}\n`;
            sysInfo += `📈 *Memory Usage:* ${((totalMem - freeMem) / totalMem * 100).toFixed(1)}%\n`;
            
            // Node.js info
            sysInfo += `\n🟢 *Node.js Information*\n`;
            sysInfo += `📦 *Version:* ${process.version}\n`;
            sysInfo += `🏗️ *Architecture:* ${process.arch}\n`;
            sysInfo += `🚀 *Platform:* ${process.platform}\n`;
            sysInfo += `🆔 *PID:* ${process.pid}\n`;
            
            // Bot uptime
            const botUptime = Date.now() - this.startTime;
            sysInfo += `\n🤖 *Bot Information*\n`;
            sysInfo += `⏱️ *Bot Uptime:* ${this.formatUptime(botUptime / 1000)}\n`;
            sysInfo += `⏱️ *System Uptime:* ${this.formatUptime(os.uptime())}\n`;
            
            await context.bot.sendMessage(context.sender, { text: sysInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get system info: ${error.message}`
            });
        }
    }

    async getPerformance(msg, params, context) {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            const totalMem = os.totalmem();
            const freeMem = os.freeMem();
            const loadAvg = os.loadavg();
            
            let perfInfo = `📊 *Performance Metrics*\n\n`;
            
            // Memory usage
            perfInfo += `💾 *Memory Usage:*\n`;
            perfInfo += `  • RSS: ${this.formatBytes(memUsage.rss)}\n`;
            perfInfo += `  • Heap Used: ${this.formatBytes(memUsage.heapUsed)}\n`;
            perfInfo += `  • Heap Total: ${this.formatBytes(memUsage.heapTotal)}\n`;
            perfInfo += `  • External: ${this.formatBytes(memUsage.external)}\n`;
            perfInfo += `  • Array Buffers: ${this.formatBytes(memUsage.arrayBuffers)}\n`;
            
            // System memory
            perfInfo += `\n🖥️ *System Memory:*\n`;
            perfInfo += `  • Total: ${this.formatBytes(totalMem)}\n`;
            perfInfo += `  • Free: ${this.formatBytes(freeMem)}\n`;
            perfInfo += `  • Used: ${this.formatBytes(totalMem - freeMem)}\n`;
            perfInfo += `  • Usage: ${((totalMem - freeMem) / totalMem * 100).toFixed(1)}%\n`;
            
            // CPU usage
            perfInfo += `\n⚡ *CPU Usage:*\n`;
            perfInfo += `  • User: ${(cpuUsage.user / 1000).toFixed(2)}ms\n`;
            perfInfo += `  • System: ${(cpuUsage.system / 1000).toFixed(2)}ms\n`;
            perfInfo += `  • Load Average: ${loadAvg.map(l => l.toFixed(2)).join(', ')}\n`;
            
            // Performance history
            if (this.performanceHistory.length > 0) {
                const recent = this.performanceHistory.slice(-5);
                const avgMemory = recent.reduce((sum, p) => sum + p.memory.heapUsed, 0) / recent.length;
                
                perfInfo += `\n📈 *Recent Performance:*\n`;
                perfInfo += `  • Avg Memory: ${this.formatBytes(avgMemory)}\n`;
                perfInfo += `  • Samples: ${this.performanceHistory.length}\n`;
            }
            
            await context.bot.sendMessage(context.sender, { text: perfInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get performance info: ${error.message}`
            });
        }
    }

    async getDiskUsage(msg, params, context) {
        try {
            let diskInfo = `💽 *Disk Usage Information*\n\n`;
            
            // Try to get disk usage using different methods
            try {
                if (os.platform() === 'linux' || os.platform() === 'darwin') {
                    const dfOutput = execSync('df -h /', { encoding: 'utf8' });
                    const lines = dfOutput.trim().split('\n');
                    if (lines.length > 1) {
                        const parts = lines[1].split(/\s+/);
                        diskInfo += `📁 *Root Filesystem:*\n`;
                        diskInfo += `  • Size: ${parts[1]}\n`;
                        diskInfo += `  • Used: ${parts[2]}\n`;
                        diskInfo += `  • Available: ${parts[3]}\n`;
                        diskInfo += `  • Usage: ${parts[4]}\n`;
                    }
                }
            } catch (error) {
                diskInfo += `❌ Unable to get disk usage: ${error.message}\n`;
            }
            
            // Get current directory size
            try {
                const currentDir = process.cwd();
                const dirSize = await this.getDirectorySize(currentDir);
                diskInfo += `\n📂 *Current Directory:*\n`;
                diskInfo += `  • Path: ${currentDir}\n`;
                diskInfo += `  • Size: ${this.formatBytes(dirSize)}\n`;
            } catch (error) {
                diskInfo += `\n❌ Unable to get directory size: ${error.message}\n`;
            }
            
            await context.bot.sendMessage(context.sender, { text: diskInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get disk usage: ${error.message}`
            });
        }
    }

    async getMemoryUsage(msg, params, context) {
        try {
            const memUsage = process.memoryUsage();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            let memInfo = `🧠 *Memory Usage Details*\n\n`;
            
            // Process memory
            memInfo += `🤖 *Bot Process Memory:*\n`;
            memInfo += `  • RSS: ${this.formatBytes(memUsage.rss)}\n`;
            memInfo += `  • Heap Used: ${this.formatBytes(memUsage.heapUsed)}\n`;
            memInfo += `  • Heap Total: ${this.formatBytes(memUsage.heapTotal)}\n`;
            memInfo += `  • External: ${this.formatBytes(memUsage.external)}\n`;
            memInfo += `  • Array Buffers: ${this.formatBytes(memUsage.arrayBuffers)}\n`;
            
            // System memory
            memInfo += `\n💻 *System Memory:*\n`;
            memInfo += `  • Total: ${this.formatBytes(totalMem)}\n`;
            memInfo += `  • Used: ${this.formatBytes(usedMem)}\n`;
            memInfo += `  • Free: ${this.formatBytes(freeMem)}\n`;
            memInfo += `  • Usage: ${(usedMem / totalMem * 100).toFixed(1)}%\n`;
            
            // Memory efficiency
            const efficiency = (memUsage.heapUsed / memUsage.heapTotal * 100).toFixed(1);
            memInfo += `\n📊 *Memory Efficiency:*\n`;
            memInfo += `  • Heap Efficiency: ${efficiency}%\n`;
            memInfo += `  • System Impact: ${(memUsage.rss / totalMem * 100).toFixed(3)}%\n`;
            
            // Memory recommendations
            if (memUsage.heapUsed / memUsage.heapTotal > 0.8) {
                memInfo += `\n⚠️ *Warning:* High heap usage detected!`;
            }
            if (usedMem / totalMem > 0.9) {
                memInfo += `\n🚨 *Alert:* System memory is critically low!`;
            }
            
            await context.bot.sendMessage(context.sender, { text: memInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get memory usage: ${error.message}`
            });
        }
    }

    async getNetworkInfo(msg, params, context) {
        try {
            const networkInterfaces = os.networkInterfaces();
            
            let netInfo = `🌐 *Network Information*\n\n`;
            
            for (const [name, interfaces] of Object.entries(networkInterfaces)) {
                netInfo += `📡 *${name}:*\n`;
                
                for (const iface of interfaces) {
                    if (!iface.internal) {
                        netInfo += `  • ${iface.family}: ${iface.address}\n`;
                        netInfo += `  • MAC: ${iface.mac}\n`;
                        netInfo += `  • Netmask: ${iface.netmask}\n`;
                    }
                }
                netInfo += `\n`;
            }
            
            // Try to get external IP
            try {
                // axios imported at top
                const response = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
                netInfo += `🌍 *External IP:* ${response.data.ip}\n`;
            } catch (error) {
                netInfo += `🌍 *External IP:* Unable to fetch\n`;
            }
            
            await context.bot.sendMessage(context.sender, { text: netInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get network info: ${error.message}`
            });
        }
    }

    async getProcesses(msg, params, context) {
        try {
            const count = parseInt(params[0]) || 10;
            
            let procInfo = `⚙️ *Running Processes* (Top ${count})\n\n`;
            
            if (os.platform() === 'linux' || os.platform() === 'darwin') {
                try {
                    const psOutput = execSync(`ps aux --sort=-%cpu | head -${count + 1}`, { encoding: 'utf8' });
                    const lines = psOutput.trim().split('\n');
                    
                    for (let i = 1; i < lines.length; i++) {
                        const parts = lines[i].split(/\s+/);
                        if (parts.length >= 11) {
                            procInfo += `${i}. *${parts[10]}*\n`;
                            procInfo += `   CPU: ${parts[2]}% | Memory: ${parts[3]}%\n`;
                            procInfo += `   PID: ${parts[1]} | User: ${parts[0]}\n\n`;
                        }
                    }
                } catch (error) {
                    procInfo += `❌ Unable to get process list: ${error.message}\n`;
                }
            } else {
                procInfo += `❌ Process listing not supported on ${os.platform()}\n`;
            }
            
            // Current process info
            procInfo += `🤖 *Current Bot Process:*\n`;
            procInfo += `  • PID: ${process.pid}\n`;
            procInfo += `  • Parent PID: ${process.ppid}\n`;
            procInfo += `  • Title: ${process.title}\n`;
            procInfo += `  • Arguments: ${process.argv.slice(2).join(' ')}\n`;
            
            await context.bot.sendMessage(context.sender, { text: procInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get process info: ${error.message}`
            });
        }
    }

    async getUptime(msg, params, context) {
        try {
            const systemUptime = os.uptime();
            const botUptime = (Date.now() - this.startTime) / 1000;
            
            let uptimeInfo = `⏱️ *Uptime Information*\n\n`;
            uptimeInfo += `🖥️ *System Uptime:* ${this.formatUptime(systemUptime)}\n`;
            uptimeInfo += `🤖 *Bot Uptime:* ${this.formatUptime(botUptime)}\n`;
            
            // Boot time
            const bootTime = new Date(Date.now() - (systemUptime * 1000));
            uptimeInfo += `🚀 *System Boot Time:* ${bootTime.toLocaleString()}\n`;
            
            // Bot start time
            const botStartTime = new Date(this.startTime);
            uptimeInfo += `▶️ *Bot Start Time:* ${botStartTime.toLocaleString()}\n`;
            
            // Uptime comparison
            const uptimeRatio = (botUptime / systemUptime * 100).toFixed(1);
            uptimeInfo += `📊 *Bot/System Ratio:* ${uptimeRatio}%\n`;
            
            await context.bot.sendMessage(context.sender, { text: uptimeInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get uptime: ${error.message}`
            });
        }
    }

    async getTemperature(msg, params, context) {
        try {
            let tempInfo = `🌡️ *System Temperature*\n\n`;
            
            if (os.platform() === 'linux') {
                try {
                    // Try to read CPU temperature
                    const tempFiles = [
                        '/sys/class/thermal/thermal_zone0/temp',
                        '/sys/class/thermal/thermal_zone1/temp'
                    ];
                    
                    for (let i = 0; i < tempFiles.length; i++) {
                        try {
                            const tempData = await fs.readFile(tempFiles[i], 'utf8');
                            const temp = parseInt(tempData.trim()) / 1000;
                            tempInfo += `🔥 *CPU Zone ${i}:* ${temp.toFixed(1)}°C\n`;
                        } catch (error) {
                            // File doesn't exist, skip
                        }
                    }
                    
                    // Try sensors command
                    try {
                        const sensorsOutput = execSync('sensors', { encoding: 'utf8' });
                        tempInfo += `\n📊 *Detailed Sensors:*\n\`\`\`\n${sensorsOutput}\n\`\`\``;
                    } catch (error) {
                        tempInfo += `\n❌ Sensors command not available`;
                    }
                    
                } catch (error) {
                    tempInfo += `❌ Unable to read temperature: ${error.message}`;
                }
            } else {
                tempInfo += `❌ Temperature monitoring not supported on ${os.platform()}`;
            }
            
            await context.bot.sendMessage(context.sender, { text: tempInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get temperature: ${error.message}`
            });
        }
    }

    async getServices(msg, params, context) {
        try {
            let serviceInfo = `🔧 *System Services Status*\n\n`;
            
            if (os.platform() === 'linux') {
                try {
                    const services = ['nginx', 'apache2', 'mysql', 'postgresql', 'redis', 'mongodb'];
                    
                    for (const service of services) {
                        try {
                            execSync(`systemctl is-active ${service}`, { encoding: 'utf8' });
                            serviceInfo += `✅ ${service}: Active\n`;
                        } catch (error) {
                            serviceInfo += `❌ ${service}: Inactive\n`;
                        }
                    }
                } catch (error) {
                    serviceInfo += `❌ Unable to check services: ${error.message}`;
                }
            } else {
                serviceInfo += `❌ Service checking not supported on ${os.platform()}`;
            }
            
            // Check Node.js related processes
            serviceInfo += `\n🟢 *Node.js Processes:*\n`;
            try {
                const nodeProcesses = execSync('pgrep -f node', { encoding: 'utf8' });
                const pids = nodeProcesses.trim().split('\n').filter(pid => pid);
                serviceInfo += `  • Running Node processes: ${pids.length}\n`;
                serviceInfo += `  • Current PID: ${process.pid}\n`;
            } catch (error) {
                serviceInfo += `  • Unable to check Node processes\n`;
            }
            
            await context.bot.sendMessage(context.sender, { text: serviceInfo });
            
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get service status: ${error.message}`
            });
        }
    }

    async runSpeedTest(msg, params, context) {
        const processingMsg = await context.bot.sendMessage(context.sender, {
            text: '⏳ *Internet Speed Test*\n\n🔄 Testing connection speed...\n📡 This may take a moment...'
        });
        
        try {
            // Simple speed test using download time
            // axios imported at top
            const testUrl = 'https://httpbin.org/bytes/1048576'; // 1MB test file
            
            const startTime = Date.now();
            const response = await axios.get(testUrl, { timeout: 30000 });
            const endTime = Date.now();
            
            const duration = (endTime - startTime) / 1000; // seconds
            const sizeBytes = response.data.length;
            const speedMbps = (sizeBytes * 8) / (duration * 1000000); // Mbps
            
            let speedInfo = `🚀 *Speed Test Results*\n\n`;
            speedInfo += `📊 *Download Speed:* ${speedMbps.toFixed(2)} Mbps\n`;
            speedInfo += `📁 *Test Size:* ${this.formatBytes(sizeBytes)}\n`;
            speedInfo += `⏱️ *Duration:* ${duration.toFixed(2)}s\n`;
            speedInfo += `📡 *Test Server:* httpbin.org\n`;
            
            // Speed rating
            if (speedMbps > 100) {
                speedInfo += `🟢 *Rating:* Excellent`;
            } else if (speedMbps > 25) {
                speedInfo += `🟡 *Rating:* Good`;
            } else if (speedMbps > 5) {
                speedInfo += `🟠 *Rating:* Fair`;
            } else {
                speedInfo += `🔴 *Rating:* Poor`;
            }
            
            await context.bot.sock.sendMessage(context.sender, {
                text: speedInfo,
                edit: processingMsg.key
            });
            
        } catch (error) {
            await context.bot.sock.sendMessage(context.sender, {
                text: `❌ *Speed Test Failed*\n\n🚫 Error: ${error.message}\n\n💡 Check your internet connection`,
                edit: processingMsg.key
            });
        }
    }

    async getDirectorySize(dirPath) {
        let totalSize = 0;
        
        const items = await fs.readdir(dirPath);
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stats = await fs.stat(itemPath);
            
            if (stats.isDirectory()) {
                totalSize += await this.getDirectorySize(itemPath);
            } else {
                totalSize += stats.size;
            }
        }
        
        return totalSize;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        let uptime = '';
        if (days > 0) uptime += `${days}d `;
        if (hours > 0) uptime += `${hours}h `;
        if (minutes > 0) uptime += `${minutes}m `;
        uptime += `${secs}s`;

        return uptime;
    }
}

export default ServerInfo;
