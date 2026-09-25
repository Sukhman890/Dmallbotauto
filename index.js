const {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =====================================================
// CONFIG
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

    addEmbed: {
        title: "🎁 CLAIM YOUR REWARD",
        description:
            "Congratulations! You have been selected to receive a reward.\n\n" +
            "**How to claim:**\n" +
            "1️⃣ Join the official server\n" +
            "2️⃣ Complete the event requirements\n" +
            "3️⃣ Click the button below to submit your claim\n\n" +
            "⏳ Claims are reviewed before rewards are delivered.",
        color: 16167971,
        footer: "Reward Event • Official Claim System",

        button: {
            enabled: true,
            label: "🎁 Claim Reward",
            url: "https://discord.gg/dkfnz8kHr"
        }
    },

    dmEmbed: {
        title: "🎁 Reward Drop",
        description: "Your DM reward message.",
        color: 16766720,
        footer: "GANGU APP"
    },

    queue: {}
};

// =====================================================
// DATABASE FUNCTIONS
// =====================================================

function cloneDefault() {
    return JSON.parse(
        JSON.stringify(DEFAULT_DB)
    );
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

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        const db = cloneDefault();
        saveDB(db);
        return db;
    }

    try {
        const db = JSON.parse(
            fs.readFileSync(DB_FILE, "utf8")
        );

        // -----------------------------
        // Migration / missing settings
        // -----------------------------

        if (!db.protectedServers) {
            db.protectedServers = [];
        }

        if (!db.queue) {
            db.queue = {};
        }

        if (!db.addEmbed) {
            db.addEmbed =
                JSON.parse(
                    JSON.stringify(
                        DEFAULT_DB.addEmbed
                    )
                );
        }

        if (!db.addEmbed.button) {
            db.addEmbed.button =
                JSON.parse(
                    JSON.stringify(
                        DEFAULT_DB.addEmbed.button
                    )
                );
        }

        if (!db.dmEmbed) {
            db.dmEmbed =
                JSON.parse(
                    JSON.stringify(
                        DEFAULT_DB.dmEmbed
                    )
                );
        }

        saveDB(db);

        return db;

    } catch (error) {
        console.error(
            "❌ Database read error:",
            error
        );

        return cloneDefault();
    }
}

// =====================================================
// ADMIN
// =====================================================

function isAdmin(message) {
    return message.member?.permissions.has(
        PermissionFlagsBits.Administrator
    );
}

// =====================================================
// ADD EMBED BUILDER
// =====================================================

function createAddEmbed(db) {
    const cfg = db.addEmbed;

    const embed = new EmbedBuilder()
        .setTitle(cfg.title)
        .setDescription(cfg.description)
        .setColor(cfg.color || 3066993);

    if (cfg.footer) {
        embed.setFooter({
            text: cfg.footer
        });
    }

    return embed;
}

// =====================================================
// ADD BUTTON BUILDER
// =====================================================

