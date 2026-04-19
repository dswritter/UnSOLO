import { getResend } from './client'

/** Verified sender in Resend (e.g. hello@unsolo.in). Dev fallback uses Resend’s test domain until unsolo.in is verified. */
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ??
  (process.env.NODE_ENV === 'production' ? 'hello@unsolo.in' : 'onboarding@resend.dev')
const ADMIN_EMAIL = 'hello@unsolo.in'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Join request approved (pay on trip page) ─────────────────

export interface JoinRequestApprovedEmailInput {
  travelerEmail: string
  /** Greeting; falls back to "there" */
  travelerName?: string | null
  hostName: string
  tripTitle: string
  /** Absolute URL to /packages/[slug] */
  packageUrl: string
  paymentDeadlineHours: number
  /** Human-readable deadline, e.g. "19 Apr 2026, 5:30 pm" */
  paymentDeadlineLabel: string
}

export async function sendJoinRequestApprovedEmail(details: JoinRequestApprovedEmailInput) {
  const {
    travelerEmail,
    travelerName,
    hostName,
    tripTitle,
    packageUrl,
    paymentDeadlineHours,
    paymentDeadlineLabel,
  } = details

  const to = travelerEmail.trim()
  if (!to) {
    throw new Error('Traveler email is empty')
  }

  const greeting = (travelerName && travelerName.trim()) || 'there'
  const safeTitle = escapeHtml(tripTitle)
  const safeHost = escapeHtml(hostName)
  const safeDeadlineLabel = escapeHtml(paymentDeadlineLabel)
  const safeUrl = packageUrl.replace(/"/g, '&quot;')

  const result = await getResend().emails.send({
    from: `UnSOLO <${FROM_EMAIL}>`,
    to,
    subject: `You're approved — complete payment for ${tripTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #FFAA00; margin: 0; font-size: 28px;">UN<span style="color: #fff;">SOLO</span></h1>
        </div>
        <h2 style="color: #FFAA00; text-align: center;">Request approved</h2>
        <p style="color: #ccc; text-align: center;">Hey ${escapeHtml(greeting)},</p>
        <p style="color: #ddd; text-align: center; line-height: 1.5;">
          <strong style="color: #fff;">${safeHost}</strong> approved your request to join <strong style="color: #FFAA00;">${safeTitle}</strong>.
        </p>

        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #333;">
          <p style="color: #ddd; margin: 8px 0;"><strong style="color: #FFAA00;">Pay within ${paymentDeadlineHours} hours</strong></p>
          <p style="color: #aaa; margin: 8px 0; font-size: 14px;">Complete payment by: <strong style="color: #fff;">${safeDeadlineLabel}</strong></p>
        </div>

        <p style="color: #ccc; font-size: 14px; line-height: 1.5;">
          Open your trip page while signed in, then use <strong>Proceed to payment</strong> to pay securely with Razorpay.
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${safeUrl}" style="display: inline-block; background: #FFAA00; color: #000; font-weight: bold; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px;">Go to trip &amp; pay</a>
        </div>

        <p style="color: #888; font-size: 12px; text-align: center; word-break: break-all;">Or copy this link:<br /><a href="${safeUrl}" style="color: #FFAA00;">${escapeHtml(packageUrl)}</a></p>

        <p style="color: #888; font-size: 12px; margin-top: 32px; text-align: center;">Questions? <a href="mailto:hello@unsolo.in" style="color: #FFAA00;">hello@unsolo.in</a></p>
        <p style="color: #555; text-align: center; margin-top: 24px; font-size: 11px;">— Team UnSOLO</p>
      </div>
    `,
  })

  if (result.error) {
    const msg =
      typeof result.error === 'object' &&
      result.error !== null &&
      'message' in result.error &&
      typeof (result.error as { message: unknown }).message === 'string'
        ? (result.error as { message: string }).message
        : JSON.stringify(result.error)
    throw new Error(`Resend: ${msg}`)
  }
}

interface CustomRequestDetails {
  packageTitle: string
  requestedDate: string
  guests: number
  contactNumber: string
  contactEmail: string
}

export async function sendAdminNotification(details: CustomRequestDetails) {
  const { packageTitle, requestedDate, guests, contactNumber, contactEmail } = details

  await getResend().emails.send({
    from: `UnSOLO <${FROM_EMAIL}>`,
    to: ADMIN_EMAIL,
    subject: `New Custom Date Request — ${packageTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FFAA00;">New Custom Date Request</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; font-weight: bold;">Package</td><td style="padding: 8px;">${packageTitle}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Requested Date</td><td style="padding: 8px;">${requestedDate}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Guests</td><td style="padding: 8px;">${guests}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;">${contactNumber}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;"><a href="mailto:${contactEmail}">${contactEmail}</a></td></tr>
        </table>
        <p style="color: #888; margin-top: 24px;">— UnSOLO System</p>
      </div>
    `,
  })
}

export async function sendUserConfirmation(details: CustomRequestDetails) {
  const { packageTitle, requestedDate, guests, contactEmail } = details

  await getResend().emails.send({
    from: `UnSOLO <${FROM_EMAIL}>`,
    to: contactEmail,
    subject: `Your Custom Date Request — ${packageTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FFAA00;">We received your request!</h2>
        <p>Thanks for your interest in <strong>${packageTitle}</strong>. Here's what we have:</p>
        <ul>
          <li><strong>Preferred Date:</strong> ${requestedDate}</li>
          <li><strong>Guests:</strong> ${guests}</li>
        </ul>
        <p>Our team will review availability and get back to you within <strong>24–48 hours</strong>.</p>
        <p style="color: #888; margin-top: 24px;">— Team UnSOLO</p>
      </div>
    `,
  })
}

// ── Booking Confirmation Email ───────────────────────────────

interface BookingConfirmationDetails {
  customerEmail: string
  customerName: string
  packageTitle: string
  destination: string
  travelDate: string
  /** Last day of trip (YYYY-MM-DD) */
  returnDateIso: string
  guests: number
  totalAmount: number
  confirmationCode: string
  /** e.g. "4 days · 3 nights" */
  durationSummary: string
}

export async function sendBookingConfirmation(details: BookingConfirmationDetails) {
  const {
    customerEmail, customerName, packageTitle, destination,
    travelDate, returnDateIso, guests, totalAmount, confirmationCode, durationSummary,
  } = details

  const formattedAmount = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(totalAmount / 100)

  const departDate = new Date(travelDate + 'T12:00:00')
  const returnDate = new Date(returnDateIso + 'T12:00:00')

  const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  await getResend().emails.send({
    from: `UnSOLO <${FROM_EMAIL}>`,
    to: customerEmail,
    subject: `Booking Confirmed! 🎉 ${packageTitle} — #${confirmationCode}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #FFAA00; margin: 0; font-size: 28px;">UN<span style="color: #fff;">SOLO</span></h1>
        </div>
        <h2 style="color: #FFAA00; text-align: center;">Booking Confirmed! 🎉</h2>
        <p style="color: #ccc; text-align: center;">Hey ${customerName}, your adventure is booked!</p>

        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #333;">
          <table style="width: 100%; border-collapse: collapse; color: #ddd;">
            <tr><td style="padding: 10px 8px; font-weight: bold; color: #FFAA00;">Confirmation Code</td><td style="padding: 10px 8px; font-size: 18px; font-weight: bold; letter-spacing: 2px;">${confirmationCode}</td></tr>
            <tr style="border-top: 1px solid #333;"><td style="padding: 10px 8px; font-weight: bold;">Package</td><td style="padding: 10px 8px;">${packageTitle}</td></tr>
            <tr style="border-top: 1px solid #333;"><td style="padding: 10px 8px; font-weight: bold;">Destination</td><td style="padding: 10px 8px;">${destination}</td></tr>
            <tr style="border-top: 1px solid #333;"><td style="padding: 10px 8px; font-weight: bold;">Departure</td><td style="padding: 10px 8px;">${fmtDate(departDate)}</td></tr>
            <tr style="border-top: 1px solid #333;"><td style="padding: 10px 8px; font-weight: bold;">Return</td><td style="padding: 10px 8px;">${fmtDate(returnDate)}</td></tr>
            <tr style="border-top: 1px solid #333;"><td style="padding: 10px 8px; font-weight: bold;">Duration</td><td style="padding: 10px 8px;">${durationSummary}</td></tr>
            <tr style="border-top: 1px solid #333;"><td style="padding: 10px 8px; font-weight: bold;">Guests</td><td style="padding: 10px 8px;">${guests}</td></tr>
            <tr style="border-top: 1px solid #333;"><td style="padding: 10px 8px; font-weight: bold; color: #FFAA00;">Total Paid</td><td style="padding: 10px 8px; font-weight: bold; color: #FFAA00; font-size: 18px;">${formattedAmount}</td></tr>
          </table>
        </div>

        <div style="text-align: center; margin-top: 24px;">
          <p style="color: #ccc;">A trip coordinator will be assigned shortly and will reach out to you with next steps.</p>
          <p style="color: #888; font-size: 12px; margin-top: 32px;">Need help? Contact us at <a href="mailto:hello@unsolo.in" style="color: #FFAA00;">hello@unsolo.in</a></p>
        </div>
        <p style="color: #555; text-align: center; margin-top: 24px; font-size: 11px;">— Team UnSOLO</p>
      </div>
    `,
  })
}

// ── POC Details Email ────────────────────────────────────────

interface POCDetailsInput {
  customerEmail: string
  customerName: string
  packageTitle: string
  confirmationCode: string
  travelDate: string
  pocName: string
  pocUsername: string
}

export async function sendPOCDetails(details: POCDetailsInput) {
  const { customerEmail, customerName, packageTitle, confirmationCode, travelDate, pocName, pocUsername } = details

  await getResend().emails.send({
    from: `UnSOLO <${FROM_EMAIL}>`,
    to: customerEmail,
    subject: `Your Trip Coordinator — ${packageTitle}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #fff; padding: 32px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #FFAA00; margin: 0; font-size: 28px;">UN<span style="color: #fff;">SOLO</span></h1>
        </div>
        <h2 style="color: #FFAA00; text-align: center;">Meet Your Trip Coordinator! 👋</h2>
        <p style="color: #ccc; text-align: center;">Hey ${customerName}, here are the details for your upcoming trip.</p>

        <div style="background: #1a1a1a; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #333;">
          <p style="color: #ddd; margin: 8px 0;"><strong>Booking:</strong> #${confirmationCode}</p>
          <p style="color: #ddd; margin: 8px 0;"><strong>Package:</strong> ${packageTitle}</p>
          <p style="color: #ddd; margin: 8px 0;"><strong>Travel Date:</strong> ${new Date(travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        </div>

        <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #333; text-align: center;">
          <p style="color: #FFAA00; font-weight: bold; font-size: 16px; margin-bottom: 8px;">Your Point of Contact</p>
          <p style="color: #fff; font-size: 20px; font-weight: bold; margin: 4px 0;">${pocName}</p>
          <p style="color: #aaa; margin: 4px 0;">@${pocUsername}</p>
          <p style="color: #ccc; margin-top: 12px; font-size: 14px;">They will reach out to you before your trip with all the details you need.</p>
        </div>

        <p style="color: #888; text-align: center; font-size: 12px; margin-top: 32px;">Need help? Contact us at <a href="mailto:hello@unsolo.in" style="color: #FFAA00;">hello@unsolo.in</a></p>
        <p style="color: #555; text-align: center; margin-top: 24px; font-size: 11px;">— Team UnSOLO</p>
      </div>
    `,
  })
}
