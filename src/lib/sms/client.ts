// ── SMS Gateway ─────────────────────────────────────────────
// Uses MSG91 for India (cheap, reliable). Easy to swap to Twilio later.
// For MVP/testing: if no MSG91 keys, logs OTP to console.

export async function sendSMS(phone: string, message: string): Promise<{ success: boolean; error?: string }> {
  const authKey = process.env.MSG91_AUTH_KEY
  const templateId = process.env.MSG91_TEMPLATE_ID
  const senderId = process.env.MSG91_SENDER_ID || 'UNSOLO'

  // MVP fallback: log to console if no SMS provider configured
  if (!authKey) {
    console.log(`[SMS FALLBACK] To: +91${phone} | Message: ${message}`)
    return { success: true }
  }

  try {
    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        sender: senderId,
        short_url: '0',
        mobiles: `91${phone}`,
        VAR1: message, // OTP code placeholder in MSG91 template
      }),
    })

    const data = await response.json()

    if (data.type === 'success') {
      return { success: true }
    }

    return { success: false, error: data.message || 'SMS send failed' }
  } catch (err) {
    console.error('SMS send error:', err)
    return { success: false, error: 'SMS service unavailable' }
  }
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
