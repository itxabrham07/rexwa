
import config from '../config.js';
import helpers from '../utils/helpers.js';

class GroupManagement {
    constructor(bot) {
        this.bot = bot;
        this.name = 'group';
        this.metadata = {
            description: 'Complete group management system with advanced features',
            version: '2.0.0',
            author: 'Bot Developer',
            category: 'management',
            dependencies: []
        };
        this.commands = [
            {
                name: 'promote',
                description: 'Promote user to admin',
                usage: '.promote @user or reply to message',
                permissions: 'admin',
                execute: this.promote.bind(this)
            },
            {
                name: 'demote',
                description: 'Demote admin to member',
                usage: '.demote @user or reply to message',
                permissions: 'admin',
                execute: this.demote.bind(this)
            },
            {
                name: 'kick',
                description: 'Remove user from group',
                usage: '.kick @user or reply to message',
                permissions: 'admin',
                execute: this.kick.bind(this)
            },
            {
                name: 'add',
                description: 'Add user to group',
                usage: '.add 1234567890',
                permissions: 'admin',
                execute: this.add.bind(this)
            },
            {
                name: 'mute',
                description: 'Mute group (admins only)',
                usage: '.mute',
                permissions: 'admin',
                execute: this.mute.bind(this)
            },
            {
                name: 'unmute',
                description: 'Unmute group',
                usage: '.unmute',
                permissions: 'admin',
                execute: this.unmute.bind(this)
            },
            {
                name: 'groupinfo',
                description: 'Get detailed group information',
                usage: '.groupinfo',
                permissions: 'public',
                execute: this.groupInfo.bind(this)
            },
            {
                name: 'admins',
                description: 'List all group admins',
                usage: '.admins',
                permissions: 'public',
                execute: this.listAdmins.bind(this)
            },
            {
                name: 'members',
                description: 'List all group members',
                usage: '.members',
                permissions: 'public',
                execute: this.listMembers.bind(this)
            },
            {
                name: 'setname',
                description: 'Change group name',
                usage: '.setname <new name>',
                permissions: 'admin',
                execute: this.setGroupName.bind(this)
            },
            {
                name: 'setdesc',
                description: 'Change group description',
                usage: '.setdesc <new description>',
                permissions: 'admin',
                execute: this.setGroupDescription.bind(this)
            },
            {
                name: 'invite',
                description: 'Get group invite link',
                usage: '.invite',
                permissions: 'admin',
                execute: this.getInviteLink.bind(this)
            },
            {
                name: 'revoke',
                description: 'Revoke and create new invite link',
                usage: '.revoke',
                permissions: 'admin',
                execute: this.revokeInviteLink.bind(this)
            },
            {
                name: 'antilink',
                description: 'Toggle anti-link protection',
                usage: '.antilink on/off',
                permissions: 'admin',
                execute: this.toggleAntiLink.bind(this)
            },
            {
                name: 'welcome',
                description: 'Toggle welcome messages',
                usage: '.welcome on/off',
                permissions: 'admin',
                execute: this.toggleWelcome.bind(this)
            }
        ];
        
        this.groupSettings = new Map();
        this.messageHooks = {
            'group.participants.update': this.handleParticipantUpdate.bind(this),
            'message.new': this.handleNewMessage.bind(this)
        };
    }

    async init() {
        // Load group settings from database if available
        this.loadGroupSettings();
    }

    loadGroupSettings() {
        // Initialize default settings for groups
        // In a real implementation, this would load from database
    }

    getGroupSettings(groupId) {
        if (!this.groupSettings.has(groupId)) {
            this.groupSettings.set(groupId, {
                antilink: false,
                welcome: true,
                goodbye: true,
                adminOnly: false
            });
        }
        return this.groupSettings.get(groupId);
    }

