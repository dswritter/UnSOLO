// ── SMS Gateway ─────────────────────────────────────────────
// Priority: TWOFACTOR_API_KEY (2factor.in) → MSG91 → console fallback (dev).
// `message` is the OTP digits for host phone verification.
//
// 2factor.in (see https://2factor.in/API/DOCS/SMS_OTP.html and 2factor-node sendOTP):
// - SMS:  POST .../API/V1/{key}/SMS/{phone}/{otp}
// - {phone} must be **10 digits only** (no leading 91). A 91 prefix in the path can mis-route delivery.
// - Voice (different): .../VOICE/... — we only call /SMS/...
// - If your account uses an approved OTP *template* (e.g. login_otp), use the
//   manual-OTP + template path: .../SMS/{phone}/{otp}/{template_name}
//   Set TWOFACTOR_OTP_TEMPLATE=login_otp (exact name from the 2factor panel).
// - Do NOT use AUTOGEN here: AUTOGEN makes 2factor generate the OTP; we already
//   generate OTP server-side and verify in Supabase. AUTOGEN would require their
//   verify API and a different flow.
//
// Use process.env['NAME'] (not dot access) so Next does not inline values at
// build time; Vercel runtime env must be read when the function runs.

type TwoFactorSendResponse = { Status?: string; Details?: string }

/** 2factor OTP URLs expect a 10-digit Indian mobile only (no country code in path). */
function twoFactorSmsPhoneSegment(phone: string): string {
  let d = phone.replace(/\D/g, '')
  if (d.startsWith('91') && d.length === 12) d = d.slice(2)
  if (d.length !== 10) d = phone.replace(/\D/g, '')
  return encodeURIComponent(d)
}

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
      const template = env('TWOFACTOR_OTP_TEMPLATE')
      const phoneSeg = twoFactorSmsPhoneSegment(phone)
      const otpSeg = encodeURIComponent(message)
      const path = template
        ? `/API/V1/${encodeURIComponent(twoFactorKey)}/SMS/${phoneSeg}/${otpSeg}/${encodeURIComponent(template)}`
        : `/API/V1/${encodeURIComponent(twoFactorKey)}/SMS/${phoneSeg}/${otpSeg}`
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
