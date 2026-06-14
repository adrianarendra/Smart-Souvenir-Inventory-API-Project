'use strict';

// ============================================================
// Smart Souvenir - ESP32 RFID Hardware Emulator
//
// Modul ini mensimulasikan perangkat keras ESP32 + RFID RC522.
// Alur data:
//   Frontend → POST /simulate → ESP32 Emulator → POST /rfid/tap → Backend API
//
// Ini sepenuhnya berbasis software (tidak ada hardware fisik).
// ============================================================

const express = require('express');
const fetch   = require('node-fetch');
const cors    = require('cors');

const app           = express();
const PORT          = parseInt(process.env.EMULATOR_PORT) || 4000;
const API_URL       = process.env.API_URL || 'http://localhost:3000';
const DEVICE_ID     = process.env.DEVICE_ID || 'ESP32-RFID-EMULATOR-001';

// ============================================================
// Middleware
// ============================================================
app.use(cors({ origin: '*' }));
app.use(express.json());

// ============================================================
// State internal emulator (mensimulasikan memori ESP32)
// ============================================================
let tapCount     = 0;
let lastUID      = null;
let lastTapTime  = null;
let isOnline     = true;
let bootTime     = new Date();

// ============================================================
// Utility: Generate UID RFID acak (alfanumerik 8 karakter)
// Mensimulasikan output chip MFRC522 pada ESP32
// ============================================================
function generateRandomUID(length = 8) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let uid = '';
  for (let i = 0; i < length; i++) {
    uid += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return uid;
}

// ============================================================
// Utility: Format durasi uptime
// ============================================================
function getUptime() {
  const diffMs   = Date.now() - bootTime.getTime();
  const diffSec  = Math.floor(diffMs / 1000);
  const hours    = Math.floor(diffSec / 3600);
  const minutes  = Math.floor((diffSec % 3600) / 60);
  const seconds  = diffSec % 60;
  return `${hours}j ${minutes}m ${seconds}d`;
}

