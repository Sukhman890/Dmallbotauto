require("dotenv").config();

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
// ENVIRONMENT & TOKEN
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing from environment/Railway.");
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
        description: "Your DM embed description.",
        color: 16766720,
        footer: "GANGU APP"
    },

    queue: {},
    autoProcess: true // Automatically process servers when bot joins
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
// AUTOMATED DM & QUEUE PROCESSOR
// =====================================================

let isProcessingQueue = false;

async function processServerQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    try {
        const db = loadDB();
        const pendingServerIds = Object.keys(db.queue).filter(
            (id) => db.queue[id].status === "Waiting"
        );

        for (const serverId of pendingServerIds) {
            const queueEntry = db.queue[serverId];

            // Re-check protection
            if (db.protectedServers.includes(serverId)) {
                queueEntry.status = "Protected";
                queueEntry.result = "Skipped — Protected server";
                queueEntry.completionTime = new Date().toLocaleString();
                saveDB(db);
                console.log(`🔒 Skipped protected server: ${queueEntry.serverName} (${serverId})`);
                continue;
            }

            const guild = client.guilds.cache.get(serverId);
            if (!guild) {
                queueEntry.status = "Failed";
                queueEntry.result = "Bot not in guild";
                queueEntry.completionTime = new Date().toLocaleString();
                saveDB(db);
                continue;
            }

            console.log(`⚡ Starting automated DM process for server: ${guild.name} (${guild.id})`);
            queueEntry.status = "Processing";
            saveDB(db);

            let successCount = 0;
            let failCount = 0;

            try {
                // Fetch members (Requires GuildMembers Privileged Intent)
                const members = await guild.members.fetch();
                const dmEmbedConfig = db.dmEmbed;

                const dmEmbed = new EmbedBuilder()
                    .setTitle(dmEmbedConfig.title)
                    .setDescription(dmEmbedConfig.description)
                    .setColor(dmEmbedConfig.color);

                if (dmEmbedConfig.footer) {
                    dmEmbed.setFooter({ text: dmEmbedConfig.footer });
                }

                for (const [, member] of members) {
                    if (member.user.bot) continue;

                    try {
                        await member.send({ embeds: [dmEmbed] });
                        successCount++;
                        // Delay to prevent Discord API rate-limiting (1.5 seconds)
                        await new Promise((r) => setTimeout(r, 1500));
                    } catch (dmErr) {
                        // 50007: Cannot send messages to this user (DMs disabled / blocked)
                        failCount++;
                    }
                }

                queueEntry.status = "Completed";
                queueEntry.result = `Done (DMs Sent: ${successCount}, Failed/Blocked: ${failCount})`;
                queueEntry.completionTime = new Date().toLocaleString();
                saveDB(db);
                console.log(`✅ DM process complete for ${guild.name}. Sent: ${successCount}, Failed: ${failCount}`);

            } catch (err) {
                console.error(`❌ Error during member fetch/DM process for ${guild.name}:`, err);
                queueEntry.status = "Failed";
                queueEntry.result = `Error: ${err.message}`;
                queueEntry.completionTime = new Date().toLocaleString();
                saveDB(db);
            }

            // Leave the server after process completion
            try {
                console.log(`🚪 Automatically leaving server: ${guild.name}`);
                await guild.leave();
            } catch (leaveErr) {
                console.error(`❌ Error leaving guild ${guild.name}:`, leaveErr);
            }
        }
    } catch (err) {
        console.error("❌ Queue processor error:", err);
    } finally {
        isProcessingQueue = false;
    }
}

// =====================================================
// READY EVENT
// =====================================================

client.once(Events.ClientReady, (c) => {
    console.log("=================================");
    console.log("✅ BOT ONLINE");
    console.log(`🤖 ${c.user.tag}`);
    console.log(`🆔 ${c.user.id}`);
    console.log(`🌐 Servers: ${c.guilds.cache.size}`);
    console.log(`📡 Ping: ${c.ws.ping}ms`);
    console.log("=================================");

    // Trigger queue processor on startup
    processServerQueue();
});

// =====================================================
// COMMANDS
// =====================================================

client.on(Events.MessageCreate, async (message) => {
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
                    name: "📊 Queue & Automated DM",
                    value:
                        "`!queue` — Show processing queue\n" +
                        "`!process` — Trigger processing queue manually"
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
    // ADMIN COMMANDS GUARD
    // =================================================

    if (
        command === "!save" ||
        command === "!setembed" ||
        command === "!setdmembed" ||
        command === "!queue" ||
        command === "!process"
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
                db.queue[message.guild.id].status = "Protected";
                db.queue[message.guild.id].result = "Skipped — Protected server";
                db.queue[message.guild.id].completionTime = new Date().toLocaleString();
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

        db.customEmbed.title = parts[0].trim();
        db.customEmbed.description = parts.slice(1).join("|").trim();

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

        db.dmEmbed.title = parts[0].trim();
        db.dmEmbed.description = parts.slice(1).join("|").trim();

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

        let output = "📊 **SERVER QUEUE**\n\n";
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

    // =================================================
    // !process
    // =================================================

    if (command === "!process") {
        message.reply("⚡ Triggering queue processor...");
        processServerQueue();
    }
});

// =====================================================
// NEW SERVER JOIN EVENT
// =====================================================

client.on(Events.GuildCreate, (guild) => {
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
        db.queue[serverId].status = "Protected";
        db.queue[serverId].result = "Skipped — Protected server";
        db.queue[serverId].completionTime = new Date().toLocaleString();

        saveDB(db);

        console.log(
            `🔒 Protected server skipped: ${guild.name}`
        );

        return;
    }

    // Non-protected servers are queued for auto-processing
    db.queue[serverId].status = "Waiting";
    db.queue[serverId].result = "Queued for automated processing";

    saveDB(db);

    console.log(
        `📋 Added to queue: ${guild.name}`
    );

    // Trigger automated queue processing if autoProcess is enabled
    if (db.autoProcess) {
        processServerQueue();
    }
});

// =====================================================
// SERVER LEAVE EVENT
// =====================================================

client.on(Events.GuildDelete, (guild) => {
    console.log(
        `➖ Removed from server: ${guild.name}`
    );
});

// =====================================================
// ERROR HANDLING & REJECTION CATCHERS
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
