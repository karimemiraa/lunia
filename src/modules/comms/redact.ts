// Replaces every literal occurrence of `code` in `body` with a same-length
// mask so an OTP/secret is never persisted to CommunicationLog.body. The real
// `body` is still sent to the user's phone; only the stored audit copy is
// redacted.
export function redactOtpBody(body: string, code: string): string {
  if (!code) return body;
  const mask = "•".repeat(code.length);
  return body.split(code).join(mask);
}
