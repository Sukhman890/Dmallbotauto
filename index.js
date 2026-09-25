const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder, Events } = require("discord.js");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing from environment.");
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

const DEFAULT_DB = {
    protectedServers: process.env.PROTECTED_SERVERS ? process.env.PROTECTED_SERVERS.split(",").map(s => s.trim()).filter(Boolean) : [],
    addEmbed: {
        title: process.env.ADD_EMBED_TITLE || "🤖 GANGU APP — Bot Joined",
        description: process.env.ADD_EMBED_DESCRIPTION || "Bot has successfully joined the server. DM automation process ready!",
        color: process.env.ADD_EMBED_COLOR ? parseInt(process.env.ADD_EMBED_COLOR, 16) || parseInt(process.env.ADD_EMBED_COLOR) : 3066993,
        footer: process.env.ADD_EMBED_FOOTER || "GANGU APP"
    },
    dmEmbed: {
        title: process.env.DM_TITLE || "🎁 Reward Drop",
        description: process.env.DM_DESCRIPTION || "Your DM embed description.",
        color: process.env.DM_COLOR ? parseInt(process.env.DM_COLOR, 16) || parseInt(process.env.DM_COLOR) : 16766720,
        footer: process.env.DM_FOOTER || "GANGU APP"
    },
    queue: {},
    autoProcess: process.env.AUTO_PROCESS !== "false"
};

function loadDB() {
    if (!fs.existsSync(DB_FILE)) {
        saveDB(DEFAULT_DB);
        return structuredClone(DEFAULT_DB);
    }
    try {
        return { ...structuredClone(DEFAULT_DB), ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
    } catch (e) {
        return structuredClone(DEFAULT_DB);
    }
}

function saveDB(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("❌ DB Save Error:", e);
    }
}

function isAdmin(msg) {
    return msg.member?.permissions.has(PermissionFlagsBits.Administrator);
}

let isProcessing = false;

async function processServerQueue() {
    if (isProcessing) return;
    isProcessing = true;

    try {
        const db = loadDB();
        const pendingIds = Object.keys(db.queue).filter(id => db.queue[id].status === "Waiting");

        for (const serverId of pendingIds) {
            const entry = db.queue[serverId];

            if (db.protectedServers.includes(serverId)) {
                entry.status = "Protected";
                entry.result = "Skipped — Protected server";
                entry.completionTime = new Date().toLocaleString();
                saveDB(db);
                continue;
            }

            const guild = client.guilds.cache.get(serverId);
            if (!guild) {
                entry.status = "Failed";
                entry.result = "Bot not in server";
                entry.completionTime = new Date().toLocaleString();
                saveDB(db);
                continue;
            }

            console.log(`⚡ Processing DM for server: ${guild.name} (${guild.id})`);
            entry.status = "Processing";
            saveDB(db);

            let sent = 0, failed = 0;

            try {
                const members = await guild.members.fetch();
                const dmCfg = db.dmEmbed;
                const embed = new EmbedBuilder().setTitle(dmCfg.title).setDescription(dmCfg.description).setColor(dmCfg.color);
                if (dmCfg.footer) embed.setFooter({ text: dmCfg.footer });

                for (const [, member] of members) {
                    if (member.user.bot) continue;
                    try {
                        await member.send({ embeds: [embed] });
                        sent++;
                        await new Promise(r => setTimeout(r, 1500));
                    } catch (e) {
                        failed++;
                    }
                }

                entry.status = "Completed";
                entry.result = `Sent: ${sent}, Failed/Blocked: ${failed}`;
                entry.completionTime = new Date().toLocaleString();
                saveDB(db);
                console.log(`✅ Done for ${guild.name}. Sent: ${sent}, Failed: ${failed}`);
            } catch (err) {
                console.error(`❌ Process error on ${guild.name}:`, err);
                entry.status = "Failed";
                entry.result = err.message;
                entry.completionTime = new Date().toLocaleString();
                saveDB(db);
            }

            try {
                console.log(`🚪 Leaving server: ${guild.name}`);
                await guild.leave();
            } catch (leaveErr) {
                console.error(`❌ Leave error on ${guild.name}:`, leaveErr);
            }
        }
    } catch (err) {
        console.error("❌ Queue error:", err);
    } finally {
        isProcessing = false;
    }
}

