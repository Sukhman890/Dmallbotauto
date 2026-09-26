require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
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
    console.error("Please add 'DISCORD_TOKEN' or 'BOT_TOKEN' in your Environment Variables.");
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
        rateLimitDelay: parseInt(process.env.RATE_LIMIT_DELAY || "1500", 10),
        requireOptIn: process.env.REQUIRE_OPT_IN === "true",
        allowRepeatDms: process.env.ALLOW_REPEAT_DMS !== "false"
    },
    protectedServers: process.env.PROTECTED_SERVERS
        ? process.env.PROTECTED_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    customEmbed: {
        title: process.env.CUSTOM_EMBED_TITLE || "📢 Custom Bot Embed",
        description: process.env.CUSTOM_EMBED_DESCRIPTION || "Your custom embed description.",
        color: parseInt(process.env.CUSTOM_EMBED_COLOR || "3066993", 10),
        footer: process.env.CUSTOM_EMBED_FOOTER || "GANGU APP",
        thumbnail: null,
        image: null,
        author: null,
        authorIcon: null,
        footerIcon: null,
        timestamp: false,
        fields: []
    },
    dmEmbed: {
        title: process.env.DM_TITLE || "🎁 Reward Drop",
        description: process.env.DM_DESCRIPTION || "Your automatic DM broadcast message.",
        color: parseInt(process.env.DM_COLOR || "16766720", 10),
        footer: process.env.DM_FOOTER || "GANGU APP",
        thumbnail: null,
        image: null,
        author: null,
        authorIcon: null,
        footerIcon: null,
        timestamp: false,
        fields: []
    },
    buttons: [],
    optedInUsers: [],
    sentUsers: [],
    lastSentMessageIds: {},
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
            buttons: Array.isArray(parsed.buttons) ? parsed.buttons : DEFAULT_DB.buttons,
            optedInUsers: Array.isArray(parsed.optedInUsers) ? parsed.optedInUsers : DEFAULT_DB.optedInUsers,
            sentUsers: Array.isArray(parsed.sentUsers) ? parsed.sentUsers : DEFAULT_DB.sentUsers,
            protectedServers: Array.isArray(parsed.protectedServers)
                ? parsed.protectedServers
                : DEFAULT_DB.protectedServers,
            lastSentMessageIds: parsed.lastSentMessageIds || {}
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
    if (!serverId) return false;
    const targetId = String(serverId).trim();
    if (Array.isArray(db.protectedServers)) {
        if (db.protectedServers.some((id) => String(id).trim() === targetId)) return true;
    }
    if (process.env.PROTECTED_SERVERS) {
        const envProtected = process.env.PROTECTED_SERVERS.split(",").map((s) => String(s).trim());
        if (envProtected.includes(targetId)) return true;
    }
    return false;
}

