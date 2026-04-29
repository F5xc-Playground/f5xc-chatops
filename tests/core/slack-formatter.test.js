const fmt = require('../../src/core/slack-formatter');

describe('slack-formatter', () => {
  describe('table', () => {
    test('renders monospace table with header separator', () => {
      const rows = [
        { name: 'http_loadbalancers', used: 12, limit: 25 },
        { name: 'origin_pools', used: 43, limit: 50 },
      ];
      const result = fmt.table(['name', 'used', 'limit'], rows);
      expect(result).toContain('http_loadbalancers');
      expect(result).toContain('origin_pools');
      expect(result).toContain('───');
    });

    test('truncates long values', () => {
      const rows = [{ name: 'a'.repeat(100), val: 'short' }];
      const result = fmt.table(['name', 'val'], rows, { maxColWidth: 20 });
      expect(result).toContain('…');
    });
  });

  describe('statusLine', () => {
    test('renders green status', () => {
      const result = fmt.statusLine('healthy', 'my-lb', 'some detail');
      expect(result).toContain('🟢');
      expect(result).toContain('my-lb');
    });

    test('renders red status', () => {
      const result = fmt.statusLine('critical', 'my-lb', 'down');
      expect(result).toContain('🔴');
    });

    test('renders yellow status', () => {
      const result = fmt.statusLine('warning', 'my-lb', 'degraded');
      expect(result).toContain('🟡');
    });

    test('renders unknown status', () => {
      const result = fmt.statusLine('unknown', 'my-lb', '');
      expect(result).toContain('⚪');
    });
  });

  describe('detailView', () => {
    test('returns blocks with header and inline key-value lines', () => {
      const blocks = fmt.detailView('🔷 My LB', [
        { label: 'Namespace', value: 'prod' },
        { label: 'Domains', value: 'example.com' },
      ]);
      expect(blocks[0].type).toBe('header');
      expect(blocks[0].text.text).toBe('🔷 My LB');
      const text = blocks[1].text.text;
      expect(text).toContain('*Namespace:* prod');
      expect(text).toContain('*Domains:* example.com');
    });
  });

  describe('errorBlock', () => {
    test('returns context block with message', () => {
      const blocks = fmt.errorBlock('Something went wrong');
      expect(blocks[0].type).toBe('section');
      expect(blocks[0].text.text).toContain('Something went wrong');
    });
  });

  describe('footer', () => {
    test('includes duration and cache status', () => {
      const block = fmt.footer({ durationMs: 1200, cached: true, namespace: 'prod' });
      expect(block.type).toBe('context');
      expect(block.elements[0].text).toContain('1.2s');
      expect(block.elements[0].text).toContain('cached');
      expect(block.elements[0].text).toContain('prod');
    });
  });

  describe('tableBlock', () => {
    test('returns native Slack table block with header row', () => {
      const rows = [
        { name: 'lb-1', status: 'online' },
        { name: 'lb-2', status: 'offline' },
      ];
      const block = fmt.tableBlock(['name', 'status'], rows);
      expect(block.type).toBe('table');
      expect(block.rows).toHaveLength(3);
      expect(block.rows[0][0]).toEqual({ type: 'raw_text', text: 'name' });
      expect(block.rows[1][0]).toEqual({ type: 'raw_text', text: 'lb-1' });
      expect(block.rows[2][1]).toEqual({ type: 'raw_text', text: 'offline' });
    });

    test('caps at TABLE_MAX_ROWS', () => {
      const rows = Array.from({ length: 150 }, (_, i) => ({ n: `r${i}` }));
      const block = fmt.tableBlock(['n'], rows);
      expect(block.rows).toHaveLength(101);
    });
  });

  describe('csvString', () => {
    test('generates CSV with header and data', () => {
      const rows = [
        { name: 'lb-1', ns: 'prod' },
        { name: 'lb-2', ns: 'staging' },
      ];
      const csv = fmt.csvString(['name', 'ns'], rows);
      expect(csv).toBe('name,ns\nlb-1,prod\nlb-2,staging');
    });

    test('quotes values containing commas', () => {
      const rows = [{ name: 'a, b', ns: 'prod' }];
      const csv = fmt.csvString(['name', 'ns'], rows);
      expect(csv).toContain('"a, b"');
    });
  });

  describe('namespacePicker', () => {
    test('renders external_select in actions block', () => {
      const blocks = fmt.namespacePicker('quota.check', ['system', 'prod', 'staging']);
      const actions = blocks.find((b) => b.type === 'actions');
      const select = actions.elements[0];
      expect(select.type).toBe('external_select');
      expect(select.action_id).toBe('ns_select_quota.check');
      expect(select.min_query_length).toBe(0);
    });
  });
});
