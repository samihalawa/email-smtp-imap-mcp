import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('serves all tools over stdio and marks failed calls as errors', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('build/index.js')],
    env: {
      PATH: process.env.PATH || '',
      EMAIL_ACCOUNTS_JSON: JSON.stringify({
        test: {
          smtp: { host: 'smtp.test', user: 'test@example.com', password: 'test-pass' },
          imap: { host: 'imap.test', user: 'test@example.com', password: 'test-pass' }
        }
      }),
      DEFAULT_EMAIL_ACCOUNT: 'test'
    }
  });
  const client = new Client({ name: 'email-mcp-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      ['email_respond', 'email_send', 'emails_find', 'emails_modify', 'folders_list']
    );

    const result = await client.callTool({
      name: 'emails_modify',
      arguments: { email_ids: [] }
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /email_ids is required/);
  } finally {
    await client.close();
  }
});
