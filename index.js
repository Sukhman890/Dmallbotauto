const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder,
    Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// ENVIRONMENT & CONFIG
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing from environment variables.");
    process.exit(1);
}

// =====================================================
// CLIENT INITIALIZATION
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// =====================================================
// DATABASE MANAGEMENT
// =====================================================

const DB_FILE = path.join(__dirname, "database.json");

const DEFAULT_DB = {
    protectedServers: [],

    customEmbed: {
        title: "📢 Custom Bot Embed",
        description: "Your custom embed description.",
        color: 3066993,
        footer: "GANGU APP"
    },

    dmEmbed: {
        title: "🎁 Reward Drop",
        description: "Your opt-in DM embed description.",
        color: 16766720,
        footer: "GANGU APP"
    },

    serverLog: {}
};

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        saveDB(DEFAULT_DB);
        return structuredClone(DEFAULT_DB);
    }

    try {
        const data = fs.readFileSync(DB_FILE, "utf8");
        return { ...structuredClone(DEFAULT_DB), ...JSON.parse(data) };
    } catch (error) {
        console.error("❌ Database read error:", error);
        return structuredClone(DEFAULT_DB);
    }
}

function saveDB(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error("❌ Database save error:", error);
    }
}

function isAdmin(message) {
    return message.member?.permissions.has(
        PermissionFlagsBits.Administrator
    );
}

// =====================================================
// READY EVENT
// =====================================================

client.once(Events.ClientReady, (c) => {
    console.log("=================================");
    console.log("✅ BOT ONLINE");
    console.log(`🤖 ${c.user.tag}`);
    console.log(`🆔 ${c.user.id}`);
    console.log(`🌐 Active Servers: ${c.guilds.cache.size}`);
    console.log(`📡 WebSocket Ping: ${c.ws.ping}ms`);
    console.log("=================================");
});

