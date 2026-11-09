
require("dotenv").config();

const express = require("express");
const pino = require("pino");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json({ limit: "10kb" }));

const PORT = process.env.PORT || 3000;
const sessions = new Map();
const pairingCodes = new Map();
const qrImages = new Map();
const statuses = new Map();
const starting = new Set();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function registerCommands(sock) {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      if (!from || from === "status@broadcast") continue;

      const body =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      const command = body.trim().toLowerCase();

      try {
        if (command === "!menu" || command === "!help") {
          await sock.sendMessage(from, {
            text: `╭━━━〔 SCOFED BOT 〕━━━╮
┃ 👑 OWNER: SCOFED
┃ ⚙️ PREFIX: !
┃
┃ !menu
┃ !ping
┃ !owner
┃ !help
╰━━━━━━━━━━━━━━━━━━╯`
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
        console.error("Command error:", error.message);
      }
    }
  });
}

async function startSession(phone, method) {
  if (starting.has(phone) || sessions.has(phone)) {
    throw new Error("A session is already running.");
  }

  starting.add(phone);
  statuses.set(phone, "connecting");

  const folder = path.join(__dirname, "sessions", phone);
  let sock;

  try {
    await fs.promises.mkdir(folder, { recursive: true });

    const { state, saveCreds } =
      await useMultiFileAuthState(folder);

    if (state.creds.registered) {
      throw new Error(
        "This account already has saved credentials. Do not create a new pairing request."
      );
    }

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["SCOFED BOT", "Chrome", "1.0.0"],
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 60000
    });

    sessions.set(phone, sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async update => {
      const { connection, qr, lastDisconnect } = update;

      if (qr && method === "qr") {
        try {
          qrImages.set(phone, await QRCode.toDataURL(qr));
          statuses.set(phone, "waiting_for_scan");
        } catch (error) {
          console.error("QR generation error:", error.message);
        }
      }

      if (connection === "open") {
        statuses.set(phone, "connected");
        pairingCodes.delete(phone);
        qrImages.delete(phone);
        registerCommands(sock);
        console.log("SCOFED BOT connected.");
      }

      if (connection === "close") {
        const code =
          lastDisconnect?.error?.output?.statusCode;

        statuses.set(phone, "disconnected");

        if (sessions.get(phone) === sock) {
          sessions.delete(phone);
        }

        if (code === DisconnectReason.loggedOut) {
          console.log("WhatsApp session logged out.");
        } else {
          console.log("Connection closed:", code);
        }
      }
    });

    if (method === "pair") {
      await sleep(5000);

      if (!sessions.has(phone)) {
        throw new Error("WhatsApp connection closed before pairing.");
      }

      const code = await sock.requestPairingCode(phone);
      pairingCodes.set(phone, code);
    }

    return { phone, method };

  } catch (error) {
    if (sock && sessions.get(phone) === sock) {
      sessions.delete(phone);
    }
    statuses.set(phone, "failed");
    throw error;
  } finally {
    starting.delete(phone);
  }
}

