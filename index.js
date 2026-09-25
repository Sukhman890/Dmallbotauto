require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// --- fetch polyfill ---
let fetch;
try {
    fetch = globalThis.fetch;
    if (!fetch) throw new Error('no native fetch');
} catch {
    try { fetch = require('node-fetch'); } catch {
        console.error('[FATAL] No fetch available. Run: npm install node-fetch@2');
        process.exit(1);
    }
}

// --- Global error handlers ---
process.on('unhandledRejection', (reason) => console.error('[UnhandledRejection]', reason));
process.on('uncaughtException', (err) => console.error('[UncaughtException]', err.message, err.stack));

// --- DATABASE SETUP ---
let db;
try {
    db = new Database('database.sqlite');
    db.pragma('journal_mode = WAL');   // faster writes
    db.pragma('synchronous = NORMAL'); // safe but faster
} catch (err) {
    console.error('[FATAL] Cannot open database:', err.message);
    process.exit(1);
}

db.prepare(`CREATE TABLE IF NOT EXISTS tickets (
    channel_id  TEXT PRIMARY KEY,
    user_id     TEXT,
    state       TEXT,
    invites     INTEGER DEFAULT 0,
    reward_name TEXT
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS rewards (
    name             TEXT PRIMARY KEY,
    invites_required INTEGER,
    position         INTEGER DEFAULT 0
)`).run();

// Safe migrations
try { db.prepare(`ALTER TABLE rewards ADD COLUMN position INTEGER DEFAULT 0`).run(); } catch {}
try { db.prepare(`ALTER TABLE tickets ADD COLUMN invites INTEGER DEFAULT 0`).run(); } catch {}
try { db.prepare(`ALTER TABLE tickets ADD COLUMN reward_name TEXT`).run(); } catch {}

// --- Prepared statements (cached for speed) ---
const stmts = {
    getTicket:    db.prepare('SELECT * FROM tickets WHERE channel_id = ?'),
    insertTicket: db.prepare('INSERT OR REPLACE INTO tickets (channel_id, user_id, state, invites) VALUES (?, ?, ?, ?)'),
    updateState:  db.prepare('UPDATE tickets SET state = ? WHERE channel_id = ?'),
    updateInvites:db.prepare('UPDATE tickets SET invites = ?, state = ? WHERE channel_id = ?'),
    updateReward: db.prepare('UPDATE tickets SET state = ?, reward_name = ? WHERE channel_id = ?'),
    getRewards:   db.prepare('SELECT * FROM rewards WHERE invites_required <= ? ORDER BY position ASC'),
    getReward:    db.prepare('SELECT invites_required FROM rewards WHERE name = ?'),
    getState:     db.prepare('SELECT state FROM tickets WHERE channel_id = ?'),
};

// --- rewardOptions with TTL ---
const rewardOptions = {};
const rewardOptionsTimers = {};

function setRewardOptions(channelId, options) {
    rewardOptions[channelId] = options;
    if (rewardOptionsTimers[channelId]) clearTimeout(rewardOptionsTimers[channelId]);
    rewardOptionsTimers[channelId] = setTimeout(() => {
        delete rewardOptions[channelId];
        delete rewardOptionsTimers[channelId];
    }, 7200000);
}

function clearRewardOptions(channelId) {
    delete rewardOptions[channelId];
    if (rewardOptionsTimers[channelId]) {
        clearTimeout(rewardOptionsTimers[channelId]);
        delete rewardOptionsTimers[channelId];
    }
}

// --- DIRECT CHANNEL DELETE ---
async function deleteChannel(channel, delayMs = 0) {
    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    try {
        await channel.delete();
        console.log(`[Delete] Deleted channel: ${channel.name}`);
    } catch (e) {
        console.error(`[Delete] Failed to delete channel ${channel.name}:`, e.message);
    }
}

// --- STOCK HELPERS ---
const stocksDir = path.join(__dirname, 'stocks');
if (!fs.existsSync(stocksDir)) fs.mkdirSync(stocksDir);

const getActualFileName = (name) => {
    const files = fs.readdirSync(stocksDir);
    return files.find(f => f.toLowerCase().trim().includes(name.toLowerCase().trim())) || null;
};

const getStockCount = (name) => {
    const fileName = getActualFileName(name);
    if (!fileName) return 0;
    try {
        return fs.readFileSync(path.join(stocksDir, fileName), 'utf-8')
            .split(/\r?\n/).filter(l => l.trim()).length;
    } catch { return 0; }
};