// ============================================================
// Utility: Kirim HTTP POST ke backend API
// Mensimulasikan ESP32 yang mengirim data via WiFi
// ============================================================
async function sendTapToAPI(uid, timestamp) {
  const payload = {
    uid:       uid,
    timestamp: timestamp,
    device:    DEVICE_ID
  };

  console.log(`[ESP32] Mengirim tap ke API: ${JSON.stringify(payload)}`);

  const response = await fetch(`${API_URL}/rfid/tap`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    timeout: 5000
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API merespons dengan status ${response.status}: ${errText}`);
  }

  return await response.json();
}

// ============================================================
// ROUTE: GET /status
// Cek status emulator (seperti serial monitor pada ESP32)
// ============================================================
app.get('/status', (req, res) => {
  res.json({
    success:     true,
    device_id:   DEVICE_ID,
    firmware:    'SmartSouvenir-ESP32-Emulator v1.0.0',
    chip:        'ESP32-WROOM-32 (Simulated)',
    rfid_module: 'MFRC522 (Simulated)',
    api_target:  API_URL,
    status:      isOnline ? 'online' : 'offline',
    uptime:      getUptime(),
    tap_count:   tapCount,
    last_uid:    lastUID,
    last_tap:    lastTapTime,
    wifi_ssid:   'SmartSouvenir-WiFi (Simulated)',
    ip_address:  '192.168.1.101 (Simulated)',
    boot_time:   bootTime.toISOString(),
    timestamp:   new Date().toISOString()
  });
});

// ============================================================
// ROUTE: POST /simulate
// Memicu simulasi ketukan kartu RFID dengan UID acak.
// Ini mensimulasikan momen ketika seseorang mendekatkan
// kartu RFID ke reader pada ESP32.
// Body (opsional): { uid: "CUSTOM_UID" }
// ============================================================
app.post('/simulate', async (req, res) => {
  if (!isOnline) {
    return res.status(503).json({
      success: false,
      error:   'ESP32 emulator sedang offline'
    });
  }

  // Gunakan UID custom jika diberikan, atau generate acak
  const uid       = req.body && req.body.uid
    ? req.body.uid.toUpperCase()
    : generateRandomUID();
  const timestamp = new Date().toISOString();

  tapCount++;
  lastUID     = uid;
  lastTapTime = timestamp;

  console.log(`\n[ESP32] ========================================`);
  console.log(`[ESP32] KARTU RFID TERDETEKSI! (Tap #${tapCount})`);
  console.log(`[ESP32] UID     : ${uid}`);
  console.log(`[ESP32] Waktu   : ${timestamp}`);
  console.log(`[ESP32] Device  : ${DEVICE_ID}`);
  console.log(`[ESP32] Mengirim data ke backend API...`);

  try {
    const apiResponse = await sendTapToAPI(uid, timestamp);

    console.log(`[ESP32] Respons API: ${JSON.stringify(apiResponse)}`);
    console.log(`[ESP32] ========================================\n`);

    res.json({
      success:   true,
      emulator: {
        device_id: DEVICE_ID,
        uid:       uid,
        timestamp: timestamp,
        tap_count: tapCount
      },
      api_response: apiResponse
    });
  } catch (err) {
    console.error(`[ESP32] GAGAL menghubungi API: ${err.message}`);
    res.status(502).json({
      success:  false,
      error:    `Emulator gagal menghubungi backend API: ${err.message}`,
      emulator: { device_id: DEVICE_ID, uid, timestamp, tap_count: tapCount }
    });
  }
});

// ============================================================
// ROUTE: POST /simulate/uid/:uid
// Simulasi tap dengan UID yang spesifik (untuk testing kasir)
// ============================================================
app.post('/simulate/uid/:uid', async (req, res) => {
  if (!isOnline) {
    return res.status(503).json({ success: false, error: 'ESP32 emulator sedang offline' });
  }

  const uid       = req.params.uid.toUpperCase();
  const timestamp = new Date().toISOString();

  tapCount++;
  lastUID     = uid;
  lastTapTime = timestamp;

  console.log(`[ESP32] Simulasi tap UID spesifik: ${uid}`);

  try {
    const apiResponse = await sendTapToAPI(uid, timestamp);
    res.json({
      success:      true,
      emulator:     { device_id: DEVICE_ID, uid, timestamp, tap_count: tapCount },
      api_response: apiResponse
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      error:   err.message,
      emulator: { device_id: DEVICE_ID, uid, timestamp }
    });
  }
});

// ============================================================
// ROUTE: POST /toggle
// Toggle status online/offline emulator (untuk demo)
// ============================================================
app.post('/toggle', (req, res) => {
  isOnline = !isOnline;
  console.log(`[ESP32] Status diubah menjadi: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  res.json({
    success: true,
    status:  isOnline ? 'online' : 'offline',
    message: `ESP32 emulator sekarang ${isOnline ? 'online' : 'offline'}`
  });
});

// ============================================================
// ROUTE: POST /reset
// Reset counter emulator
// ============================================================
app.post('/reset', (req, res) => {
  tapCount    = 0;
  lastUID     = null;
  lastTapTime = null;
  bootTime    = new Date();
  console.log('[ESP32] Counter direset');
  res.json({ success: true, message: 'Counter emulator direset' });
});

// ============================================================
// Start Emulator Server
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Smart Souvenir - ESP32 RFID Emulator       ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Device ID  : ${DEVICE_ID.substring(0, 29).padEnd(29)} ║`);
  console.log(`║  Port       : ${String(PORT).padEnd(29)} ║`);
  console.log(`║  API Target : ${API_URL.substring(0, 29).padEnd(29)} ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  Endpoint tersedia:                          ║');
  console.log('║  GET  /status         - Status emulator      ║');
  console.log('║  POST /simulate       - Tap kartu acak       ║');
  console.log('║  POST /simulate/uid/  - Tap UID spesifik     ║');
  console.log('║  POST /toggle         - Toggle online/offline║');
  console.log('╚══════════════════════════════════════════════╝');
});
