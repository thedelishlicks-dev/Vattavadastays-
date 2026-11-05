// src/lib/sms.ts
//
// Pre-filled text for the phone's SMS app (the sms: link). Some SMS apps decode the message and then
// split it at "&" or "#" as if they were part of the link itself, so everything after the first one is
// lost (found on a Xiaomi/MIUI phone, 5 Nov 2026). The text is cleaned before it is encoded, so a
// property called "Tea & Coffee Villa" or a landmark like "Plot #5" can't cut a message short.

export function smsSafe(text: string): string {
  return text.replace(/\s*&\s*/g, " and ").replace(/#/g, "No. ").replace(/[ \t]{2,}/g, " ");
}

export function smsLink(body: string): string {
  return `sms:?body=${encodeURIComponent(smsSafe(body))}`;
}
