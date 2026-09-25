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
// ENVIRONMENT & CONFIG
// =====================================================

const TOKEN =
    process.env.DISCORD_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TOKEN ||
    process.env.CLIENT_TOKEN;

if (!TOKEN) {
    console.error("❌ BOT TOKEN MISSING!");
    console.error("Please add 'DISCORD_TOKEN' or 'BOT_TOKEN' in your Railway Environment Variables.");
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
    settings: {
        autoProcess: process.env.AUTO_PROCESS !== "false",
        rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || "1500", 10)
    },
    protectedServers: process.env.PROTECTED_SERVERS
        ? process.env.PROTECTED_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    customEmbed: {
        title: process.env.CUSTOM_EMBED_TITLE || "📢 Custom Bot Embed",
        description: process.env.CUSTOM_EMBED_DESCRIPTION || "Your custom embed description.",
        color: parseInt(process.env.CUSTOM_EMBED_COLOR || "3066993", 10),
        footer: process.env.CUSTOM_EMBED_FOOTER || "GANGU APP"
    },
    dmEmbed: {
        title: process.env.DM_TITLE || "🎁 Reward Drop",
        description: process.env.DM_DESCRIPTION || "Your automatic DM broadcast message.",
        color: parseInt(process.env.DM_COLOR || "16766720", 10),
        footer: process.env.DM_FOOTER || "GANGU APP"
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
        const parsed = JSON.parse(data);
        return {
            ...structuredClone(DEFAULT_DB),
            ...parsed,
            settings: { ...DEFAULT_DB.settings, ...(parsed.settings || {}) },
            customEmbed: { ...DEFAULT_DB.customEmbed, ...(parsed.customEmbed || {}) },
            dmEmbed: { ...DEFAULT_DB.dmEmbed, ...(parsed.dmEmbed || {}) },
            protectedServers: Array.isArray(parsed.protectedServers)
                ? parsed.protectedServers
                : DEFAULT_DB.protectedServers
        };
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
    return message.member?.permissions.has(PermissionFlagsBits.Administrator);
}

function isProtectedServer(serverId, db) {
    if (db.protectedServers.includes(serverId)) return true;
    if (process.env.PROTECTED_SERVERS) {
        const envProtected = process.env.PROTECTED_SERVERS.split(",").map((s) => s.trim());
        if (envProtected.includes(serverId)) return true;
    }
    return false;
}

// =====================================================
// QUEUE & AUTO-DM MANAGER
// =====================================================

const processingQueue = [];
let isQueueProcessing = false;

function enqueueGuild(guild) {
    console.log(`📥 [QUEUE] Adding server to queue: ${guild.name} (${guild.id})`);
    processingQueue.push(guild);
    processQueue();
}

async function processQueue() {
    if (isQueueProcessing || processingQueue.length === 0) return;

    isQueueProcessing = true;
    const guild = processingQueue.shift();
    const db = loadDB();

    console.log(`\n=================================================`);
    console.log(`🤖 AUTO DM SYSTEM TRIGGERED`);
    console.log(`🔹 Server: ${guild.name} (${guild.id})`);
    console.log(`=================================================`);

    // STEP 1: Check Protected Servers
    if (isProtectedServer(guild.id, db)) {
        console.log(`🛡️ [PROTECTED] Server "${guild.name}" is protected. Skipping auto DM and leave.`);
        db.serverLog[guild.id] = {
            serverName: guild.name,
            status: "🛡️ Protected (Skipped)",
            processedAt: new Date().toLocaleString()
        };
        saveDB(db);
        isQueueProcessing = false;
        setImmediate(processQueue);
        return;
    }

    // STEP 2: Start DM Process
    await executeDmAndLeaveProcess(guild, db);

    isQueueProcessing = false;
    setImmediate(processQueue);
}

