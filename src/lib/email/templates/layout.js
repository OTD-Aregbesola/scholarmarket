/**
 * Minimal shared email layout and escaping helpers.
 *
 * Templates only provide the inner card content and (optionally) a coloured
 * banner; this module wraps them in the table-based, email-client-safe shell
 * used across ScholarMarket messages.
 */

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * Renders the full HTML document for an email.
 */
export function renderEmailLayout({
  title,
  preheader = "",
  banner = null,
  contentHtml = "",
  footerNote = "",
  unsubscribeUrl = null,
  year = new Date().getUTCFullYear(),
} = {}) {
  const url = appUrl();
  const safeUrl = escapeHtml(url);

  const bannerHtml = banner
    ? `<tr>
          <td style="padding:0;">
            <div style="background:${escapeHtml(banner.color)};padding:16px 24px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#ffffff;font-family:${FONT};letter-spacing:0.05em;text-transform:uppercase;">${escapeHtml(banner.label)}</p>
            </div>
          </td>
        </tr>`
    : "";

  const unsubscribeHtml = unsubscribeUrl
    ? `<p class="muted" style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-family:${FONT};">
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        </p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  ${preheader ? `<meta name="description" content="${escapeHtml(preheader)}"/>` : ""}
  <title>${escapeHtml(title)}</title>
  <style>
    @media (prefers-color-scheme:dark){
      .card{background:#111827!important;color:#e5e7eb!important;}
      .muted{color:#9ca3af!important;}
      td{color:#d1d5db!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f6f9fc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f6f9fc;">
    <tr><td align="center" style="padding:24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="padding:0 0 12px 0;" align="center">
            <a href="${safeUrl}" style="text-decoration:none;color:#111827;">
              <span style="font-family:${FONT};font-weight:700;font-size:18px;">ScholarMarket</span>
            </a>
          </td>
        </tr>
        <tr>
          <td class="card" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              ${bannerHtml}
              <tr>
                <td style="padding:24px 24px 8px 24px;">
                  ${contentHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 8px 0 8px;">
            ${footerNote ? `<p class="muted" style="margin:0 0 8px 0;font-size:12px;color:#6b7280;font-family:${FONT};">${escapeHtml(footerNote)}</p>` : ""}
            ${unsubscribeHtml}
            <p class="muted" style="margin:0 0 24px 0;font-size:12px;color:#6b7280;font-family:${FONT};">
              &copy; ${year} ScholarMarket
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Shared plain-text footer. Kept text-only so every template has a text part.
 */
export function renderTextFooter({ unsubscribeUrl = null, year = new Date().getUTCFullYear() } = {}) {
  const lines = ["", "— ScholarMarket Team"];
  if (unsubscribeUrl) lines.push("", `Unsubscribe: ${unsubscribeUrl}`);
  lines.push(`© ${year} ScholarMarket`);
  return lines.join("\n");
}
