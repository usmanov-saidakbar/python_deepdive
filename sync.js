// Fetches video messages from the configured Telegram channel and writes
// them to data/content.json. Requires TG_SESSION (see login.js) to be set.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;
const channelUsername = process.env.TG_CHANNEL || "sm1523";
const fetchLimit = Number(process.env.TG_FETCH_LIMIT || 10000);
const DATA_FILE = path.join(__dirname, "data", "content.json");

function firstLine(text) {
  if (!text) return null;
  const line = text.split("\n")[0].trim();
  return line || null;
}

async function sync() {
  if (!process.env.TG_SESSION) {
    throw new Error('TG_SESSION is not set. Run "npm run login" first.');
  }

  const client = new TelegramClient(
    new StringSession(process.env.TG_SESSION),
    apiId,
    apiHash,
    { connectionRetries: 5 }
  );
  await client.connect();

  const channel = await client.getEntity(channelUsername);

  try {
    await client.invoke(new Api.channels.JoinChannel({ channel }));
  } catch (err) {
    // Already a member, or channel doesn't require joining — safe to ignore.
  }

  const items = [];
  let scanned = 0;
  for await (const message of client.iterMessages(channel, { limit: fetchLimit })) {
    scanned++;
    if (!message.video) continue;
    const id = String(message.id);
    items.push({
      id,
      title: firstLine(message.message) || `Video #${id}`,
      date: message.date ? new Date(message.date * 1000).toISOString() : null,
      link: `https://t.me/${channelUsername}/${message.id}`,
    });
  }

  // The site groups videos by their position in this list (see server.js), so a
  // scan cut short by the limit would shift every course. Keep the old file.
  if (scanned >= fetchLimit) {
    await client.disconnect();
    throw new Error(
      `Scanned ${scanned} messages, which is the TG_FETCH_LIMIT cap, so older ones may be missing. ` +
        "Raise TG_FETCH_LIMIT and sync again; data/content.json was not changed."
    );
  }

  items.sort((a, b) => new Date(a.date) - new Date(b.date));

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
  console.log(`Synced ${items.length} videos from @${channelUsername}`);

  await client.disconnect();
  return items;
}

if (require.main === module) {
  sync().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { sync };
