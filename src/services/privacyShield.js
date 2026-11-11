/**
 * Wayfinder AI — Modular Privacy Shield & Safety Net Engine
 *
 * Provider-Pattern Architecture:
 * - Extensible, open-source safety rules.
 * - Redacts sensitive data (credit cards, passwords, SSH keys, GitHub tokens, database URIs, personal PII).
 * - Detects sensitive URLs and DOM contexts (payment gateways, login pages, private code repos, .env files).
 * - Easy for community contributors to add custom safety rules.
 */

/**
 * Base Safety Rule Interface
 */
export class SafetyRule {
  /**
   * @param {Object} options
   * @param {string} options.id - Unique rule identifier
   * @param {string} options.name - Human-readable name
   * @param {string} options.category - 'payment' | 'credential' | 'source_code' | 'personal_pii' | 'medical'
   * @param {string} options.description - Detailed explanation of what this rule guards
   */
  constructor({ id, name, category, description }) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.description = description;
  }

  /**
   * Check if current webpage context should trigger an immediate Privacy Shield halt
   * @param {string} url - Active page URL
   * @param {Document|null} doc - Active page DOM document (if available)
   * @returns {{ isSensitive: boolean, reason?: string }}
   */
  checkPageContext(url, doc) {
    return { isSensitive: false };
  }

  /**
   * Check if a specific DOM element is sensitive and must never be annotated or scraped
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  isSensitiveElement(el) {
    return false;
  }

  /**
   * Redact sensitive tokens from raw user text or page snippets
   * @param {string} text - Raw input text
   * @returns {string} - Sanitized text with sensitive data redacted
   */
  sanitizeText(text) {
    return text;
  }
}

/**
 * Rule 1: Credit Cards, CVVs, IBANs & Payment Gateways
 */
export class PaymentAndCardRule extends SafetyRule {
  constructor() {
    super({
      id: "payment_and_cards",
      name: "Credit Card & Payment Protection",
      category: "payment",
      description: "Guards credit card numbers, CVVs, expiration dates, IBANs, and checkout gateways."
    });
  }

  checkPageContext(url = "", doc = null) {
    const lowerUrl = url.toLowerCase();
    const sensitiveUrls = [
      "/checkout/payment", "/checkout/billing", "/pay", "/payment", "/billing",
      "paypal.com", "checkout.stripe.com", "pay.google.com", "braintreegateway.com"
    ];

    if (sensitiveUrls.some(pat => lowerUrl.includes(pat))) {
      return { isSensitive: true, reason: "Payment checkout or billing gateway active" };
    }

    if (doc) {
      const paymentEl = doc.querySelector(
        "[autocomplete*='cc-'], [autocomplete*='card'], [data-elements-stable-field-name='cardNumber'], " +
        "input[name*='cardnumber' i], input[name*='cvv' i], input[name*='cvc' i], input[id*='creditcard' i], " +
        "iframe[src*='stripe' i], iframe[src*='paypal' i], iframe[src*='braintree' i]"
      );
      if (paymentEl) {
        return { isSensitive: true, reason: "Credit card or payment entry form detected" };
      }
    }

    return { isSensitive: false };
  }

  isSensitiveElement(el) {
    if (!el || !el.getAttribute) return false;
    const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
    const name = (el.getAttribute("name") || "").toLowerCase();
    const id = (el.getAttribute("id") || "").toLowerCase();
    const cls = (el.className && typeof el.className === "string") ? el.className.toLowerCase() : "";

    const terms = /creditcard|cardnumber|card-num|card_number|cvv|cvc|securitycode|exp-date|card-exp/i;
    return auto.includes("cc-") || terms.test(`${auto} ${name} ${id} ${cls}`);
  }

  sanitizeText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      // Credit card numbers (Visa, Mastercard, Amex, Discover with optional spaces/dashes)
      .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, "[CARD_REDACTED]")
      // Amex 15-digit card numbers
      .replace(/\b\d{4}[ -]?\d{6}[ -]?\d{5}\b/g, "[CARD_REDACTED]")
      // CVV / CVC with explicit label
      .replace(/(?:cvv|cvc|security\s*code|cid)\s*[:=]?\s*\b\d{3,4}\b/gi, "[CVV_REDACTED]")
      // IBAN International Bank Account Numbers
      .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, "[IBAN_REDACTED]");
  }
}

