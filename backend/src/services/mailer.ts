import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";

interface CachedConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

let cached: CachedConfig | null | undefined; // undefined = not loaded yet, null = none configured

export function invalidateEmailConfigCache() {
  cached = undefined;
}

async function loadConfig(): Promise<CachedConfig | null> {
  if (cached !== undefined) return cached;

  const row = await prisma.emailConfig.findUnique({ where: { id: "default" } });
  cached = row
    ? {
        host: row.host,
        port: row.port,
        secure: row.secure,
        username: row.username,
        password: row.password,
        fromName: row.fromName,
        fromEmail: row.fromEmail,
      }
    : null;

  return cached;
}

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  purpose: string;
  instituteId?: string | null;
  organizationId?: string | null;
}

interface SendMailResult {
  delivered: boolean;
  /** Set when SMTP isn't configured — caller can surface this to the operator for manual handover. */
  devFallbackNotice?: string;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const config = await loadConfig();

  if (!config) {
    console.log(`[mailer] SMTP not configured — would send to ${input.to}: ${input.subject}`);
    await prisma.messageLog.create({
      data: {
        instituteId: input.instituteId ?? null,
        organizationId: input.organizationId ?? null,
        toEmail: input.to,
        subject: input.subject,
        purpose: input.purpose,
        delivered: false,
        error: "SMTP not configured",
      },
    });
    return { delivered: false, devFallbackNotice: "SMTP is not configured; deliver credentials manually." };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.username, pass: config.password },
    });

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });

    await prisma.messageLog.create({
      data: {
        instituteId: input.instituteId ?? null,
        organizationId: input.organizationId ?? null,
        toEmail: input.to,
        subject: input.subject,
        purpose: input.purpose,
        delivered: true,
      },
    });

    return { delivered: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown mailer error";
    await prisma.messageLog.create({
      data: {
        instituteId: input.instituteId ?? null,
        organizationId: input.organizationId ?? null,
        toEmail: input.to,
        subject: input.subject,
        purpose: input.purpose,
        delivered: false,
        error: message,
      },
    });
    return { delivered: false, devFallbackNotice: `Email delivery failed (${message}); deliver credentials manually.` };
  }
}
