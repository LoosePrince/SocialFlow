import { supabase } from '../supabase';
import { apiUrl } from './api';

type SseHandler = (data: Record<string, unknown>) => void;

let listeners = new Set<SseHandler>();
let refCount = 0;
let abort: AbortController | null = null;

function parseSseChunk(buffer: string, onEvent: (line: string) => void): string {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data: '));
    if (line) onEvent(line.slice(6));
  }
  return rest;
}

async function runSseLoop(signal: AbortSignal) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(apiUrl('/api/events'), {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal,
    });

    if (!res.ok || !res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      buf = parseSseChunk(buf, (jsonLine) => {
        try {
          const data = JSON.parse(jsonLine) as Record<string, unknown>;
          if (data.type === 'connected') return;
          listeners.forEach((fn) => {
            try {
              fn(data);
            } catch {
              /* ignore */
            }
          });
        } catch {
          /* ignore */
        }
      });
    }
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) return;
    console.debug('[appSse]', e);
  }
}

export function subscribeAppEvents(handler: SseHandler): () => void {
  listeners.add(handler);
  refCount += 1;
  if (refCount === 1) {
    abort = new AbortController();
    void runSseLoop(abort.signal).catch((e: unknown) => {
      const err = e as { name?: string; message?: string };
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) return;
      console.debug('[appSse]', e);
    });
  }
  return () => {
    listeners.delete(handler);
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && abort) {
      abort.abort();
      abort = null;
    }
  };
}
