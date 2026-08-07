import { Injectable, computed, signal } from '@angular/core';

export type Trend = 'up' | 'down' | 'flat';

export interface Metric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: '' | 'currency' | 'percent';
  /** Change against the previous period, as a fraction. */
  readonly delta: number;
  /** Whether a rise is good — churn going up is not an improvement. */
  readonly riseIsGood: boolean;
  readonly spark: readonly number[];
}

export interface SeriesPoint {
  readonly date: string;
  readonly value: number;
}

export interface Series {
  readonly id: string;
  readonly label: string;
  readonly points: readonly SeriesPoint[];
}

export interface Channel {
  readonly label: string;
  readonly value: number;
}

export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'failed';

export interface Order {
  readonly id: string;
  readonly customer: string;
  readonly region: string;
  readonly placed: string;
  readonly total: number;
  readonly status: OrderStatus;
}

export type RangeKey = '7d' | '30d' | '90d';

/** Deterministic pseudo-random so the demo renders the same on every reload. */
const seeded = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const buildSeries = (
  days: number,
  base: number,
  drift: number,
  seed: number
): SeriesPoint[] => {
  const random = seeded(seed);
  const start = new Date(Date.UTC(2026, 4, 1));

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
    const wave = Math.sin(i / 5.5) * base * 0.12;
    const noise = (random() - 0.5) * base * 0.16;
    const value = base + drift * i + wave + noise - (weekend ? base * 0.22 : 0);

    return { date: date.toISOString().slice(0, 10), value: Math.max(0, Math.round(value)) };
  });
};

const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

const CUSTOMERS = [
  'Nordwind Logistics', 'Kanda Foods', 'Bluewave Studio', 'Orchid Health',
  'Pathfinder Labs', 'Verde Market', 'Sunbelt Freight', 'Atlas Interiors',
  'Copperline Media', 'Harbour Analytics', 'Tidepool Games', 'Ridgeway Legal',
];
const REGIONS = ['APAC', 'EMEA', 'North America', 'LATAM'];
const STATUSES: OrderStatus[] = ['paid', 'paid', 'paid', 'pending', 'refunded', 'failed'];

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  readonly range = signal<RangeKey>('30d');

  private readonly revenue = buildSeries(90, 42_000, 180, 7);
  private readonly orders = buildSeries(90, 610, 2.4, 19);

  readonly series = computed<Series[]>(() => {
    const days = RANGE_DAYS[this.range()];
    return [
      { id: 'revenue', label: 'Revenue', points: this.revenue.slice(-days) },
      { id: 'orders', label: 'Orders', points: this.orders.slice(-days) },
    ];
  });

  readonly metrics = computed<Metric[]>(() => {
    const days = RANGE_DAYS[this.range()];
    const revenue = this.revenue.slice(-days);
    const orders = this.orders.slice(-days);
    const previous = this.revenue.slice(-days * 2, -days);

    const sum = (points: readonly SeriesPoint[]) =>
      points.reduce((total, point) => total + point.value, 0);

    const revenueTotal = sum(revenue);
    const previousTotal = sum(previous) || revenueTotal;
    const orderTotal = sum(orders);

    return [
      {
        id: 'revenue',
        label: 'Revenue',
        value: revenueTotal,
        unit: 'currency',
        delta: (revenueTotal - previousTotal) / previousTotal,
        riseIsGood: true,
        spark: revenue.map((point) => point.value),
      },
      {
        id: 'orders',
        label: 'Orders',
        value: orderTotal,
        unit: '',
        delta: 0.084,
        riseIsGood: true,
        spark: orders.map((point) => point.value),
      },
      {
        id: 'aov',
        label: 'Average order value',
        value: Math.round(revenueTotal / Math.max(1, orderTotal)),
        unit: 'currency',
        delta: -0.021,
        riseIsGood: true,
        spark: revenue.map((point, i) => point.value / Math.max(1, orders[i]?.value ?? 1)),
      },
      {
        id: 'churn',
        label: 'Churn',
        value: 2.4,
        unit: 'percent',
        delta: -0.006,
        riseIsGood: false,
        spark: [3.1, 3.0, 2.9, 2.9, 2.7, 2.6, 2.5, 2.4],
      },
    ];
  });

  readonly channels = computed<Channel[]>(() => {
    const scale = RANGE_DAYS[this.range()] / 30;
    return [
      { label: 'Direct', value: Math.round(18_400 * scale) },
      { label: 'Organic search', value: Math.round(14_950 * scale) },
      { label: 'Referral', value: Math.round(9_120 * scale) },
      { label: 'Email', value: Math.round(6_480 * scale) },
      { label: 'Social', value: Math.round(3_260 * scale) },
    ];
  });

  readonly recentOrders = computed<Order[]>(() => {
    const random = seeded(31);

    return Array.from({ length: 24 }, (_, i) => {
      const day = 28 - (i % 28);
      return {
        id: `ORD-${(4821 - i).toString().padStart(4, '0')}`,
        customer: CUSTOMERS[Math.floor(random() * CUSTOMERS.length)],
        region: REGIONS[Math.floor(random() * REGIONS.length)],
        placed: `2026-07-${day.toString().padStart(2, '0')}`,
        total: Math.round(180 + random() * 5_400),
        status: STATUSES[Math.floor(random() * STATUSES.length)],
      };
    });
  });

  setRange(range: RangeKey): void {
    this.range.set(range);
  }
}
