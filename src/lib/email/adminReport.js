import nodemailer from 'nodemailer'
import { getDb } from '@/lib/mongodb'
import { renderAdminReportEmail } from './templates/adminReport.js'

// ---------------------------------------------------------------------------
// Transporter
// ---------------------------------------------------------------------------
function createTransporter() {
  const smtpHost = process.env.SMTP_HOST
  const smtpPort = Number(process.env.SMTP_PORT || 0)
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS

  if (smtpHost) {
    const port = smtpPort || 587
    return nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    })
  }

  if (!smtpUser || !smtpPass) {
    throw new Error('Email credentials missing (EMAIL_USER/EMAIL_PASS or SMTP_*)')
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  })
}

// ---------------------------------------------------------------------------
// Stats aggregation
// ---------------------------------------------------------------------------

/**
 * Returns the UTC start of `n` weeks ago (Monday 00:00:00 UTC).
 */
function weekStart(weeksAgo = 1) {
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0=Sun … 6=Sat
  const daysToLastMonday = ((dayOfWeek + 6) % 7) + (weeksAgo - 1) * 7
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToLastMonday)
  )
  return start
}

/**
 * Fetches marketplace performance statistics for the previous calendar week.
 *
 * @returns {Promise<{
 *   weekStart: string,
 *   weekEnd: string,
 *   totalSales: number,
 *   totalRevenue: number,
 *   newRegistrations: number,
 *   activeListings: number,
 *   newMaterials: number,
 * }>}
 */
export async function fetchWeeklyStats() {
  const db = await getDb()
  const start = weekStart(1)
  const end = weekStart(0) // start of current week = end of last week

  const [salesResult, registrations, activeListings, newMaterials] = await Promise.all([
    // Total completed purchases + revenue in the window
    db.collection('purchases').aggregate([
      { $match: { createdAt: { $gte: start.toISOString(), $lt: end.toISOString() }, status: 'completed' } },
      { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: { $toDouble: '$price' } } } },
    ]).toArray(),

    // New user registrations
    db.collection('users').countDocuments({
      createdAt: { $gte: start.toISOString(), $lt: end.toISOString() },
    }),

    // Active material listings (all time, currently active)
    db.collection('materials').countDocuments({ visibility: 'public', status: { $ne: 'removed' } }),

    // Materials uploaded in the window
    db.collection('materials').countDocuments({
      createdAt: { $gte: start.toISOString(), $lt: end.toISOString() },
    }),
  ])

  const salesData = salesResult[0] || { count: 0, revenue: 0 }

  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    totalSales: salesData.count,
    totalRevenue: Number(salesData.revenue.toFixed(2)),
    newRegistrations: registrations,
    activeListings,
    newMaterials,
  }
}


// ---------------------------------------------------------------------------
// Send report
// ---------------------------------------------------------------------------

/**
 * Sends the weekly stats email to all configured admin addresses.
 *
 * @param {object} [overrideStats] - Optional pre-fetched stats (useful in tests).
 * @returns {Promise<{ delivered: string[], stats: object }>}
 */
export async function sendWeeklyAdminReport(overrideStats) {
  const adminEmails = (process.env.ADMIN_REPORT_EMAILS || process.env.EMAIL_USER || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean)

  if (adminEmails.length === 0) {
    throw new Error('No admin email addresses configured (set ADMIN_REPORT_EMAILS)')
  }

  const stats = overrideStats || (await fetchWeeklyStats())
  const transporter = createTransporter()
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@scholarmarket.local'
  const { subject, text, html } = renderAdminReportEmail(stats)

  try {
    await transporter.sendMail({
      from,
      to: adminEmails.join(', '),
      subject,
      text: buildReportText(stats),
      html: buildReportHtml(stats),
    })
  await transporter.sendMail({
    from,
    to: adminEmails.join(', '),
    subject,
    text,
    html,
  })

    return { delivered: adminEmails, stats }
  } catch (err) {
    console.error('[email:adminReport] Failed to send weekly admin report:', err)
    return { delivered: [], stats, error: err instanceof Error ? err.message : String(err) }
  }
}
