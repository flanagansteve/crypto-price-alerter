require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');
const { getSolanaPrices, getEthereumPrice } = require('./price');
const monitor = require('./monitor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---

app.get('/api/alerts', (req, res) => {
  const alerts = db.getAllAlerts();
  res.json(alerts);
});

app.post('/api/alerts', async (req, res) => {
  const { chain, token_address, threshold_price, direction } = req.body;

  if (!chain || !token_address || threshold_price == null || !direction) {
    return res.status(400).json({ error: 'Missing required fields: chain, token_address, threshold_price, direction' });
  }

  if (!['solana', 'ethereum'].includes(chain)) {
    return res.status(400).json({ error: 'Chain must be "solana" or "ethereum"' });
  }

  if (!['above', 'below'].includes(direction)) {
    return res.status(400).json({ error: 'Direction must be "above" or "below"' });
  }

  const price = parseFloat(threshold_price);
  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: 'Threshold price must be a positive number' });
  }

  // Resolve token name
  let tokenName = null;
  try {
    if (chain === 'solana') {
      const prices = await getSolanaPrices([token_address]);
      if (prices[token_address] != null) {
        tokenName = token_address.slice(0, 8) + '...';
      }
    } else {
      const ethPrice = await getEthereumPrice(token_address);
      if (ethPrice != null) {
        tokenName = token_address.slice(0, 8) + '...';
      }
    }
  } catch (err) {
    console.warn('[server] Could not resolve token name:', err.message);
  }

  const alert = db.createAlert(chain, token_address, tokenName, price, direction);
  res.status(201).json(alert);
});

app.delete('/api/alerts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid alert ID' });

  const alert = db.getAlertById(id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });

  db.deleteAlert(id);
  res.json({ success: true });
});

// --- Start ---

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  monitor.start();
});
