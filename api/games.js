const { getGames } = require('./lib/store');

module.exports = (req, res) => {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  return res.status(200).json({ games: getGames() });
};
