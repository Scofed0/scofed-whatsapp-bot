
const express = require("express");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("SCOFED BOT is running!");
});

app.listen(PORT, () => {
  console.log("SCOFED BOT server started on port " + PORT);
});

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("session");

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("SCOFED BOT connected!");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (statusCode !== DisconnectReason.loggedOut) {
        startBot();
      } else {
        console.log("WhatsApp session logged out.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (text.trim().toLowerCase() === "!menu") {
      await sock.sendMessage(from, {
        text: `╭━━━〔 SCOFED BOT 〕━━━╮
┃
┃ 👑 OWNER: SCOFED
┃ ⚙️ PREFIX: !
┃
┃ 📌 GENERAL
┃ !menu
┃ !ping
┃ !owner
┃
┃ 🛡️ GROUP
┃ !antilink
┃ !antisticker
┃
┃ 🤖 BOT
┃ !always
┃ !help
┃
╰━━━━━━━━━━━━━━━━━━╯
        `
      });
    }

    if (text.trim().toLowerCase() === "!ping") {
      await sock.sendMessage(from, { text: "SCOFED BOT is online! 🚀" });
    }

    if (text.trim().toLowerCase() === "!owner") {
      await sock.sendMessage(from, { text: "Owner: SCOFED 👑" });
    }
  });
}

startBot().catch(console.error);
