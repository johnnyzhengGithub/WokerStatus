const { updatePresence } = require('../lib/store');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const result = updatePresence(req.body || {});
  if (result.error) return res.status(400).json(result);
  return res.status(200).json(result);
};
