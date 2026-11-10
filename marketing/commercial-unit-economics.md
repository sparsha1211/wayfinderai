# Wayfinder AI — Commercial Unit Economics & Financial Model

## 1. Executive Summary

Wayfinder AI operates a high-margin, software-as-a-service (SaaS) subscription model for browser intelligence. By using modern ultra-efficient small reasoning models (`gpt-4o-mini`, `claude-3-5-haiku`), the variable cost per active user is extraordinarily low, yielding **~93% gross margins** at the standard retail price of **$9.99 / month**.

---

## 2. Subscription Pricing & Tier Architecture

| Tier | Price | Daily AI Limit | Max Context / Call | Primary Audience |
| :--- | :--- | :--- | :--- | :--- |
| **Free Trial** | $0 (7 Days) | 25 queries / day | 2,000 tokens | Casual evaluators & lead acquisition |
| **Wayfinder Pro** | **$9.99 / mo** | 1,000 queries / day | 4,000 tokens | Power users, shoppers, researchers, professionals |
| **Enterprise / Teams** | **$79.00 / mo** (5 seats) | 10,000 queries / day | 8,000 tokens | Remote teams, agencies, power shoppers |
| **BYOK (Free)** | Free forever | Unlimited (Self-funded) | Model limit | Developers with existing OpenAI/Claude keys |

---

## 3. Cost of Goods Sold (COGS) Breakdown

### A. AI Inference Costs (OpenAI `gpt-4o-mini`)
* **Input Token Price**: $0.150 / 1,000,000 tokens ($0.00000015 / token)
* **Output Token Price**: $0.600 / 1,000,000 tokens ($0.00000060 / token)

#### Per-Query Math:
* Average page prompt input: **550 tokens**
* Average JSON guidance output: **150 tokens**
* **Cost per query**:
  $$\text{Input} = 550 \times \$0.00000015 = \$0.0000825$$
  $$\text{Output} = 150 \times \$0.00000060 = \$0.0000900$$
  $$\mathbf{\text{Total Cost per Query}} = \mathbf{\$0.0001725} \quad (\approx 1/58\text{th of a penny})$$

### B. User Usage Profiles & Monthly Token Spend

| User Cohort | Queries / Day | Queries / Month | Monthly Token Cost | % of User Base |
| :--- | :--- | :--- | :--- | :--- |
| **Light User** | 5 | 150 | $0.026 | 35% |
| **Moderate User** | 20 | 600 | $0.104 | 50% |
| **Heavy / Power User** | 60 | 1,800 | $0.311 | 15% |
| **Weighted Average** | **20.7** | **622** | **$0.108 / month** | **100%** |

### C. Payment Processing Fees (Stripe Standard)
* **Rate**: 2.9% + $0.30 per successful charge.
* On **$9.99 / month**:
  $$\text{Stripe Fee} = (0.029 \times 9.99) + 0.30 = \$0.2897 + \$0.30 = \mathbf{\$0.590}$$

### D. Server & Infrastructure Overhead
* Middle server is zero-dependency native Node.js running on Railway / Render.
* Base cost: ~$5.00 / month flat.
* At 1,000 users, infrastructure cost per user = **$0.005 / user / month**.

---

## 4. Net Unit Economics (Per Pro Subscriber @ $9.99 / mo)

```
Gross Revenue:                     $9.9900   (100.0%)
Less Stripe Processing Fee:       - $0.5900   ( -5.9%)
Less OpenAI API Token Inference:  - $0.1080   ( -1.1%)
Less Cloud Infrastructure:        - $0.0050   ( -0.1%)
------------------------------------------------------
Net Contribution Margin:           $9.2870   (~92.9% Gross Margin)
```

> **Takeaway**: Every single Pro subscriber yields **~$9.29 net monthly profit**. Even if a hyper-active user queries the AI 1,000 times in a month, their token cost is only ~$0.17, preserving a **>92% gross margin**.

---

## 5. Financial Projections & Scale Economics

| Active Paid Subscribers | Monthly Recurring Revenue (MRR) | Annual Recurring Revenue (ARR) | Token & API Costs (Mo) | Stripe Fees (Mo) | Server Costs (Mo) | Net Monthly Profit | Net Annual Profit |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **50** | $500 | $6,000 | $5.40 | $29.50 | $5.00 | **$460** | $5,520 |
| **200** | $2,000 | $24,000 | $21.60 | $118.00 | $5.00 | **$1,855** | $22,260 |
| **1,000** | $10,000 | $120,000 | $108.00 | $590.00 | $10.00 | **$9,292** | $111,500 |
| **5,000** | $50,000 | $600,000 | $540.00 | $2,950.00 | $25.00 | **$46,485** | $557,800 |
| **10,000** | $100,000 | $1,200,000 | $1,080.00 | $5,900.00 | $50.00 | **$92,970** | $1,115,640 |

---

## 6. Customer Lifetime Value (LTV) & CAC Targets

* **Average Monthly Churn Target**: 5%
* **Expected Average Lifetime**: $1 / \text{churn} = 20\text{ months}$
* **Customer Lifetime Value (LTV)**:
  $$\text{LTV} = 20 \text{ months} \times \$9.29 = \mathbf{\$185.80}$$
* **Conservative Scenario** (12% monthly churn, 8.3-month lifetime):
  $$\text{LTV} = 8.3 \text{ months} \times \$9.29 = \mathbf{\$77.10}$$
* **Customer Acquisition Cost (CAC) Guardrails**:
  * Target LTV:CAC Ratio: **3.5x to 5.0x**
  * Maximum Allowable CAC: **$15.00 – $22.00**
  * Target Payback Period: **< 2.4 months**

---

## 7. Cost Containment & Financial Guardrails

1. **Sliding-Window Daily Quota**: Hard cap of 1,000 requests/day prevents API scraping or runaway automated loops.
2. **Context Window Token Ceiling**: Prompts are constrained to max 4,000 tokens on server proxy, preventing unexpected bill spikes on gigantic web pages.
3. **Graceful Trial Depletion**: 7-day trials auto-expire and revert to BYOK or prompt for upgrade without unexpected billing.
4. **Instant Stripe Webhook Revocation**: When a subscription is canceled or payment defaults, the license key is immediately invalidated via `customer.subscription.deleted`.
