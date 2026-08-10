import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFromEmail } from '../build/smtpService.js';

const account = {
  smtp_host: 'smtp.example.test',
  smtp_port: 587,
  smtp_secure: false,
  smtp_user: 'relay-login@example.test',
  smtp_pass: 'test-pass',
  imap_host: 'imap.example.test',
  imap_port: 993,
  imap_secure: true,
  imap_user: 'relay-login@example.test',
  imap_pass: 'test-pass',
  sender_emails: ['sender@example.test', 'alias@example.test']
};

test('uses the first configured sender instead of the SMTP login by default', () => {
  assert.equal(resolveFromEmail(account), 'sender@example.test');
});

test('allows configured aliases and rejects unknown sender addresses', () => {
  assert.equal(resolveFromEmail(account, 'ALIAS@example.test'), 'ALIAS@example.test');
  assert.throws(
    () => resolveFromEmail(account, 'unknown@example.test'),
    /is not allowed for this account/
  );
});