function createAddButton(db) {
    const button = db.addEmbed?.button;

    if (!button || !button.enabled) {
        return null;
    }

    if (!button.label || !button.url) {
        return null;
    }

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(button.label)
            .setStyle(ButtonStyle.Link)
            .setURL(button.url)
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

        // -----------------------------------------------
        // FIX: only split off the command name from the
        // first word. Everything after it is kept RAW so
        // manual line breaks (shift+enter) and spacing are
        // preserved instead of being collapsed by \s+ splitting.
        // -----------------------------------------------
        const firstSpace = content.indexOf(" ");
        const command = (
            firstSpace === -1
                ? content
                : content.slice(0, firstSpace)
        ).toLowerCase();

        const rawArgs =
            firstSpace === -1
                ? ""
                : content.slice(firstSpace + 1);

        // =================================================
        // HELP
        // =================================================

        if (command === "!help") {
            const embed = new EmbedBuilder()
                .setTitle("🤖 GANGU APP")
                .setDescription(
                    "Available commands"
                )
                .addFields(
                    {
                        name: "🏓 General",
                        value:
                            "`!ping`\n" +
                            "`!status`\n" +
                            "`!help`"
                    },
                    {
                        name: "🤖 Bot Add Embed",
                        value:
                            "`!addembed`\n" +
                            "`!setaddembed Title | Description`\n" +
                            "`!addbutton Label | URL`\n" +
                            "`!removebutton`\n" +
                            "`!resetaddembed`"
                    },
                    {
                        name: "📩 DM Embed",
                        value:
                            "`!dmallembed`\n" +
                            "`!setdmallembed Title | Description`"
                    },
                    {
                        name: "🔒 Server",
                        value:
                            "`!save`\n" +
                            "`!queue`"
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
        // PING
        // =================================================

        if (command === "!ping") {
            return message.reply(
                `🏓 Pong! **${client.ws.ping}ms**`
            );
        }

        // =================================================
        // STATUS
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
                .setColor(5763719);

            return message.channel.send({
                embeds: [embed]
            });
        }

        // =================================================
        // ADMIN COMMANDS
        // =================================================

        const adminCommands = [
            "!save",
            "!setaddembed",
            "!addbutton",
            "!removebutton",
            "!resetaddembed",
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
        // !SAVE
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
        // !ADDEMBED
        // =================================================

        if (command === "!addembed") {
            const db = loadDB();

            const embed =
                createAddEmbed(db);

            const row =
                createAddButton(db);

            const payload = {
                embeds: [embed]
            };

            if (row) {
                payload.components = [row];
            }

            return message.channel.send(
                payload
            );
        }

        // =================================================
        // !SETADDEMBED
        // =================================================

        if (command === "!setaddembed") {
            const parts = rawArgs.split("|");

            if (parts.length < 2) {
                return message.reply(
                    "⚠️ Usage:\n" +
                    "`!setaddembed Title | Description`\n" +
                    "You can use shift+enter for real line breaks in the description."
                );
            }

            const db = loadDB();

            db.addEmbed.title =
                parts[0].trim();

            db.addEmbed.description =
                parts
                    .slice(1)
                    .join("|")
                    .trim();

            saveDB(db);

            return message.reply(
                "✅ Bot-add embed updated.\n" +
                "Use `!addembed` to preview it."
            );
        }

        // =================================================
        // !ADDBUTTON
        // =================================================

        if (command === "!addbutton") {
            const parts = rawArgs.split("|");

            if (parts.length < 2) {
                return message.reply(
                    "⚠️ Usage:\n" +
                    "`!addbutton Button Label | https://discord.gg/example`"
                );
            }

            const label =
                parts[0].trim();

            const url =
                parts
                    .slice(1)
                    .join("|")
                    .trim();

            // Basic URL validation
            let parsedURL;

            try {
                parsedURL =
                    new URL(url);
            } catch {
                return message.reply(
                    "❌ Invalid URL."
                );
            }

            if (
                parsedURL.protocol !==
                "https:"
            ) {
                return message.reply(
                    "❌ Button URL must use HTTPS."
                );
            }

            const db = loadDB();

            db.addEmbed.button = {
                enabled: true,
                label: label,
                url: url
            };

            saveDB(db);

            return message.reply(
                `✅ Button added: **${label}**\n` +
                `🔗 ${url}\n\n` +
                "Use `!addembed` to preview it."
            );
        }

        // =================================================
        // !REMOVEBUTTON
        // =================================================

        if (command === "!removebutton") {
            const db = loadDB();

            db.addEmbed.button.enabled =
                false;

            saveDB(db);

            return message.reply(
                "✅ Button removed from the add embed."
            );
        }

        // =================================================
        // !RESETADDEMBED
        // =================================================

        if (command === "!resetaddembed") {
            const db = loadDB();

            db.addEmbed =
                JSON.parse(
                    JSON.stringify(
                        DEFAULT_DB.addEmbed
                    )
                );

            saveDB(db);

            return message.reply(
                "♻️ Bot-add embed reset to default."
            );
        }

        // =================================================
        // !DMALLEMBED
        // =================================================

        if (command === "!dmallembed") {
            const db = loadDB();

            const cfg = db.dmEmbed;

            const embed = new EmbedBuilder()
                .setTitle(cfg.title)
                .setDescription(
                    cfg.description
                )
                .setColor(
                    cfg.color || 3066993
                );

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
        // !SETDMALLEMBED
        // =================================================

        if (command === "!setdmallembed") {
            const parts = rawArgs.split("|");

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
                parts
                    .slice(1)
                    .join("|")
                    .trim();

            saveDB(db);

            return message.reply(
                "✅ DM embed updated."
            );
        }

        // =================================================
        // !QUEUE
        // =================================================

        if (command === "!queue") {
            const db = loadDB();

            const entries =
                Object.entries(
                    db.queue
                );

            if (entries.length === 0) {
                return message.reply(
                    "📊 Queue is empty."
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
                    `🆔 \`${serverId}\`\n` +
                    `📌 **${data.status}**\n` +
                    `📋 ${data.result}\n` +
                    `⏰ ${data.completionTime}\n\n`;

                position++;
            }

            return message.reply(
                output
            );
        }

    } catch (error) {
        console.error(
            "❌ Command error:",
            error
        );

        return message.reply(
            "❌ Something went wrong."
        );
    }
});

// =====================================================
// BOT ADDED
// =====================================================

client.on("guildCreate", (guild) => {
    try {
        console.log(
            `➕ Joined: ${guild.name} (${guild.id})`
        );

        const db = loadDB();

        db.queue[guild.id] = {
            serverName: guild.name,
            status: "Waiting",
            result: "Pending",
            completionTime: "Not completed"
        };

        if (
            db.protectedServers.includes(
                guild.id
            )
        ) {
            db.queue[guild.id].status =
                "Protected";

            db.queue[guild.id].result =
                "Skipped — Protected server";

            db.queue[guild.id].completionTime =
                new Date().toLocaleString();
        }

        saveDB(db);

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
        `➖ Removed: ${guild.name} (${guild.id})`
    );
});

// =====================================================
// ERROR HANDLING
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

console.log(
    "🔄 Connecting to Discord..."
);

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
