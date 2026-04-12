/** Twikoo-Magic owo.json catalog: https://github.com/LoosePrince/Twikoo-Magic */

export const TWIKOO_OWO_JSON_URL = 'https://looseprince.github.io/Twikoo-Magic/owo.json';

export type TwikooOwoItem = {
  packName: string;
  text: string;
  icon: string;
};

/** 与 owo.json 顶层键顺序一致的一组表情 */
export type TwikooOwoPack = {
  packName: string;
  items: TwikooOwoItem[];
};

type RawPack = {
  type?: string;
  container?: Array<{ text?: string; icon?: string }>;
};

let cache: {
  map: Map<string, string>;
  items: TwikooOwoItem[];
  packs: TwikooOwoPack[];
} | null = null;
let loadPromise: Promise<void> | null = null;

export function getTwikooOwoIcon(text: string): string | undefined {
  return cache?.map.get(text);
}

export function getTwikooOwoItems(): TwikooOwoItem[] {
  return cache?.items ?? [];
}

export function getTwikooOwoPacks(): TwikooOwoPack[] {
  return cache?.packs ?? [];
}

export function isTwikooOwoReady(): boolean {
  return cache !== null;
}

export async function ensureTwikooOwoLoaded(): Promise<void> {
  if (cache) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      const res = await fetch(TWIKOO_OWO_JSON_URL);
      if (!res.ok) throw new Error(`Twikoo owo.json HTTP ${res.status}`);
      const data = (await res.json()) as Record<string, RawPack>;
      const map = new Map<string, string>();
      const items: TwikooOwoItem[] = [];
      const packs: TwikooOwoPack[] = [];
      for (const packName of Object.keys(data)) {
        const pack = data[packName];
        const container = pack?.container;
        if (!Array.isArray(container)) continue;
        const packItems: TwikooOwoItem[] = [];
        for (const row of container) {
          const t = row?.text?.trim();
          const icon = row?.icon?.trim();
          if (t && icon) {
            map.set(t, icon);
            const item = { packName, text: t, icon };
            items.push(item);
            packItems.push(item);
          }
        }
        if (packItems.length > 0) {
          packs.push({ packName, items: packItems });
        }
      }
      cache = { map, items, packs };
    })();
  }
  await loadPromise;
}
