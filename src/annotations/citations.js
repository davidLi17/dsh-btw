import { decodeText } from './core.js';

/** Reserved .invalid destination: navigation is handled inside the reply. */
export const CITATION_PREFIX = 'https://dsh-annotations.invalid/';
export const CITATION_SELECTOR = `a[href^="${CITATION_PREFIX}"]`;

export function citationNumber(href) {
  const match = /^https:\/\/dsh-annotations\.invalid\/([1-9]\d*)$/.exec(href);
  const number = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(number) ? number : null;
}

/** Only use durable user messages preceding this reply; never resolve a future note. */
export function resolveCitation(nodes, replyKey, number) {
  // The host's keyed store explicitly does not guarantee iteration order.
  const entries = [...nodes], reply = entries.find(node => String(node.key) === String(replyKey));
  if (!reply) return null;
  let found = null, ambiguous = false;
  for (const node of entries) {
    if (node.anchorSeq >= reply.anchorSeq) continue;
    if (node.kind !== 'user' && node.kind !== 'steering') continue;
    for (const block of node.data.content ?? []) {
      if (block.type !== 'text') continue;
      for (const payload of decodeText(block.text).payloads) for (const note of payload.annotations) {
        if (note.number !== number) continue;
        if (found && found.id !== note.id) ambiguous = true;
        found = { ...note, status: 'sent' };
      }
    }
  }
  return ambiguous ? null : found;
}
