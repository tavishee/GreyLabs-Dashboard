import { kv } from '@upstash/redis';

export type FunnelRow = {
  date:             string;
  bot_sent:         number;
  bot_received:     number;
  bot_dialled:      number;
  bot_connected:    number;
  bot_qualified:    number;
  cc_sent:          number;
  cc_connected:     number;
  cc_converted:     number;
  bot_connect_rate: number;
  bot_qualify_rate: number;
  cc_convert_rate:  number;
  e2e_rate:         number;
};

const INDEX_KEY = 'funnel:index'; // sorted set of dates
const ROW_PREFIX = 'funnel:row:';

export async function saveRow(row: FunnelRow) {
  const key = ROW_PREFIX + row.date;
  await kv.set(key, JSON.stringify(row));
  await kv.zadd(INDEX_KEY, { score: dateScore(row.date), member: row.date });
}

export async function getAllRows(): Promise<FunnelRow[]> {
  const dates = await kv.zrange(INDEX_KEY, 0, -1) as string[];
  if (!dates.length) return [];
  const rows = await Promise.all(
    dates.map(async d => {
      const raw = await kv.get<string>(ROW_PREFIX + d);
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) as FunnelRow : raw as FunnelRow;
    })
  );
  return rows.filter(Boolean) as FunnelRow[];
}

export async function getRowsByDateRange(from: string, to: string): Promise<FunnelRow[]> {
  const all = await getAllRows();
  return all.filter(r => r.date >= from && r.date <= to);
}

function dateScore(dateStr: string): number {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}
