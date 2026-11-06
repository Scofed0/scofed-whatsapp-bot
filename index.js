
const express = require("express");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const {
  default: makeWASocket;
  color:black;
  border:none;
  border-radius:8px;
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
