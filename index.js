
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
const SESSION_DIR = process.env.SESSION_DIR || "sessions";

fs.mkdirSync(SESSION_DIR, { recursive: true });

const sessions = new Map();
const lastRequests = new Map();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SCOFED BOT</title>
<style>
body {
  background:#080808;
  color:white;
  font-family:Arial;
  text-align:center;
  padding:35px 15px;
}
.container {
  max-width:400px;
  margin:auto;
  background:#151515;
  padding:25px;
  border-radius:18px;
  border:1px solid #c99b35;
}
h1 { color:#d5a637; }
input {
  width:90%;
  padding:15px;
  margin:15px 0;
  border-radius:8px;
  border:none;
  font-size:16px;
}
button {
  width:100%;
  padding:15px;
  background:#c99b35;
  color:black;
  border:none;
  border-radius:8px;
  font-weight:bold;
}
#result {
  margin-top:20px;
  color:#e2bd65;
  overflow-wrap:anywhere;
}
</style>
</head>
<body>
<div class="container">
<h1>🤖 SCOFED BOT</h1>
<p>WHATSAPP PAIRING SYSTEM</p>

<input id="phone" type="tel"
placeholder="2557XXXXXXXX">

<button onclick="generate()">
GENERATE PAIRING CODE
</button>

<div id="result"></div>
<p>POWERED BY SCOFED 👑</p>
</div>

<script>
async function generate() {
  const phone = document.getElementById("phone").value.trim();
  const result = document.getElementById("result");

  if (!/^[1-9][0-9]{7,14}$/.test(phone)) {
    result.innerText = "Enter a valid number with country code.";
    return;
  }

  result.innerText = "Generating your code...";

  try {
    const response = await fetch("/api/pair", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({phone})
    });

    const data = await response.json();

    if (data.code) {
      result.innerText = "YOUR PAIRING CODE: " + data.code;
    } else {
      result.innerText = data.message || "Unable to generate code.";
    }
  } catch (error) {
    result.innerText = "Connection error. Try again.";
  }
}
</script>
</body>
</html>
  `);
});

async function startSession(phone, generateCode = false) {
  const folder = path.join(SESSION_DIR, phone);

  const { state, saveCreds } =
    await useMultiFileAuthState(folder);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false
  });

  sessions.set(phone, sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async update => {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      console.log("SCOFED BOT connected:", phone);
    }

    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode;

      if (status === DisconnectReason.loggedOut) {
        sessions.delete(phone);
        await fs.promises.rm(folder, {
          recursive: true,
          force: true
        });
        console.log("Session logged out:", phone);
      } else {
        sessions.delete(phone);
        setTimeout(() => {
          startSession(phone).catch(console.error);
        }, 5000);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];

    if (!msg?.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    const command = text.trim().toLowerCase();

    if (command === "!menu") {
      await sock.sendMessage(from, {
        text: `╭━━━〔 SCOFED BOT 〕━━━╮
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
╰━━━━━━━━━━━━━━━━━━╯`
      });
    }

    if (command === "!ping") {
      await sock.sendMessage(from, {
        text: "SCOFED BOT is online! 🚀"
      });
    }

    if (command === "!owner") {
      await sock.sendMessage(from, {
        text: "Owner: SCOFED 👑"
      });
    }
  });

  if (generateCode && !state.creds.registered) {
    await sleep(3000);
    return await sock.requestPairingCode(phone);
  }

  return null;
}

app.post("/api/pair", async (req, res) => {
  const phone = String(req.body.phone || "");

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

    res.json({ code });
  } catch (error) {
    console.error("Pairing error:", error);

    res.status(500).json({
      message: "Pairing failed. Check server logs."
    });
  }
});

app.listen(PORT, () => {
  console.log("SCOFED BOT running on port " + PORT);
});
