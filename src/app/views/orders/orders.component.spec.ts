import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersComponent } from './orders.component';

const FIXTURE = {
  data: [
    { reference: 'ORD-01', customerName: 'APAC Co', region: { code: 'APAC', name: 'APAC' }, placedOn: '2026-07-01', status: 'paid', totalMinor: 100000, currency: 'THB' },
    { reference: 'ORD-02', customerName: 'EMEA Co', region: { code: 'EMEA', name: 'EMEA' }, placedOn: '2026-07-02', status: 'failed', totalMinor: 90000, currency: 'THB' },
    { reference: 'ORD-03', customerName: 'Big Co', region: { code: 'NA', name: 'NA' }, placedOn: '2026-07-03', status: 'paid', totalMinor: 500000, currency: 'THB' }
  ],
  meta: { total: 3, limit: 200, offset: 0 }
};

describe('OrdersComponent', () => {
  let fixture: ComponentFixture<OrdersComponent>;
  let component: any;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;

    // fixture.detectChanges() flushes the constructor's pending effects,
    // which is what fires httpResource's request — TestBed.tick() alone
    // does not run change detection on a specific fixture.
    fixture.detectChanges();
    http.expectOne('/api/orders?limit=200').flush(FIXTURE);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('loads the fetched orders', () => {
    expect(component.rows().length).toBe(3);
  });

  it('filters on customer, id and region together', () => {
    // Arrange
    const all = component.rows().length;

    // Act
    component.query.set('apac');

    // Assert
    expect(component.rows().length).toBeLessThan(all);
    expect(component.rows().every((o: any) => o.region === 'APAC')).toBe(true);
  });

  it('narrows to a single status', () => {
    // Arrange & Act
    component.status.set('paid');

    // Assert
    expect(component.rows().length).toBe(2);
    expect(component.rows().every((o: any) => o.status === 'paid')).toBe(true);
  });

  it('flips direction when the same column is clicked twice', () => {
    // Arrange
    component.sortBy('customer');
    const first = component.direction();

    // Act
    component.sortBy('customer');

    // Assert
    expect(component.direction()).not.toBe(first);
  });

  it('sorts numeric columns numerically, not lexically', () => {
    // Arrange & Act — descending puts the largest total first, which a string
    // comparison would not (it would rank "900" above "1000").
    component.sortBy('total');
    const totals = component.rows().map((o: any) => o.total);

    // Assert
    expect(totals).toEqual([...totals].sort((a: number, b: number) => b - a));
  });

  it('reports aria-sort only for the active column', () => {
    // Arrange & Act
    component.sortBy('region');

    // Assert
    expect(component.ariaSort('region')).toBe('ascending');
    expect(component.ariaSort('total')).toBe('none');
  });

  it('resets both filters at once', () => {
    // Arrange
    component.query.set('nord');
    component.status.set('failed');

    // Act
    component.clear();

    // Assert
    expect(component.query()).toBe('');
    expect(component.status()).toBe('all');
  });
});
