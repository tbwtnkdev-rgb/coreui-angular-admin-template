import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AnalyticsService } from './analytics.service';

/** 90 flat days so revenue/order totals are trivial to assert on. */
const buildRevenueFixture = (days: number, revenueMinor: number, ordersCount: number) => ({
  data: Array.from({ length: days }, (_, i) => ({
    day: `2026-05-${(i + 1).toString().padStart(2, '0')}`,
    revenueMinor,
    ordersCount
  }))
});

const CHANNEL_FIXTURE = {
  data: [
    { code: 'direct', name: 'Direct', sessions: 100 },
    { code: 'organic', name: 'Organic search', sessions: 80 }
  ]
};

describe('AnalyticsService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    // AnalyticsService is providedIn: 'root', and its range signal is
    // mutated by several tests below. Without an explicit reset, the root
    // injector — and the service instance's signal state — carries over to
    // the next test, which fires an unexpected request for whatever range
    // the previous test last set.
    TestBed.resetTestingModule();
  });

  /**
   * Injects the service, flushes the effect that fires httpResource's
   * request, hands back fixed responses, then waits for the result to
   * propagate through the computed signals.
   *
   * Two different waits, and the order matters. `TestBed.tick()` runs change
   * detection synchronously to fire the initial request — `whenStable()`
   * would deadlock here, since it does not resolve while a request it is
   * itself waiting to have flushed is still pending. Once the response is
   * flushed, the request is no longer pending, so `whenStable()` can then
   * settle the microtasks that carry the resolved value into the signal.
   */
  const primed = async (revenueDays = 90, revenueMinor = 420000, ordersCount = 10) => {
    const service = TestBed.inject(AnalyticsService);
    TestBed.tick();

    http
      .expectOne('/api/analytics/revenue?range=90d')
      .flush(buildRevenueFixture(revenueDays, revenueMinor, ordersCount));
    http.expectOne('/api/analytics/channels?range=30d').flush(CHANNEL_FIXTURE);
    await TestBed.inject(ApplicationRef).whenStable();

    return service;
  };

  it('converts money from minor units to major units', async () => {
    // Arrange — 420000 satang per day; the default range is 30 days.
    const service = await primed(90, 420000, 10);

    // Assert
    const revenue = service.metrics().find((m) => m.id === 'revenue')!;
    expect(revenue.value).toBeCloseTo(30 * 4200, 5);
  });

  it('returns one point per day for the selected range', async () => {
    // Arrange
    const service = await primed(90, 100000, 5);

    // Act
    service.setRange('7d');
    const week = service.series()[0].points.length;
    service.setRange('90d');
    const quarter = service.series()[0].points.length;

    // Assert
    expect(week).toBe(7);
    expect(quarter).toBe(90);
  });

  it('recomputes the hero metric when the range changes', async () => {
    // Arrange — flat series, so 90 days is strictly more revenue than 7.
    const service = await primed(90, 100000, 5);

    // Act
    service.setRange('7d');
    const shortTotal = service.metrics().find((m) => m.id === 'revenue')!.value;
    service.setRange('90d');
    const longTotal = service.metrics().find((m) => m.id === 'revenue')!.value;

    // Assert
    expect(longTotal).toBeGreaterThan(shortTotal);
  });

  it('marks churn as a metric where a rise is bad', async () => {
    // Arrange & Act — churn has no backing table yet, so it stays a fixed
    // placeholder; this only pins that the flag itself is correct.
    const service = await primed();
    const churn = service.metrics().find((metric) => metric.id === 'churn');

    // Assert — the tile decides its own colour from this, so it must not
    // default to "up is good" for every metric.
    expect(churn?.riseIsGood).toBe(false);
  });

  it('maps channel sessions in the order the API returned them', async () => {
    // Arrange & Act
    const service = await primed();

    // Assert — the API already sorts by the channel's fixed paint position;
    // the service must not silently re-sort or re-key that.
    expect(service.channels()).toEqual([
      { label: 'Direct', value: 100 },
      { label: 'Organic search', value: 80 }
    ]);
  });

  it('surfaces a request failure as a readable error rather than throwing', async () => {
    // Arrange
    const service = TestBed.inject(AnalyticsService);
    TestBed.tick();

    // Act
    http.expectOne('/api/analytics/revenue?range=90d').flush(null, { status: 500, statusText: 'Server Error' });
    http.expectOne('/api/analytics/channels?range=30d').flush(CHANNEL_FIXTURE);
    await TestBed.inject(ApplicationRef).whenStable();

    // Assert
    expect(service.error()).toBe('Could not load analytics data.');
  });
});
