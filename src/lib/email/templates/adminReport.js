import { appUrl, escapeHtml, renderEmailLayout, renderTextFooter } from "./layout.js";

const STAT_ROWS = [
  ["Total completed sales", "totalSales"],
  ["Total revenue (XLM)", "totalRevenue"],
  ["New user registrations", "newRegistrations"],
  ["New materials uploaded", "newMaterials"],
  ["Active listings (all time)", "activeListings"],
];

function weekLabel(iso, opts) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC", ...opts,
  });
}

/** Renders the weekly admin report as both HTML and plain text. */
export function renderAdminReportEmail(stats, { year = new Date().getUTCFullYear() } = {}) {
  const startLabel = weekLabel(stats.weekStart);
  const endLabel = weekLabel(stats.weekEnd);
  const rows = STAT_ROWS.map(([label, key]) => `
    <tr>
      <td style="padding:10px 16px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6;">${escapeHtml(label)}</td>
      <td style="padding:10px 16px;font-size:14px;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6;text-align:right;">${escapeHtml(Number(stats[key]).toLocaleString('en-US'))}</td>
    </tr>`).join("");

  const contentHtml = `
    <h1 style="margin:0 0 4px 0;font-size:20px;line-height:1.3;color:#111827;">Weekly Marketplace Report</h1>
    <p class="muted" style="margin:0 0 20px 0;font-size:13px;color:#6b7280;">${escapeHtml(startLabel)} – ${escapeHtml(endLabel)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">${rows}
    </table>
    <p style="margin:20px 0 0 0;">
      <a href="${escapeHtml(appUrl())}/admin" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:600;font-size:14px;">View admin dashboard</a>
    </p>`;

  const text = [
    "ScholarMarket Weekly Marketplace Report",
    `Period: ${stats.weekStart.slice(0, 10)} – ${stats.weekEnd.slice(0, 10)}`,
    "",
    ...STAT_ROWS.map(([label, key]) => `${label.padEnd(24)}: ${stats[key]}`),
    "",
    `Admin dashboard: ${appUrl()}/admin`,
    renderTextFooter({ year }),
  ].join("\n");

  return {
    subject: `ScholarMarket Weekly Report — w/c ${stats.weekStart.slice(0, 10)}`,
    text,
    html: renderEmailLayout({
      title: "ScholarMarket Weekly Report",
      footerNote: "Automated weekly report",
      contentHtml,
      year,
    }),
  };
}