/* WEBSITE */

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SCOFED BOT</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;background:#080808;color:white;
  font-family:Arial,sans-serif;
  min-height:100vh;display:grid;place-items:center;padding:20px
}
.card{
  width:100%;max-width:420px;text-align:center;
  background:#151515;border:1px solid #d4af37;
  border-radius:18px;padding:28px 20px;
  box-shadow:0 0 25px #d4af3725
}
.logo{
  width:80px;height:80px;border:2px solid #d4af37;
  border-radius:50%;display:grid;place-items:center;
  margin:auto;color:#d4af37;font-size:38px
}
h1{color:#d4af37;letter-spacing:3px}
p{color:#aaa;line-height:1.5;font-size:14px}
input{
  width:100%;padding:15px;margin-top:15px;
  background:#080808;color:white;
  border:1px solid #d4af37;border-radius:8px;font-size:16px
}
button{
  width:100%;padding:14px;margin-top:12px;
  border:0;border-radius:8px;
  background:linear-gradient(90deg,#b8860b,#f5d76e);
  font-weight:bold;cursor:pointer
}
button:disabled{opacity:.5}
#result{margin-top:20px;overflow-wrap:anywhere}
.code{font-size:25px;letter-spacing:4px;color:#f5d76e}
#qr{width:220px;max-width:100%;margin-top:15px;background:white}
.footer{font-size:11px;color:#777;margin-top:25px}
</style>
</head>
<body>
<div class="card">
  <div class="logo">👑</div>
  <h1>SCOFED BOT</h1>
  <p>Connect your own WhatsApp account.</p>
  <input id="phone" placeholder="255XXXXXXXXX" type="tel">
  <button id="pair" onclick="connect('pair')">PAIRING CODE</button>
  <button id="qrbtn" onclick="connect('qr')">QR CODE</button>
  <div id="result"></div>
  <img id="qr" hidden>
  <div class="footer">POWERED BY SCOFED • 2026</div>
</div>
<script>
let timer;

async function connect(method){
  clearInterval(timer);
  const phone=document.getElementById("phone").value.replace(/\\D/g,"");
  const result=document.getElementById("result");
  const qr=document.getElementById("qr");
  const buttons=[document.getElementById("pair"),document.getElementById("qrbtn")];

  if(!/^[1-9][0-9]{7,14}$/.test(phone)){
    result.textContent="Enter a valid number with country code.";
    return;
  }

  buttons.forEach(b=>b.disabled=true);
  qr.hidden=true;
  result.textContent="Connecting...";

  try{
    const response=await fetch("/api/connect",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({phone,method})
    });

    const data=await response.json();
    if(!response.ok) throw new Error(data.message);

    if(method==="pair"){
      result.innerHTML="YOUR PAIRING CODE:<div class='code'></div><p>WhatsApp → Linked Devices → Link a Device → Link with phone number instead.</p>";
      result.querySelector(".code").textContent=data.code;
    }else{
      result.textContent="Scan this QR using WhatsApp → Linked Devices → Link a Device.";
      await refresh(phone);
      timer=setInterval(()=>refresh(phone),3000);
    }
  }catch(error){
    result.textContent=error.message;
  }finally{
    buttons.forEach(b=>b.disabled=false);
  }
}

async function refresh(phone){
  try{
    const response=await fetch("/api/status/"+encodeURIComponent(phone));
    const data=await response.json();

    if(data.qr){
      document.getElementById("qr").src=data.qr;
      document.getElementById("qr").hidden=false;
    }

    if(data.status==="connected"){
      document.getElementById("result").textContent="WhatsApp Connected!";
      clearInterval(timer);
    }
  }catch(e){}
}
</script>
</body>
</html>`);
});

/* CONNECT */

app.post("/api/connect", async (req, res) => {
  const phone = String(req.body.phone || "").replace(/\D/g, "");
  const method = req.body.method;

  if (!/^[1-9][0-9]{7,14}$/.test(phone)) {
    return res.status(400).json({ message: "Invalid phone number." });
  }

  if (!["pair", "qr"].includes(method)) {
    return res.status(400).json({ message: "Invalid connection method." });
  }

  try {
    await startSession(phone, method);

    if (method === "pair") {
      const code = pairingCodes.get(phone);
      if (!code) {
        return res.status(500).json({
          message: "Pairing code was not generated. Check server logs."
        });
      }
      return res.json({ code });
    }

    return res.json({ message: "QR session started." });

  } catch (error) {
    console.error("Connection error:", error);
    return res.status(500).json({ message: error.message });
  }
});

/* STATUS */

app.get("/api/status/:phone", (req, res) => {
  const phone = String(req.params.phone).replace(/\D/g, "");

  res.json({
    status: statuses.get(phone) || "not_connected",
    qr: qrImages.get(phone) || null
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "online", service: "SCOFED BOT" });
});

app.listen(PORT, () => {
  console.log("SCOFED BOT running on port " + PORT);
});