const popStockItem = (name) => {
    const fileName = getActualFileName(name);
    if (!fileName) return null;
    const fp = path.join(stocksDir, fileName);
    try {
        const lines = fs.readFileSync(fp, 'utf-8').split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) return null;
        const item = lines[0];
        fs.writeFileSync(fp, lines.slice(1).join('\n') + (lines.length > 1 ? '\n' : ''));
        return item;
    } catch { return null; }
};

// --- CLIENT ---
const client = new Client({ checkUpdate: false });

client.on('error', (err) => console.error('[ClientError]', err.message));

client.on('disconnect', (event) => {
    console.warn('[Disconnected] Code:', event?.code, '| Reason:', event?.reason || 'unknown');
    setTimeout(() => {
        client.login(process.env.TOKEN).catch(err => console.error('[ReconnectFailed]', err.message));
    }, 10000);
});

// --- ENV CHECKS ---
if (!process.env.TOKEN) { console.error('[FATAL] TOKEN not set'); process.exit(1); }
if (!process.env.FELCON_BOT_ID) console.warn('[WARN] FELCON_BOT_ID not set — invite tracking disabled');

const TICKET_TOOL_ID = '557628352828014614';

client.on('ready', () => {
    console.log(`>>> Bot online: ${client.user.tag}`);
    const eventRewards = [
        { name: 'Mcfa Permanent',        invites: 2 },
        { name: 'Minecraft Redeem Code', invites: 4 },
        { name: 'Roblox 50$ Giftcard',   invites: 2 },
        { name: 'Roblox 100$ Giftcard',  invites: 4 },
        { name: 'Nitro Basic Yearly',     invites: 2 },
        { name: 'Nitro Boost Yearly',     invites: 4 },
    ];
    db.prepare('DELETE FROM rewards').run();
    const stmt = db.prepare('INSERT INTO rewards (name, invites_required, position) VALUES (?, ?, ?)');
    eventRewards.forEach((r, i) => stmt.run(r.name, r.invites, i));
    console.log('>>> Rewards synced.');
});

// --- Felcon -i retry tracker (cooldown detection) ---
// channelId -> { attempts, timer }
const felconRetry = {};

async function sendInviteCheck(channel, userId, attempt = 1) {
    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY = 6000; // 6s (slightly more than 5s cooldown)

    try {
        await channel.send(`-i <@${userId}>`);
        console.log(`[InviteCheck] Sent -i in ${channel.name} (attempt ${attempt})`);
    } catch (e) {
        console.error(`[InviteCheck] Send failed in ${channel.name}:`, e.message);
    }

    // Clear any existing retry timer for this channel
    if (felconRetry[channel.id]?.timer) clearTimeout(felconRetry[channel.id].timer);
    felconRetry[channel.id] = { attempts: attempt };
}

// Detect if Felcon returned a cooldown message and retry
// NOTE: Keep this specific — broad words like "wait" or "seconds" also appear
// in normal invite-count replies and would cause false positives.
function isCooldownMessage(text) {
    return /cooldown|slow\s*down|try again/i.test(text) ||
           /wait\s+\d+\s*seconds?/i.test(text) ||
           /\d+\s*seconds?\s*(?:remaining|left|to wait)/i.test(text);
}