function buildEmbed(cfg) {
    const embed = new EmbedBuilder();
    if (!cfg || typeof cfg !== "object") return embed;

    // -----------------------------
    // TITLE (Discord max: 256)
    // -----------------------------
    if (cfg.title) {
        const title = String(cfg.title).slice(0, 256);
        if (title.length > 0) embed.setTitle(title);
    }

    // -----------------------------
    // DESCRIPTION (Discord max: 4096)
    // -----------------------------
    if (cfg.description) {
        const description = String(cfg.description).slice(0, 4096);
        if (description.length > 0) embed.setDescription(description);
    }

    // -----------------------------
    // COLOR
    // Supports:
    // #5865F2
    // 5865F2
    // decimal numbers
    // -----------------------------
    if (cfg.color !== undefined && cfg.color !== null && cfg.color !== "") {
        let color = null;

        try {
            if (typeof cfg.color === "number") {
                if (
                    Number.isInteger(cfg.color) &&
                    cfg.color >= 0 &&
                    cfg.color <= 0xFFFFFF
                ) {
                    color = cfg.color;
                }
            } else if (typeof cfg.color === "string") {
                const rawColor = cfg.color.trim();

                if (/^#[0-9a-fA-F]{6}$/.test(rawColor)) {
                    color = parseInt(rawColor.slice(1), 16);
                } else if (/^[0-9a-fA-F]{6}$/.test(rawColor)) {
                    color = parseInt(rawColor, 16);
                } else if (/^\d+$/.test(rawColor)) {
                    const decimalColor = Number(rawColor);

                    if (
                        Number.isInteger(decimalColor) &&
                        decimalColor >= 0 &&
                        decimalColor <= 0xFFFFFF
                    ) {
                        color = decimalColor;
                    }
                }
            }

            if (color !== null) {
                embed.setColor(color);
            }
        } catch (_) {
            // Invalid color is safely ignored.
        }
    }

    // -----------------------------
    // THUMBNAIL
    // -----------------------------
    if (cfg.thumbnail) {
        try {
            const url = new URL(String(cfg.thumbnail));

            if (url.protocol === "http:" || url.protocol === "https:") {
                embed.setThumbnail(url.toString());
            }
        } catch (_) {
            // Invalid thumbnail URL ignored.
        }
    }

    // -----------------------------
    // IMAGE
    // -----------------------------
    if (cfg.image) {
        try {
            const url = new URL(String(cfg.image));

            if (url.protocol === "http:" || url.protocol === "https:") {
                embed.setImage(url.toString());
            }
        } catch (_) {
            // Invalid image URL ignored.
        }
    }

    // -----------------------------
    // FOOTER
    // Discord max text: 2048
    // -----------------------------
    if (cfg.footer) {
        const footerText = String(cfg.footer).slice(0, 2048);

        if (footerText.length > 0) {
            const footerObj = {
                text: footerText
            };

            if (cfg.footerIcon) {
                try {
                    const url = new URL(String(cfg.footerIcon));

                    if (url.protocol === "http:" || url.protocol === "https:") {
                        footerObj.iconURL = url.toString();
                    }
                } catch (_) {
                    // Invalid footer icon ignored.
                }
            }

            try {
                embed.setFooter(footerObj);
            } catch (_) {}
        }
    }

    // -----------------------------
    // AUTHOR
    // Discord max name: 256
    // -----------------------------
    if (cfg.author) {
        const authorName = String(cfg.author).slice(0, 256);

        if (authorName.length > 0) {
            const authorObj = {
                name: authorName
            };

            if (cfg.authorIcon) {
                try {
                    const url = new URL(String(cfg.authorIcon));

                    if (url.protocol === "http:" || url.protocol === "https:") {
                        authorObj.iconURL = url.toString();
                    }
                } catch (_) {
                    // Invalid author icon ignored.
                }
            }

            try {
                embed.setAuthor(authorObj);
            } catch (_) {}
        }
    }

    // -----------------------------
    // TIMESTAMP
    // -----------------------------
    if (cfg.timestamp) {
        try {
            embed.setTimestamp();
        } catch (_) {}
    }

    // -----------------------------
    // FIELDS
    // Discord:
    // Maximum 25 fields
    // Name max 256
    // Value max 1024
    // -----------------------------
    if (Array.isArray(cfg.fields) && cfg.fields.length > 0) {
        const validFields = [];

        for (const f of cfg.fields) {
            if (!f || f.name === undefined || f.value === undefined) {
                continue;
            }

            const name = String(f.name).slice(0, 256);
            const value = String(f.value).slice(0, 1024);

            if (!name || !value) continue;

            validFields.push({
                name,
                value,
                inline: !!f.inline
            });

            if (validFields.length >= 25) {
                break;
            }
        }

        if (validFields.length > 0) {
            try {
                embed.addFields(validFields);
            } catch (_) {}
        }
    }

    return embed;
}

function buildButtonRows(buttons) {
    if (!Array.isArray(buttons) || buttons.length === 0) {
        return [];
    }

    const rows = [];
    let currentRow = new ActionRowBuilder();

    for (const btnConfig of buttons) {
        if (!btnConfig || !btnConfig.url || !btnConfig.label) {
            continue;
        }

        // Discord button label limit
        const label = String(btnConfig.label).slice(0, 80);

        if (!label) {
            continue;
        }

        // Validate URL
        let parsedUrl;

        try {
            parsedUrl = new URL(String(btnConfig.url));

            if (
                parsedUrl.protocol !== "http:" &&
                parsedUrl.protocol !== "https:"
            ) {
                continue;
            }
        } catch (_) {
            continue;
        }

        try {
            // Maximum 5 buttons per action row
            if (currentRow.components.length >= 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }

            const btn = new ButtonBuilder()
                .setLabel(label)
                .setStyle(ButtonStyle.Link)
                .setURL(parsedUrl.toString());

            // Preserve existing emoji behavior
            if (btnConfig.emoji) {
                try {
                    btn.setEmoji(String(btnConfig.emoji));
                } catch (_) {}
            }

            currentRow.addComponents(btn);

        } catch (_) {
            // Invalid button is skipped without crashing embed rendering.
        }
    }

    if (currentRow.components.length > 0) {
        rows.push(currentRow);
    }

    return rows;
}

