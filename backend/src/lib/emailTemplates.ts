interface InviteEmailInput {
  recipientName: string;
  orgOrInstituteName: string;
  email: string;
  tempPassword: string;
  role: string;
  loginUrl: string;
}

// Palette mirrors the app's light theme (styles/theme.css) — email clients
// don't reliably support CSS variables or dark mode, so values are inlined.
const COLORS = {
  background: "#e8f1f5",
  card: "#ffffff",
  primary: "#132238",
  primaryForeground: "#ffffff",
  accent: "#f26a36",
  accentForeground: "#ffffff",
  border: "#dbe3ea",
  muted: "#f5f8fa",
  mutedForeground: "#667085",
  foreground: "#132238",
};

const FONT_STACK =
  "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif";

export function inviteEmailHtml(input: InviteEmailInput): string {
  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:${COLORS.background};font-family:${FONT_STACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background};padding:40px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${COLORS.card};border-radius:20px;overflow:hidden;border:1px solid ${COLORS.border};">

              <!-- Brand header -->
              <tr>
                <td align="center" style="background:${COLORS.primary};padding:32px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="width:36px;height:36px;background:rgba(255,255,255,0.12);border-radius:10px;text-align:center;vertical-align:middle;">
                        <span style="font-size:16px;font-weight:700;color:${COLORS.primaryForeground};line-height:36px;">T</span>
                      </td>
                      <td style="padding-left:10px;">
                        <span style="font-size:18px;font-weight:700;color:${COLORS.primaryForeground};letter-spacing:-0.01em;">TutorGO</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td align="center" style="padding:36px 32px 8px;">
                  <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${COLORS.accent};text-transform:uppercase;letter-spacing:0.06em;">
                    You're invited
                  </p>
                  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${COLORS.foreground};line-height:1.3;">
                    Welcome to TutorGO, ${escapeHtml(input.recipientName)}
                  </h1>
                  <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:${COLORS.mutedForeground};max-width:360px;">
                    You've been added as
                    <span style="display:inline-block;padding:2px 10px;margin:0 2px;border-radius:999px;background:${COLORS.muted};color:${COLORS.foreground};font-weight:600;font-size:13px;">${escapeHtml(input.role)}</span>
                    for <strong style="color:${COLORS.foreground};">${escapeHtml(input.orgOrInstituteName)}</strong>. Use the credentials below to sign in — you'll set your own password on first login.
                  </p>
                </td>
              </tr>

              <!-- Credentials card -->
              <tr>
                <td align="center" style="padding:0 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.muted};border:1px solid ${COLORS.border};border-radius:14px;">
                    <tr>
                      <td style="padding:18px 20px;border-bottom:1px solid ${COLORS.border};">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:${COLORS.mutedForeground};text-transform:uppercase;letter-spacing:0.05em;">Email</p>
                        <p style="margin:0;font-size:15px;font-weight:600;color:${COLORS.foreground};font-family:'SF Mono', 'Consolas', monospace;">${escapeHtml(input.email)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:18px 20px;">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:${COLORS.mutedForeground};text-transform:uppercase;letter-spacing:0.05em;">Temporary password</p>
                        <p style="margin:0;font-size:15px;font-weight:600;color:${COLORS.foreground};font-family:'SF Mono', 'Consolas', monospace;">${escapeHtml(input.tempPassword)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- CTA -->
              <tr>
                <td align="center" style="padding:28px 32px 8px;">
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="border-radius:12px;background:${COLORS.accent};">
                        <a href="${input.loginUrl}" style="display:inline-block;padding:13px 32px;font-size:14px;font-weight:700;color:${COLORS.accentForeground};text-decoration:none;border-radius:12px;">
                          Sign in to TutorGO
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="padding:28px 32px 36px;">
                  <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.mutedForeground};">
                    This is an automated message from TutorGO. If you weren't expecting this invite,
                    you can safely ignore it.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:20px 0 0;font-size:12px;color:${COLORS.mutedForeground};">
              © ${new Date().getFullYear()} TutorGO · Run your institute end-to-end
            </p>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface PayslipEmailInput {
  recipientName: string;
  instituteName: string;
  amount: string;
  mode: string;
  paidOn: string;
  pendingAmount: string;
}

export function payslipEmailHtml(input: PayslipEmailInput): string {
  return `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:${COLORS.background};font-family:${FONT_STACK};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background};padding:40px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${COLORS.card};border-radius:20px;overflow:hidden;border:1px solid ${COLORS.border};">
              <tr>
                <td align="center" style="background:${COLORS.primary};padding:32px 24px;">
                  <span style="font-size:18px;font-weight:700;color:${COLORS.primaryForeground};">${escapeHtml(input.instituteName)}</span>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:36px 32px 8px;">
                  <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${COLORS.accent};text-transform:uppercase;letter-spacing:0.06em;">
                    Payment recorded
                  </p>
                  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${COLORS.foreground};line-height:1.3;">
                    ₹${escapeHtml(input.amount)} paid to ${escapeHtml(input.recipientName)}
                  </h1>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:0 32px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.muted};border:1px solid ${COLORS.border};border-radius:14px;">
                    <tr>
                      <td style="padding:16px 20px;border-bottom:1px solid ${COLORS.border};">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:${COLORS.mutedForeground};text-transform:uppercase;letter-spacing:0.05em;">Mode</p>
                        <p style="margin:0;font-size:15px;font-weight:600;color:${COLORS.foreground};">${escapeHtml(input.mode)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 20px;border-bottom:1px solid ${COLORS.border};">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:${COLORS.mutedForeground};text-transform:uppercase;letter-spacing:0.05em;">Paid on</p>
                        <p style="margin:0;font-size:15px;font-weight:600;color:${COLORS.foreground};">${escapeHtml(input.paidOn)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:16px 20px;">
                        <p style="margin:0 0 2px;font-size:11px;font-weight:600;color:${COLORS.mutedForeground};text-transform:uppercase;letter-spacing:0.05em;">Pending balance</p>
                        <p style="margin:0;font-size:15px;font-weight:600;color:${COLORS.foreground};">₹${escapeHtml(input.pendingAmount)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:28px 32px 36px;">
                  <p style="margin:0;font-size:12px;line-height:1.6;color:${COLORS.mutedForeground};">
                    This is an automated payroll notification from ${escapeHtml(input.instituteName)}.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}