/**
 * Rule 2: Passwords, Login Forms & API Authentication Tokens
 */
export class CredentialsAndAuthRule extends SafetyRule {
  constructor() {
    super({
      id: "credentials_and_auth",
      name: "Authentication & Credential Protection",
      category: "credential",
      description: "Guards passwords, login/registration forms, bearer tokens, and JWTs."
    });
  }

  checkPageContext(url = "", doc = null) {
    const lowerUrl = url.toLowerCase();
    const authPaths = [
      "/login", "/signin", "/signup", "/register", "/auth", "/oauth",
      "/account/password", "/forgot-password", "/reset-password", "/two-factor", "/mfa"
    ];

    if (authPaths.some(pat => lowerUrl.includes(pat))) {
      return { isSensitive: true, reason: "Authentication, login, or account security form detected" };
    }

    if (doc) {
      const passwordEl = doc.querySelector("input[type='password'], [autocomplete*='password']");
      if (passwordEl) {
        return { isSensitive: true, reason: "Password entry field present on page" };
      }
    }

    return { isSensitive: false };
  }

  isSensitiveElement(el) {
    if (!el || !el.getAttribute) return false;
    const type = (el.getAttribute("type") || "").toLowerCase();
    const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
    const name = (el.getAttribute("name") || "").toLowerCase();
    const id = (el.getAttribute("id") || "").toLowerCase();

    if (type === "password") return true;
    if (auto.includes("current-password") || auto.includes("new-password") || auto.includes("one-time-code")) return true;
    if (/password|passwd|passcode|secret_key|api_key|auth_token/i.test(`${name} ${id}`)) return true;
    return false;
  }

  sanitizeText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      // Passwords in text or JSON
      .replace(/(?:password|passwd|pin|secret)\s*[:=]\s*[^\s,;]+/gi, "[PASSWORD_REDACTED]")
      // Bearer tokens & Authorization headers
      .replace(/bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "[BEARER_TOKEN_REDACTED]")
      // JSON Web Tokens (JWT)
      .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, "[JWT_REDACTED]");
  }
}

/**
 * Rule 3: Source Code Secrets, Private Repositories & SSH Keys
 * Prevents uploading proprietary code, GitHub private tokens, and server secrets.
 */
export class SourceCodeAndSecretsRule extends SafetyRule {
  constructor() {
    super({
      id: "source_code_and_secrets",
      name: "Source Code & Secret Key Guard",
      category: "source_code",
      description: "Prevents leaking private GitHub repos, SSH private keys, AWS credentials, and database URIs."
    });
  }

  checkPageContext(url = "", doc = null) {
    const lowerUrl = url.toLowerCase();

    // Guard private GitHub/GitLab settings, secrets, and raw internal code files
    const sensitiveDevUrls = [
      "github.com/settings/tokens", "github.com/settings/keys", "/settings/secrets",
      "/settings/variables", "gitlab.com/-/profile/personal_access_tokens",
      ".env", "id_rsa", "id_ed25519", "credentials.json", "service-account.json"
    ];

    if (sensitiveDevUrls.some(pat => lowerUrl.includes(pat))) {
      return { isSensitive: true, reason: "Developer secrets, access tokens, or private credentials page active" };
    }

    return { isSensitive: false };
  }

