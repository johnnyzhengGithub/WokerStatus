const { dashboardData } = require('./lib/store');

module.exports = (req, res) => {
  if (req.method && req.method !== 'GET') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(200).send(JSON.stringify(dashboardData()));
};
