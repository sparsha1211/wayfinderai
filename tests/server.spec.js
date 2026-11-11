import { test, expect } from '@playwright/test';
import { startServer, stopServer } from '../server/index.js';
import { resetQuota } from '../server/rateLimiter.js';

let serverInstance;
const TEST_PORT = 3105;
const BASE_URL = `http://localhost:${TEST_PORT}`;

test.beforeAll(async () => {
  serverInstance = await startServer(TEST_PORT);
});

test.afterAll(async () => {
  if (serverInstance) {
    await stopServer();
  }
});

test.describe('Wayfinder AI Subscription Server Gateway Tests', () => {

  test('SRV-1: GET /api/v1/health and GET / return ok status', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('Wayfinder AI Gateway');

    // Also verify root path /
    const rootRes = await fetch(`${BASE_URL}/`);
    expect(rootRes.status).toBe(200);
    const rootData = await rootRes.json();
    expect(rootData.status).toBe('ok');
    expect(rootData.message).toContain('online');
  });

  test('SRV-2: POST /api/v1/auth/verify validates Pro and Trial keys', async () => {
    // 1. Valid Pro Key
    const proRes = await fetch(`${BASE_URL}/api/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'wf_live_test_pro_key_12345' })
    });
    expect(proRes.status).toBe(200);
    const proData = await proRes.json();
    expect(proData.success).toBe(true);
    expect(proData.tier).toBe('pro');
    expect(proData.quota.dailyLimit).toBe(1000);

    // 2. Invalid Key
    const badRes = await fetch(`${BASE_URL}/api/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'invalid_key_xyz' })
    });
    expect(badRes.status).toBe(401);
    const badData = await badRes.json();
    expect(badData.success).toBe(false);
  });

  test('SRV-3: POST /api/v1/auth/trial generates 7-day trial license', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newuser@example.com' })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.licenseKey.startsWith('wf_trial_')).toBe(true);
    expect(data.tier).toBe('trial');
    expect(data.dailyLimit).toBe(25);
  });

  test('SRV-4: POST /api/v1/ai/guidance proxies inference and decrements quota', async () => {
    const key = 'wf_live_test_pro_key_12345';
    resetQuota(key);

    const res = await fetch(`${BASE_URL}/api/v1/ai/guidance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        systemPrompt: 'You are Wayfinder AI.',
        userPrompt: 'Summarize flight booking options.',
        responseFormat: 'json'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.provider).toBe('wayfinder_cloud');
    expect(data.quotaRemaining).toBeLessThan(1000);
    expect(data.guidance).toBeDefined();
  });

  test('SRV-5: Rate Limiter returns 429 when daily quota is exhausted', async () => {
    // Generate fresh trial license with 25 calls limit
    const trialRes = await fetch(`${BASE_URL}/api/v1/auth/trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'quota_tester@example.com' })
    });
    const trial = await trialRes.json();
    const trialKey = trial.licenseKey;

    // Simulate reaching limit (25 calls)
    for (let i = 0; i < 25; i++) {
      const call = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trialKey}`
        },
        body: JSON.stringify({
          systemPrompt: 'You are Wayfinder AI.',
          userPrompt: `Test query #${i}`
        })
      });
      expect(call.status).toBe(200);
    }

    // 26th call should be blocked with 429 Too Many Requests
    const blockedRes = await fetch(`${BASE_URL}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${trialKey}`
      },
      body: JSON.stringify({
        systemPrompt: 'You are Wayfinder AI.',
        userPrompt: 'Blocked query'
      })
    });

    expect(blockedRes.status).toBe(429);
    const blockedData = await blockedRes.json();
    expect(blockedData.success).toBe(false);
    expect(blockedData.error).toContain('Daily limit of 25 AI queries reached');
  });

  test('SRV-6: POST /api/v1/webhooks/stripe provisions license on checkout.session.completed', async () => {
    const mockStripeEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_test_abc_123',
          subscription: 'sub_test_sub_456',
          customer_details: {
            email: 'payingcustomer@example.com'
          }
        }
      }
    };

    const res = await fetch(`${BASE_URL}/api/v1/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mockStripeEvent)
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
    expect(data.status).toBe('created');
    expect(data.licenseKey.startsWith('wf_live_')).toBe(true);

    // Verify newly generated license is immediately valid
    const verifyRes = await fetch(`${BASE_URL}/api/v1/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: data.licenseKey })
    });
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.tier).toBe('pro');
  });

  test('SRV-7: POST /api/v1/auth/lookup finds active license by customer email', async () => {
    // Lookup the paying customer created in SRV-6
    const res = await fetch(`${BASE_URL}/api/v1/auth/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'payingcustomer@example.com' })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.licenseKey.startsWith('wf_live_')).toBe(true);
    expect(data.tier).toBe('pro');

    // Lookup non-existent customer
    const failRes = await fetch(`${BASE_URL}/api/v1/auth/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'notfound@example.com' })
    });
    expect(failRes.status).toBe(404);
  });

  test('SRV-8: GET /checkout/success renders branded HTML page with license key', async () => {
    const res = await fetch(`${BASE_URL}/checkout/success?email=payingcustomer@example.com`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Wayfinder Pro Active');
    expect(html).toContain('wf_live_');
    expect(html).toContain('Copy License Key');
  });

});