async function sendOrReplaceEmbedMessage(channel, payload, db) {
    const channelId = channel.id;
    if (db.lastSentMessageIds && db.lastSentMessageIds[channelId]) {
        try {
            const oldMsg = await channel.messages.fetch(db.lastSentMessageIds[channelId]);
            if (oldMsg) {
                await oldMsg.delete();
            }
        } catch (_) {}
    }
    const sentMsg = await channel.send(payload);
    db.lastSentMessageIds = db.lastSentMessageIds || {};
    db.lastSentMessageIds[channelId] = sentMsg.id;
    saveDB(db);
    return sentMsg;
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
        let members;
        try {
            members = await guild.members.fetch();
        } catch (fetchErr) {
            console.error(`⚠️ Member fetch error for "${guild.name}":`, fetchErr.message);
            console.error(`⚠️ Ensure "Server Members Intent" is enabled in Discord Developer Portal!`);
            members = guild.members.cache;
        }

        console.log(`📊 Raw fetched members count: ${members.size}`);

        if (members.size === 0) {
            console.warn(`⚠️ WARNING: 0 members fetched for server "${guild.name}".`);
            console.warn(`👉 Check if "Server Members Intent" is toggled ON in Discord Developer Portal -> Bot Settings.`);
        }

        const eligibleMembers = members.filter((m) => {
            if (m.user.bot || m.id === client.user.id) return false;
            // Check repeat DM setting
            if (!db.settings.allowRepeatDms && db.sentUsers && db.sentUsers.includes(m.id)) return false;
            if (db.settings.requireOptIn && (!db.optedInUsers || !db.optedInUsers.includes(m.id))) return false;
            return true;
        });

        totalCount = eligibleMembers.size;

        console.log(`📋 Found ${totalCount} eligible members in "${guild.name}". (Skipped previously sent: ${members.size - eligibleMembers.size})`);

        const delayMs = db.settings.rateLimitDelay || 1500;
        const dmEmbed = buildEmbed(db.dmEmbed);
        const buttonRows = buildButtonRows(db.buttons);

        const sendPayload = { embeds: [dmEmbed] };
        if (buttonRows.length > 0) {
            sendPayload.components = buttonRows;
        }

        let current = 0;

        for (const [id, member] of eligibleMembers) {
            current++;
            try {
                await member.send(sendPayload);
                successCount++;
                if (!db.sentUsers.includes(member.id)) {
                    db.sentUsers.push(member.id);
                }
                console.log(`  📩 [DM ${current}/${totalCount}] ✅ Sent to @${member.user.tag}`);
            } catch (err) {
                failCount++;
                console.log(`  📩 [DM ${current}/${totalCount}] ❌ Failed for @${member.user.tag} (${err.message || "DMs Closed"})`);
            }

            if (current < totalCount) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        saveDB(db);

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
    if (db.settings.allowRepeatDms) {
        console.log("🔄 Repeat DMs are ENABLED (Previously sent users will receive messages again).");
    } else {
        console.log("🛡️ Repeat DMs are DISABLED (Users will only receive 1 DM ever across servers).");
    }
});

// =====================================================
// GUILD JOIN EVENT (AUTO DM TRIGGER)
// =====================================================