// =====================================================
// COMMANDS
// =====================================================

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    if (!content.startsWith("!")) return;

    const args = content.split(/\s+/);
    const command = args.shift().toLowerCase();

    // =================================================
    // !help
    // =================================================

    if (command === "!help") {
        const embed = new EmbedBuilder()
            .setTitle("🤖 GANGU APP — Commands")
            .setDescription("Available bot commands:")
            .addFields(
                {
                    name: "🏓 General",
                    value:
                        "`!ping` — Check bot latency\n" +
                        "`!status` — Show bot status\n" +
                        "`!help` — Show command list"
                },
                {
                    name: "🔒 Protected Servers",
                    value:
                        "`!save` — Mark current server as protected"
                },
                {
                    name: "🎨 Custom Embeds",
                    value:
                        "`!embed` — Display configured custom embed\n" +
                        "`!setembed Title | Description` — Update custom embed\n" +
                        "`!setdmembed Title | Description` — Update DM embed"
                },
                {
                    name: "📊 Status & Logs",
                    value:
                        "`!queue` — Show server status log"
                }
            )
            .setColor(3066993)
            .setFooter({ text: "GANGU APP" })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // =================================================
    // !ping
    // =================================================

    if (command === "!ping") {
        return message.reply(`🏓 Pong! **${client.ws.ping}ms**`);
    }

    // =================================================
    // !status
    // =================================================

    if (command === "!status") {
        const db = loadDB();

        const embed = new EmbedBuilder()
            .setTitle("🤖 Bot Status")
            .addFields(
                { name: "Status", value: "🟢 Online", inline: true },
                { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
                { name: "Ping", value: `${client.ws.ping}ms`, inline: true },
                { name: "Protected", value: `${db.protectedServers.length}`, inline: true }
            )
            .setColor(5763719);

        return message.channel.send({ embeds: [embed] });
    }

    // =================================================
    // ADMIN PERMISSION CHECK
    // =================================================

    if (
        command === "!save" ||
        command === "!setembed" ||
        command === "!setdmembed" ||
        command === "!queue"
    ) {
        if (!isAdmin(message)) {
            return message.reply("❌ Administrator permission required.");
        }
    }

    // =================================================
    // !save
    // =================================================

    if (command === "!save") {
        const db = loadDB();

        if (!db.protectedServers.includes(message.guild.id)) {
            db.protectedServers.push(message.guild.id);
            saveDB(db);
            return message.reply(
                `🔒 **${message.guild.name}** is now permanently protected.`
            );
        }

        return message.reply("ℹ️ This server is already protected.");
    }

    // =================================================
    // !embed
    // =================================================

    if (command === "!embed") {
        const db = loadDB();
        const cfg = db.customEmbed;

        const embed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description)
            .setColor(cfg.color);

        if (cfg.footer) {
            embed.setFooter({ text: cfg.footer });
        }

        return message.channel.send({ embeds: [embed] });
    }

    // =================================================
    // !setembed
    // =================================================

    if (command === "!setembed") {
        const text = args.join(" ");
        const parts = text.split("|");

        if (parts.length < 2) {
            return message.reply(
                "⚠️ Usage:\n`!setembed Title | Description`"
            );
        }

        const db = loadDB();

        db.customEmbed.title = parts[0].trim();
        db.customEmbed.description = parts.slice(1).join("|").trim();

        saveDB(db);

        return message.reply("✅ Custom embed updated successfully.");
    }

    // =================================================
    // !setdmembed
    // =================================================

    if (command === "!setdmembed") {
        const text = args.join(" ");
        const parts = text.split("|");

        if (parts.length < 2) {
            return message.reply(
                "⚠️ Usage:\n`!setdmembed Title | Description`"
            );
        }

        const db = loadDB();

        db.dmEmbed.title = parts[0].trim();
        db.dmEmbed.description = parts.slice(1).join("|").trim();

        saveDB(db);

        return message.reply("✅ DM embed updated successfully.");
    }

    // =================================================
    // !queue
    // =================================================

    if (command === "!queue") {
        const db = loadDB();
        const entries = Object.entries(db.serverLog);

        if (entries.length === 0) {
            return message.reply("📊 The server log is empty.");
        }

        let output = "📊 **SERVER LOG**\n\n";
        let position = 1;

        for (const [serverId, data] of entries) {
            output +=
                `**${position}. ${data.serverName}**\n` +
                `🆔 ID: \`${serverId}\`\n` +
                `📌 Status: **${data.status}**\n` +
                `⏰ Joined: ${data.joinedTime}\n\n`;
            position++;
        }

        return message.reply(output);
    }
});

// =====================================================
// SERVER JOIN EVENT (Compliant Welcome Message)
// =====================================================

client.on(Events.GuildCreate, async (guild) => {
    console.log(`➕ Joined server: ${guild.name} (${guild.id})`);

    const db = loadDB();
    const serverId = guild.id;

    db.serverLog[serverId] = {
        serverName: guild.name,
        status: "Active",
        joinedTime: new Date().toLocaleString()
    };

    saveDB(db);

    // Send welcome embed to system channel or first writable channel
    try {
        const cfg = db.customEmbed;
        const embed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description)
            .setColor(cfg.color);

        if (cfg.footer) {
            embed.setFooter({ text: cfg.footer });
        }

        const channel = guild.systemChannel || guild.channels.cache.find(
            (c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has("SendMessages")
        );

        if (channel) {
            await channel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(`❌ Could not send welcome embed to ${guild.name}:`, error);
    }
});

// =====================================================
// SERVER LEAVE EVENT
// =====================================================

client.on(Events.GuildDelete, (guild) => {
    console.log(`➖ Removed from server: ${guild.name}`);
});

// =====================================================
// ERROR HANDLING
// =====================================================

client.on(Events.Error, (error) => {
    console.error("❌ Discord error:", error);
});

process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled rejection:", error);
});

process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught exception:", error);
});

// =====================================================
// LOGIN
// =====================================================

console.log("🔄 Connecting to Discord...");

client.login(TOKEN)
    .then(() => {
        console.log("✅ Login request accepted.");
    })
    .catch((error) => {
        console.error("❌ Login failed:", error);
        process.exit(1);
    });
