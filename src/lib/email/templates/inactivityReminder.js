import { appUrl, escapeHtml, renderEmailLayout, renderTextFooter } from "./layout.js";
import { buildUnsubscribeUrl, UNSUBSCRIBE_CATEGORIES } from "./unsubscribe.js";

/** Renders the creator inactivity reminder with a one-click unsubscribe link. */
export function renderInactivityReminderEmail({ to, name, inactiveDays, stats }, { year = new Date().getFullYear() } = {}) {
  const dashboardUrl = `${appUrl()}/dashboard`;
  const profileUrl = `${appUrl()}/profile`;
  const unsubscribeUrl = buildUnsubscribeUrl({ email: to, category: UNSUBSCRIBE_CATEGORIES.REMINDERS });

  const relevanceNote = stats.demotedCount > 0
    ? `${stats.demotedCount} of your ${stats.materialCount} catalog item(s) have been marked as low-relevance and may not appear in marketplace search results.`
    : `You have ${stats.materialCount} published item(s). If your profile stays inactive, items may be flagged as low-relevance.`;

  const flaggedStat = stats.demotedCount > 0
    ? `<td style="width:8px;"></td>
       <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;">
         <p style="margin:0 0 4px 0;font-size:12px;text-transform:uppercase;color:#6b7280;">Low-relevance flagged</p>
         <p style="margin:0;font-size:20px;font-weight:700;color:#dc2626;">${escapeHtml(stats.demotedCount)}</p>
       </td>`
    : "";

  const contentHtml = `
    <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">Your catalog needs attention</h1>
    <p class="muted" style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#6b7280;">
      Hi ${escapeHtml(name)}, your ScholarMarket profile has been inactive for <strong>${escapeHtml(inactiveDays)} days</strong>.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">
      <tr>
        <td style="background:#f0f4ff;border:1px solid #e0e7ff;border-radius:8px;padding:12px 16px;">
          <p style="margin:0 0 4px 0;font-size:12px;text-transform:uppercase;color:#6b7280;">Catalog items</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#111827;">${escapeHtml(stats.materialCount)}</p>
        </td>
        ${flaggedStat}
      </tr>
    </table>
    <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#111827;">${escapeHtml(relevanceNote)}</p>
    <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#111827;">To keep your catalog visible:</p>
    <ol style="margin:0 0 16px 0;padding-left:20px;font-size:14px;line-height:1.8;color:#374151;">
      <li>Log in and review your published materials</li>
      <li>Update descriptions, pricing, or thumbnails</li>
      <li>Publish new content to signal active stewardship</li>
    </ol>
    <p style="margin:20px 0;">
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:600;font-size:14px;">Go to your dashboard</a>
    </p>
    <p class="muted" style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
      If you no longer plan to maintain your catalog, consider unpublishing your materials to keep the marketplace high-quality.
    </p>`;

  const text = [
    `Hi ${name},`,
    "",
    `Your ScholarMarket profile has been inactive for ${inactiveDays} days.`,
    "",
    relevanceNote,
    "",
    "To keep your catalog visible:",
    "  1. Log in and review your published materials.",
    "  2. Update descriptions, pricing, or thumbnails.",
    "  3. Publish new content to signal active stewardship.",
    "",
    `Dashboard: ${dashboardUrl}`,
    `Profile: ${profileUrl}`,
    "",
    "If you no longer plan to maintain your catalog, consider unpublishing your materials to keep the marketplace high-quality.",
    "",
    renderTextFooter({ unsubscribeUrl, year }),
  ].join("\n");

  return {
    subject: `Your ScholarMarket catalog needs attention — ${inactiveDays} days inactive`,
    text,
    html: renderEmailLayout({
      title: "ScholarMarket Inactivity Reminder",
      preheader: `Your catalog has been inactive for ${inactiveDays} days`,
      footerNote: "You're receiving this because you have a creator profile on ScholarMarket.",
      unsubscribeUrl,
      contentHtml,
      year,
    }),
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    unsubscribeUrl,
  };
}
