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

  describe('namespacePicker', () => {
    test('renders dropdown with sorted namespaces', () => {
      const blocks = fmt.namespacePicker('quota.check', ['system', 'prod', 'staging']);
      const section = blocks.find((b) => b.type === 'section');
      const select = section.accessory;
      expect(select.type).toBe('static_select');
      expect(select.action_id).toBe('ns_select');
      expect(select.options).toHaveLength(3);
      expect(select.options[0].text.text).toBe('prod');
      expect(select.options[1].text.text).toBe('staging');
      expect(select.options[2].text.text).toBe('system');
    });

    test('filters wildcard namespace', () => {
      const blocks = fmt.namespacePicker('quota.check', ['prod', '*', 'staging']);
      const select = blocks[0].accessory;
      expect(select.options).toHaveLength(2);
    });
  });
});
