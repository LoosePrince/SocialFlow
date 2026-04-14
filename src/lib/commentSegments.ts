/** Split comment body into plain text, @mentions, and Twikoo-style `[:id]` emoji placeholders. */

export type CommentSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; handle: string; raw: string }
  | { kind: 'link'; href: string; raw: string }
  | { kind: 'owo'; id: string; raw: string };

const SEGMENT_RE = /(@\S+)|(\[:(\S+?)\])|(https?:\/\/[^\s]+)/g;

export function parseCommentSegments(text: string): CommentSegment[] {
  const out: CommentSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = SEGMENT_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ kind: 'text', value: text.slice(last, m.index) });
    }
    if (m[1]) {
      out.push({ kind: 'mention', handle: m[1].slice(1), raw: m[1] });
    } else if (m[2] && m[3] !== undefined) {
      out.push({ kind: 'owo', id: m[3], raw: m[2] });
    } else if (m[4]) {
      out.push({ kind: 'link', href: m[4], raw: m[4] });
    }
    last = SEGMENT_RE.lastIndex;
  }
  if (last < text.length) {
    out.push({ kind: 'text', value: text.slice(last) });
  }
  return out;
}
