const db = require('./db');
const { getSolanaPrices, getEthereumPrice } = require('./price');
const { sendPriceAlert } = require('./email');

const POLL_INTERVAL = 60_000; // 60 seconds
const COOLDOWN = 3600; // 1 hour in seconds

function isThresholdCrossed(price, threshold, direction) {
  if (direction === 'above') return price >= threshold;
  if (direction === 'below') return price <= threshold;
  return false;
}

function isCooldownElapsed(lastNotifiedAt) {
  if (!lastNotifiedAt) return true;
  const now = Math.floor(Date.now() / 1000);
  return now - lastNotifiedAt >= COOLDOWN;
}

async function checkAlerts() {
  const alerts = db.getActiveAlerts();
  if (alerts.length === 0) {
    console.log('[monitor] No active alerts');
    return;
  }

  const solanaAlerts = alerts.filter((a) => a.chain === 'solana');
  const ethereumAlerts = alerts.filter((a) => a.chain === 'ethereum');

  // Batch fetch Solana prices
  const solanaMints = [...new Set(solanaAlerts.map((a) => a.token_address))];
  let solanaPrices = {};
  if (solanaMints.length > 0) {
    try {
      solanaPrices = await getSolanaPrices(solanaMints);
      console.log('[monitor] Solana prices:', solanaPrices);
    } catch (err) {
      console.error('[monitor] Solana price fetch error:', err.message);
    }
  }

  // Process Solana alerts
  for (const alert of solanaAlerts) {
    const price = solanaPrices[alert.token_address];
    if (price == null) continue;
    db.updateLastPrice(alert.id, price);

    if (isThresholdCrossed(price, alert.threshold_price, alert.direction) && isCooldownElapsed(alert.last_notified_at)) {
      console.log(`[monitor] Threshold crossed for alert #${alert.id}: $${price}`);
      const sent = await sendPriceAlert(alert, price);
      if (sent) db.updateLastNotified(alert.id, Math.floor(Date.now() / 1000));
    }
  }

  // Fetch Ethereum prices one by one
  const seenEthTokens = new Map();
  for (const alert of ethereumAlerts) {
    const addr = alert.token_address.toLowerCase();
    let price;
    if (seenEthTokens.has(addr)) {
      price = seenEthTokens.get(addr);
    } else {
      try {
        price = await getEthereumPrice(alert.token_address);
        seenEthTokens.set(addr, price);
        console.log(`[monitor] Ethereum price for ${alert.token_name || alert.token_address}: $${price}`);
      } catch (err) {
        console.error(`[monitor] Ethereum price fetch error for ${alert.token_address}:`, err.message);
        continue;
      }
    }

    if (price == null) continue;
    db.updateLastPrice(alert.id, price);

    if (isThresholdCrossed(price, alert.threshold_price, alert.direction) && isCooldownElapsed(alert.last_notified_at)) {
      console.log(`[monitor] Threshold crossed for alert #${alert.id}: $${price}`);
      const sent = await sendPriceAlert(alert, price);
      if (sent) db.updateLastNotified(alert.id, Math.floor(Date.now() / 1000));
    }
  }
}

function start() {
  console.log('[monitor] Starting price monitor (60s interval)');
  // Run immediately on start
  checkAlerts().catch((err) => console.error('[monitor] Check error:', err));
  // Then every 60 seconds
  setInterval(() => {
    checkAlerts().catch((err) => console.error('[monitor] Check error:', err));
  }, POLL_INTERVAL);
}

module.exports = { start };
