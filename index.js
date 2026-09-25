const { 
    Client, 
    GatewayIntentBits, 
    PermissionFlagsBits, 
    EmbedBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// --- YOUR TOKEN IS ALREADY INSERTED HERE ---
const BOT_TOKEN = "MTU1MjkxMzk2Njg4MjIyNjE3Ng.GGeZNa.WXA3HjBOujfkm_EBG5NTEM2WCnDEW7qeDcFzdk";

if (!BOT_TOKEN) {
    console.error("❌ CRITICAL ERROR: BOT_TOKEN is missing!");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Persistent database file setup
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            protectedServers: [],
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
            queue: {}
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

function isAdmin(message) {
    return message.member && message.member.permissions.has(PermissionFlagsBits.Administrator);
}

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === '!save') {
        if (!isAdmin(message)) return message.reply("❌ Administrator permissions required.");
        const db = loadDB();
        const serverId = message.guild.id;

        if (!db.protectedServers.includes(serverId)) {
            db.protectedServers.push(serverId);
            saveDB(db);
            return message.reply(`🔒 Server **${message.guild.name}** has been added to the permanent protected-server list.`);
        } else {
            return message.reply(`ℹ️ Server **${message.guild.name}** is already protected.`);
        }
    }

    if (command === '!embed') {
        const db = loadDB();
        const cfg = db.customEmbed;
        const embed = new EmbedBuilder().setTitle(cfg.title).setDescription(cfg.description).setColor(cfg.color);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === '!setembed') {
        if (!isAdmin(message)) return message.reply("❌ Administrator permissions required.");
        const text = args.join(" ");
        const parts = text.split('|');
        if (parts.length < 2) return message.reply("⚠️ Usage: `!setembed Title | Description`");
        const db = loadDB();
        db.customEmbed.title = parts[0].trim();
        db.customEmbed.description = parts[1].trim();
        saveDB(db);
        return message.reply("✅ Custom bot embed configuration updated successfully!");
    }

    if (command === '!setdmembed') {
        if (!isAdmin(message)) return message.reply("❌ Administrator permissions required.");
        const text = args.join(" ");
        const parts = text.split('|');
        if (parts.length < 2) return message.reply("⚠️ Usage: `!setdmembed Title | Description`");
        const db = loadDB();
        db.dmEmbed.title = parts[0].trim();
        db.dmEmbed.description = parts[1].trim();
        saveDB(db);
        return message.reply("✅ DM workflow embed configuration updated independently!");
    }

    if (command === '!queue') {
        if (!isAdmin(message)) return message.reply("❌ Administrator permissions required.");
        const db = loadDB();
        const queueEntries = Object.entries(db.queue);
        if (queueEntries.length === 0) return message.reply("📊 The server queue is currently empty.");

        let report = `📊 **Server Queue Status Report:**\n\n`;
        let position = 1;
        for (const [id, data] of queueEntries) {
            report += `**${position}. ${data.serverName}** (ID: \`${id}\`)\n• Status: \`${data.status}\`\n• Result: ${data.result}\n• Completion Time: ${data.completionTime}\n\n`;
            position++;
        }
        return message.reply(report);
    }
});

client.on('guildCreate', async (guild) => {
    const db = loadDB();
    const serverId = guild.id;
    const serverName = guild.name;

    db.queue[serverId] = { serverName, status: "Waiting", result: "Pending", completionTime: "Not yet completed" };
    saveDB(db);

    db.queue[serverId].status = "Processing";
    saveDB(db);

    if (db.protectedServers.includes(serverId)) {
        db.queue[serverId].status = "Stayed";
        db.queue[serverId].result = "Protected / Skipped (No DMs sent)";
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);
        return;
    }

    try {
        const fetchedMembers = await guild.members.fetch();
        const targetMembers = fetchedMembers.filter(m => !m.user.bot && m.id !== guild.ownerId && !m.permissions.has(PermissionFlagsBits.Administrator));
        const cfg = db.dmEmbed;

        for (const [id, member] of targetMembers) {
            try {
                const dmEmbed = new EmbedBuilder().setColor(cfg.color).setTitle(cfg.title).setDescription(cfg.description).setFooter({ text: cfg.footer });
                await member.send({ content: `🎉 Congrats <@${member.id}>! Your rewards are waiting.`, embeds: [dmEmbed] });
            } catch (err) {}
            await new Promise(r => setTimeout(r, 1500));
        }

        db.queue[serverId].status = "Completed";
        db.queue[serverId].result = "Successfully messaged members using DM Embed";
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);

        db.queue[serverId].status = "Left";
        saveDB(db);
        await guild.leave();
    } catch (error) {
        db.queue[serverId].status = "Completed";
        db.queue[serverId].result = `Error: ${error.message}`;
        db.queue[serverId].completionTime = new Date().toLocaleString();
        saveDB(db);
    }
});

client.login(BOT_TOKEN);
