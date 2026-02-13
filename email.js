const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const SENDER = process.env.SENDER_EMAIL || 'Crypto Alerter <onboarding@resend.dev>';
const RECIPIENT = process.env.RECIPIENT_EMAIL || 'steveflanagan@protonmail.com';

async function sendPriceAlert(alert, currentPrice) {
  const direction = alert.direction === 'above' ? 'risen above' : 'fallen below';
  const tokenLabel = alert.token_name || alert.token_address;
  const timestamp = new Date().toUTCString();

  try {
    console.log(`[email] Sending alert for ${tokenLabel} — from: ${SENDER}, to: ${RECIPIENT}`);
    const { data, error } = await resend.emails.send({
      from: SENDER,
      to: RECIPIENT,
      subject: `Price Alert: ${tokenLabel} is now $${currentPrice.toFixed(4)}`,
      html: `
        <h2>Price Alert Triggered</h2>
        <p><strong>${tokenLabel}</strong> on <strong>${alert.chain}</strong> has ${direction} your threshold.</p>
        <table style="border-collapse:collapse;">
          <tr><td style="padding:4px 12px;font-weight:bold;">Current Price</td><td style="padding:4px 12px;">$${currentPrice.toFixed(6)}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold;">Threshold</td><td style="padding:4px 12px;">$${alert.threshold_price}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold;">Direction</td><td style="padding:4px 12px;">${alert.direction}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold;">Chain</td><td style="padding:4px 12px;">${alert.chain}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold;">Token Address</td><td style="padding:4px 12px;">${alert.token_address}</td></tr>
          <tr><td style="padding:4px 12px;font-weight:bold;">Time</td><td style="padding:4px 12px;">${timestamp}</td></tr>
        </table>
      `,
    });
    if (error) {
      console.error(`[email] Resend API error:`, error);
      return false;
    }
    console.log(`[email] Alert sent for ${tokenLabel} at $${currentPrice.toFixed(4)} (id: ${data?.id})`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send alert:`, err);
    return false;
  }
}

module.exports = { sendPriceAlert };
