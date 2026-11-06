
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
    const jid = userId.split(":")[0].split("@")[0] + "@s.whatsapp.net";

    await sock.sendMessage(jid, { text: message });
    await fs.promises.writeFile(marker, "sent");

    console.log("Welcome sent:", jid);
  } catch (error) {
    console.error("Welcome error:", error);
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

      const messageText =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        "";

      const command = messageText.trim().toLowerCase();

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
        } else if (command === "!ping") {
          await sock.sendMessage(from, {
            text: "SCOFED BOT is online! 🚀"
          });
        } else if (command === "!owner") {
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

/* SCOFED BOT BLACK & GOLD WEBSITE */

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SCOFED BOT</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #080808;
  color: white;
  font-family: Arial, sans-serif;
}

.container {
  width: 100%;
  max-width: 420px;
  padding: 30px 22px;
  text-align: center;
  background: #141414;
  border: 1px solid #c9a227;
  border-radius: 18px;
  box-shadow: 0 0 25px rgba(201,162,39,0.15);
}

.logo {
  width: 85px;
  height: 85px;
  margin: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #d4af37;
  border-radius: 50%;
  font-size: 42px;
  color: #d4af37;
}

h1 {
  color: #d4af37;
  letter-spacing: 2px;
}

.subtitle {
  color: #aaa;
  font-size: 14px;
  line-height: 1.6;
}

input {
  width: 100%;
  padding: 15px;
  margin-top: 20px;
  border: 1px solid #c9a227;
  border-radius: 9px;
  background: #080808;
  color: white;
  font-size: 16px;
}

button {
  width: 100%;
  padding: 15px;
  margin-top: 15px;
  border: none;
  border-radius: 9px;
  background: linear-gradient(90deg,#b8860b,#f5d76e);
  color: #080808;
  font-weight: bold;
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
}

#result {
  margin-top: 20px;
  color: #f5d76e;
  overflow-wrap: anywhere;
  line-height: 1.7;
}

.code {
  font-size: 25px;
  font-weight: bold;
  letter-spacing: 4px;
  padding: 12px;
  border: 1px dashed #d4af37;
  border-radius: 8px;
}

.footer {
  margin-top: 25px;
  color: #777;
  font-size: 12px;
}
</style>
</head>

<body>
<div class="container">

  <div class="logo">👑</div>

  <h1>SCOFED BOT</h1>

  <p class="subtitle">
    Welcome to SCOFED BOT Pairing System.<br>
    Connect your own WhatsApp account.
  </p>

  <input
    id="phone"
    type="tel"
    placeholder="Country code + number"
  >

  <button id="pairBtn" onclick="getCode()">
    GET PAIRING CODE
  </button>

  <div id="result"></div>

  <p class="footer">
    POWERED BY SCOFED • 2026
  </p>

</div>

<script>
async function getCode() {
  const phone = document
    .getElementById("phone")
    .value.replace(/\\D/g, "");

  const button = document.getElementById("pairBtn");
  const result = document.getElementById("result");

  if (!/^[1-9][0-9]{7,14}$/.test(phone)) {
    result.textContent =
      "Enter a valid number with country code.";
    return;
  }

  button.disabled = true;
  button.textContent = "PLEASE WAIT...";
  result.textContent = "Generating pairing code...";

  try {
    const response = await fetch("/api/pair", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phone })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Pairing failed.");
    }

    if (data.code) {
      result.innerHTML =
        "YOUR PAIRING CODE:<div class='code'></div>" +
        "<p>Open WhatsApp → Linked Devices → Link a Device → Link with phone number.</p>";

      result.querySelector(".code").textContent = data.code;
    } else {
      result.textContent =
        data.message || "No code returned.";
    }

  } catch (error) {
    result.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "GET PAIRING CODE";
  }
}
</script>

</body>
</html>`);
});

/* PAIRING API */

app.post("/api/pair", async (req, res) => {
  const phone = String(req.body.phone || "")
    .replace(/\D/g, "");

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