async function executeDmAndLeaveProcess(guild, db) {
    const serverId = guild.id;

    db.serverLog[serverId] = {
        serverName: guild.name,
        status: "⏳ Processing DMs...",
        startedAt: new Date().toLocaleString(),
        successCount: 0,
        failCount: 0,
        totalMembers: 0
    };
    saveDB(db);

    let successCount = 0;
    let failCount = 0;
    let totalCount = 0;

    try {
        console.log(`🔄 Fetching server members for "${guild.name}"...`);
        const members = await guild.members.fetch();
        const eligibleMembers = members.filter((m) => !m.user.bot && m.id !== client.user.id);
        totalCount = eligibleMembers.size;

        console.log(`📋 Found ${totalCount} eligible members in "${guild.name}". Starting DM process...`);

        const delayMs = db.settings.rateLimitDelay || 1500;
        const cfg = db.dmEmbed;

        const dmEmbed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description)
            .setColor(cfg.color);

        if (cfg.footer) {
            dmEmbed.setFooter({ text: cfg.footer });
        }

        let current = 0;

        for (const [id, member] of eligibleMembers) {
            current++;
            try {
                await member.send({ embeds: [dmEmbed] });
                successCount++;
                console.log(`  📩 [DM ${current}/${totalCount}] ✅ Sent to @${member.user.tag}`);
            } catch (err) {
                failCount++;
                console.log(`  📩 [DM ${current}/${totalCount}] ❌ Failed for @${member.user.tag} (${err.message || "DMs Closed"})`);
            }

            // Respect rate limits with delay between sends
            if (current < totalCount) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        console.log(`\n✅ DM Process Complete for "${guild.name}"`);
        console.log(`📊 Results -> Sent: ${successCount} | Failed: ${failCount} | Total: ${totalCount}`);

        db.serverLog[serverId] = {
            serverName: guild.name,
            status: `✅ Complete (Sent: ${successCount}/${totalCount})`,
            completedAt: new Date().toLocaleString(),
            successCount,
            failCount,
            totalMembers: totalCount
        };
        saveDB(db);

    } catch (error) {
        console.error(`❌ Error fetching members or executing DM process for "${guild.name}":`, error);
        db.serverLog[serverId] = {
            serverName: guild.name,
            status: `❌ DM Error: ${error.message}`,
            failedAt: new Date().toLocaleString()
        };
        saveDB(db);
    }

    // STEP 3: Automatically leave server
    try {
        console.log(`🚪 Automatically leaving server: "${guild.name}" (${serverId})...`);
        await guild.leave();
        console.log(`✅ Automatically left server: "${guild.name}"`);

        db.serverLog[serverId].status += " | 🚪 Left Server";
        saveDB(db);
    } catch (leaveErr) {
        console.error(`❌ Failed to leave server "${guild.name}":`, leaveErr);
        db.serverLog[serverId].status += " | ⚠️ Failed to Leave";
        saveDB(db);
    }
}

// =====================================================
// READY EVENT
// =====================================================

client.once(Events.ClientReady, async (c) => {
    console.log("=================================");
    console.log("✅ BOT ONLINE — AUTO DM SYSTEM");
    console.log(`🤖 Bot Tag: ${c.user.tag}`);
    console.log(`🆔 Bot ID: ${c.user.id}`);
    console.log(`🌐 Active Servers: ${c.guilds.cache.size}`);
    console.log(`📡 WebSocket Latency: ${c.ws.ping}ms`);
    console.log("=================================");

    const db = loadDB();
    if (db.settings.autoProcess) {
        console.log("⚡ Auto DM processing is ENABLED on server join.");
    } else {
        console.log("⏸️ Auto DM processing is DISABLED. Use !autoprocess on to enable.");
    }
});

// =====================================================
// GUILD JOIN EVENT (AUTO DM TRIGGER)
// =====================================================

client.on(Events.GuildCreate, async (guild) => {
    console.log(`\n➕ Bot joined server: ${guild.name} (${guild.id})`);
    enqueueGuild(guild);
});

// =====================================================
// GUILD LEAVE EVENT
// =====================================================

