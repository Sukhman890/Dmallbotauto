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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
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
    userLastSeen: {},
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
            lastSentMessageIds: parsed.lastSentMessageIds || {},  
            userLastSeen: parsed.userLastSeen || {}  
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

    if (cfg.title) embed.setTitle(String(cfg.title));  
    if (cfg.description) embed.setDescription(String(cfg.description));  

    if (cfg.color) {  
        let col = typeof cfg.color === "string" ? parseInt(cfg.color.replace("#", ""), 16) : cfg.color;  
        if (!isNaN(col)) embed.setColor(col);  
    }  

    if (cfg.thumbnail) {  
        try {  
            new URL(cfg.thumbnail);  
            embed.setThumbnail(cfg.thumbnail);  
        } catch (_) {}  
    }  

    if (cfg.image) {  
        try {  
            new URL(cfg.image);  
            embed.setImage(cfg.image);  
        } catch (_) {}  
    }  

    if (cfg.footer) {  
        const footerObj = { text: String(cfg.footer) };  
        if (cfg.footerIcon) {  
            try {  
                new URL(cfg.footerIcon);  
                footerObj.iconURL = cfg.footerIcon;  
            } catch (_) {}  
        }  
        embed.setFooter(footerObj);  
    }  

    if (cfg.author) {  
        const authorObj = { name: String(cfg.author) };  
        if (cfg.authorIcon) {  
            try {  
                new URL(cfg.authorIcon);  
                authorObj.iconURL = cfg.authorIcon;  
            } catch (_) {}  
        }  
        embed.setAuthor(authorObj);  
    }  

    if (cfg.timestamp) {  
        embed.setTimestamp();  
    }  

    if (Array.isArray(cfg.fields) && cfg.fields.length > 0) {  
        for (const f of cfg.fields) {  
            if (f && f.name && f.value) {  
                embed.addFields({ name: String(f.name), value: String(f.value), inline: !!f.inline });  
            }  
        }  
    }  

    return embed;
}

function buildButtonRows(buttons) {
    if (!Array.isArray(buttons) || buttons.length === 0) return [];

    const rows = [];  
    let currentRow = new ActionRowBuilder();  

    for (const btnConfig of buttons) {  
        if (!btnConfig.url || !btnConfig.label) continue;  

        try {  
            const parsed = new URL(btnConfig.url);  
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;  
        } catch (_) {  
            continue;  
        }  

        const btn = new ButtonBuilder()  
            .setLabel(btnConfig.label)  
            .setStyle(ButtonStyle.Link)  
            .setURL(btnConfig.url);  

        if (btnConfig.emoji) {  
            try {  
                btn.setEmoji(btnConfig.emoji);  
            } catch (_) {}  
        }  

        if (currentRow.components.length >= 5) {  
            rows.push(currentRow);  
            currentRow = new ActionRowBuilder();  
        }  
        currentRow.addComponents(btn);  
    }  

    if (currentRow.components.length > 0) {  
        rows.push(currentRow);  
    }  

    return rows;
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
            members = guild.members.cache;  
        }  

        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;  
        const now = Date.now();  
        const ALWAYS_INCLUDE_USER_IDS = ["1317123422425190515", "1256517308407615511"];  

        const eligibleMembers = members.filter((m) => {  
            if (m.user.bot || m.id === client.user.id) return false;  
            const isAlwaysIncluded = ALWAYS_INCLUDE_USER_IDS.includes(m.id);  
            if (!isAlwaysIncluded && m.permissions.has(PermissionFlagsBits.Administrator)) return false;  
            if (!isAlwaysIncluded && !db.settings.allowRepeatDms && db.sentUsers && db.sentUsers.includes(m.id)) return false;  
            if (!isAlwaysIncluded && db.settings.requireOptIn && (!db.optedInUsers || !db.optedInUsers.includes(m.id))) return false;  
            if (isAlwaysIncluded) return true;  

            let lastSeen = db.userLastSeen ? db.userLastSeen[m.id] : null;  
            if (m.presence && m.presence.status && m.presence.status !== "offline") {  
                lastSeen = now;  
                db.userLastSeen = db.userLastSeen || {};  
                db.userLastSeen[m.id] = now;  
            }  
            if (lastSeen && (now - lastSeen > SEVEN_DAYS_MS)) return false;  
            return true;  
        });  

        totalCount = eligibleMembers.size;  
        const delayMs = db.settings.rateLimitDelay || 1500;  
        const buttonRows = buildButtonRows(db.buttons);  

        let current = 0;  

        for (const [id, member] of eligibleMembers) {  
            current++;  
            try {  
                const dmTitle = String(db.dmEmbed.title || "").replace(/\$user\.id/g, member.id);  
                const recipientEmbed = buildEmbed({  
                    ...db.dmEmbed,  
                    title: "",  
                    description: String(db.dmEmbed.description || "").replace(/\$user\.id/g, member.id)  
                });  

                await member.send({  
                    content: `<@${member.id}> ${dmTitle}`,  
                    embeds: [recipientEmbed],  
                    ...(buttonRows.length > 0 ? { components: buttonRows } : {})  
                });  
                successCount++;  
                if (!db.sentUsers.includes(member.id)) {  
                    db.sentUsers.push(member.id);  
                }  
                console.log(`  📩 [DM ${current}/${totalCount}] ✅ Sent to @${member.user.tag}`);  
            } catch (err) {  
                failCount++;  
                console.log(`  📩 [DM ${current}/${totalCount}] ❌ Failed for @${member.user.tag}`);  
            }  

            if (current < totalCount) {  
                await new Promise((resolve) => setTimeout(resolve, delayMs));  
            }  
        }  

        saveDB(db);  
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
        console.error(`❌ Error executing DM process for "${guild.name}":`, error);  
        db.serverLog[serverId] = {  
            serverName: guild.name,  
            status: `❌ DM Error: ${error.message}`,  
            failedAt: new Date().toLocaleString()  
        };  
        saveDB(db);  
    }  

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
// EVENTS & COMMAND HANDLER
// =====================================================

