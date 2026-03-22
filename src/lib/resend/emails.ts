import { resend } from './client'

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
const ADMIN_EMAIL = 'unsolo.in@gmail.com'

interface CustomRequestDetails {
  packageTitle: string
  requestedDate: string
  guests: number
  contactNumber: string
  contactEmail: string
}

export async function sendAdminNotification(details: CustomRequestDetails) {
  const { packageTitle, requestedDate, guests, contactNumber, contactEmail } = details

  await resend.emails.send({
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

  await resend.emails.send({
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
