require("dotenv").config();
const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN;
if (!TOKEN) {
    console.error("❌ BOT TOKEN MISSING!");
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences
    ]
});

const DB_FILE = path.join(__dirname, "database.json");
const DEFAULT_DB = {
    settings: { autoProcess: true, rateLimitDelay: 1500, requireOptIn: false, allowRepeatDms: true },
    protectedServers: [],
    dmEmbed: { title: "🎁 Reward Drop", description: "Your message here.", color: 16766720 },
    buttons: [], optedInUsers: [], sentUsers: [], lastSentMessageIds: {}, userLastSeen: {}, serverLog: {}
};

function loadDB() {
    if (!fs.existsSync(DB_FILE)) saveDB(DEFAULT_DB);
    try { return { ...DEFAULT_DB, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) }; }
    catch { return DEFAULT_DB; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function isAdmin(m) { return m.member?.permissions.has(PermissionFlagsBits.Administrator); }
function isProtected(id, db) { return db.protectedServers?.includes(String(id)); }

client.once(Events.ClientReady, (c) => {
    console.log(`✅ BOT ONLINE: ${c.user.tag}`);
});

client.on(Events.GuildCreate, async (guild) => {
    const db = loadDB();
    if (db.settings.autoProcess && !isProtected(guild.id, db)) {
        console.log(`📥 Joined ${guild.name}, executing DMs...`);
        // DM loop triggers here
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild || !message.content.startsWith("!")) return;
    const args = message.content.slice(1).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();

    if (cmd === "ping") {
        await message.reply(`Pong! ${client.ws.ping}ms`);
    }
    else if (cmd === "help") {
        const embed = new EmbedBuilder()
            .setTitle("🤖 Bot Commands")
            .setDescription("`!ping`, `!status`, `!startdm`, `!protect`, `!unprotect`, `!protected`")
            .setColor(0x3066993);
        await message.channel.send({ embeds: [embed] });
    }
});

client.login(TOKEN);
