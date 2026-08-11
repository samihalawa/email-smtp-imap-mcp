import assert from 'node:assert/strict';
import test from 'node:test';

import { getAccount, loadAccounts } from '../build/accountManager.js';

const managedKeys = [
  'EMAIL_ACCOUNTS_JSON',
  'DEFAULT_EMAIL_ACCOUNT',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_USERNAME',
  'SMTP_PASS',
  'SMTP_PASSWORD',
  'IMAP_HOST',
  'IMAP_PORT',
  'IMAP_SECURE',
  'IMAP_USER',
  'IMAP_USERNAME',
  'IMAP_PASS',
  'IMAP_PASSWORD',
  'SENDER_EMAILS'
];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(managedKeys.map((key) => [key, process.env[key]]));
  for (const key of managedKeys) delete process.env[key];
  Object.assign(process.env, values);

  try {
    return callback();
  } finally {
    for (const key of managedKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('loads nested multi-account configuration and selects the default', () => {
  withEnvironment({
    DEFAULT_EMAIL_ACCOUNT: 'personal',
    EMAIL_ACCOUNTS_JSON: JSON.stringify({
      work: {
        smtp: { host: 'smtp.work.test', port: 587, user: 'work@test', password: 'work-pass' },
        imap: { host: 'imap.work.test', port: 993, user: 'work@test', password: 'work-pass' }
      },
      personal: {
        smtp: { host: 'smtp.personal.test', port: 465, secure: true, user: 'me@test', password: 'personal-pass' },
        imap: { host: 'imap.personal.test', port: 993, user: 'me@test', password: 'personal-pass' },
        sender_emails: ['me@test', 'alias@test']
      }
    })
  }, () => {
    const accounts = loadAccounts();
    assert.deepEqual(Object.keys(accounts), ['work', 'personal']);
    assert.equal(accounts.personal.smtp_secure, true);
    assert.deepEqual(accounts.personal.sender_emails, ['me@test', 'alias@test']);
    assert.equal(getAccount().name, 'personal');
  });
});

test('supports flat environment aliases and comma-separated sender addresses', () => {
  withEnvironment({
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'owner@test',
    SMTP_PASS: 'smtp-pass',
    IMAP_HOST: 'imap.example.test',
    SENDER_EMAILS: 'owner@test, alias@test'
  }, () => {
    const account = loadAccounts().default;
    assert.equal(account.imap_user, 'owner@test');
    assert.equal(account.imap_pass, 'smtp-pass');
    assert.deepEqual(account.sender_emails, ['owner@test', 'alias@test']);
  });
});

test('does not impose an account-count limit', () => {
  const configuredAccounts = Object.fromEntries(
    Array.from({ length: 100 }, (_, index) => [`account-${index + 1}`, {
      smtp: { host: 'smtp.example.test', user: `user-${index + 1}@test`, password: 'smtp-pass' },
      imap: { host: 'imap.example.test', user: `user-${index + 1}@test`, password: 'imap-pass' }
    }])
  );

  withEnvironment({ EMAIL_ACCOUNTS_JSON: JSON.stringify(configuredAccounts) }, () => {
    const accounts = loadAccounts();
    assert.equal(Object.keys(accounts).length, 100);
    assert.equal(getAccount('account-100').config.smtp_user, 'user-100@test');
  });
});

test('validates every JSON account and the selected default', () => {
  withEnvironment({
    EMAIL_ACCOUNTS_JSON: JSON.stringify({
      incomplete: {
        smtp: { host: 'smtp.example.test', user: 'user@test', password: 'smtp-pass' }
      }
    })
  }, () => {
    assert.throws(() => loadAccounts(), /Account "incomplete" is missing required fields: imap.host/);
  });

  withEnvironment({
    DEFAULT_EMAIL_ACCOUNT: 'missing',
    EMAIL_ACCOUNTS_JSON: JSON.stringify({
      configured: {
        smtp: { host: 'smtp.example.test', user: 'user@test', password: 'smtp-pass' },
        imap: { host: 'imap.example.test', user: 'user@test', password: 'imap-pass' }
      }
    })
  }, () => {
    assert.throws(() => loadAccounts(), /DEFAULT_EMAIL_ACCOUNT "missing" was not found/);
  });
});

test('rejects invalid ports and boolean values before connecting', () => {
  withEnvironment({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: 'not-a-port',
    SMTP_USER: 'owner@test',
    SMTP_PASS: 'smtp-pass',
    IMAP_HOST: 'imap.example.test'
  }, () => {
    assert.throws(() => loadAccounts(), /SMTP_PORT must be an integer between 1 and 65535/);
  });

  withEnvironment({
    SMTP_HOST: 'smtp.example.test',
    SMTP_SECURE: 'sometimes',
    SMTP_USER: 'owner@test',
    SMTP_PASS: 'smtp-pass',
    IMAP_HOST: 'imap.example.test'
  }, () => {
    assert.throws(() => loadAccounts(), /SMTP_SECURE must be true or false/);
  });
});
