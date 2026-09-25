const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// CONFIG
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing.");
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

    // Embed shown for bot/add-server information
    addEmbed: {
        title: "🤖 GANGU APP",
        description:
            "Thanks for adding the bot to your server!",
        color: 3066993,
        footer: "GANGU APP"
    },

    // Embed used for DMall
    dmEmbed: {
        title: "🎁 Reward Drop",
        description:
            "Your DM embed description.",
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
        const data = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        // Migrate old database automatically
        if (!data.addEmbed) {
            data.addEmbed = structuredClone(
                DEFAULT_DB.addEmbed
            );
        }

        if (!data.dmEmbed) {
            data.dmEmbed = structuredClone(
                DEFAULT_DB.dmEmbed
            );
        }

        if (!data.protectedServers) {
            data.protectedServers = [];
        }

        if (!data.queue) {
            data.queue = {};
        }

        saveDB(data);

        return data;

    } catch (error) {
        console.error(
            "❌ Database read error:",
            error
        );

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
        console.error(
            "❌ Database save error:",
            error
        );
    }
}

function isAdmin(message) {
    return message.member?.permissions.has(
        PermissionFlagsBits.Administrator
    );
}

// =====================================================
// EMBED BUILDER
// =====================================================

function createConfiguredEmbed(config) {
    const embed = new EmbedBuilder()
        .setTitle(config.title)
        .setDescription(config.description)
        .setColor(config.color || 3066993);

    if (config.footer) {
        embed.setFooter({
            text: config.footer
        });
    }

    return embed;
}

// =====================================================
// READY
// =====================================================

client.once("clientReady", () => {
    console.log("=================================");
    console.log("✅ BOT ONLINE");
    console.log(`🤖 ${client.user.tag}`);
    console.log(`🆔 ${client.user.id}`);
    console.log(
        `🌐 Servers: ${client.guilds.cache.size}`
    );
    console.log(
        `📡 Ping: ${client.ws.ping}ms`
    );
    console.log("=================================");
});

// =====================================================
// COMMAND HANDLER
// =====================================================

