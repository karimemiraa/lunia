// Branded, email-client-safe HTML wrapper for outgoing emails. Table-based
// layout with inline styles (Gmail/Outlook strip <style> and external CSS), a
// light brand palette, and a plain-text body rendered into readable paragraphs.
// A 6-digit verification code on its own line is promoted into a prominent code
// block so OTP emails read like a real product email.

export interface EmailLayoutOptions {
  subject: string;
  body: string;
  /** Optional recipient name for a personalized greeting. */
  recipientName?: string | null;
  /** Optional preheader (inbox preview text). */
  preheader?: string;
  locale?: string;
}

const BRAND = {
  name: "Lunia",
  tagline: "Skin Quality Center — Riyadh",
  teal: "#9ed5d0",
  tealInk: "#2f6d67",
  ink: "#1c2b2a",
  cream: "#f7f5f2",
  page: "#fbfaf7",
  muted: "#6b7674",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CODE_RE = /^\s*\d{6}\s*$/;
const INLINE_CODE_RE = /\b(\d{6})\b/;

// Renders the plain-text body into HTML: paragraphs split on blank lines, and a
// standalone/embedded 6-digit code promoted to a styled code block.
function renderBody(body: string, isRtl: boolean): string {
  const align = isRtl ? "right" : "left";
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paragraphs
    .map((para) => {
      if (CODE_RE.test(para)) {
        return codeBlock(para.trim());
      }
      const match = para.match(INLINE_CODE_RE);
      // A short sentence that contains the code (e.g. "Your code is 123456. Valid
      // for 5 minutes.") — split around the code so the copy reads naturally
      // above/below a prominent code block.
      if (match && para.length <= 90) {
        const idx = para.indexOf(match[1]);
        const before = para.slice(0, idx).replace(/[\s:—-]+$/, "").trim();
        const after = para.slice(idx + match[1].length).replace(/^[\s.,;—-]+/, "").trim();
        const line = (t: string) =>
          t ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.ink};text-align:${align}">${escapeHtml(t)}</p>` : "";
        return `${line(before)}${codeBlock(match[1])}${line(after)}`;
      }
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};text-align:${align}">${escapeHtml(para)}</p>`;
    })
    .join("");
}

function codeBlock(code: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td align="center">
    <div style="display:inline-block;padding:14px 28px;background:${BRAND.cream};border:1px solid ${BRAND.teal};border-radius:12px;font-family:'Courier New',monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${BRAND.ink}">${escapeHtml(code)}</div>
  </td></tr></table>`;
}

export function renderEmailHtml(opts: EmailLayoutOptions): string {
  const isRtl = (opts.locale ?? "").toLowerCase().startsWith("ar");
  const dir = isRtl ? "rtl" : "ltr";
  const align = isRtl ? "right" : "left";
  const greeting = opts.recipientName
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.ink};text-align:${align}">${isRtl ? "مرحباً" : "Hi"} ${escapeHtml(opts.recipientName)},</p>`
    : "";
  const preheader = opts.preheader ?? opts.subject;

  return `<!doctype html>
<html lang="${isRtl ? "ar" : "en"}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #eee7db;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:${BRAND.ink};padding:22px 32px;text-align:center;">
          <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:6px;color:${BRAND.cream};">LUNIA</span>
          <div style="margin-top:4px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${BRAND.teal};">${escapeHtml(BRAND.tagline)}</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;font-family:Arial,Helvetica,sans-serif;">
          ${greeting}
          ${renderBody(opts.body, isRtl)}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:${BRAND.cream};font-family:Arial,Helvetica,sans-serif;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(BRAND.name)} · King Fahd Road, Riyadh, Saudi Arabia</p>
          <p style="margin:6px 0 0;font-size:11px;color:${BRAND.muted};">This is an automated message from ${escapeHtml(BRAND.name)}. Please do not reply.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