client.on('messageCreate', async (message) => {
    if (!message.guild) return;

    try {
        // =========================================================
        // OWNER COMMANDS
        // =========================================================
        if (message.author.id === client.user.id) {
            const prefix = '!';
            if (!message.content.startsWith(prefix)) return; // exit early if not a command

            const args = message.content.slice(prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            if (command === 'stock' && args[0] === 'add') {
                const name = args.slice(1).join(' ');
                if (!name || !message.attachments.size)
                    return message.edit('❌ **Usage:** `!stock add <reward_name>`').catch(() => {});

                const attachment = message.attachments.first();
                let text;
                try {
                    const res = await fetch(attachment.url);
                    text = await res.text();
                } catch (e) {
                    return message.edit('❌ Failed to download attachment.').catch(() => {});
                }
                const existingFile = getActualFileName(name);
                const fp = path.join(stocksDir, existingFile || `${name}.txt`);
                fs.appendFileSync(fp, (fs.existsSync(fp) ? '\n' : '') + text.trim() + '\n');
                return message.edit(`✅ **Stock Added:** ${name} (Total: ${getStockCount(name)})`).catch(() => {});
            }

            if (command === 'reward' && args[0] === 'list') {
                const rows = db.prepare('SELECT * FROM rewards ORDER BY position ASC').all();
                let txt = '### 🎁 **EXCLUSIVE REWARD POOL** 🎁\n\n';
                rows.forEach(r => txt += `• **${r.name}** — Requires ${r.invites_required} Invites\n`);
                return message.edit(txt).catch(() => {});
            }
            return;
        }

        // =========================================================
        // TICKET TOOL MESSAGES
        // =========================================================
        if (message.author.id === TICKET_TOOL_ID || message.applicationId === TICKET_TOOL_ID) {
            const msgText = (message.content + ' ' + (message.embeds?.[0]?.description || '')).toLowerCase();

            // Close event → just delete the channel directly
            const isCloseEvent = msgText.includes('ticket closed')
                || msgText.includes('closed by')
                || msgText.includes('support team ticket controls');

            if (isCloseEvent) {
                const ch = message.channel;
                console.log(`[AutoDelete] Close event in ${ch.name}`);
                stmts.updateState.run('CLOSED', ch.id);
                clearRewardOptions(ch.id);
                if (felconRetry[ch.id]?.timer) clearTimeout(felconRetry[ch.id].timer);
                delete felconRetry[ch.id];
                deleteChannel(ch, 5000);
                return;
            }

            // Ticket open — detect by user mention in content/embed, not channel name
            if (true) {
                const embed = message.embeds?.[0];
                const fullText = message.content + ' ' + (embed?.description || '') + ' ' + (embed?.fields?.map(f => f.value).join(' ') || '');
                const userMatch = fullText.match(/<@!?(\d+)>/);

                if (userMatch) {
                    const uid = userMatch[1];
                    if (uid === client.user.id) return;

                    const existing = stmts.getTicket.get(message.channel.id);
                    const activeStates = ['OPENED', 'SELECTING', 'AWAITING_RMI', 'DELIVERED', 'NO_STOCK'];
                    if (existing && activeStates.includes(existing.state)) return;

                    stmts.insertTicket.run(message.channel.id, uid, 'OPENED', 0);
                    // Send -i after 1.5s
                    setTimeout(() => sendInviteCheck(message.channel, uid), 1500);
                }
            }
            return;
        }

        // =========================================================
        // FELCON BOT — invite count OR cooldown detection
        // =========================================================
        if (process.env.FELCON_BOT_ID && message.author.id === process.env.FELCON_BOT_ID) {
            const ticket = stmts.getTicket.get(message.channel.id);

            // Cooldown detection — retry -i
            const combined = (
                message.content + ' ' +
                (message.embeds?.[0]?.description || '') + ' ' +
                (message.embeds?.[0]?.fields?.map(f => f.value).join(' ') || '')
            );

            if (isCooldownMessage(combined)) {
                if (!ticket || ticket.state !== 'OPENED') return;
                const retryInfo = felconRetry[message.channel.id] || { attempts: 0 };
                const nextAttempt = retryInfo.attempts + 1;
                if (nextAttempt > 5) {
                    console.warn(`[InviteCheck] Max retries reached in ${message.channel.name}`);
                    return;
                }
                console.log(`[InviteCheck] Cooldown detected in ${message.channel.name} — retrying in 6s (attempt ${nextAttempt})`);
                const ch = message.channel;
                const uid = ticket.user_id;
                const timer = setTimeout(() => sendInviteCheck(ch, uid, nextAttempt), 6000);
                felconRetry[ch.id] = { attempts: nextAttempt, timer };
                return;
            }

            if (!ticket || ticket.state !== 'OPENED') return;

            const combinedLow = combined.toLowerCase();
            const invMatch =
                combinedLow.match(/has\s*(\d+)\s*invite/i) ||
                combinedLow.match(/total\s*[:\-]\s*(\d+)/i) ||
                combinedLow.match(/(\d+)\s*total/i) ||
                combinedLow.match(/invites?\s*[:\-]\s*(\d+)/i) ||
                combinedLow.match(/(\d+)\s*invites?/i) ||
                combinedLow.match(/invite\s*count\s*[:\-]?\s*(\d+)/i);

            if (!invMatch) return;

            // Clear retry state — we got our response
            if (felconRetry[message.channel.id]?.timer) clearTimeout(felconRetry[message.channel.id].timer);
            delete felconRetry[message.channel.id];

            const count = parseInt(invMatch[1]);
            const ch = message.channel;

            if (count <= 1) {
                ch.send(
                    `You have **${count} invite(s)** right now. You need at least **2 invites** to claim a reward. Check <#1487785639662456932> for the rewards.\n\n` +
                    `Left: The people who joined from your invite but left the server\n` +
                    `Fake: Any account which is considered an ALT or a new account\n` +
                    `Rejoin: These users were members of the server before but left and rejoined the server with your link`
                ).catch(() => {});

                stmts.updateState.run('CLOSED', ch.id);
                clearRewardOptions(ch.id);
                deleteChannel(ch, 10000);
                return;
            }

            // Enough invites
            stmts.updateInvites.run(count, 'SELECTING', ch.id);

            const rewards = stmts.getRewards.all(count);
            if (!rewards.length) {
                ch.send(
                    `You only have **${count} invite(s)**. Need at least **2 invites** to claim a reward. ` +
                    `Check <#1487785639662456932> for details.`
                ).catch(() => {});
                deleteChannel(ch, 30000);
                return;
            }

            const options = rewards.map((r, i) => ({ id: i + 1, name: r.name }));
            setRewardOptions(ch.id, options);

            let rewardMsg = `<@${ticket.user_id}> You have **${count}** invites.\nHere are your options:\n\n`;
            for (const o of options) {
                const r = stmts.getReward.get(o.name);
                rewardMsg += `**${o.id})** ${o.name} *(${r ? r.invites_required : '?'} invites)*\n`;
            }
            rewardMsg +=
                `\nLeft: The people who joined from your invite but left the server\n` +
                `Fake: Any account which is considered an ALT or a new account\n` +
                `Rejoin: These users were members of the server before but left and rejoined the server with your link`;

            // Send both messages in parallel
            await Promise.all([
                ch.send(rewardMsg),
                ch.send(`Reply with the number (1-${options.length}) or just type the reward name.`)
            ]).catch(() => {});
            return;
        }

        // =========================================================
        // USER SELECTS REWARD (state: SELECTING)
        // =========================================================
        const ticketSelect = stmts.getTicket.get(message.channel.id);

        if (ticketSelect?.state === 'SELECTING' && message.author.id === ticketSelect.user_id) {
            const input = message.content.trim();

            let options = rewardOptions[message.channel.id];
            if (!options) {
                const rewards = stmts.getRewards.all(ticketSelect.invites);
                if (!rewards.length) return;
                options = rewards.map((r, i) => ({ id: i + 1, name: r.name }));
                setRewardOptions(message.channel.id, options);
            }

            const num = parseInt(input);
            const selected = !isNaN(num)
                ? options.find(o => o.id === num)
                : options.find(o => o.name.toLowerCase().includes(input.toLowerCase()));

            if (!selected) return;

            stmts.updateReward.run('AWAITING_RMI', selected.name, message.channel.id);
            message.channel.send(
                `<@${ticketSelect.user_id}> Please type \`-rmi\` to receive your **${selected.name}**`
            ).catch(() => {});

            // Rename channel based on selected reward
            const selLow = selected.name.toLowerCase();
            let newChannelName = null;
            if (selLow.includes('mcfa')) {
                newChannelName = 'mtat';
            } else if (selLow.includes('minecraft') && selLow.includes('redeem')) {
                newChannelName = 'mtat-cd';
            } else if (selLow.includes('nitro')) {
                newChannelName = 'nio';
            } else if (selLow.includes('roblox')) {
                newChannelName = 'rux';
            }
            if (newChannelName) {
                message.channel.setName(newChannelName).catch(e =>
                    console.error(`[Rename] Failed to rename channel to ${newChannelName}:`, e.message)
                );
            }

            return; // prevent fall-through to RMI block
        }

        // =========================================================
        // USER SENDS -RMI
        // =========================================================
        const ticketRmi = stmts.getTicket.get(message.channel.id);

        if (
            ticketRmi?.state === 'AWAITING_RMI' &&
            message.author.id === ticketRmi.user_id &&
            message.content.toLowerCase().trim() === '-rmi'
        ) {
            // Check stock FIRST — block -rmi entirely if nothing available
            const stockCount = getStockCount(ticketRmi.reward_name);
            if (stockCount === 0) {
                const nsLow = ticketRmi.reward_name.toLowerCase();
                let nsName = null;
                if (nsLow.includes('mcfa')) nsName = 'mtat';
                else if (nsLow.includes('minecraft') && nsLow.includes('redeem')) nsName = 'mtat-cd';
                else if (nsLow.includes('nitro')) nsName = 'nio';
                else if (nsLow.includes('roblox')) nsName = 'rux';
                if (nsName) {
                    message.channel.setName(nsName).catch(e =>
                        console.error(`[Rename] Failed to rename channel to ${nsName}:`, e.message)
                    );
                }
                message.channel.send(
                    `Please wait for an owner or staff member <@&1415610287574487151>`
                ).catch(() => {});
                return;
            }

            // Mark DELIVERED immediately to prevent double-claim
            stmts.updateState.run('DELIVERED', message.channel.id);
            clearRewardOptions(message.channel.id);

            const item = popStockItem(ticketRmi.reward_name);

            const reward = ticketRmi.reward_name.toLowerCase();
            let payoutMsg;

            if (reward.includes('mcfa')) {
                const [email = 'N/A', pass = 'N/A'] = item.split(':');
                payoutMsg =
                    `Email = ||${email}||\nPass = ||${pass}||\n\n` +
                    `<@${ticketRmi.user_id}> Are we **LEGIT?**`;
            } else if (reward.includes('minecraft') && reward.includes('redeem')) {
                payoutMsg =
                    `Minecraft Redeem Code = ||${item}||\n\n` +
                    `Redeem here: ||https://elevateiq.shop||\n\n` +
                    `<@${ticketRmi.user_id}> Are we **LEGIT?**`;
            } else if (reward.includes('roblox') && reward.includes('50')) {
                payoutMsg =
                    `Roblox 50$ Giftcard = ||${item}||\n\n` +
                    `Redeem here: ||https://elevateiq.shop||\n\n` +
                    `<@${ticketRmi.user_id}> Are we **LEGIT?**`;
            } else if (reward.includes('roblox') && reward.includes('100')) {
                payoutMsg =
                    `Roblox 100$ Giftcard = ||${item}||\n\n` +
                    `Redeem here: ||https://elevateiq.shop||\n\n` +
                    `<@${ticketRmi.user_id}> Are we **LEGIT?**`;
            } else if (reward.includes('nitro') && reward.includes('basic')) {
                payoutMsg =
                    `Nitro Basic Yearly = ||${item}||\n\n` +
                    `Redeem here: ||https://elevateiq.shop||\n\n` +
                    `<@${ticketRmi.user_id}> Are we **LEGIT?**`;
            } else if (reward.includes('nitro') && reward.includes('boost')) {
                payoutMsg =
                    `Nitro Boost Yearly = ||${item}||\n\n` +
                    `Redeem here: ||https://elevateiq.shop||\n\n` +
                    `<@${ticketRmi.user_id}> Are we **LEGIT?**`;
            } else {
                payoutMsg =
                    `Your Reward: ||${item}||\n\n` +
                    `<@${ticketRmi.user_id}> Are we **LEGIT?**`;
            }

            // Rename channel to 'paid' since reward is delivered
            message.channel.setName('paid').catch(e =>
                console.error(`[Rename] Failed to rename channel to paid:`, e.message)
            );

            // Send both messages in parallel
            await Promise.all([
                message.channel.send(payoutMsg),
                message.channel.send(`<@&1477703262802153686> Please screenshot and post in proofs. Thanks!`)
            ]).catch(() => {});

            // Auto-delete after 2 hours
            const channelToClose = message.channel;
            setTimeout(async () => {
                const current = stmts.getState.get(channelToClose.id);
                if (!current || current.state === 'CLOSED') {
                    console.log(`[AutoDelete] ${channelToClose.name} already closed — skipping.`);
                    return;
                }
                console.log(`[AutoDelete] 2h elapsed — deleting ${channelToClose.name}`);
                stmts.updateState.run('CLOSED', channelToClose.id);
                await deleteChannel(channelToClose);
            }, 2 * 60 * 60 * 1000);
        }

    } catch (err) {
        console.error('[messageCreate error]', err.message, err.stack);
    }
});

// --- LOGIN ---
client.login(process.env.TOKEN).catch(err => {
    console.error('[LoginFailed]', err.message);
    process.exit(1);
});