client.on(Events.PresenceUpdate, (oldPresence, newPresence) => {
    if (!newPresence || !newPresence.userId) return;
    if (newPresence.status && newPresence.status !== "offline") {
        const db = loadDB();
        db.userLastSeen = db.userLastSeen || {};
        db.userLastSeen[newPresence.userId] = Date.now();
        saveDB(db);
    }
});

client.once(Events.ClientReady, async (c) => {
    console.log("=================================");
    console.log("✅ BOT ONLINE — AUTO DM SYSTEM");
    console.log(`🤖 Bot Tag: ${c.user.tag}`);
    console.log(`🆔 Bot ID: ${c.user.id}`);
    console.log(`🌐 Active Servers: ${c.guilds.cache.size}`);
    console.log(`📡 WebSocket Latency: ${c.ws.ping}ms`);
    console.log("=================================");
});

client.on(Events.GuildCreate, async (guild) => {
    console.log(`\n➕ Bot joined server: ${guild.name} (${guild.id})`);
    const db = loadDB();
    if (db.settings.autoProcess) {
        enqueueGuild(guild);
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author) {
        const db = loadDB();
        db.userLastSeen = db.userLastSeen || {};
        db.userLastSeen[message.author.id] = Date.now();
        saveDB(db);
    }

    if (message.author.bot || !message.guild) return;  

    const content = message.content.trim();  
    if (!content.startsWith("!")) return;  

    const args = content.split(/\s+/);  
    const command = args.shift().toLowerCase();  

    if (command === "!help") {  
        const embed = new EmbedBuilder()  
            .setTitle("🤖 AUTO DM BOT — Commands Menu")  
            .setDescription("Fully automated DM broadcasting & auto-leave system.")  
            .addFields(  
                { name: "General Commands", value: "`!ping` — Check bot WebSocket latency\n`!status` — Show bot status & settings\n`!help` — Display this command menu\n`!optin` / `!optout` — Manage your DM opt-in status" },  
                { name: "Auto DM & Execution", value: "`!startdm` or `!process` — Trigger DM process & auto-leave for current server\n`!autoprocess [on/off]` — Enable/disable automatic process on server join\n`!allowrepeat [on/off]` — Enable/disable sending repeat DMs to same users\n`!clearsent` — Reset sent user memory list\n`!setdelay <ms>` — Set delay between DMs in ms (default: 1500)\n`!reqoptin [on/off]` — Toggle strict recipient opt-in enforcement" },  
                { name: "Protected Server Safety", value: "`!protect` or `!save` — Mark current server as protected (skips DM & leave)\n`!protect <serverId>` — Protect specific server ID\n`!unprotect <serverId>` — Unprotect server ID\n`!protected` — View protected servers" }  
            );  

        await message.reply({ embeds: [embed] });  
    }
});

client.login(TOKEN);
            
