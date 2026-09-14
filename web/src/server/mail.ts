/**
 * Transactional email via Resend's REST API.
 *
 * Called through `fetch` rather than the `resend` package: the payload is a
 * single JSON object, and keeping the dependency out means one less thing to
 * audit in the serverless bundle.
 */
import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type MailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not_configured" | "send_failed" };

export function mailFrom(): string {
  // onboarding@resend.dev is Resend's shared sender: it works without a
  // verified domain but can only reach the account owner's address.
  return process.env.EMAIL_FROM?.trim() || "ワンマケ <onboarding@resend.dev>";
}

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    // Local development: show the message instead of dropping it silently.
    console.info(
      `[mail] RESEND_API_KEY 未設定のため送信しません: to=${message.to} subject=${message.subject}\n${message.text}`,
    );
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });

    if (!response.ok) {
      // Resend puts the reason in the body; the address is safe to log, the
      // API key is not part of the response.
      const detail = await response.text().catch(() => "");
      console.error("[mail] send failed", response.status, detail.slice(0, 500));
      return { ok: false, reason: "send_failed" };
    }

    const body = (await response.json().catch(() => null)) as
      | { id?: string }
      | null;
    return { ok: true, id: body?.id ?? null };
  } catch (error) {
    console.error("[mail] send threw", error);
    return { ok: false, reason: "send_failed" };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function verificationEmail(input: {
  url: string;
  purpose: "SIGNUP" | "NEW_DEVICE";
  deviceLabel: string | null;
}): { subject: string; text: string; html: string } {
  const signup = input.purpose === "SIGNUP";
  const subject = signup
    ? "【ワンマケ】メールアドレスの確認をお願いします"
    : "【ワンマケ】新しい端末からのログイン確認";

  const lead = signup
    ? "ワンマケへのご登録ありがとうございます。下のリンクを開くと確認が完了し、そのまま診断に進めます。"
    : "いつもと違う端末からのログインが試みられました。ご本人であれば、下のリンクを開いて確認を完了してください。";

  const deviceLine = input.deviceLabel
    ? `ご利用の端末: ${input.deviceLabel}\n`
    : "";

  const text = [
    lead,
    "",
    input.url,
    "",
    deviceLine,
    "このリンクは30分間のみ有効です。",
    "心当たりがない場合は、このメールを破棄してください。ログインは完了しません。",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = `<!doctype html>
<html lang="ja">
  <body style="margin:0;padding:24px;background:#f6f7f8;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2933;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:18px;">${subject.replace("【ワンマケ】", "")}</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.8;">${lead}</p>
      <p style="margin:0 0 24px;">
        <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:700;font-size:14px;">
          確認を完了する
        </a>
      </p>
      ${input.deviceLabel ? `<p style="margin:0 0 12px;font-size:13px;color:#616e7c;">ご利用の端末: ${escapeHtml(input.deviceLabel)}</p>` : ""}
      <p style="margin:0 0 12px;font-size:13px;color:#616e7c;">このリンクは30分間のみ有効です。</p>
      <p style="margin:0;font-size:13px;color:#616e7c;">
        心当たりがない場合は、このメールを破棄してください。ログインは完了しません。
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
