const { dashboardData } = require('./lib/store');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).send(JSON.stringify(dashboardData()));
};
