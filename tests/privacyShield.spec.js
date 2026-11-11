import { test, expect } from '@playwright/test';
import {
  PrivacyShield,
  SafetyRule,
  PaymentAndCardRule,
  CredentialsAndAuthRule,
  SourceCodeAndSecretsRule,
  PersonalInfoRule
} from '../src/services/privacyShield.js';

test.describe('Wayfinder AI — Modular Privacy Shield Engine Tests', () => {

  test('PS-1: Payment & Card Rule redacts credit cards, CVVs, and IBANs', () => {
    const raw = 'Please charge card 4532-1234-5678-9010 with CVV 842. Alternative card 3782-822468-12345. IBAN GB29XUID20041538356942.';
    const sanitized = PrivacyShield.sanitizeText(raw);

    expect(sanitized).not.toContain('4532-1234-5678-9010');
    expect(sanitized).toContain('[CARD_REDACTED]');
    expect(sanitized).not.toContain('842');
    expect(sanitized).toContain('[CVV_REDACTED]');
    expect(sanitized).not.toContain('GB29XUID20041538356942');
    expect(sanitized).toContain('[IBAN_REDACTED]');
  });

  test('PS-2: Credentials & Auth Rule redacts passwords, Bearer tokens, and JWTs', () => {
    const raw = 'Login with password: SuperSecretPass123! Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const sanitized = PrivacyShield.sanitizeText(raw);

    expect(sanitized).not.toContain('SuperSecretPass123!');
    expect(sanitized).toContain('[PASSWORD_REDACTED]');
    expect(sanitized).not.toContain('eyJhbGci');
    expect(sanitized).toContain('[BEARER_TOKEN_REDACTED]');
  });

  test('PS-3: Source Code & Secrets Rule redacts GitHub tokens, AWS keys, database URIs, and SSH keys', () => {
    const rawToken = 'My GitHub token is ghp_1234567890abcdefghijklmnopqrstuvwxyz and fine-grained github_pat_11AAAAAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const rawAws = 'AWS key is AKIAIOSFODNN7EXAMPLE';
    const rawDb = 'Connected to postgres://app_user:super_secure_db_pass@db.production.internal:5432/main';
    const rawKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y...\n-----END RSA PRIVATE KEY-----';

    const fullText = `${rawToken}\n${rawAws}\n${rawDb}\n${rawKey}`;
    const sanitized = PrivacyShield.sanitizeText(fullText);

    expect(sanitized).not.toContain('ghp_');
    expect(sanitized).not.toContain('github_pat_');
    expect(sanitized).toContain('[GITHUB_TOKEN_REDACTED]');

    expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(sanitized).toContain('[AWS_KEY_REDACTED]');

    expect(sanitized).not.toContain('super_secure_db_pass');
    expect(sanitized).toContain('[DATABASE_URI_REDACTED]');

    expect(sanitized).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(sanitized).toContain('[PRIVATE_KEY_REDACTED]');
  });

  test('PS-4: Personal Info Rule redacts SSNs, personal emails, and phone numbers', () => {
    const raw = 'Contact Alice at alice.smith@corp.example.com or call +1 (555) 234-5678. SSN: 123-45-6789.';
    const sanitized = PrivacyShield.sanitizeText(raw);

    expect(sanitized).not.toContain('alice.smith@corp.example.com');
    expect(sanitized).toContain('[EMAIL_REDACTED]');
    expect(sanitized).not.toContain('123-45-6789');
    expect(sanitized).toContain('[SSN_REDACTED]');
    expect(sanitized).not.toContain('(555) 234-5678');
    expect(sanitized).toContain('[PHONE_REDACTED]');
  });

  test('PS-5: checkPageContext detects sensitive URLs (checkout, login, secrets)', () => {
    const checkoutResult = PrivacyShield.checkPageContext('https://store.example.com/checkout/payment');
    expect(checkoutResult.isSensitive).toBe(true);
    expect(checkoutResult.triggeredRule).toBe('payment_and_cards');

    const loginResult = PrivacyShield.checkPageContext('https://auth.example.com/signin');
    expect(loginResult.isSensitive).toBe(true);
    expect(loginResult.triggeredRule).toBe('credentials_and_auth');

    const githubSecretsResult = PrivacyShield.checkPageContext('https://github.com/my-org/my-repo/settings/secrets');
    expect(githubSecretsResult.isSensitive).toBe(true);
    expect(githubSecretsResult.triggeredRule).toBe('source_code_and_secrets');

    const normalPageResult = PrivacyShield.checkPageContext('https://docs.example.com/getting-started');
    expect(normalPageResult.isSensitive).toBe(false);
  });

  test('PS-6: Open-source extensibility — allows registering custom community rules', () => {
    class CustomMedicalRule extends SafetyRule {
      constructor() {
        super({
          id: 'custom_medical',
          name: 'Medical Record ID Guard',
          category: 'medical',
          description: 'Redacts patient MRN numbers.'
        });
      }
      sanitizeText(text) {
        return text.replace(/\bMRN-\d{6,8}\b/g, '[MRN_REDACTED]');
      }
    }

    PrivacyShield.registerRule(new CustomMedicalRule());

    const raw = 'Patient file notes for MRN-98765432.';
    const sanitized = PrivacyShield.sanitizeText(raw);
    expect(sanitized).not.toContain('MRN-98765432');
    expect(sanitized).toContain('[MRN_REDACTED]');
  });

});