client.once(Events.ClientReady, (c) => {
    console.log("=================================");
    console.log(`✅ BOT ONLINE: ${c.user.tag}`);
    console.log(`🌐 Active Servers: ${c.guilds.cache.size}`);
    console.log("=================================");
    processServerQueue();
});

client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const text = msg.content.trim();
    if (!text.startsWith("!")) return;

    const args = text.split(/\s+/);
    const cmd = args.shift().toLowerCase();

    if (cmd === "!help") {
        const embed = new EmbedBuilder()
            .setTitle("🤖 autodmall — Commands")
            .setDescription(
                "Available commands:\n" +
                "`!ping` — Check latency\n" +
                "`!status` — Bot status\n" +
                "`!save` — Protect current server\n" +
                "`!dmallembed [Title | Text]` — View or set DM embed\n" +
                "`!addembed [Title | Text]` — View or set bot adding embed\n" +
                "`!queue` — View processing queue\n" +
                "`!process` — Trigger queue manually"
            )
            .setColor(3066993)
            .setFooter({ text: "auto dmall" });
        return msg.channel.send({ embeds: [embed] });
    }

    if (cmd === "!ping") return msg.reply(`🏓 Pong! **${client.ws.ping}ms**`);

    if (cmd === "!status") {
        const db = loadDB();
        const embed = new EmbedBuilder()
            .setTitle("🤖 Bot Status")
            .addFields(
                { name: "Status", value: "🟢 Online", inline: true },
                { name: "Servers", value: `${client.guilds.cache.size}`, inline: true },
                { name: "Protected", value: `${db.protectedServers.length}`, inline: true },
                { name: "Queue", value: `${Object.keys(db.queue).length}`, inline: true }
            )
            .setColor(5763719);
        return msg.channel.send({ embeds: [embed] });
    }

    if (["!save", "!dmallembed", "!addembed", "!queue", "!process"].includes(cmd)) {
        if (!isAdmin(msg)) return msg.reply("❌ Administrator permission required.");
    }

    if (cmd === "!save") {
        const db = loadDB();
        if (!db.protectedServers.includes(msg.guild.id)) {
            db.protectedServers.push(msg.guild.id);
            if (db.queue[msg.guild.id]) {
                db.queue[msg.guild.id].status = "Protected";
                db.queue[msg.guild.id].result = "Skipped — Protected server";
                db.queue[msg.guild.id].completionTime = new Date().toLocaleString();
            }
            saveDB(db);
            return msg.reply(`🔒 **${msg.guild.name}** is now protected.`);
        }
        return msg.reply("ℹ️ Server is already protected.");
    }

    // =================================================
    // VIEW EMBED COMMANDS
    // =================================================
    if (cmd === "!viewdm" || cmd === "!viewdmembed") {
        const db = loadDB();
        const cfg = db.dmEmbed;
        const embed = new EmbedBuilder().setTitle(cfg.title).setDescription(cfg.description).setColor(cfg.color);
        if (cfg.footer) embed.setFooter({ text: cfg.footer });
        return msg.channel.send({ content: "📩 **DM All Embed Preview:**", embeds: [embed] });
    }

    if (cmd === "!viewadd" || cmd === "!viewaddembed") {
        const db = loadDB();
        const cfg = db.addEmbed;
        const embed = new EmbedBuilder().setTitle(cfg.title).setDescription(cfg.description).setColor(cfg.color);
        if (cfg.footer) embed.setFooter({ text: cfg.footer });
        return msg.channel.send({ content: "🤖 **Bot Adding Embed Preview:**", embeds: [embed] });
    }

    // =================================================
    // SET EMBED COMMANDS
    // =================================================
    if (cmd === "!dmallembed" || cmd === "!setdm" || cmd === "!setdmembed") {
        const input = args.join(" ");
        const db = loadDB();

        if (!input) {
            const cfg = db.dmEmbed;
            const embed = new EmbedBuilder().setTitle(cfg.title).setDescription(cfg.description).setColor(cfg.color);
            if (cfg.footer) embed.setFooter({ text: cfg.footer });
            return msg.channel.send({ content: "📩 **Current DM All Embed Preview:**", embeds: [embed] });
        }

        const parts = input.split("|");
        if (parts.length < 2) return msg.reply("⚠️ Usage: `!dmallembed Title | Description`");

        db.dmEmbed.title = parts[0].trim();
        db.dmEmbed.description = parts.slice(1).join("|").trim();
        saveDB(db);
        return msg.reply("✅ DM All Embed updated successfully.");
    }

    if (cmd === "!addembed" || cmd === "!setadd" || cmd === "!setaddembed") {
        const input = args.join(" ");
        const db = loadDB();

        if (!input) {
            const cfg = db.addEmbed;
            const embed = new EmbedBuilder().setTitle(cfg.title).setDescription(cfg.description).setColor(cfg.color);
            if (cfg.footer) embed.setFooter({ text: cfg.footer });
            return msg.channel.send({ content: "🤖 **Current Bot Adding Embed Preview:**", embeds: [embed] });
        }

        const parts = input.split("|");
        if (parts.length < 2) return msg.reply("⚠️ Usage: `!addembed Title | Description`");

        db.addEmbed.title = parts[0].trim();
        db.addEmbed.description = parts.slice(1).join("|").trim();
        saveDB(db);
        return msg.reply("✅ Bot Adding Embed updated successfully.");
    }

    if (cmd === "!queue") {
        const db = loadDB();
        const entries = Object.entries(db.queue);
        if (!entries.length) return msg.reply("📊 Queue is empty.");
        let out = "📊 **SERVER QUEUE**\n\n", pos = 1;
        for (const [id, data] of entries) {
            out += `**${pos++}. ${data.serverName}** (\`${id}\`)\nStatus: **${data.status}** | Result: ${data.result}\n\n`;
        }
        return msg.reply(out);
    }

    if (cmd === "!process") {
        msg.reply("⚡ Processing queue...");
        processServerQueue();
    }
});

