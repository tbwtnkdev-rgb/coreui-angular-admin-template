import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OrdersService, PAGE_SIZE } from './orders.service';

const emptyResponse = (total = 0) => ({ data: [], meta: { total, limit: PAGE_SIZE, offset: 0 } });

const FIXTURE = {
  data: [
    {
      reference: 'ORD-0001',
      customerName: 'Nordwind Logistics',
      region: { code: 'EMEA', name: 'Europe, Middle East & Africa' },
      placedOn: '2026-07-30',
      status: 'paid',
      totalMinor: 150000,
      currency: 'THB'
    }
  ],
  meta: { total: 1, limit: PAGE_SIZE, offset: 0 }
};

// httpResource builds its request URL as one string ("/api/orders?sort=...")
// rather than via Angular's HttpParams, so the mock request's own `.params`
// stays empty — the query string only shows up in `.url`. Parsing it here
// is simpler than fighting that.
const paramsOf = (url: string) => new URL(url, 'http://localhost').searchParams;

describe('OrdersService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withFetch()), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  const create = () => {
    const service = TestBed.inject(OrdersService);
    TestBed.tick();
    return service;
  };

  /**
   * Applies a mutation, flushes the effect it triggers so the resulting
   * request actually fires, then drains that request with a throwaway
   * response and hands back its query params.
   *
   * Only the outgoing request shape is under test here — not the resolved
   * signal state — so there is no need to await stability; that matters only
   * when a test goes on to read `.orders()` or `.total()` afterward.
   */
  const paramsAfter = (mutate: () => void) => {
    mutate();
    TestBed.tick();
    const request = http.expectOne((req) => req.url.startsWith('/api/orders'));
    const params = paramsOf(request.request.url);
    request.flush(emptyResponse());
    return params;
  };

  it('requests the default page sorted newest-first, with no status or search param', () => {
    // Arrange & Act
    create();
    const request = http.expectOne((req) => req.url.startsWith('/api/orders'));
    const params = paramsOf(request.request.url);

    // Assert
    expect(params.get('sort')).toBe('placed');
    expect(params.get('direction')).toBe('desc');
    expect(params.get('limit')).toBe(String(PAGE_SIZE));
    expect(params.get('offset')).toBe('0');
    expect(params.has('status')).toBe(false);
    expect(params.has('search')).toBe(false);

    request.flush(emptyResponse());
  });

  it('maps the API shape to the flat fields the pages consume', async () => {
    // Arrange
    const service = create();

    // Act
    http.expectOne((req) => req.url.startsWith('/api/orders')).flush(FIXTURE);
    await TestBed.inject(ApplicationRef).whenStable();

    // Assert
    expect(service.orders()).toEqual([
      {
        id: 'ORD-0001',
        customer: 'Nordwind Logistics',
        region: 'Europe, Middle East & Africa',
        placed: '2026-07-30',
        total: 1500,
        status: 'paid'
      }
    ]);
    expect(service.total()).toBe(1);
  });

  it('resets to page 1 when the status filter changes', () => {
    // Arrange — land on page 3 first.
    const service = create();
    http.expectOne((req) => req.url.startsWith('/api/orders')).flush(emptyResponse(50));
    paramsAfter(() => service.goToPage(3));

    // Act & Assert — filtering while on page 3 must not leave the user on a
    // page that might not exist for the new, smaller result set.
    const params = paramsAfter(() => service.setStatus('paid'));
    expect(params.get('offset')).toBe('0');
    expect(params.get('status')).toBe('paid');
  });

  it('resets to page 1 when the sort column changes', () => {
    // Arrange
    const service = create();
    http.expectOne((req) => req.url.startsWith('/api/orders')).flush(emptyResponse(50));
    paramsAfter(() => service.goToPage(2));

    // Act & Assert
    const params = paramsAfter(() => service.sortBy('customer'));
    expect(params.get('sort')).toBe('customer');
    expect(params.get('offset')).toBe('0');
  });

  it('picks ascending for a new text column and descending for total/placed', () => {
    // Arrange
    const service = create();
    http.expectOne((req) => req.url.startsWith('/api/orders')).flush(emptyResponse());

    // Act & Assert
    expect(paramsAfter(() => service.sortBy('customer')).get('direction')).toBe('asc');
    expect(paramsAfter(() => service.sortBy('total')).get('direction')).toBe('desc');
  });

  it('flips direction on a second click of the same column', () => {
    // Arrange
    const service = create();
    http.expectOne((req) => req.url.startsWith('/api/orders')).flush(emptyResponse());
    paramsAfter(() => service.sortBy('customer'));

    // Act — clicking the already-active column again flips it rather than
    // restarting from the column's default direction.
    const params = paramsAfter(() => service.sortBy('customer'));

    // Assert
    expect(params.get('direction')).toBe('desc');
  });

  it('rejects going below page 1', () => {
    // Arrange
    const service = create();
    http.expectOne((req) => req.url.startsWith('/api/orders')).flush(emptyResponse());

    // Act & Assert
    expect(paramsAfter(() => service.goToPage(0)).get('offset')).toBe('0');
  });

  it('reset() returns every filter, sort and page to its default', () => {
    // Arrange
    const service = create();
    http.expectOne((req) => req.url.startsWith('/api/orders')).flush(emptyResponse(50));
    paramsAfter(() => service.setStatus('failed'));
    paramsAfter(() => service.sortBy('total'));
    paramsAfter(() => service.goToPage(2));

    // Act
    const params = paramsAfter(() => service.reset());

    // Assert
    expect(params.get('sort')).toBe('placed');
    expect(params.get('direction')).toBe('desc');
    expect(params.get('offset')).toBe('0');
    expect(params.has('status')).toBe(false);
  });

  it('reports a readable error when the request fails, without throwing from orders()', async () => {
    // Arrange
    const service = create();

    // Act
    http
      .expectOne((req) => req.url.startsWith('/api/orders'))
      .flush(null, { status: 500, statusText: 'Server Error' });
    await TestBed.inject(ApplicationRef).whenStable();

    // Assert
    expect(service.error()).toBe('Could not load orders.');
    expect(service.orders()).toEqual([]);
  });
});
