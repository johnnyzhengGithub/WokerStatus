async function fetchGames() {
  try {
    const res = await fetch('/api/games');
    if (!res.ok) return;
    const data = await res.json();
    renderGames(data.games || []);
  } catch (e) {
    console.error('Failed to load games', e);
  }
}

function renderGames(games) {
  const grid = document.getElementById('games-grid');
  if (!grid) return;

  grid.innerHTML = '';

  if (!games.length) {
    grid.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">No mini games released yet. Keep the dashboard running and let the team ship the first one.</p>';
    return;
  }

  games.forEach(game => {
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-card__accent"></div>
      <h3>${game.name}</h3>
      <ul>
        <li>${game.description || 'Mini game from internal pipeline.'}</li>
        <li>Project: ${game.project}</li>
        <li>Status: ${game.status}</li>
      </ul>
      <a href="${game.download_url || '#'}" class="product-card__link">Download / Play</a>
    `;
    grid.appendChild(card);
  });
}

window.addEventListener('DOMContentLoaded', fetchGames);