client.on(Events.GuildCreate, async (guild) => {
    console.log(`\n➕ Bot joined server: ${guild.name} (${guild.id})`);
    const db = loadDB();
    if (db.settings.autoProcess) {
        enqueueGuild(guild);
    } else {
        console.log(`⏸️ Auto-process is turned off. Use !startdm in the server to trigger manually.`);
    }
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

    // !help
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
                        "`!help` — Display this command menu\n" +
                        "`!optin` / `!optout` — Manage your DM opt-in status"
                },
                {
                    name: "⚡ Auto DM & Execution",
                    value:
                        "`!startdm` or `!process` — Trigger DM process & auto-leave for current server\n" +
                        "`!autoprocess [on/off]` — Enable/disable automatic process on server join\n" +
                        "`!allowrepeat [on/off]` — Enable/disable sending repeat DMs to same users\n" +
                        "`!clearsent` — Reset sent user memory list\n" +
                        "`!setdelay <ms>` — Set delay between DMs in ms (default: 1500)\n" +
                        "`!reqoptin [on/off]` — Toggle strict recipient opt-in enforcement"
                },
                {
                    name: "🔒 Protected Server Safety",
                    value:
                        "`!protect` or `!save` — Mark current server as protected (skips DM & leave)\n" +
                        "`!protect <serverId>` — Protect specific server ID\n" +
                        "`!unprotect <serverId>` — Unprotect server ID\n" +
                        "`!protected` — View protected servers list"
                },
                {
                    name: "🎨 Embed Customization",
                    value:
                        "`!dmembed` — Preview configured active DM embed & buttons\n" +
                        "`!setdmembed Title | Description | [Color] | [Thumbnail] | [Image] | [Footer]` — Update DM embed\n" +
                        "`!embed` — Preview active custom embed\n" +
                        "`!setembed Title | Description | [Color] | [Thumbnail] | [Image] | [Footer]` — Update custom embed"
                },
                {
                    name: "🎛️ Button Support",
                    value:
                        "`!addbutton Label | URL | [Emoji]` — Add link button to DM embed\n" +
                        "`!buttons` — List active buttons\n" +
                        "`!clearbuttons` — Clear all configured buttons"
                },
                {
                    name: "📊 Logs & Recipients",
                    value:
                        "`!queue` — View log of processed servers\n" +
                        "`!clearqueue` — Clear processing history log\n" +
                        "`!addrecipient <userId>` — Add approved DM recipient ID\n" +
                        "`!removerecipient <userId>` — Remove recipient ID"
                }
            )
            .setColor(3066993)
            .setFooter({ text: "AUTO DM BOT" })
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // !ping
    if (command === "!ping") {
        return message.reply(`🏓 Pong! **${client.ws.ping}ms**`);
    }

    // !status
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
                { name: "🔄 Allow Repeat DMs", value: db.settings.allowRepeatDms ? "✅ Enabled" : "❌ Disabled", inline: true },
                { name: "👥 Sent History Count", value: `${db.sentUsers.length} users`, inline: true },
                { name: "🔒 Protected Servers", value: `${db.protectedServers.length}`, inline: true },
                { name: "📥 Queue Size", value: `${processingQueue.length}`, inline: true },
                { name: "⚙️ Currently Processing", value: isQueueProcessing ? "Yes" : "No", inline: true }
            )
            .setColor(5763719)
            .setTimestamp();

        return message.channel.send({ embeds: [embed] });
    }

    // Admin commands check
    const adminCommands = [
        "!save", "!protect", "!unprotect", "!protected",
        "!startdm", "!process", "!autoprocess", "!setdelay",
        "!setembed", "!setdmembed", "!clearqueue",
        "!setbutton", "!addbutton", "!clearbuttons", "!buttons",
        "!addrecipient", "!removerecipient", "!reqoptin",
        "!allowrepeat", "!clearsent"
    ];

    if (adminCommands.includes(command) && !isAdmin(message)) {
        return message.reply("❌ Administrator permissions are required to execute this command.");
    }

    // !save / !protect
    if (command === "!save" || command === "!protect") {
        const db = loadDB();
        const targetId = String(args[0] || message.guild.id).trim();

        if (!db.protectedServers.some((id) => String(id).trim() === targetId)) {
            db.protectedServers.push(targetId);
            saveDB(db);
            return message.reply(
                `🔒 Server Protection Enabled\nServer ID \`${targetId}\` will be excluded from the automated DM workflow.`
            );
        }

        return message.reply(`ℹ️ Server ID \`${targetId}\` is already protected.`);
    }

    // !unprotect
    if (command === "!unprotect") {
        const targetId = String(args[0] || message.guild.id).trim();
        const db = loadDB();

        if (db.protectedServers.some((id) => String(id).trim() === targetId)) {
            db.protectedServers = db.protectedServers.filter((id) => String(id).trim() !== targetId);
            saveDB(db);
            return message.reply(`🔓 Server ID \`${targetId}\` has been removed from protected servers.`);
        }

        return message.reply(`ℹ️ Server ID \`${targetId}\` is not in the protected servers list.`);
    }

    // !protected
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

    // !startdm / !process
    if (command === "!startdm" || command === "!process") {
        const db = loadDB();
        if (isProtectedServer(message.guild.id, db)) {
            return message.reply(`🛡️ **${message.guild.name}** is a protected server. DM process skipped.`);
        }
        await message.reply(`🚀 Triggering DM process for **${message.guild.name}**...`);
        enqueueGuild(message.guild);
        return;
    }

    // !autoprocess
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

    // !allowrepeat
    if (command === "!allowrepeat") {
        const state = args[0]?.toLowerCase();
        const db = loadDB();

        if (state === "on" || state === "true" || state === "enable") {
            db.settings.allowRepeatDms = true;
            saveDB(db);
            return message.reply("🔄 Repeat DMs are now **ENABLED**. Previously messaged users will receive DMs again on server join.");
        } else if (state === "off" || state === "false" || state === "disable") {
            db.settings.allowRepeatDms = false;
            saveDB(db);
            return message.reply("🛡️ Repeat DMs are now **DISABLED**. Users will only receive 1 DM across all servers.");
        } else {
            return message.reply(`ℹ️ Current Repeat DM state: **${db.settings.allowRepeatDms ? "ENABLED" : "DISABLED"}**.\nUse \`!allowrepeat on\` or \`!allowrepeat off\` to toggle.`);
        }
    }

    // !clearsent
    if (command === "!clearsent") {
        const db = loadDB();
        const count = db.sentUsers ? db.sentUsers.length : 0;
        db.sentUsers = [];
        saveDB(db);
        return message.reply(`🗑️ Cleared **${count}** users from the sent memory history.`);
    }

    // !setdelay
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

    // !setbutton / !addbutton
    if (command === "!setbutton" || command === "!addbutton") {
        const text = args.join(" ");
        const parts = text.split("|").map((p) => p.trim());

        if (parts.length < 2) {
            return message.reply("⚠️ Usage: `!addbutton Label | URL | [Emoji]`\nExample: `!addbutton Claim Reward | https://example.com | 🎁`");
        }

        const label = parts[0];
        const url = parts[1];
        const emoji = parts[2] || null;

        try {
            const parsed = new URL(url);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return message.reply("❌ Invalid URL protocol. URL must start with http:// or https://");
            }
        } catch (e) {
            return message.reply("❌ Invalid URL provided. Please provide a valid HTTP/HTTPS URL.");
        }

        const db = loadDB();
        if (!Array.isArray(db.buttons)) db.buttons = [];

        db.buttons.push({ label, url, emoji });
        saveDB(db);

        return message.reply(`✅ Added button **${label}** pointing to \`${url}\`${emoji ? ` with emoji ${emoji}` : ""}.`);
    }

    // !clearbuttons
    if (command === "!clearbuttons") {
        const db = loadDB();
        db.buttons = [];
        saveDB(db);
        return message.reply("🗑️ All configured buttons have been cleared.");
    }

    // !buttons
    if (command === "!buttons") {
        const db = loadDB();
        if (!db.buttons || db.buttons.length === 0) {
            return message.reply("ℹ️ No active buttons configured.");
        }

        let list = "🎛️ **CONFIGURED DM BUTTONS**\n\n";
        db.buttons.forEach((btn, index) => {
            list += `**${index + 1}. ${btn.emoji ? `${btn.emoji} ` : ""}${btn.label}** -> \`${btn.url}\`\n`;
        });

        return message.channel.send(list);
    }

    // !embed
    if (command === "!embed") {
        const db = loadDB();
        const cfg = db.customEmbed;
        const embed = buildEmbed(cfg);
        return message.channel.send({ embeds: [embed] });
    }

    // !dmembed
    if (command === "!dmembed") {
        const db = loadDB();
        const cfg = db.dmEmbed;
        const embed = buildEmbed(cfg);
        const buttonRows = buildButtonRows(db.buttons);

        const payload = {
            content: "📩 **Preview of Configured DM Embed & Buttons:**",
            embeds: [embed]
        };

        if (buttonRows.length > 0) {
            payload.components = buttonRows;
        }

        await sendOrReplaceEmbedMessage(message.channel, payload, db);
        return;
    }

    // !setembed
    if (command === "!setembed") {
        const text = message.content.slice(command.length).trim();
const separatorIndex = text.indexOf("|");

const parts = separatorIndex === -1
    ? [text]
    : [
        text.slice(0, separatorIndex).trim(),
        text.slice(separatorIndex + 1).trim()
    ];

    if (/^#[0-9a-fA-F]{6}$/.test(colorInput)) {
        db.customEmbed.color = parseInt(colorInput.slice(1), 16);
    } else if (/^[0-9a-fA-F]{6}$/.test(colorInput)) {
        db.customEmbed.color = parseInt(colorInput, 16);
    } else if (/^\d+$/.test(colorInput)) {
        const decimalColor = Number(colorInput);

        if (
            Number.isInteger(decimalColor) &&
            decimalColor >= 0 &&
            decimalColor <= 0xFFFFFF
        ) {
            db.customEmbed.color = decimalColor;
        }
    }
        }
        if (parts[3]) db.customEmbed.thumbnail = parts[3];
        if (parts[4]) db.customEmbed.image = parts[4];
        if (parts[5]) db.customEmbed.footer = parts[5];

        saveDB(db);

        const embed = buildEmbed(db.customEmbed);
        await sendOrReplaceEmbedMessage(message.channel, { content: "✅ Custom embed updated successfully.", embeds: [embed] }, db);
        return;
    }

    // !setdmembed
    if (command === "!setdmembed") {
        const text = args.join(" ");
        const parts = text.split("|").map((p) => p.trim());

        if (parts.length < 2) {
            return message.reply("⚠️ Usage: `!setdmembed Title | Description | [Color] | [Thumbnail] | [Image] | [Footer]`");
        }

        const db = loadDB();
        db.dmEmbed.title = parts[0];
        db.dmEmbed.description = parts[1];
        if (parts[2]) {
    const colorInput = parts[2].trim();

    if (/^#[0-9a-fA-F]{6}$/.test(colorInput)) {
        db.dmEmbed.color = parseInt(colorInput.slice(1), 16);
    } else if (/^[0-9a-fA-F]{6}$/.test(colorInput)) {
        db.dmEmbed.color = parseInt(colorInput, 16);
    } else if (/^\d+$/.test(colorInput)) {
        const decimalColor = Number(colorInput);

        if (
            Number.isInteger(decimalColor) &&
            decimalColor >= 0 &&
            decimalColor <= 0xFFFFFF
        ) {
            db.dmEmbed.color = decimalColor;
        }
    }
        }
        if (parts[3]) db.dmEmbed.thumbnail = parts[3];
        if (parts[4]) db.dmEmbed.image = parts[4];
        if (parts[5]) db.dmEmbed.footer = parts[5];

        saveDB(db);

        const embed = buildEmbed(db.dmEmbed);
        const buttonRows = buildButtonRows(db.buttons);
        const payload = { content: "✅ DM embed updated successfully.", embeds: [embed] };
        if (buttonRows.length > 0) payload.components = buttonRows;

        await sendOrReplaceEmbedMessage(message.channel, payload, db);
        return;
    }

    // !addrecipient
    if (command === "!addrecipient") {
        const targetId = args[0];
        if (!targetId) return message.reply("⚠️ Usage: `!addrecipient <userId>`");
        const db = loadDB();
        if (!db.optedInUsers.includes(targetId)) {
            db.optedInUsers.push(targetId);
            saveDB(db);
        }
        return message.reply(`✅ User ID \`${targetId}\` added to approved recipients list.`);
    }

    // !removerecipient
    if (command === "!removerecipient") {
        const targetId = args[0];
        if (!targetId) return message.reply("⚠️ Usage: `!removerecipient <userId>`");
        const db = loadDB();
        db.optedInUsers = db.optedInUsers.filter((id) => id !== targetId);
        saveDB(db);
        return message.reply(`🔓 User ID \`${targetId}\` removed from approved recipients list.`);
    }

    // !queue & !clearqueue
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
