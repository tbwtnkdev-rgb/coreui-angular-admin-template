import { DOCUMENT, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal
} from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { ChartjsComponent } from '@coreui/angular-chartjs';

import { AnalyticsService, Metric, RangeKey } from '../../core/analytics.service';

/** Token values are only readable once the stylesheet has applied. */
const readToken = (doc: Document, name: string): string =>
  getComputedStyle(doc.documentElement).getPropertyValue(name).trim();

interface Palette {
  readonly series1: string;
  readonly series2: string;
  readonly ink: string;
  readonly muted: string;
  readonly grid: string;
  readonly surface: string;
}

const RANGES: readonly { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' }
];

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartjsComponent, DecimalPipe]
})
export class DashboardComponent {
  readonly #doc = inject(DOCUMENT);
  readonly #analytics = inject(AnalyticsService);

  protected readonly ranges = RANGES;
  protected readonly range = this.#analytics.range;
  protected readonly metrics = this.#analytics.metrics;
  protected readonly channels = this.#analytics.channels;
  protected readonly isLoading = this.#analytics.isLoading;
  protected readonly loadError = this.#analytics.error;

  /** Re-read on theme change so the charts follow the palette. */
  readonly #palette = signal<Palette>(this.#readPalette());

  // By id, not position: metrics() is service-owned, and a reorder there
  // should not silently swap which figure gets the hero treatment.
  protected readonly hero = computed(
    () => this.metrics().find((metric) => metric.id === 'revenue') ?? this.metrics()[0]
  );

  protected readonly revenueChart = computed<ChartData>(() => {
    const palette = this.#palette();
    const [revenue, orders] = this.#analytics.series();

    return {
      labels: revenue.points.map((point) => point.date),
      datasets: [
        {
          label: 'Revenue',
          data: revenue.points.map((point) => point.value),
          borderColor: palette.series1,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: palette.surface,
          pointHoverBackgroundColor: palette.series1,
          tension: 0.25
        },
        {
          label: 'Orders (indexed)',
          data: this.#indexTo(orders.points.map((p) => p.value), revenue.points.map((p) => p.value)),
          borderColor: palette.series2,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 3],
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: palette.surface,
          pointHoverBackgroundColor: palette.series2,
          tension: 0.25
        }
      ]
    };
  });

  protected readonly channelChart = computed<ChartData>(() => {
    const palette = this.#palette();
    const channels = this.channels();

    return {
      labels: channels.map((channel) => channel.label),
      datasets: [
        {
          label: 'Sessions',
          data: channels.map((channel) => channel.value),
          backgroundColor: palette.series1,
          borderRadius: 4,
          borderSkipped: 'start',
          barPercentage: 0.6
        }
      ]
    };
  });

  protected readonly lineOptions = computed<ChartOptions>(() => this.#baseOptions(true));
  protected readonly barOptions = computed<ChartOptions>(() => this.#baseOptions(false));

  constructor() {
    // app.component dispatches this whenever the colour mode changes.
    const onSchemeChange = () => this.#palette.set(this.#readPalette());
    this.#doc.documentElement.addEventListener('ColorSchemeChange', onSchemeChange);
    inject(DestroyRef).onDestroy(() =>
      this.#doc.documentElement.removeEventListener('ColorSchemeChange', onSchemeChange)
    );
  }

  protected setRange(range: RangeKey): void {
    this.#analytics.setRange(range);
  }

  /** A rise is not automatically good — churn going up is a regression. */
  protected deltaTone(metric: Metric): 'good' | 'bad' | 'flat' {
    if (Math.abs(metric.delta) < 0.0005) return 'flat';
    return metric.delta > 0 === metric.riseIsGood ? 'good' : 'bad';
  }

  protected deltaLabel(metric: Metric): string {
    const pct = (metric.delta * 100).toFixed(1);
    return `${metric.delta > 0 ? '+' : ''}${pct}%`;
  }

  /**
   * Two measures of different magnitude share one axis by indexing the second
   * onto the first's range. A second y-axis would let the crossing points imply
   * a relationship that is not in the data.
   */
  #indexTo(values: readonly number[], reference: readonly number[]): number[] {
    const maxValue = Math.max(...values, 1);
    const maxReference = Math.max(...reference, 1);
    return values.map((value) => (value / maxValue) * maxReference);
  }

  #readPalette(): Palette {
    return {
      series1: readToken(this.#doc, '--series-1') || '#2a78d6',
      series2: readToken(this.#doc, '--series-2') || '#eb6834',
      ink: readToken(this.#doc, '--ink') || '#0b0b0b',
      muted: readToken(this.#doc, '--ink-muted') || '#898781',
      grid: readToken(this.#doc, '--rule') || '#e1e0d9',
      surface: readToken(this.#doc, '--surface') || '#fcfcfb'
    };
  }

  #baseOptions(isTimeSeries: boolean): ChartOptions {
    const palette = this.#palette();

    return {
      maintainAspectRatio: false,
      // Identity is carried by the legend and the direct labels, never by
      // colour alone, so the legend stays on for the two-series chart.
      plugins: {
        legend: {
          display: isTimeSeries,
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            pointStyle: 'circle',
            color: palette.muted,
            font: { size: 11 }
          }
        },
        tooltip: {
          mode: isTimeSeries ? 'index' : 'nearest',
          intersect: false,
          backgroundColor: palette.ink,
          titleColor: palette.surface,
          bodyColor: palette.surface,
          padding: 10,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true
        }
      },
      interaction: { mode: isTimeSeries ? 'index' : 'nearest', intersect: false },
      scales: {
        x: {
          grid: { display: false },
          border: { color: palette.grid },
          ticks: {
            color: palette.muted,
            font: { size: 11 },
            maxRotation: 0,
            autoSkipPadding: 24
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: palette.grid, tickLength: 0 },
          border: { display: false },
          ticks: {
            color: palette.muted,
            font: { size: 11 },
            padding: 8,
            maxTicksLimit: 5
          }
        }
      }
    };
  }
}
