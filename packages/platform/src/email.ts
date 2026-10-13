// Email: Resend's HTTP API when RESEND_API_KEY is set, otherwise printed to the server log
// (so magic links and OTP codes still work in a demo without any provider).
export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email:dev] to=${to}\n  subject: ${subject}\n  ${text.replaceAll("\n", "\n  ")}\n`);
    return { delivered: false as const };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Megathon <onboarding@resend.dev>", to, subject, text }),
  });
  if (!res.ok) console.error(`[email] resend ${res.status}: ${await res.text()}`);
  return { delivered: res.ok };
}
