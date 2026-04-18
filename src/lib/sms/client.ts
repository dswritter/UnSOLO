// ── SMS Gateway ─────────────────────────────────────────────
// Priority: TWOFACTOR_API_KEY (2factor.in) → MSG91 → console fallback (dev).
// `message` is the OTP digits for host phone verification.
//
// Use process.env['NAME'] (not dot access) so Next does not inline values at
// build time; Vercel runtime env must be read when the function runs.

type TwoFactorSendResponse = { Status?: string; Details?: string }

function env(name: string): string | undefined {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : undefined
}

export async function sendSMS(phone: string, message: string): Promise<{ success: boolean; error?: string; devConsoleOnly?: boolean }> {
  const twoFactorKey = env('TWOFACTOR_API_KEY')
  const authKey = env('MSG91_AUTH_KEY')
  const templateId = env('MSG91_TEMPLATE_ID')
  const senderId = env('MSG91_SENDER_ID') || 'UNSOLO'

  if (twoFactorKey) {
    try {
      const path = `/API/V1/${encodeURIComponent(twoFactorKey)}/SMS/91${encodeURIComponent(phone)}/${encodeURIComponent(message)}`
      const response = await fetch(`https://2factor.in${path}`, { method: 'POST' })
      const data = (await response.json()) as TwoFactorSendResponse

      if (data.Status === 'Success') {
        return { success: true }
      }

      console.error('[SMS] 2factor.in response:', data)
      return {
        success: false,
        error: data.Details || `SMS send failed (HTTP ${response.status})`,
      }
    } catch (err) {
      console.error('SMS send error:', err)
      return { success: false, error: 'SMS service unavailable' }
    }
  }

  // No provider key: local/dev — OTP only in server logs (never claim SMS was delivered)
  if (!authKey) {
    console.log(`[SMS FALLBACK] To: +91${phone} | OTP/message: ${message}`)
    return { success: true, devConsoleOnly: true }
  }

  if (!templateId) {
    console.error('[SMS] MSG91_AUTH_KEY is set but MSG91_TEMPLATE_ID is missing — SMS will not send.')
    return {
      success: false,
      error: 'SMS is not configured (missing MSG91_TEMPLATE_ID). Add it in Vercel/host env or use console fallback by removing MSG91_AUTH_KEY in dev.',
    }
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

    const data = (await response.json()) as { type?: string; message?: string }

    if (data.type === 'success') {
      return { success: true }
    }

    console.error('[SMS] MSG91 response:', data)
    return { success: false, error: data.message || `SMS send failed (HTTP ${response.status})` }
  } catch (err) {
    console.error('SMS send error:', err)
    return { success: false, error: 'SMS service unavailable' }
  }
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