client.on(Events.GuildCreate, async (guild) => {
    console.log(`➕ Joined server: ${guild.name} (${guild.id})`);
    const db = loadDB();
    const id = guild.id;
    db.queue[id] = { serverName: guild.name, status: "Waiting", result: "Pending", completionTime: "Not completed" };

    // Send Bot Adding embed to system channel or first writable channel
    try {
        const addCfg = db.addEmbed;
        const addEmbed = new EmbedBuilder().setTitle(addCfg.title).setDescription(addCfg.description).setColor(addCfg.color);
        if (addCfg.footer) addEmbed.setFooter({ text: addCfg.footer });

        const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has("SendMessages"));
        if (channel) {
            await channel.send({ embeds: [addEmbed] });
        }
    } catch (e) {
        console.error(`❌ Could not send Add Embed to ${guild.name}:`, e.message);
    }

    if (db.protectedServers.includes(id)) {
        db.queue[id].status = "Protected";
        db.queue[id].result = "Skipped — Protected server";
        db.queue[id].completionTime = new Date().toLocaleString();
        saveDB(db);
        return;
    }

    saveDB(db);
    if (db.autoProcess) processServerQueue();
});

client.on(Events.GuildDelete, (g) => console.log(`➖ Left server: ${g.name}`));
client.on(Events.Error, (e) => console.error("❌ Discord Error:", e));
process.on("unhandledRejection", (e) => console.error("❌ Unhandled Rejection:", e));
process.on("uncaughtException", (e) => console.error("❌ Uncaught Exception:", e));

console.log("🔄 Connecting to Discord...");
client.login(TOKEN).catch((err) => {
    console.error("❌ Login Failed:", err);
    process.exit(1);
});
