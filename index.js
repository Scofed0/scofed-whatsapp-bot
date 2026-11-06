
require("dotenv").config();

const express = require("express");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const sessions = new Map();
const lastRequests = new Map();
const reconnecting = new Set();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendWelcomeOnce(sock, folder) {
  try {
    const marker = path.join(folder, ".welcome-sent");

    if (fs.existsSync(marker)) return;

    const welcomePath = path.join(__dirname, "welcome.txt");

    let message = "👑 KARIBU KWENYE SCOFED BOT!\n\n";
    
    if (fs.existsSync(welcomePath)) {
      message = await fs.promises.readFile(welcomePath, "utf8");
    }

    const userId = sock.user.id;
    const jid = userId.includes("@")
      ? userId.split(":")[0]
      : userId + "@s.whatsapp.net";

    await sock.sendMessage(jid, {
      text: message
    });

    await fs.promises.writeFile(marker, "sent");

    console.log("Welcome message sent to:", jid);

  } catch (error) {
    console.error("Welcome message error:", error);
  }
}

async function startSession(phone, generateCode = false) {
  const folder = path.join(__dirname, "sessions", phone);

  await fs.promises.mkdir(folder, { recursive: true });

  const { state, saveCreds } =
    await useMultiFileAuthState(folder);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["SCOFED BOT", "Chrome", "1.0.0"]
  });

  sessions.set(phone, sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("SCOFED BOT connected:", phone);
      await sendWelcomeOnce(sock, folder);
    }

    if (connection === "close") {
      if (sessions.get(phone) === sock) {
        sessions.delete(phone);
      }

      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log("Account logged out:", phone);
        return;
      }

      if (!reconnecting.has(phone)) {
        reconnecting.add(phone);

        await sleep(5000);

        try {
          await startSession(phone, false);
        } catch (error) {
          console.error("Reconnect error:", error);
        } finally {
          reconnecting.delete(phone);
        }
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.remoteJid === "status@broadcast") {
        continue;
      }

      const from = msg.key.remoteJid;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        "";

      const command = text.trim().toLowerCase();

      try {
        if (command === "!menu" || command === "!help") {
          await sock.sendMessage(from, {
            text: `╭━━━〔 SCOFED BOT 〕━━━╮
┃ 👑 OWNER: SCOFED
┃ ⚙️ PREFIX: !
┃
┃ 📌 GENERAL
┃ !menu
┃ !ping
┃ !owner
┃ !help
┃
╰━━━━━━━━━━━━━━━━━━╯

🔥 Karibu kutumia SCOFED BOT!`
          });
        }

        else if (command === "!ping") {
          await sock.sendMessage(from, {
            text: "SCOFED BOT is online! 🚀"
          });
        }

        else if (command === "!owner") {
          await sock.sendMessage(from, {
            text: "👑 OWNER: SCOFED"
          });
        }

      } catch (error) {
        console.error("Command error:", error);
      }
    }
  });

  if (generateCode && !state.creds.registered) {
    await sleep(3000);
    return await sock.requestPairingCode(phone);
  }

  return null;
}

app.get("/", (req, res) => {
  res.send(`
    <h1>👑 SCOFED BOT</h1>
    <p>WhatsApp pairing server is running.</p>
  `);
});

app.post("/api/pair", async (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");

  if (!/^[1-9][0-9]{7,14}$/.test(phone)) {
    return res.status(400).json({
      message: "Invalid WhatsApp number."
    });
  }

  const now = Date.now();
  const last = lastRequests.get(phone) || 0;

  if (now - last < 60000) {
    return res.status(429).json({
      message: "Wait 60 seconds before trying again."
    });
  }

  if (sessions.has(phone)) {
    return res.status(409).json({
      message: "Session already exists. Check your WhatsApp."
    });
  }

  lastRequests.set(phone, now);

  try {
    const code = await startSession(phone, true);

    if (!code) {
      return res.json({
        message: "This number is already registered."
      });
    }

    return res.json({ code });

  } catch (error) {
    console.error("Pairing error:", error);

    return res.status(500).json({
      message: "Pairing failed. Check server logs."
    });
  }
});

app.listen(PORT, () => {
  console.log("SCOFED BOT running on port " + PORT);
});
