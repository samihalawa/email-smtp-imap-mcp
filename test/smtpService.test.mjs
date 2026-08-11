import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReplyRecipients, resolveFromEmail } from '../build/smtpService.js';

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

test('builds reply-all recipients without adding the account or its aliases', () => {
  const recipients = buildReplyRecipients(account, {
    from: 'Sender <sender@outside.test>',
    reply_to: 'Replies <reply@outside.test>',
    to: ['Alias <alias@example.test>', 'Colleague <colleague@outside.test>'],
    cc: ['Login <relay-login@example.test>', 'COLLEAGUE@outside.test', 'Other <other@outside.test>']
  }, true);

  assert.deepEqual(recipients, [
    'reply@outside.test',
    'colleague@outside.test',
    'other@outside.test'
  ]);
});

test('uses explicit reply recipients as the documented override', () => {
  const recipients = buildReplyRecipients(account, {
    from: 'sender@outside.test',
    to: [],
    cc: []
  }, true, ['override@example.test']);

  assert.deepEqual(recipients, ['override@example.test']);
});
