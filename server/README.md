# Wayfinder AI — Commercial Cloud Server & Subscription Gateway

A secure, high-performance Node.js proxy server and license management gateway designed for commercial subscription distribution of the Wayfinder AI Chrome Extension.

---

## 🔒 Security Architecture: Why a Middle Server is Required

> [!CAUTION] Never Ship Private API Keys in a Chrome Extension
> Any API key bundled inside an extension (or saved in client `chrome.storage`) can be extracted in seconds by opening Chrome DevTools (`Network` or `Sources` tab) or unzipping the `.crx` file.
> 
> **Wayfinder Cloud solves this completely:**
> 1. Your `OPENAI_API_KEY` stays **100% private** on this backend server.
> 2. Users only hold a **License Key** (`wf_live_...` or `wf_trial_...`).
> 3. The server authenticates every request, enforces daily subscription quotas, and blocks abuse before contacting OpenAI.

---

## 🚀 Quick Start (Local Development)

### 1. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp server/.env.example server/.env
```
Add your private OpenAI API Key:
```env
PORT=3000
NODE_ENV=development
OPENAI_API_KEY=sk-proj-your-openai-api-key-here
OPENAI_MODEL=gpt-4o-mini
STRIPE_WEBHOOK_SECRET=whsec_your_test_secret
```

### 2. Start the Server
```bash
npm run server
# Server listening at http://localhost:3000
```

### 3. Test Built-in Demo License
In the Chrome Extension Popup:
1. Select **Active Provider:** `Wayfinder Cloud (Subscription Service)`
2. Enter the pre-seeded Pro License Key:
   ```
   wf_live_test_pro_key_12345
   ```
3. Click **⚡ Test Connection** -> Returns `✓ Subscription Active: Wayfinder Pro (Remaining: 1000/1000)`.

---

## 💳 Stripe Billing & Automated License Provisioning

### 1. Setup Stripe Webhook
In your [Stripe Dashboard](https://dashboard.stripe.com/webhooks):
1. Add Endpoint: `https://your-server-domain.com/api/v1/webhooks/stripe`
2. Select Events:
   - `checkout.session.completed` (Triggers automatic Pro License generation)
   - `invoice.payment_succeeded` (Renews license for 32 days)
   - `customer.subscription.deleted` (Revokes license upon cancellation)
3. Copy **Signing Secret** (`whsec_...`) into `server/.env`.

### 2. Automated Lifecycle
When a user subscribes via Stripe Checkout ($9.99/mo):
- Stripe sends `checkout.session.completed` to `/api/v1/webhooks/stripe`.
- The server generates a unique Pro key (`wf_live_...`) and stores it in `server/data/licenses.json`.
- The user enters this key into their Chrome extension to unlock Pro.

---

## 🛡️ API Endpoints Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Health & uptime check | None |
| `POST` | `/api/v1/auth/verify` | Validates license & returns remaining daily quota | Body `{ licenseKey }` |
| `POST` | `/api/v1/auth/trial` | Instantly issues a 7-day Free Trial key (25 calls/day) | None |
| `POST` | `/api/v1/ai/guidance` | Secure LLM page assistance proxy | `Bearer <license_key>` |
| `POST` | `/api/v1/ai/chat` | Secure LLM copilot chat proxy | `Bearer <license_key>` |
| `POST` | `/api/v1/ai/analyze-text` | Secure text selection explanation proxy | `Bearer <license_key>` |
| `POST` | `/api/v1/webhooks/stripe`| Handles Stripe subscription events | Stripe HMAC Signature |

---

## ☁️ 1-Click Deployment (Railway / Render / Docker)

### Option A: Deploy to Railway
1. Push this repository to GitHub.
2. Link your repo in [Railway](https://railway.app/).
3. Set Environment Variables:
   - `OPENAI_API_KEY`: Your OpenAI secret key.
   - `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook secret.
4. Set Start Command: `node server/index.js`
5. Railway provides a public HTTPS URL (e.g. `https://api-wayfinder.up.railway.app`). Update this as `defaultEndpoint` in `src/services/aiProviders.js`.

### Option B: Deploy with Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server/ ./server/
EXPOSE 3000
CMD ["node", "server/index.js"]
```
Run container:
```bash
docker build -t wayfinder-gateway -f server/Dockerfile .
docker run -p 3000:3000 -e OPENAI_API_KEY=sk-... wayfinder-gateway
```
