const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// Get token from Railway Variables
const BOT_TOKEN = process.env.DISCORD_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
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

const DB_FILE = path.join(__dirname, "database.json");

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const data = {
            protectedServers: [],
            customEmbed: {
                title: "📢 Custom Bot Embed",
                description: "This is the custom embed.",
                color: 3066993
            }
        };

        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(data, null, 2)
        );

        return data;
    }

    try {
        return JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );
    } catch {
        console.error("❌ database.json is corrupted.");
        process.exit(1);
    }
}

function saveDB(data) {
    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(data, null, 2)
    );
}

function isAdmin(message) {
    return (
        message.member &&
        message.member.permissions.has(
            PermissionFlagsBits.Administrator
        )
    );
}

client.once("ready", () => {
    console.log("=================================");
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`🌐 Servers: ${client.guilds.cache.size}`);
    console.log("✅ Bot is online.");
    console.log("=================================");
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const args = message.content
        .trim()
        .split(/\s+/);

    const command = args.shift()?.toLowerCase();

    if (!command) return;

    // !save
    if (command === "!save") {
        if (!isAdmin(message)) {
            return message.reply(
                "❌ Administrator permissions required."
            );
        }

        const db = loadDB();
        const serverId = message.guild.id;

        if (!db.protectedServers.includes(serverId)) {
            db.protectedServers.push(serverId);
            saveDB(db);

            return message.reply(
                `🔒 **${message.guild.name}** has been added to the protected-server list.`
            );
        }

        return message.reply(
            "ℹ️ This server is already protected."
        );
    }

    // !embed
    if (command === "!embed") {
        const db = loadDB();
        const cfg = db.customEmbed;

        const embed = new EmbedBuilder()
            .setTitle(cfg.title)
            .setDescription(cfg.description)
            .setColor(cfg.color);

        return message.channel.send({
            embeds: [embed]
        });
    }

    // !setembed Title | Description
    if (command === "!setembed") {
        if (!isAdmin(message)) {
            return message.reply(
                "❌ Administrator permissions required."
            );
        }

        const text = args.join(" ");
        const parts = text.split("|");

        if (parts.length < 2) {
            return message.reply(
                "⚠️ Usage:\n`!setembed Title | Description`"
            );
        }

        const db = loadDB();

        db.customEmbed.title = parts[0].trim();
        db.customEmbed.description = parts
            .slice(1)
            .join("|")
            .trim();

        saveDB(db);

        return message.reply(
            "✅ Custom embed updated."
        );
    }

    // !servers
    if (command === "!servers") {
        if (!isAdmin(message)) {
            return message.reply(
                "❌ Administrator permissions required."
            );
        }

        const db = loadDB();

        const protectedCount =
            db.protectedServers.length;

        return message.reply(
            `📊 **Bot Status**\n\n` +
            `🌐 Servers: **${client.guilds.cache.size}**\n` +
            `🔒 Protected servers: **${protectedCount}**`
        );
    }

    // !ping
    if (command === "!ping") {
        return message.reply(
            `🏓 Pong! **${client.ws.ping}ms**`
        );
    }

    // !help
    if (command === "!help") {
        const embed = new EmbedBuilder()
            .setTitle("🤖 Bot Commands")
            .setDescription(
                "`!ping` — Check bot latency\n" +
                "`!save` — Protect this server\n" +
                "`!embed` — Show the custom embed\n" +
                "`!setembed Title | Description` — Change the embed\n" +
                "`!servers` — Show bot/server status"
            )
            .setColor(3066993);

        return message.channel.send({
            embeds: [embed]
        });
    }
});

client.on("guildCreate", (guild) => {
    console.log(
        `➕ Joined server: ${guild.name} (${guild.id})`
    );
});

client.on("guildDelete", (guild) => {
    console.log(
        `➖ Left server: ${guild.name} (${guild.id})`
    );
});

client.on("error", (error) => {
    console.error("Discord client error:", error);
});

process.on("unhandledRejection", (error) => {
    console.error("Unhandled rejection:", error);
});

client.login(BOT_TOKEN);