  sanitizeText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      // SSH / RSA / PGP Private Keys
      .replace(/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, "[PRIVATE_KEY_REDACTED]")
      // GitHub Personal Access Tokens (classic and fine-grained)
      .replace(/\b(?:ghp_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{20,})\b/g, "[GITHUB_TOKEN_REDACTED]")
      // GitLab Personal Access Tokens
      .replace(/\bglpat-[a-zA-Z0-9_-]{20,}\b/g, "[GITLAB_TOKEN_REDACTED]")
      // AWS Access Key IDs
      .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[AWS_KEY_REDACTED]")
      // OpenAI API Keys
      .replace(/\bsk-(?:proj-)?[a-zA-Z0-9_-]{32,}\b/g, "[OPENAI_KEY_REDACTED]")
      // Anthropic Claude API Keys
      .replace(/\bsk-ant-[a-zA-Z0-9_-]{32,}\b/g, "[ANTHROPIC_KEY_REDACTED]")
      // Slack Bot & User Tokens
      .replace(/\bxox[baprs]-[a-zA-Z0-9_-]{10,}\b/g, "[SLACK_TOKEN_REDACTED]")
      // Database Connection Strings with Passwords
      .replace(/(?:postgres|postgresql|mongodb\+srv|mongodb|mysql|redis):\/\/[^:\s]+:[^@\s]+@[^\s/]+/gi, "[DATABASE_URI_REDACTED]")
      // Generic .env key-value secrets
      .replace(/^(?:SECRET|PRIVATE|API_KEY|AUTH_KEY|TOKEN|PASSWORD)=[^\r\n]+/gim, "[ENV_SECRET_REDACTED]");
  }
}

/**
 * Rule 4: Personal Identifiable Information (PII)
 */
export class PersonalInfoRule extends SafetyRule {
  constructor() {
    super({
      id: "personal_pii",
      name: "Personal PII & Identity Protection",
      category: "personal_pii",
      description: "Redacts emails, phone numbers, US SSNs, and government identity IDs."
    });
  }

  sanitizeText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      // US Social Security Numbers (SSN)
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN_REDACTED]")
      // Personal email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]")
      // Phone numbers (international and domestic formats)
      .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE_REDACTED]");
  }
}

/**
 * Main Privacy Shield Engine
 * Manages safety net rules and provides unified client-side sanitization.
 */
export class PrivacyShieldEngine {
  constructor() {
    /** @type {SafetyRule[]} */
    this.rules = [];

    // Register standard out-of-the-box safety net rules
    this.registerRule(new PaymentAndCardRule());
    this.registerRule(new CredentialsAndAuthRule());
    this.registerRule(new SourceCodeAndSecretsRule());
    this.registerRule(new PersonalInfoRule());
  }

  /**
   * Register a new safety rule (Open-Source Extension Point)
   * @param {SafetyRule} rule
   */
  registerRule(rule) {
    if (!rule || !rule.id) {
      throw new Error("Invalid SafetyRule: must have a unique 'id'");
    }
    this.rules.push(rule);
  }

  /**
   * Get all currently registered safety rules
   * @returns {SafetyRule[]}
   */
  getRules() {
    return [...this.rules];
  }

  /**
   * Check if the active webpage should trigger an automatic Privacy Shield halt
   * @param {string} url - Active page URL
   * @param {Document|null} doc - Page document
   * @returns {{ isSensitive: boolean, reason?: string, triggeredRule?: string }}
   */
  checkPageContext(url = "", doc = null) {
    for (const rule of this.rules) {
      const result = rule.checkPageContext(url, doc);
      if (result && result.isSensitive) {
        return {
          isSensitive: true,
          reason: result.reason || rule.name,
          triggeredRule: rule.id
        };
      }
    }
    return { isSensitive: false };
  }

  /**
   * Check if a DOM element is sensitive and should never be marked or scraped
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  isSensitiveElement(el) {
    if (!el) return false;
    for (const rule of this.rules) {
      if (rule.isSensitiveElement(el)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Redact sensitive information through all registered rules sequentially
   * @param {string} text
   * @returns {string}
   */
  sanitizeText(text) {
    if (!text || typeof text !== "string") return "";
    let sanitized = text;
    for (const rule of this.rules) {
      sanitized = rule.sanitizeText(sanitized);
    }
    return sanitized;
  }
}

// Singleton instance for extension runtime
export const PrivacyShield = new PrivacyShieldEngine();

// Export to window for non-module content scripts in Chrome extensions
if (typeof window !== "undefined") {
  window.WayfinderPrivacyShield = PrivacyShield;
}
