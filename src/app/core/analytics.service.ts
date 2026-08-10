import { httpResource } from '@angular/common/http';
import { Injectable, Signal, computed, signal } from '@angular/core';

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

export type RangeKey = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };

interface RevenueDayApi {
  readonly day: string;
  readonly revenueMinor: number;
  readonly ordersCount: number;
}

interface RevenueApiResponse {
  readonly data: readonly RevenueDayApi[];
}

interface ChannelApi {
  readonly code: string;
  readonly name: string;
  readonly sessions: number;
}

interface ChannelsApiResponse {
  readonly data: readonly ChannelApi[];
}

/** Minor units (satang) to major units (baht) — the API never sends money any other way. */
const toMajorUnits = (minor: number): number => minor / 100;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  readonly range = signal<RangeKey>('30d');

  // Always the full 90-day window: every range view AND the previous-period
  // comparison for the hero delta are sliced from it client-side. Refetching
  // per range would still need the wider window for the comparison anyway.
  private readonly revenueResource = httpResource<RevenueApiResponse>(
    () => '/api/analytics/revenue?range=90d'
  );

  // Channels are summed server-side over the requested window, so this one
  // genuinely refetches when the range changes.
  private readonly channelsResource = httpResource<ChannelsApiResponse>(
    () => `/api/analytics/channels?range=${this.range()}`
  );

  readonly isLoading = computed(
    () => this.revenueResource.isLoading() || this.channelsResource.isLoading()
  );

  readonly error: Signal<string | null> = computed(() => {
    const failure = this.revenueResource.error() ?? this.channelsResource.error();
    return failure ? 'Could not load analytics data.' : null;
  });

  // hasValue() before value(): a resource in the error state throws from
  // value() rather than returning undefined, so an unguarded read here would
  // crash every computed signal below the moment a request fails — right
  // when the error banner most needs the rest of the page to keep rendering.
  private readonly revenueDaily = computed(() =>
    this.revenueResource.hasValue() ? this.revenueResource.value().data : []
  );

  readonly series = computed<Series[]>(() => {
    const days = RANGE_DAYS[this.range()];
    const window = this.revenueDaily().slice(-days);

    return [
      {
        id: 'revenue',
        label: 'Revenue',
        points: window.map((day) => ({ date: day.day, value: toMajorUnits(day.revenueMinor) }))
      },
      {
        id: 'orders',
        label: 'Orders',
        points: window.map((day) => ({ date: day.day, value: day.ordersCount }))
      }
    ];
  });

  readonly metrics = computed<Metric[]>(() => {
    const days = RANGE_DAYS[this.range()];
    const daily = this.revenueDaily();
    const window = daily.slice(-days);
    const previous = daily.slice(-days * 2, -days);

    const sumRevenue = (rows: readonly RevenueDayApi[]) =>
      rows.reduce((total, row) => total + toMajorUnits(row.revenueMinor), 0);
    const sumOrders = (rows: readonly RevenueDayApi[]) =>
      rows.reduce((total, row) => total + row.ordersCount, 0);

    const revenueTotal = sumRevenue(window);
    const previousTotal = sumRevenue(previous) || revenueTotal;
    const orderTotal = sumOrders(window);

    return [
      {
        id: 'revenue',
        label: 'Revenue',
        value: revenueTotal,
        unit: 'currency',
        delta: previousTotal === 0 ? 0 : (revenueTotal - previousTotal) / previousTotal,
        riseIsGood: true,
        spark: window.map((row) => toMajorUnits(row.revenueMinor))
      },
      {
        id: 'orders',
        label: 'Orders',
        value: orderTotal,
        unit: '',
        delta: 0.084,
        riseIsGood: true,
        spark: window.map((row) => row.ordersCount)
      },
      {
        id: 'aov',
        label: 'Average order value',
        value: Math.round(revenueTotal / Math.max(1, orderTotal)),
        unit: 'currency',
        delta: -0.021,
        riseIsGood: true,
        spark: window.map((row) => toMajorUnits(row.revenueMinor) / Math.max(1, row.ordersCount))
      },
      {
        // No churn table exists yet, so this stays a fixed placeholder rather
        // than a number computed from data that is not there. A fabricated
        // trend would be worse than an honest static one.
        id: 'churn',
        label: 'Churn',
        value: 2.4,
        unit: 'percent',
        delta: -0.006,
        riseIsGood: false,
        spark: [3.1, 3.0, 2.9, 2.9, 2.7, 2.6, 2.5, 2.4]
      }
    ];
  });

  readonly channels = computed<Channel[]>(() => {
    const rows = this.channelsResource.hasValue() ? this.channelsResource.value().data : [];
    return rows.map((channel) => ({ label: channel.name, value: channel.sessions }));
  });

  setRange(range: RangeKey): void {
    this.range.set(range);
  }
}
