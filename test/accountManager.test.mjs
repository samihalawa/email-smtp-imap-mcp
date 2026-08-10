import assert from 'node:assert/strict';
import test from 'node:test';

import { getAccount, loadAccounts } from '../build/accountManager.js';

const managedKeys = [
  'EMAIL_ACCOUNTS_JSON',
  'DEFAULT_EMAIL_ACCOUNT',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'IMAP_HOST',
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
