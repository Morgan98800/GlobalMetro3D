import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';

import { NetworkDataLoader } from './loader.js';
import { computeTripKinematics } from './kinematics.js';
import { PrimRealtimeClient } from './rt_siri.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDataDir = path.resolve(__dirname, '../../data/processed');

// Load rolling stock configuration
const rollingStockMap = new Map([
  ['IDFM:C01371', 'MP05'], // Line 1
  ['IDFM:C01372', 'MF01'], // Line 2
  ['IDFM:C01373', 'MF67'], // Line 3
  ['IDFM:C01386', 'MF67'], // Line 3bis
  ['IDFM:C01374', 'MP89'], // Line 4
  ['IDFM:C01375', 'MF01'], // Line 5
  ['IDFM:C01376', 'MP73'], // Line 6
  ['IDFM:C01377', 'MF77'], // Line 7
  ['IDFM:C01387', 'MF88'], // Line 7bis
  ['IDFM:C01378', 'MF77'], // Line 8
  ['IDFM:C01379', 'MF01'], // Line 9
  ['IDFM:C01380', 'MF67'], // Line 10
  ['IDFM:C01381', 'MP14'], // Line 11
  ['IDFM:C01382', 'MF67'], // Line 12
  ['IDFM:C01383', 'MF77'], // Line 13
  ['IDFM:C01384', 'MP14']  // Line 14
]);

// 1. Initialize Loader
const loader = new NetworkDataLoader(baseDataDir);

// 2. Initialize Realtime PRIM Client
const primKey = process.env.PRIM_API_KEY || '';
const primClient = new PrimRealtimeClient(primKey);

// Start polling all lines on PRIM
const linesJson = JSON.parse(fs.readFileSync(path.join(baseDataDir, 'lines.json'), 'utf-8'));
const lineIds = linesJson.map(l => l.id);
primClient.startPolling(lineIds);

// 3. HTTP Server
const PORT = parseInt(process.env.PORT || '4000', 10);
let activeTrainsCount = 0;
let lastTickDurationMs = 0;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        activeTrains: activeTrainsCount,
        connectedClients: wss.clients.size,
        lastTickDurationMs,
        timestamp: Date.now()
      })
    );
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Paris Subway 3D Simulation Engine Running');
});

// 4. WebSocket Server
const wss = new WebSocketServer({ server });

let previousTrainIds = new Set();
let currentSnapshot = [];

function getParisCurrentTime() {
  const now = new Date();
  const parisString = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const pDate = new Date(parisString);

  const year = pDate.getFullYear();
  const month = String(pDate.getMonth() + 1).padStart(2, '0');
  const day = String(pDate.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const dayOfWeek = pDate.getDay();

  const secondsSinceMidnight = pDate.getHours() * 3600 + pDate.getMinutes() * 60 + pDate.getSeconds();
  return { dateStr, dayOfWeek, secondsSinceMidnight };
}

// 1 Hz Simulation Loop
setInterval(() => {
  const t0 = performance.now();
  const { dateStr, dayOfWeek, secondsSinceMidnight } = getParisCurrentTime();

  const activeServices = loader.getActiveServiceIds(dateStr, dayOfWeek);
  const activeTrips = loader.getActiveTripsAtTime(secondsSinceMidnight, activeServices);

  const currentTrains = [];
  const currentTrainIds = new Set();

  for (const trip of activeTrips) {
    const shape = loader.shapes.get(trip.shapeId);
    if (!shape) continue;

    const delay = primClient.getLineDelay(trip.routeId);
    const trainState = computeTripKinematics(trip, shape, secondsSinceMidnight, delay, rollingStockMap);
    if (trainState) {
      currentTrains.push(trainState);
      currentTrainIds.add(trainState.id);
    }
  }

  activeTrainsCount = currentTrains.length;
  currentSnapshot = currentTrains;

  // Compute deletions
  const deletedIds = [];
  for (const prevId of previousTrainIds) {
    if (!currentTrainIds.has(prevId)) {
      deletedIds.push(prevId);
    }
  }
  previousTrainIds = currentTrainIds;

  lastTickDurationMs = Math.round((performance.now() - t0) * 100) / 100;

  // Broadcast delta to connected clients
  if (wss.clients.size > 0) {
    const deltaMsg = JSON.stringify({
      t: 'delta',
      ts: Math.floor(Date.now() / 1000),
      upd: currentTrains,
      del: deletedIds
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(deltaMsg);
      }
    }
  }
}, 1000);

// Client connection handler
wss.on('connection', (ws) => {
  console.log(`[ws] Client connected (total: ${wss.clients.size})`);

  // Send full initial snapshot immediately
  ws.send(
    JSON.stringify({
      t: 'snapshot',
      ts: Math.floor(Date.now() / 1000),
      trains: currentSnapshot
    })
  );

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.t === 'ping') {
        ws.send(JSON.stringify({ t: 'pong', ts: Date.now() }));
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log(`[ws] Client disconnected (total: ${wss.clients.size})`);
  });
});

server.listen(PORT, () => {
  console.log(`[engine] Paris Subway 3D Simulation Engine listening on http://localhost:${PORT}`);
});
