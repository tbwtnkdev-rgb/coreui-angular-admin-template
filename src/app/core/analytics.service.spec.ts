import { TestBed } from '@angular/core/testing';

import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AnalyticsService);
  });

  it('generates the same data on every construction', () => {
    // Arrange
    const first = service.series()[0].points.map((point) => point.value);

    // Act
    const second = TestBed.inject(AnalyticsService).series()[0].points.map((p) => p.value);

    // Assert — a dashboard that reshuffles on reload cannot be reviewed.
    expect(second).toEqual(first);
  });

  it('returns one point per day for the selected range', () => {
    // Arrange & Act
    service.setRange('7d');
    const week = service.series()[0].points.length;
    service.setRange('90d');
    const quarter = service.series()[0].points.length;

    // Assert
    expect(week).toBe(7);
    expect(quarter).toBe(90);
  });

  it('recomputes every consumer when the range changes', () => {
    // Arrange
    service.setRange('7d');
    const shortTotal = service.metrics().find((m) => m.id === 'revenue')!.value;

    // Act
    service.setRange('90d');
    const longTotal = service.metrics().find((m) => m.id === 'revenue')!.value;

    // Assert
    expect(longTotal).toBeGreaterThan(shortTotal);
  });

  it('marks churn as a metric where a rise is bad', () => {
    // Arrange & Act
    const churn = service.metrics().find((metric) => metric.id === 'churn');

    // Assert — the tile decides its own colour from this, so it must not
    // default to "up is good" for every metric.
    expect(churn?.riseIsGood).toBe(false);
  });

  it('never produces a negative value', () => {
    // Arrange
    service.setRange('90d');

    // Act
    const values = service.series().flatMap((s) => s.points.map((p) => p.value));

    // Assert
    expect(values.every((value) => value >= 0)).toBe(true);
  });
});