client.on(Events.GuildDelete, (guild) => {
    console.log(`➖ Left server: ${guild.name} (${guild.id})`);
});

// =====================================================
// COMMAND HANDLER
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
            .setTitle("🤖 AUTO DM BOT — Commands Menu")
            .setDescription("Fully automated DM broadcasting & auto-leave system.")
            .addFields(
                {
                    name: "🏓 General Commands",
                    value:
                        "`!ping` — Check bot WebSocket latency\n" +
                        "`!status` — Show bot status & settings\n" +
                        "`!help` — Display this command menu"
                },
                {
                    name: "⚡ Auto DM & Execution",
                    value:
                        "`!startdm` or `!process` — Manually trigger DM process & auto-leave for current server\n" +
                        "`!autoprocess [on/off]` — Enable/disable automatic process on server join\n" +
                        "`!setdelay <ms>` — Set delay between DMs in ms (default: 1500)"
                },
                {
                    name: "🔒 Protected Server Safety",
                    value:
                        "`!save` or `!protect` — Mark current server as protected (skips DM & leave)\n" +
                        "`!protect <serverId>` — Protect specific server ID\n" +
                        "`!unprotect <serverId>` — Unprotect server ID\n" +
                        "`!protected` — View protected servers list"
                },
                {
                    name: "🎨 Embed Customization",
                    value:
                        "`!dmembed` — Preview configured DM embed\n" +
                        "`!setdmembed Title | Description` — Update DM embed\n" +
                        "`!embed` — Preview welcome custom embed\n" +
                        "`!setembed Title | Description` — Update welcome custom embed"
                },
                {
                    name: "📊 Logs & Queue",
                    value:
                        "`!queue` — View log of processed servers\n" +
                        "`!clearqueue` — Clear processing history log"
                }
            )
            .setColor(3066993)
            .setFooter({ text: "AUTO DM BOT" })
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
            .setTitle("🤖 Bot Status & System Info")
            .addFields(
                { name: "🟢 Status", value: "Online", inline: true },
                { name: "🌐 Active Servers", value: `${client.guilds.cache.size}`, inline: true },
                { name: "📡 Latency", value: `${client.ws.ping}ms`, inline: true },
                { name: "⚡ Auto-Process", value: db.settings.autoProcess ? "✅ Enabled" : "❌ Disabled", inline: true },
                { name: "⏱️ DM Delay", value: `${db.settings.rateLimitDelay || 1500}ms`, inline: true },
                { name: "🔒 Protected Servers", value: `${db.protectedServers.length}`, inline: true },
                { name: "📥 Queue Size", value: `${processingQueue.length}`, inline: true },
                { name: "⚙️ Currently Processing", value: isQueueProcessing ? "Yes" : "No", inline: true }
            )
            .setColor(5763719)
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // =================================================
    // ADMIN PERMISSION CHECK FOR ADMIN COMMANDS
    // =================================================

    const adminCommands = [
        "!save", "!protect", "!unprotect", "!protected",
        "!startdm", "!process", "!autoprocess", "!setdelay",
        "!setembed", "!setdmembed", "!clearqueue"
    ];

    if (adminCommands.includes(command) && !isAdmin(message)) {
        return message.reply("❌ Administrator permissions are required to execute this command.");
    }

    // =================================================
    // !save / !protect
    // =================================================

    if (command === "!save" || command === "!protect") {
        const db = loadDB();
        const targetId = args[0] || message.guild.id;

        if (!db.protectedServers.includes(targetId)) {
            db.protectedServers.push(targetId);
            saveDB(db);
            return message.reply(`🔒 Server ID \`${targetId}\` is now permanently protected from auto DM and auto leave.`);
        }

        return message.reply(`ℹ️ Server ID \`${targetId}\` is already protected.`);
    }

    // =================================================
    // !unprotect
    // =================================================

    if (command === "!unprotect") {
        const targetId = args[0] || message.guild.id;
        const db = loadDB();

        if (db.protectedServers.includes(targetId)) {
            db.protectedServers = db.protectedServers.filter((id) => id !== targetId);
            saveDB(db);
            return message.reply(`🔓 Server ID \`${targetId}\` has been removed from protected servers.`);
        }

        return message.reply(`ℹ️ Server ID \`${targetId}\` is not in the protected servers list.`);
    }

    // =================================================
    // !protected
    // =================================================

    if (command === "!protected") {
        const db = loadDB();
        if (db.protectedServers.length === 0) {
            return message.reply("🔒 No protected servers registered.");
        }

        let list = "🔒 **PROTECTED SERVERS LIST**\n\n";
        db.protectedServers.forEach((id, index) => {
            const guildObj = client.guilds.cache.get(id);
            const name = guildObj ? guildObj.name : "Unknown Server / Bot Not In Server";
            list += `**${index + 1}. ${name}** (ID: \`${id}\`)\n`;
        });

        return message.channel.send(list);
    }

    // =================================================
    // !startdm / !process
    // =================================================

    if (command === "!startdm" || command === "!process") {
        await message.reply(`🚀 Triggering DM process for **${message.guild.name}**...`);
        enqueueGuild(message.guild);
        return;
    }

    // =================================================
    // !autoprocess
    // =================================================

    if (command === "!autoprocess") {
        const state = args[0]?.toLowerCase();
        const db = loadDB();

        if (state === "on" || state === "true" || state === "enable") {
            db.settings.autoProcess = true;
            saveDB(db);
            return message.reply("⚡ Automatic DM processing on server join is now **ENABLED**.");
        } else if (state === "off" || state === "false" || state === "disable") {
            db.settings.autoProcess = false;
            saveDB(db);
            return message.reply("⏸️ Automatic DM processing on server join is now **DISABLED**.");
        } else {
            return message.reply(`ℹ️ Current Auto-Process state: **${db.settings.autoProcess ? "ENABLED" : "DISABLED"}**.\nUse \`!autoprocess on\` or \`!autoprocess off\` to toggle.`);
        }
    }

    // =================================================
    // !setdelay
    // =================================================

    if (command === "!setdelay") {
        const val = parseInt(args[0], 10);
        if (isNaN(val) || val < 500) {
            return message.reply("⚠️ Please specify a valid delay in milliseconds (minimum 500ms). Example: `!setdelay 1500`");
        }

        const db = loadDB();
        db.settings.rateLimitDelay = val;
        saveDB(db);

        return message.reply(`✅ DM rate limit delay set to **${val}ms** per message.`);
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
    // !dmembed
    // =================================================

    if (command === "!dmembed") {
        const db = loadDB();
        const cfg = db.dmEmbed;

        const embed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description)
            .setColor(cfg.color);

        if (cfg.footer) {
            embed.setFooter({ text: cfg.footer });
        }

        return message.channel.send({
            content: "📩 **Preview of Configured DM Embed:**",
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
            return message.reply("⚠️ Usage: `!setembed Title | Description`");
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
            return message.reply("⚠️ Usage: `!setdmembed Title | Description`");
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

        let output = "📊 **SERVER PROCESSING LOG**\n\n";
        let position = 1;

        for (const [serverId, data] of entries) {
            output +=
                `**${position}. ${data.serverName}**\n` +
                `🆔 ID: \`${serverId}\`\n` +
                `📌 Status: **${data.status}**\n` +
                `⏰ Time: ${data.completedAt || data.startedAt || data.processedAt || data.joinedTime || "N/A"}\n\n`;
            position++;
        }

        return message.channel.send(output);
    }

    // =================================================
    // !clearqueue
    // =================================================

    if (command === "!clearqueue") {
        const db = loadDB();
        db.serverLog = {};
        saveDB(db);

        return message.reply("🗑️ Server log history has been cleared.");
    }
});

// =====================================================
// ERROR HANDLING
// =====================================================

client.on(Events.Error, (error) => {
    console.error("❌ Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
    console.error("❌ Unhandled promise rejection:", error);
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
