import { Redis } from '@upstash/redis';

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

function getRedis() {
  return new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

const INDEX_KEY  = 'funnel:index';
const ROW_PREFIX = 'funnel:row:';

function dateScore(dateStr: string): number {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

export async function saveRow(row: FunnelRow) {
  const redis = getRedis();
  await redis.set(ROW_PREFIX + row.date, JSON.stringify(row));
  await redis.zadd(INDEX_KEY, { score: dateScore(row.date), member: row.date });
}

export async function getAllRows(): Promise<FunnelRow[]> {
  const redis = getRedis();
  const dates = await redis.zrange(INDEX_KEY, 0, -1) as string[];
  if (!dates.length) return [];
  const rows = await Promise.all(
    dates.map(async d => {
      const raw = await redis.get<string>(ROW_PREFIX + d);
      if (!raw) return null;
      return (typeof raw === 'string' ? JSON.parse(raw) : raw) as FunnelRow;
    })
  );
  return rows.filter(Boolean) as FunnelRow[];
}
