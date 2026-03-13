const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// --- File paths for persistent JSON data ---
const PLAYERS_FILE = path.join(__dirname, 'players.json');
const MATCHES_FILE = path.join(__dirname, 'matches.json');

// --- MIME types for serving static files ---
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ============================================================
//  Data Helpers — read / write JSON files
// ============================================================

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// Create data files on first run
if (!fs.existsSync(PLAYERS_FILE)) writeJSON(PLAYERS_FILE, []);
if (!fs.existsSync(MATCHES_FILE)) writeJSON(MATCHES_FILE, []);

// ============================================================
//  Match-schedule generator (round-robin)
//  Every player plays every other player once.
// ============================================================

function generateMatches(players) {
  const matches = [];
  let id = 1;

  // First match starts tomorrow
  const base = new Date();
  base.setDate(base.getDate() + 1);

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const d = new Date(base);
      d.setDate(d.getDate() + matches.length);

      matches.push({
        id: id++,
        player1: players[i].name,
        player1Team: players[i].team,
        player2: players[j].name,
        player2Team: players[j].team,
        date: d.toISOString().split('T')[0],
        time: '18:00',
        status: 'upcoming',   // upcoming | completed
        score1: null,
        score2: null,
        winner: null,
      });
    }
  }
  return matches;
}

// ============================================================
//  Leaderboard builder (derived from completed matches)
// ============================================================

function buildLeaderboard(players, matches) {
  const stats = {};
  players.forEach((p) => {
    stats[p.name] = { name: p.name, team: p.team, played: 0, wins: 0, losses: 0, draws: 0, points: 0 };
  });

  matches.forEach((m) => {
    if (m.status !== 'completed') return;
    const p1 = stats[m.player1];
    const p2 = stats[m.player2];
    if (!p1 || !p2) return;

    p1.played++;
    p2.played++;

    if (m.winner === m.player1) {
      p1.wins++; p1.points += 3; p2.losses++;
    } else if (m.winner === m.player2) {
      p2.wins++; p2.points += 3; p1.losses++;
    } else {
      p1.draws++; p2.draws++; p1.points += 1; p2.points += 1;
    }
  });

  return Object.values(stats).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

// ============================================================
//  Utility: parse JSON request body
// ============================================================

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ============================================================
//  Utility: send a JSON response
// ============================================================

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// ============================================================
//  Static file server — serves /frontend directory
// ============================================================

function serveStatic(res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';

  // Security: prevent directory traversal
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(__dirname, '..', 'frontend', safePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 — Not Found</h1>');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ============================================================
//  HTTP Server & Router
// ============================================================

const server = http.createServer(async (req, res) => {
  const { method } = req;
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;

  // --- CORS preflight ---
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  try {
    // -------------------------------------------------------
    //  POST /api/register  — register a new player
    // -------------------------------------------------------
    if (method === 'POST' && pathname === '/api/register') {
      const { name, team, email } = await parseBody(req);

      if (!name || !team || !email) {
        return sendJSON(res, 400, { error: 'All fields are required.' });
      }

      const players = readJSON(PLAYERS_FILE);

      if (players.find((p) => p.name.toLowerCase() === name.toLowerCase())) {
        return sendJSON(res, 409, { error: 'Player name already registered.' });
      }

      players.push({ name, team, email, registeredAt: new Date().toISOString() });
      writeJSON(PLAYERS_FILE, players);

      // Auto-regenerate the match schedule with the updated player pool
      const matches = generateMatches(players);
      writeJSON(MATCHES_FILE, matches);

      return sendJSON(res, 201, { message: 'Registration successful!', player: { name, team } });
    }

    // -------------------------------------------------------
    //  GET /api/players  — list all registered players
    // -------------------------------------------------------
    if (method === 'GET' && pathname === '/api/players') {
      return sendJSON(res, 200, readJSON(PLAYERS_FILE));
    }

    // -------------------------------------------------------
    //  GET /api/matches  — full match schedule
    // -------------------------------------------------------
    if (method === 'GET' && pathname === '/api/matches') {
      return sendJSON(res, 200, readJSON(MATCHES_FILE));
    }

    // -------------------------------------------------------
    //  GET /api/leaderboard  — current standings
    // -------------------------------------------------------
    if (method === 'GET' && pathname === '/api/leaderboard') {
      const players = readJSON(PLAYERS_FILE);
      const matches = readJSON(MATCHES_FILE);
      return sendJSON(res, 200, buildLeaderboard(players, matches));
    }

    // -------------------------------------------------------
    //  PUT /api/matches/:id  — update a match result (admin)
    // -------------------------------------------------------
    if (method === 'PUT' && pathname.startsWith('/api/matches/')) {
      const matchId = parseInt(pathname.split('/').pop(), 10);
      const { score1, score2 } = await parseBody(req);

      if (score1 == null || score2 == null) {
        return sendJSON(res, 400, { error: 'score1 and score2 are required.' });
      }

      const matches = readJSON(MATCHES_FILE);
      const match = matches.find((m) => m.id === matchId);

      if (!match) return sendJSON(res, 404, { error: 'Match not found.' });

      match.score1 = Number(score1);
      match.score2 = Number(score2);
      match.status = 'completed';
      match.winner = match.score1 > match.score2
        ? match.player1
        : match.score2 > match.score1
          ? match.player2
          : 'draw';

      writeJSON(MATCHES_FILE, matches);
      return sendJSON(res, 200, { message: 'Match result updated.', match });
    }

    // -------------------------------------------------------
    //  GET /api/results  — completed matches only
    // -------------------------------------------------------
    if (method === 'GET' && pathname === '/api/results') {
      return sendJSON(res, 200, readJSON(MATCHES_FILE).filter((m) => m.status === 'completed'));
    }

    // -------------------------------------------------------
    //  Fallback: serve static frontend files
    // -------------------------------------------------------
    serveStatic(res, pathname);

  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  eFootball Tournament Server`);
  console.log(`  http://localhost:${PORT}\n`);
});
