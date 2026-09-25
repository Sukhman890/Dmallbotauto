# 🤖 GANGU APP — Discord Automated DM & Queue Bot

A Discord.js v14 bot for managing custom embeds, protected servers, and automated queue processing.

---

## ⚡ Features

1. **Automated Server Processing**:
   - Bot joins a non-protected server.
   - Adds server to the processing queue (`db.queue`).
   - Automated processing sends configured DM (`dmEmbed`) to eligible members.
   - Automatically leaves the server once complete (`guild.leave()`).

2. **Protected Server Safety (`!save`)**:
   - Admin command to add a server to the protected list (`protectedServers`).
   - Protected servers are skipped automatically during queue processing and remain untouched.

3. **Custom Embed Configuration**:
   - `!setembed Title | Description` — Customize default bot embed.
   - `!setdmembed Title | Description` — Customize DM embed content.
   - `!embed` — Preview configured embed.

4. **Queue Management**:
   - `!queue` — View server queue status.
   - `!process` — Manually trigger queue processing.

---

## ⚙️ Setup & Requirements

### 1. Discord Developer Portal Configuration
To allow fetching server members and sending messages:
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Select your Application -> **Bot**.
3. Under **Privileged Gateway Intents**, enable:
   - ✅ **Server Members Intent** (`GatewayIntentBits.GuildMembers`)
   - ✅ **Message Content Intent** (`GatewayIntentBits.MessageContent`)
4. Save Changes.

---

## 🚀 Environment Variables

Create a `.env` file or specify in Railway:

```env
# Required
DISCORD_TOKEN=your_bot_token_here

# Optional Embed Customization Variables (Set directly in Railway dashboard)
DM_TITLE=🎁 Reward Drop
DM_DESCRIPTION=Your DM embed description text here.
DM_COLOR=16766720
DM_FOOTER=GANGU APP

CUSTOM_EMBED_TITLE=📢 Custom Bot Embed
CUSTOM_EMBED_DESCRIPTION=Your custom embed description.
CUSTOM_EMBED_COLOR=3066993
CUSTOM_EMBED_FOOTER=GANGU APP

# Optional Protected Servers (comma-separated server IDs)
PROTECTED_SERVERS=123456789012345678,987654321098765432
AUTO_PROCESS=true
```

---

## 🏃 Running Locally

```bash
# Install dependencies
npm install

# Start the bot
npm start
```

---

## 🔒 Important Discord Guidelines & Rate Limits

- **Rate Limits**: The bot incorporates a delay (1.5s per message) to respect Discord's API rate limits and avoid `429 Too Many Requests`.
- **Closed DMs**: Users with "Allow direct messages from server members" turned off or who have blocked the bot will fail gracefully without crashing the process (`Discord API Error 50007`).
- **Guild Leaving**: The bot automatically calls `guild.leave()` after processing is finished for a server.
