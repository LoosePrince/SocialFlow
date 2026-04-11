export type SseSend = (line: string) => void;

const clients = new Set<SseSend>();

export function registerSseClient(send: SseSend): () => void {
  clients.add(send);
  return () => {
    clients.delete(send);
  };
}

export function broadcastSse(data: Record<string, unknown>): void {
  const line = `data: ${JSON.stringify(data)}\n\n`;
  const dead: SseSend[] = [];
  for (const fn of clients) {
    try {
      fn(line);
    } catch {
      dead.push(fn);
    }
  }
  for (const d of dead) clients.delete(d);
}
