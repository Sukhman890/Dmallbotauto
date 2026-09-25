const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// RAILWAY
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing from Railway.");
    process.exit(1);
}

// =====================================================
// CLIENT
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
// DATABASE
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
        description: "Your DM embed description.",
        color: 16766720,
        footer: "GANGU APP"
    },

    queue: {}
};

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        saveDB(DEFAULT_DB);
        return structuredClone(DEFAULT_DB);
    }

    try {
        return JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );
    } catch (error) {
        console.error("❌ Database read error:", error);
        return structuredClone(DEFAULT_DB);
    }
}

function saveDB(db) {
    try {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(db, null, 2)
        );
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
// READY
// =====================================================

client.once("clientReady", () => {
    console.log("=================================");
    console.log("✅ BOT ONLINE");
    console.log(`🤖 ${client.user.tag}`);
    console.log(`🆔 ${client.user.id}`);
    console.log(`🌐 Servers: ${client.guilds.cache.size}`);
    console.log(`📡 Ping: ${client.ws.ping}ms`);
    console.log("=================================");
});

// =====================================================
// COMMANDS
// =====================================================

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

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
            .setDescription("Available commands:")
            .addFields(
                {
                    name: "🏓 General",
                    value:
                        "`!ping` — Check bot latency\n" +
                        "`!status` — Show bot status\n" +
                        "`!help` — Show commands"
                },
                {
                    name: "🔒 Protected Servers",
                    value:
                        "`!save` — Protect the current server"
                },
                {
                    name: "🎨 Custom Embed",
                    value:
                        "`!embed` — Display custom embed\n" +
                        "`!setembed Title | Description` — Configure custom embed"
                },
                {
                    name: "🎁 DM Embed",
                    value:
                        "`!setdmembed Title | Description` — Configure DM embed"
                },
                {
                    name: "📊 Queue",
                    value:
                        "`!queue` — Show processing queue"
                }
            )
            .setColor(3066993)
            .setFooter({
                text: "GANGU APP"
            })
            .setTimestamp();

        return message.channel.send({
            embeds: [embed]
        });
    }

    // =================================================
    // !ping
    // =================================================

    if (command === "!ping") {
        return message.reply(
            `🏓 Pong! **${client.ws.ping}ms**`
        );
    }

    // =================================================
    // !status
    // =================================================

    if (command === "!status") {
        const db = loadDB();

        const embed = new EmbedBuilder()
            .setTitle("🤖 Bot Status")
            .addFields(
                {
                    name: "Status",
                    value: "🟢 Online",
                    inline: true
                },
                {
                    name: "Servers",
                    value: `${client.guilds.cache.size}`,
                    inline: true
                },
                {
                    name: "Ping",
                    value: `${client.ws.ping}ms`,
                    inline: true
                },
                {
                    name: "Protected",
                    value: `${db.protectedServers.length}`,
                    inline: true
                },
                {
                    name: "Queue",
                    value: `${Object.keys(db.queue).length}`,
                    inline: true
                }
            )
            .setColor(5763719);

        return message.channel.send({
            embeds: [embed]
        });
    }

    // =================================================
    // ADMIN COMMANDS
    // =================================================

    if (
        command === "!save" ||
        command === "!setembed" ||
        command === "!setdmembed" ||
        command === "!queue"
    ) {
        if (!isAdmin(message)) {
            return message.reply(
                "❌ Administrator permission required."
            );
        }
    }

    // =================================================
    // !save
    // =================================================

    if (command === "!save") {
        const db = loadDB();

        if (!db.protectedServers.includes(message.guild.id)) {
            db.protectedServers.push(message.guild.id);

            if (db.queue[message.guild.id]) {
                db.queue[message.guild.id].status =
                    "Protected";

                db.queue[message.guild.id].result =
                    "Skipped — Protected server";

                db.queue[message.guild.id].completionTime =
                    new Date().toLocaleString();
            }

            saveDB(db);

            return message.reply(
                `🔒 **${message.guild.name}** is now permanently protected.`
            );
        }

        return message.reply(
            "ℹ️ This server is already protected."
        );
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
            embed.setFooter({
                text: cfg.footer
            });
        }

        return message.channel.send({
            embeds: [embed]
        });
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

        db.customEmbed.title =
            parts[0].trim();

        db.customEmbed.description =
            parts.slice(1).join("|").trim();

        saveDB(db);

        return message.reply(
            "✅ Custom embed updated successfully."
        );
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

        db.dmEmbed.title =
            parts[0].trim();

        db.dmEmbed.description =
            parts.slice(1).join("|").trim();

        saveDB(db);

        return message.reply(
            "✅ DM embed updated independently."
        );
    }

    // =================================================
    // !queue
    // =================================================

    if (command === "!queue") {
        const db = loadDB();
        const entries = Object.entries(db.queue);

        if (entries.length === 0) {
            return message.reply(
                "📊 The processing queue is empty."
            );
        }

        let output =
            "📊 **SERVER QUEUE**\n\n";

        let position = 1;

        for (const [serverId, data] of entries) {
            output +=
                `**${position}. ${data.serverName}**\n` +
                `🆔 ID: \`${serverId}\`\n` +
                `📌 Status: **${data.status}**\n` +
                `📋 Result: ${data.result}\n` +
                `⏰ Completion: ${data.completionTime}\n\n`;

            position++;
        }

        return message.reply(output);
    }
});

// =====================================================
// NEW SERVER
// =====================================================

client.on("guildCreate", (guild) => {
    console.log(
        `➕ Joined server: ${guild.name} (${guild.id})`
    );

    const db = loadDB();
    const serverId = guild.id;

    // Create queue entry
    db.queue[serverId] = {
        serverName: guild.name,
        status: "Waiting",
        result: "Pending",
        completionTime: "Not completed"
    };

    // Check protected list
    if (db.protectedServers.includes(serverId)) {
        db.queue[serverId].status =
            "Protected";

        db.queue[serverId].result =
            "Skipped — Protected server";

        db.queue[serverId].completionTime =
            new Date().toLocaleString();

        saveDB(db);

        console.log(
            `🔒 Protected server: ${guild.name}`
        );

        return;
    }

    // Non-protected servers are queued.
    db.queue[serverId].status =
        "Waiting";

    db.queue[serverId].result =
        "Waiting for authorized processing";

    saveDB(db);

    console.log(
        `📋 Added to queue: ${guild.name}`
    );
});

// =====================================================
// SERVER LEAVE
// =====================================================

client.on("guildDelete", (guild) => {
    console.log(
        `➖ Removed from server: ${guild.name}`
    );
});

// =====================================================
// ERROR HANDLING
// =====================================================

client.on("error", (error) => {
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