    async promote(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        const targetUser = await this.getTargetUser(msg, params, context);
        if (!targetUser) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ Please mention a user or reply to their message.'
            });
        }

        try {
            await context.bot.sock.groupParticipantsUpdate(context.sender, [targetUser], 'promote');
            await context.bot.sendMessage(context.sender, {
                text: `✅ Successfully promoted @${targetUser.split('@')[0]} to admin!`,
                mentions: [targetUser]
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to promote user: ${error.message}`
            });
        }
    }

    async demote(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        const targetUser = await this.getTargetUser(msg, params, context);
        if (!targetUser) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ Please mention a user or reply to their message.'
            });
        }

        try {
            await context.bot.sock.groupParticipantsUpdate(context.sender, [targetUser], 'demote');
            await context.bot.sendMessage(context.sender, {
                text: `✅ Successfully demoted @${targetUser.split('@')[0]} from admin!`,
                mentions: [targetUser]
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to demote user: ${error.message}`
            });
        }
    }

    async kick(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        const targetUser = await this.getTargetUser(msg, params, context);
        if (!targetUser) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ Please mention a user or reply to their message.'
            });
        }

        try {
            await context.bot.sock.groupParticipantsUpdate(context.sender, [targetUser], 'remove');
            await context.bot.sendMessage(context.sender, {
                text: `✅ Successfully removed @${targetUser.split('@')[0]} from the group!`,
                mentions: [targetUser]
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to remove user: ${error.message}`
            });
        }
    }

    async add(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        if (params.length === 0) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ Please provide a phone number to add.\nUsage: .add 1234567890'
            });
        }

        const phoneNumber = params[0].replace(/[^\d]/g, '');
        const targetUser = phoneNumber + '@s.whatsapp.net';

        try {
            await context.bot.sock.groupParticipantsUpdate(context.sender, [targetUser], 'add');
            await context.bot.sendMessage(context.sender, {
                text: `✅ Successfully added +${phoneNumber} to the group!`
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to add user: ${error.message}`
            });
        }
    }

    async mute(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        try {
            await context.bot.sock.groupSettingUpdate(context.sender, 'announcement');
            await context.bot.sendMessage(context.sender, {
                text: '🔇 Group has been muted! Only admins can send messages now.'
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to mute group: ${error.message}`
            });
        }
    }

    async unmute(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        try {
            await context.bot.sock.groupSettingUpdate(context.sender, 'not_announcement');
            await context.bot.sendMessage(context.sender, {
                text: '🔊 Group has been unmuted! All members can send messages now.'
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to unmute group: ${error.message}`
            });
        }
    }

    async groupInfo(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        try {
            const groupMetadata = await context.bot.sock.groupMetadata(context.sender);
            const settings = this.getGroupSettings(context.sender);
            
            let infoText = `📊 *Group Information*\n\n`;
            infoText += `📝 *Name:* ${groupMetadata.subject}\n`;
            infoText += `🆔 *ID:* ${groupMetadata.id}\n`;
            infoText += `👥 *Members:* ${groupMetadata.participants.length}\n`;
            infoText += `👑 *Admins:* ${groupMetadata.participants.filter(p => p.admin).length}\n`;
            infoText += `📅 *Created:* ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}\n`;
            infoText += `🔗 *Anti-Link:* ${settings.antilink ? '✅' : '❌'}\n`;
            infoText += `👋 *Welcome:* ${settings.welcome ? '✅' : '❌'}\n`;
            
            if (groupMetadata.desc) {
                infoText += `\n📄 *Description:*\n${groupMetadata.desc}`;
            }

            await context.bot.sendMessage(context.sender, { text: infoText });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get group info: ${error.message}`
            });
        }
    }

    async listAdmins(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        try {
            const groupMetadata = await context.bot.sock.groupMetadata(context.sender);
            const admins = groupMetadata.participants.filter(p => p.admin);
            
            let adminText = `👑 *Group Admins (${admins.length})*\n\n`;
            
            for (let i = 0; i < admins.length; i++) {
                const admin = admins[i];
                const role = admin.admin === 'superadmin' ? '👑 Owner' : '👮 Admin';
                adminText += `${i + 1}. ${role}: @${admin.id.split('@')[0]}\n`;
            }

            const mentions = admins.map(admin => admin.id);
            await context.bot.sendMessage(context.sender, { 
                text: adminText,
                mentions: mentions
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get admin list: ${error.message}`
            });
        }
    }

    async listMembers(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        try {
            const groupMetadata = await context.bot.sock.groupMetadata(context.sender);
            const members = groupMetadata.participants;
            
            let memberText = `👥 *Group Members (${members.length})*\n\n`;
            
            for (let i = 0; i < Math.min(members.length, 50); i++) {
                const member = members[i];
                const role = member.admin ? (member.admin === 'superadmin' ? '👑' : '👮') : '👤';
                memberText += `${i + 1}. ${role} @${member.id.split('@')[0]}\n`;
            }

            if (members.length > 50) {
                memberText += `\n... and ${members.length - 50} more members`;
            }

            const mentions = members.slice(0, 50).map(member => member.id);
            await context.bot.sendMessage(context.sender, { 
                text: memberText,
                mentions: mentions
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get member list: ${error.message}`
            });
        }
    }

    async setGroupName(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        if (params.length === 0) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ Please provide a new group name.\nUsage: .setname <new name>'
            });
        }

        const newName = params.join(' ');

        try {
            await context.bot.sock.groupUpdateSubject(context.sender, newName);
            await context.bot.sendMessage(context.sender, {
                text: `✅ Group name changed to: *${newName}*`
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to change group name: ${error.message}`
            });
        }
    }

    async setGroupDescription(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        if (params.length === 0) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ Please provide a new group description.\nUsage: .setdesc <new description>'
            });
        }

        const newDesc = params.join(' ');

        try {
            await context.bot.sock.groupUpdateDescription(context.sender, newDesc);
            await context.bot.sendMessage(context.sender, {
                text: `✅ Group description updated successfully!`
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to change group description: ${error.message}`
            });
        }
    }

    async getInviteLink(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        try {
            const inviteCode = await context.bot.sock.groupInviteCode(context.sender);
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            
            await context.bot.sendMessage(context.sender, {
                text: `🔗 *Group Invite Link*\n\n${inviteLink}\n\n⚠️ Share this link carefully!`
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to get invite link: ${error.message}`
            });
        }
    }

    async revokeInviteLink(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        try {
            await context.bot.sock.groupRevokeInvite(context.sender);
            const newInviteCode = await context.bot.sock.groupInviteCode(context.sender);
            const newInviteLink = `https://chat.whatsapp.com/${newInviteCode}`;
            
            await context.bot.sendMessage(context.sender, {
                text: `✅ *Invite Link Revoked!*\n\n🔗 New Link: ${newInviteLink}\n\n⚠️ Old link is no longer valid!`
            });
        } catch (error) {
            await context.bot.sendMessage(context.sender, {
                text: `❌ Failed to revoke invite link: ${error.message}`
            });
        }
    }

    async toggleAntiLink(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        const settings = this.getGroupSettings(context.sender);
        
        if (params.length === 0) {
            return context.bot.sendMessage(context.sender, {
                text: `🔗 *Anti-Link Status:* ${settings.antilink ? '✅ Enabled' : '❌ Disabled'}\n\nUsage: .antilink on/off`
            });
        }

        const action = params[0].toLowerCase();
        
        if (action === 'on' || action === 'enable') {
            settings.antilink = true;
            await context.bot.sendMessage(context.sender, {
                text: '✅ Anti-Link protection enabled! Links will be automatically deleted.'
            });
        } else if (action === 'off' || action === 'disable') {
            settings.antilink = false;
            await context.bot.sendMessage(context.sender, {
                text: '❌ Anti-Link protection disabled!'
            });
        } else {
            await context.bot.sendMessage(context.sender, {
                text: '❌ Invalid option. Use: .antilink on/off'
            });
        }
    }

    async toggleWelcome(msg, params, context) {
        if (!context.isGroup) {
            return context.bot.sendMessage(context.sender, {
                text: '❌ This command can only be used in groups.'
            });
        }

        const settings = this.getGroupSettings(context.sender);
        
        if (params.length === 0) {
            return context.bot.sendMessage(context.sender, {
                text: `👋 *Welcome Messages:* ${settings.welcome ? '✅ Enabled' : '❌ Disabled'}\n\nUsage: .welcome on/off`
            });
        }

        const action = params[0].toLowerCase();
        
        if (action === 'on' || action === 'enable') {
            settings.welcome = true;
            await context.bot.sendMessage(context.sender, {
                text: '✅ Welcome messages enabled!'
            });
        } else if (action === 'off' || action === 'disable') {
            settings.welcome = false;
            await context.bot.sendMessage(context.sender, {
                text: '❌ Welcome messages disabled!'
            });
        } else {
            await context.bot.sendMessage(context.sender, {
                text: '❌ Invalid option. Use: .welcome on/off'
            });
        }
    }

    async handleParticipantUpdate(update) {
        const { id: groupId, participants, action } = update;
        const settings = this.getGroupSettings(groupId);

        if (!settings.welcome) return;

        try {
            const groupMetadata = await this.bot.sock.groupMetadata(groupId);
            
            for (const participant of participants) {
                if (action === 'add') {
                    const welcomeText = `👋 Welcome to *${groupMetadata.subject}*!\n\n` +
                                      `🎉 @${participant.split('@')[0]} has joined the group!\n\n` +
                                      `📋 Please read the group rules and enjoy your stay!`;
                    
                    await this.bot.sendMessage(groupId, {
                        text: welcomeText,
                        mentions: [participant]
                    });
                } else if (action === 'remove') {
                    const goodbyeText = `👋 @${participant.split('@')[0]} has left the group.\n\n` +
                                       `🌟 Thanks for being part of *${groupMetadata.subject}*!`;
                    
                    await this.bot.sendMessage(groupId, {
                        text: goodbyeText,
                        mentions: [participant]
                    });
                }
            }
        } catch (error) {
            console.error('Error handling participant update:', error);
        }
    }

    async handleNewMessage(msg, text) {
        if (!msg.key.remoteJid?.endsWith('@g.us')) return;
        
        const settings = this.getGroupSettings(msg.key.remoteJid);
        
        if (settings.antilink && text) {
            const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+)/gi;
            
            if (linkRegex.test(text)) {
                const participant = msg.key.participant || msg.key.remoteJid;
                const isAdmin = await this.isUserAdmin(msg.key.remoteJid, participant);
                
                if (!isAdmin) {
                    try {
                        await this.bot.sock.sendMessage(msg.key.remoteJid, {
                            delete: msg.key
                        });
                        
                        await this.bot.sendMessage(msg.key.remoteJid, {
                            text: `🚫 @${participant.split('@')[0]}, links are not allowed in this group!`,
                            mentions: [participant]
                        });
                    } catch (error) {
                        console.error('Error deleting link message:', error);
                    }
                }
            }
        }
    }

    async isUserAdmin(groupId, userId) {
        try {
            const groupMetadata = await this.bot.sock.groupMetadata(groupId);
            const participant = groupMetadata.participants.find(p => p.id === userId);
            return participant?.admin !== undefined;
        } catch (error) {
            return false;
        }
    }

    async getTargetUser(msg, params, context) {
        // Check if replying to a message
        if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            return msg.message.extendedTextMessage.contextInfo.participant;
        }
        
        // Check for mentions
        if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            return msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
        }
        
        // Check for phone number in params
        if (params.length > 0) {
            const phoneNumber = params[0].replace(/[^\d]/g, '');
            if (phoneNumber) {
                return phoneNumber + '@s.whatsapp.net';
            }
        }
        
        return null;
    }
}

export default GroupManagement;
