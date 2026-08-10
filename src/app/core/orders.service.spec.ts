import { provideHttpClient, withFetch } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OrdersService } from './orders.service';

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
  meta: { total: 1, limit: 200, offset: 0 }
};

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

  it('maps the API shape to the flat fields the pages consume', async () => {
    // Arrange
    const service = TestBed.inject(OrdersService);
    TestBed.tick();

    // Act
    http.expectOne('/api/orders?limit=200').flush(FIXTURE);
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
  });

  it('reports a readable error when the request fails', async () => {
    // Arrange
    const service = TestBed.inject(OrdersService);
    TestBed.tick();

    // Act
    http.expectOne('/api/orders?limit=200').flush(null, { status: 500, statusText: 'Server Error' });
    await TestBed.inject(ApplicationRef).whenStable();

    // Assert
    expect(service.error()).toBe('Could not load orders.');
    expect(service.orders()).toEqual([]);
  });
});
