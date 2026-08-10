import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PAGE_SIZE } from '../../core/orders.service';
import { OrdersComponent } from './orders.component';

const page = (total: number, rows = 1) => ({
  data: Array.from({ length: rows }, (_, i) => ({
    reference: `ORD-${i}`,
    customerName: 'A Co',
    region: { code: 'APAC', name: 'APAC' },
    placedOn: '2026-07-01',
    status: 'paid',
    totalMinor: 10000,
    currency: 'THB'
  })),
  meta: { total, limit: PAGE_SIZE, offset: 0 }
});

// httpResource builds its request URL as one string rather than via Angular's
// HttpParams, so the mock request's own `.params` stays empty — the query
// string only shows up in `.url`.
const paramsOf = (url: string) => new URL(url, 'http://localhost').searchParams;

describe('OrdersComponent', () => {
  let fixture: ComponentFixture<OrdersComponent>;
  let component: any;
  let http: HttpTestingController;

  const expectOrdersRequest = () => http.expectOne((req) => req.url.startsWith('/api/orders'));
  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()]
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;

    // fixture.detectChanges() flushes the constructor's pending effects,
    // which is what fires httpResource's initial request.
    fixture.detectChanges();
    expectOrdersRequest().flush(page(35, PAGE_SIZE));
    await settle();
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('loads the fetched page', () => {
    expect(component.rows().length).toBe(PAGE_SIZE);
    expect(component.total()).toBe(35);
  });

  it('shows the range within the total, not just a row count', () => {
    expect(component.rangeStart()).toBe(1);
    expect(component.rangeEnd()).toBe(PAGE_SIZE);
    expect(component.pageCount()).toBe(4); // ceil(35 / 10)
  });

  describe('search debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('waits for typing to settle before sending a request', async () => {
      // Arrange & Act
      component.onSearchInput('n');
      await vi.advanceTimersByTimeAsync(100);
      component.onSearchInput('no');
      await vi.advanceTimersByTimeAsync(100);
      component.onSearchInput('nord');

      // Assert — nothing sent yet; still inside the debounce window from the
      // last keystroke.
      http.expectNone((req) => req.url.startsWith('/api/orders'));

      // Act
      await vi.advanceTimersByTimeAsync(300);
      fixture.detectChanges(); // flushes the effect the debounced setSearch() scheduled

      // Assert — exactly one request, for the final value.
      const request = expectOrdersRequest();
      expect(paramsOf(request.request.url).get('search')).toBe('nord');
      request.flush(page(0, 0));
    });

    it('cancels a pending debounce on destroy so it cannot fire after teardown', async () => {
      // Arrange
      component.onSearchInput('leaked');

      // Act
      fixture.destroy();
      await vi.advanceTimersByTimeAsync(300);
      TestBed.tick();

      // Assert — no request follows a destroyed component's debounce timer.
      http.expectNone((req) => req.url.startsWith('/api/orders'));
    });

    it('reset clears the visible search text immediately, not after the debounce', async () => {
      // Arrange — change something away from the defaults first, otherwise
      // clear() has nothing to observably undo.
      component.setStatus('paid');
      fixture.detectChanges();
      expectOrdersRequest().flush(page(1, 1));
      component.onSearchInput('something');

      // Act
      component.clear();
      fixture.detectChanges(); // flushes the effect that fires the reset request
      const request = expectOrdersRequest();
      expect(paramsOf(request.request.url).has('status')).toBe(false);
      request.flush(page(35, PAGE_SIZE));
      await vi.advanceTimersByTimeAsync(300); // a leftover debounce would fire here

      // Assert
      expect(component.searchText()).toBe('');
      http.expectNone((req) => req.url.startsWith('/api/orders'));
    });
  });

  it('disables Previous on the first page and Next on the last', () => {
    // Arrange — already on page 1 of 4 from the 35-row fixture in beforeEach.
    const [prevButton, nextButton] = fixture.nativeElement.querySelectorAll('.pager .chip');

    // Assert
    expect(prevButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(false);
  });

  it('requests the next page and reflects it once loaded', async () => {
    // Act
    component.nextPage();
    fixture.detectChanges(); // flushes the effect that fires the new request
    const request = expectOrdersRequest();

    // Assert the request, then resolve it and check the resulting state.
    expect(paramsOf(request.request.url).get('offset')).toBe(String(PAGE_SIZE));
    request.flush(page(35, PAGE_SIZE));
    await settle();
    fixture.detectChanges();

    expect(component.page()).toBe(2);
    expect(component.rangeStart()).toBe(11);
  });

  it('delegates sorting to the service and reports aria-sort from it', async () => {
    // Act
    component.sortBy('customer');
    fixture.detectChanges(); // flushes the effect that fires the new request
    const request = expectOrdersRequest();

    // Assert
    expect(paramsOf(request.request.url).get('sort')).toBe('customer');
    request.flush(page(35, PAGE_SIZE));
    await settle();
    fixture.detectChanges();

    expect(component.ariaSort('customer')).toBe('ascending');
    expect(component.ariaSort('total')).toBe('none');
  });
});
