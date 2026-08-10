import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSearchCriteria } from '../build/imapService.js';

test('builds exact false-valued read and flag filters', () => {
  assert.deepEqual(buildSearchCriteria({ is_unread: true, is_flagged: false }), {
    seen: false,
    flagged: false
  });
});

test('turns a text query into a portable multi-field IMAP search', () => {
  assert.deepEqual(buildSearchCriteria({ after_date: '2026-08-01' }, 'quarterly report'), {
    since: new Date('2026-08-01'),
    or: [
      { subject: 'quarterly report' },
      { body: 'quarterly report' },
      { from: 'quarterly report' },
      { to: 'quarterly report' }
    ]
  });
});
