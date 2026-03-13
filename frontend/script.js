/* ============================================================
   eFootball Tournament — Frontend JavaScript
   Uses fetch() to communicate with the Node.js backend API
   ============================================================ */

const API = '';  // Same origin — backend serves the frontend

// ============================================================
//  Mobile nav toggle
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  // Route page-specific initialisation
  if (document.getElementById('register-form'))    initRegisterPage();
  if (document.getElementById('matches-container')) initMatchesPage();
  if (document.getElementById('leaderboard-table')) initLeaderboardPage();
  if (document.getElementById('results-container')) initResultsPage();
  if (document.getElementById('admin-form'))        initAdminForm();
});

// ============================================================
//  Register Page
// ============================================================

function initRegisterPage() {
  const form    = document.getElementById('register-form');
  const msgEl   = document.getElementById('form-message');

  // Load existing players on page load
  loadPlayers();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name  = form.name.value.trim();
    const team  = form.team.value.trim();
    const email = form.email.value.trim();

    if (!name || !team || !email) {
      showMessage(msgEl, 'Please fill in all fields.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, team, email }),
      });
      const data = await res.json();

      if (res.ok) {
        showMessage(msgEl, data.message, 'success');
        form.reset();
        loadPlayers(); // refresh the player list
      } else {
        showMessage(msgEl, data.error, 'error');
      }
    } catch (err) {
      showMessage(msgEl, 'Server error. Is the backend running?', 'error');
    }
  });
}

async function loadPlayers() {
  const list = document.getElementById('players-list');
  const box  = document.getElementById('registered-box');
  if (!list) return;

  try {
    const res = await fetch(`${API}/api/players`);
    const players = await res.json();

    if (players.length === 0) {
      box.style.display = 'none';
      return;
    }

    box.style.display = 'block';
    list.innerHTML = players.map((p) =>
      `<li>
        <span class="player-name">${escapeHtml(p.name)}</span>
        <span class="player-team">${escapeHtml(p.team)}</span>
      </li>`
    ).join('');
  } catch {
    box.style.display = 'none';
  }
}

// ============================================================
//  Matches Page
// ============================================================

async function initMatchesPage() {
  const container = document.getElementById('matches-container');

  try {
    const res = await fetch(`${API}/api/matches`);
    const matches = await res.json();

    if (matches.length === 0) {
      container.innerHTML = '<p class="empty-state">No matches scheduled yet. Register players first!</p>';
      return;
    }

    container.innerHTML = matches.map((m) => buildMatchCard(m, false)).join('');
  } catch {
    container.innerHTML = '<p class="empty-state">Could not load matches. Is the server running?</p>';
  }
}

// ============================================================
//  Results Page
// ============================================================

async function initResultsPage() {
  const container = document.getElementById('results-container');

  try {
    const res = await fetch(`${API}/api/results`);
    const results = await res.json();

    if (results.length === 0) {
      container.innerHTML = '<p class="empty-state">No completed matches yet.</p>';
      return;
    }

    container.innerHTML = results.map((m) => buildMatchCard(m, true)).join('');
  } catch {
    container.innerHTML = '<p class="empty-state">Could not load results. Is the server running?</p>';
  }
}

// ============================================================
//  Leaderboard Page
// ============================================================

async function initLeaderboardPage() {
  const tbody   = document.querySelector('#leaderboard-table tbody');
  const emptyEl = document.getElementById('leaderboard-empty');

  try {
    const res = await fetch(`${API}/api/leaderboard`);
    const board = await res.json();

    if (board.length === 0) {
      emptyEl.textContent = 'No players registered yet.';
      return;
    }

    emptyEl.style.display = 'none';

    tbody.innerHTML = board.map((p, i) => {
      const rank = i + 1;
      const rankClass = rank <= 3 ? `rank-${rank}` : '';
      const badgeClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const badge = badgeClass
        ? `<span class="rank-badge ${badgeClass}">${rank}</span>`
        : rank;

      return `<tr class="${rankClass}">
        <td>${badge}</td>
        <td class="player-name">${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.team)}</td>
        <td>${p.played}</td>
        <td>${p.wins}</td>
        <td>${p.draws}</td>
        <td>${p.losses}</td>
        <td class="pts-cell">${p.points}</td>
      </tr>`;
    }).join('');
  } catch {
    emptyEl.textContent = 'Could not load leaderboard. Is the server running?';
  }
}

// ============================================================
//  Admin Form (update match results)
// ============================================================

function initAdminForm() {
  const form  = document.getElementById('admin-form');
  const msgEl = document.getElementById('admin-message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const matchId = form.matchId.value;
    const score1  = form.score1.value;
    const score2  = form.score2.value;

    try {
      const res = await fetch(`${API}/api/matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score1: Number(score1), score2: Number(score2) }),
      });
      const data = await res.json();

      if (res.ok) {
        showMessage(msgEl, `Match #${matchId} updated! Winner: ${data.match.winner}`, 'success');
        form.reset();
        // Refresh results list if visible
        if (document.getElementById('results-container')) initResultsPage();
      } else {
        showMessage(msgEl, data.error, 'error');
      }
    } catch {
      showMessage(msgEl, 'Server error. Is the backend running?', 'error');
    }
  });
}

// ============================================================
//  Shared helpers
// ============================================================

/** Build an HTML match card */
function buildMatchCard(m, showResult) {
  const statusClass = m.status === 'completed' ? 'completed' : 'upcoming';

  let scoreHtml = '';
  let winnerHtml = '';

  if (m.status === 'completed') {
    const s1Class = m.score1 > m.score2 ? 'win' : m.score1 < m.score2 ? 'lose' : 'draw';
    const s2Class = m.score2 > m.score1 ? 'win' : m.score2 < m.score1 ? 'lose' : 'draw';
    scoreHtml = `<div class="match-score"><span class="${s1Class}">${m.score1}</span> — <span class="${s2Class}">${m.score2}</span></div>`;

    if (m.winner && m.winner !== 'draw') {
      winnerHtml = `<div class="match-winner">Winner: ${escapeHtml(m.winner)}</div>`;
    } else if (m.winner === 'draw') {
      winnerHtml = `<div class="match-winner" style="color:var(--clr-gold)">Draw</div>`;
    }
  }

  return `
    <div class="match-card ${statusClass}">
      <div class="match-header">
        <span class="match-id">Match #${m.id}</span>
        <span class="match-status ${statusClass}">${m.status.toUpperCase()}</span>
      </div>
      <div class="match-players">
        <div class="match-player">
          <div class="name">${escapeHtml(m.player1)}</div>
          <div class="team">${escapeHtml(m.player1Team)}</div>
        </div>
        <span class="match-vs">VS</span>
        <div class="match-player">
          <div class="name">${escapeHtml(m.player2)}</div>
          <div class="team">${escapeHtml(m.player2Team)}</div>
        </div>
      </div>
      ${scoreHtml}
      <div class="match-meta">${m.date} at ${m.time}</div>
      ${winnerHtml}
    </div>`;
}

/** Display a form message */
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = 'form-message ' + type;
}

/** Prevent XSS when injecting dynamic content */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
