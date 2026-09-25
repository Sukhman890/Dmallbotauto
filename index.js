const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    EmbedBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load token directly from token.json
const tokenPath = path.join(__dirname, 'token.json');
if (!fs.existsSync(tokenPath)) {
    console.error("❌ Error: token.json file is missing!");
    process.exit(1);
}
const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
const BOT_TOKEN = tokenData.token;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Persistent database setup for data preservation
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            protectedServers: [], // Populated by !save
            customEmbed: {
                title: "📢 Custom Bot Embed",
                description: "This is the independent custom display embed configured by the administrator.",
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
    console.log(`🤖 Logged in as ${client.user.tag}! Bot is online and fully functional.`);
});

// Helper: Check administrator permissions
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

    // 1. Protected Servers — !save
    if (command === '!save') {
        if (!isAdmin(message)) {
            return message.reply("❌ Administrator permissions required.");
        }

        const db = loadDB();
        const serverId = message.guild.id;

        if (!db.protectedServers.includes(serverId)) {
            db.protectedServers.push(serverId);
            saveDB(db);
            return message.reply(`🔒 Server **${message.guild.name}** has been added to the permanent protected-server list. The bot will stay and won't DM members.`);
        } else {
            return message.reply(`ℹ️ Server **${message.guild.name}** is already protected.`);
        }
    }

    // 2. Custom Bot Embed — !embed
    if (command === '!embed') {
        const db = loadDB();
        const cfg = db.customEmbed;

        const embed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description)
            .setColor(cfg.color);

        return message.channel.send({ embeds: [embed] });
    }

    // Admin Command: Configure !embed settings (!setembed Title | Description)
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

        return message.reply("✅ Custom bot embed configuration (`!embed`) updated successfully!");
    }

    // 3. Admin Command: Configure DM Embed settings (!setdmembed Title | Description)
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

        return message.reply("✅ DM workflow embed configuration updated independently!");
    }

    // 5. !queue — Displays servers currently being processed or waiting
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
// 4. NEW SERVER WORKFLOW & PROTECTED SERVER CHECKS
// ----------------------------------------------------
client.on('guildCreate', async (guild) => {
    const db = loadDB();
    const serverId = guild.id;
    const serverName = guild.name;

    // Step 1: Detect the new server and add it to the queue (Waiting)
    db.queue[serverId] = {
        serverName: serverName,
        status: "Waiting",
        result: "Pending",
        completionTime: "Not yet completed"
    };
    saveDB(db);

    console.log(`[Queue] Added server to queue: ${serverName} (${serverId})`);

    // Step 2: Transition status to Processing
    db.queue[serverId].status = "Processing";
    saveDB(db);

    // Check whether the server is in the !save protected list
    if (db.protectedServers.includes(serverId)) {
        db.queue[serverId].status = "Stayed";
        db.queue[serverId].result = "Protected / Skipped (No DMs sent)";
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);

        console.log(`[Protected] Server ${serverName} is protected. Bot is staying in server without DMing.`);
        return;
    }

    // Unprotected Server Workflow: Use DM Embed, record result, then leave
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
                // Skips users with DMs closed or blocked bot
            }
            await new Promise(resolve => setTimeout(resolve, 1500)); // Rate-limit safety delay
        }

        db.queue[serverId].status = "Completed";
        db.queue[serverId].result = "Successfully messaged members using DM Embed";
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);

        // After DM workflow is finished, leave the server automatically
        console.log(`[Workflow] Finished DMing members in ${serverName}. Leaving server automatically...`);
        
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

client.login(BOT_TOKEN);
