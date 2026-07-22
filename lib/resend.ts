import "server-only";
import { Resend } from "resend";

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return new Resend(apiKey);
}

function getEmailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM is not set");
  }
  return from;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const resend = getResendClient();
  const from = getEmailFrom();

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: "Код входа в Don't Worry Club",
    text: [
      "Код входа в Don't Worry Club",
      "",
      `Код: ${code}`,
      "",
      "Код действует 10 минут. Если вы не запрашивали вход, проигнорируйте это письмо.",
    ].join("\n"),
    html: `
      <div style="background:#0b0b0b;padding:32px 0;font-family:sans-serif;">
        <div style="max-width:420px;margin:0 auto;background:#141414;border-radius:20px;padding:32px;color:#ffffff;">
          <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin:0 0 12px;">
            Don't Worry Club
          </p>
          <h1 style="font-size:22px;margin:0 0 16px;">Код входа</h1>
          <p style="font-size:14px;color:rgba(255,255,255,0.6);margin:0 0 20px;">
            Введите этот код в приложении, чтобы войти.
          </p>
          <div style="font-size:32px;letter-spacing:0.28em;font-weight:600;text-align:center;padding:16px;background:rgba(255,255,255,0.04);border-radius:14px;margin:0 0 20px;">
            ${code}
          </div>
          <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:0;">
            Код действует 10 минут. Если вы не запрашивали вход, проигнорируйте это письмо.
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend sendOtpEmail failed: ${error.message}`);
  }
}
