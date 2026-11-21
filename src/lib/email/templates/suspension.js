import { appUrl, escapeHtml, renderEmailLayout, renderTextFooter } from "./layout.js";

const DEFAULT_REASON = "Violation of ScholarMarket community guidelines or terms of service.";

function supportEmail(appealEmail) {
  return appealEmail || process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER || "support@scholarmarket.local";
}

/** Account suspension notice (transactional: no unsubscribe link). */
export function renderSuspensionEmail({ name, reason, appealEmail }, { year = new Date().getUTCFullYear() } = {}) {
  const support = supportEmail(appealEmail);
  const termsUrl = `${appUrl()}/terms`;
  const shownReason = reason || DEFAULT_REASON;

  const contentHtml = `
    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#111827;">Your account has been suspended</h1>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;">We've temporarily suspended access to your ScholarMarket account. Here's why:</p>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:12px 16px;margin:0 0 20px 0;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:#7f1d1d;">${escapeHtml(shownReason)}</p>
    </div>
    <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#111827;">What this means:</p>
    <ul style="margin:0 0 20px 0;padding-left:20px;">
      <li style="font-size:14px;line-height:1.8;color:#374151;">You cannot log in to your account while it is suspended.</li>
      <li style="font-size:14px;line-height:1.8;color:#374151;">Your published materials will be unlisted for the duration of the suspension.</li>
      <li style="font-size:14px;line-height:1.8;color:#374151;">Pending payouts may be placed on hold.</li>
    </ul>
    <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#111827;">How to appeal:</p>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#374151;">
      If you believe this action was taken in error, you can appeal by replying to this email or contacting us at
      <a href="mailto:${escapeHtml(support)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(support)}</a>.
      Please include your account email address and a brief explanation.
    </p>
    <p style="margin:0 0 8px 0;font-size:14px;font-weight:600;color:#111827;">Our guidelines:</p>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#374151;">
      You can read our full community guidelines and terms of service at
      <a href="${escapeHtml(termsUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(termsUrl)}</a>.
    </p>`;

  const text = [
    `Hi ${name},`,
    "",
    "Your ScholarMarket account has been suspended.",
    "",
    `Reason: ${shownReason}`,
    "",
    "What this means:",
    "- You cannot log in while your account is suspended.",
    "- Your published materials will be unlisted for the duration of the suspension.",
    "- Pending payouts may be placed on hold.",
    "",
    "How to appeal:",
    `Reply to this email or contact us at ${support}. Please include your account`,
    "email address and a brief explanation if you believe this is an error.",
    "",
    `Community guidelines: ${termsUrl}`,
    "",
    renderTextFooter({ year }),
  ].join("\n");

  return {
    subject: "Important: Your ScholarMarket account has been suspended",
    text,
    html: renderEmailLayout({
      title: "Your ScholarMarket Account Has Been Suspended",
      banner: { color: "#dc2626", label: "Account Notice" },
      footerNote: "You're receiving this because your ScholarMarket account status changed.",
      contentHtml,
      year,
    }),
  };
}

/** Account reactivation notice (transactional: no unsubscribe link). */
export function renderReactivationEmail({ name }, { year = new Date().getUTCFullYear() } = {}) {
  const dashboardUrl = `${appUrl()}/dashboard`;
  const termsUrl = `${appUrl()}/terms`;

  const contentHtml = `
    <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#111827;">Your account has been reactivated</h1>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#374151;">Good news — your ScholarMarket account has been fully reinstated. You can now log in and access all features as normal.</p>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#374151;">
      Please review our community guidelines to ensure continued access:
      <a href="${escapeHtml(termsUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(termsUrl)}</a>.
    </p>
    <p style="margin:0 0 24px 0;">
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:600;font-size:14px;">Go to your dashboard</a>
    </p>`;

  const text = [
    `Hi ${name},`,
    "",
    "Your ScholarMarket account has been fully reinstated.",
    "You can now log in and access all features as normal.",
    "",
    `Please review our guidelines to ensure continued access: ${termsUrl}`,
    "",
    renderTextFooter({ year }),
  ].join("\n");

  return {
    subject: "Good news: Your ScholarMarket account has been reactivated",
    text,
    html: renderEmailLayout({
      title: "Your ScholarMarket Account Has Been Reactivated",
      banner: { color: "#16a34a", label: "Account Restored" },
      contentHtml,
      year,
    }),
  };
}