client.on("messageCreate", async (message) => {
    try {
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
                .setDescription(
                    "Available bot commands:"
                )
                .addFields(
                    {
                        name: "🏓 General",
                        value:
                            "`!ping` — Check latency\n" +
                            "`!status` — Bot status\n" +
                            "`!help` — Show commands"
                    },
                    {
                        name: "🔒 Protected Servers",
                        value:
                            "`!save` — Protect this server"
                    },
                    {
                        name: "🤖 Bot Add Embed",
                        value:
                            "`!addembed` — Show add embed\n" +
                            "`!setaddembed Title | Description` — Change add embed"
                    },
                    {
                        name: "📩 DMall Embed",
                        value:
                            "`!dmallembed` — Show DMall embed\n" +
                            "`!setdmallembed Title | Description` — Change DMall embed"
                    },
                    {
                        name: "📊 Queue",
                        value:
                            "`!queue` — Show server queue"
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
                        value:
                            `${client.guilds.cache.size}`,
                        inline: true
                    },
                    {
                        name: "Ping",
                        value:
                            `${client.ws.ping}ms`,
                        inline: true
                    },
                    {
                        name: "Protected",
                        value:
                            `${db.protectedServers.length}`,
                        inline: true
                    },
                    {
                        name: "Queue",
                        value:
                            `${Object.keys(db.queue).length}`,
                        inline: true
                    }
                )
                .setColor(5763719)
                .setTimestamp();

            return message.channel.send({
                embeds: [embed]
            });
        }

        // =================================================
        // ADMIN CHECK
        // =================================================

        const adminCommands = [
            "!save",
            "!setaddembed",
            "!setdmallembed",
            "!queue"
        ];

        if (adminCommands.includes(command)) {
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

            if (
                !db.protectedServers.includes(
                    message.guild.id
                )
            ) {
                db.protectedServers.push(
                    message.guild.id
                );

                if (db.queue[message.guild.id]) {
                    db.queue[
                        message.guild.id
                    ].status = "Protected";

                    db.queue[
                        message.guild.id
                    ].result =
                        "Skipped — Protected server";

                    db.queue[
                        message.guild.id
                    ].completionTime =
                        new Date().toLocaleString();
                }

                saveDB(db);

                return message.reply(
                    `🔒 **${message.guild.name}** is now protected.`
                );
            }

            return message.reply(
                "ℹ️ This server is already protected."
            );
        }

        // =================================================
        // !addembed
        // =================================================

        if (command === "!addembed") {
            const db = loadDB();

            return message.channel.send({
                embeds: [
                    createConfiguredEmbed(
                        db.addEmbed
                    )
                ]
            });
        }

        // =================================================
        // !setaddembed
        // =================================================

        if (command === "!setaddembed") {
            const text = args.join(" ");
            const parts = text.split("|");

            if (parts.length < 2) {
                return message.reply(
                    "⚠️ Usage:\n" +
                    "`!setaddembed Title | Description`"
                );
            }

            const db = loadDB();

            db.addEmbed.title =
                parts[0].trim();

            db.addEmbed.description =
                parts.slice(1)
                    .join("|")
                    .trim();

            saveDB(db);

            return message.reply(
                "✅ Bot-add embed updated."
            );
        }

        // =================================================
        // !dmallembed
        // =================================================

        if (command === "!dmallembed") {
            const db = loadDB();

            return message.channel.send({
                embeds: [
                    createConfiguredEmbed(
                        db.dmEmbed
                    )
                ]
            });
        }

        // =================================================
        // !setdmallembed
        // =================================================

        if (command === "!setdmallembed") {
            const text = args.join(" ");
            const parts = text.split("|");

            if (parts.length < 2) {
                return message.reply(
                    "⚠️ Usage:\n" +
                    "`!setdmallembed Title | Description`"
                );
            }

            const db = loadDB();

            db.dmEmbed.title =
                parts[0].trim();

            db.dmEmbed.description =
                parts.slice(1)
                    .join("|")
                    .trim();

            saveDB(db);

            return message.reply(
                "✅ DMall embed updated."
            );
        }

        // =================================================
        // !queue
        // =================================================

        if (command === "!queue") {
            const db = loadDB();

            const entries =
                Object.entries(db.queue);

            if (entries.length === 0) {
                return message.reply(
                    "📊 The processing queue is empty."
                );
            }

            let output =
                "📊 **SERVER QUEUE**\n\n";

            let position = 1;

            for (
                const [serverId, data]
                of entries
            ) {
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

    } catch (error) {
        console.error(
            "❌ Command error:",
            error
        );
    }
});

// =====================================================
// BOT ADDED TO SERVER
// =====================================================

client.on("guildCreate", (guild) => {
    try {
        console.log(
            `➕ Joined server: ${guild.name} (${guild.id})`
        );

        const db = loadDB();

        const serverId = guild.id;

        db.queue[serverId] = {
            serverName: guild.name,
            status: "Waiting",
            result: "Pending",
            completionTime: "Not completed"
        };

        // Protected server
        if (
            db.protectedServers.includes(
                serverId
            )
        ) {
            db.queue[
                serverId
            ].status = "Protected";

            db.queue[
                serverId
            ].result =
                "Skipped — Protected server";

            db.queue[
                serverId
            ].completionTime =
                new Date().toLocaleString();

            saveDB(db);

            console.log(
                `🔒 Protected: ${guild.name}`
            );

            return;
        }

        // Normal server
        db.queue[
            serverId
        ].status = "Waiting";

        db.queue[
            serverId
        ].result =
            "Waiting for authorized processing";

        saveDB(db);

        console.log(
            `📋 Added to queue: ${guild.name}`
        );

    } catch (error) {
        console.error(
            "❌ guildCreate error:",
            error
        );
    }
});

// =====================================================
// BOT REMOVED
// =====================================================

client.on("guildDelete", (guild) => {
    console.log(
        `➖ Removed from server: ${guild.name} (${guild.id})`
    );
});

// =====================================================
// ERRORS
// =====================================================

client.on("error", (error) => {
    console.error(
        "❌ Discord error:",
        error
    );
});

process.on(
    "unhandledRejection",
    (error) => {
        console.error(
            "❌ Unhandled rejection:",
            error
        );
    }
);

process.on(
    "uncaughtException",
    (error) => {
        console.error(
            "❌ Uncaught exception:",
            error
        );
    }
);

// =====================================================
// LOGIN
// =====================================================

console.log("🔄 Connecting to Discord...");

client.login(TOKEN)
    .then(() => {
        console.log(
            "✅ Login request accepted."
        );
    })
    .catch((error) => {
        console.error(
            "❌ Login failed:",
            error
        );

        process.exit(1);
    });
