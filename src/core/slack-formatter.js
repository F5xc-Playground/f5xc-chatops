const STATUS_EMOJI = {
  healthy: '🟢',
  online: '🟢',
  valid: '🟢',
  warning: '🟡',
  degraded: '🟡',
  expiring: '🟡',
  critical: '🔴',
  down: '🔴',
  expired: '🔴',
  offline: '🔴',
  unknown: '⚪',
};

function table(columns, rows, { maxColWidth = 40 } = {}) {
  const widths = columns.map((col) => {
    const values = rows.map((r) => String(r[col] ?? ''));
    return Math.min(maxColWidth, Math.max(col.length, ...values.map((v) => v.length)));
  });

  const pad = (str, width) => {
    const s = String(str);
    if (s.length > width) return s.slice(0, width - 1) + '…';
    return s.padEnd(width);
  };

  const header = columns.map((col, i) => pad(col, widths[i])).join('  ');
  const separator = widths.map((w) => '─'.repeat(w)).join('──');
  const body = rows
    .map((row) => columns.map((col, i) => pad(row[col] ?? '', widths[i])).join('  '))
    .join('\n');

  return '```\n' + header + '\n' + separator + '\n' + body + '\n```';
}

function statusLine(status, name, detail) {
  const emoji = STATUS_EMOJI[status] || STATUS_EMOJI.unknown;
  const parts = [emoji, `*${name}*`];
  if (detail) parts.push(detail);
  return parts.join('  ');
}

function detailView(title, fields) {
  const lines = fields.map(({ label, value }) => `*${label}:* ${value}`);
  return [
    { type: 'header', text: { type: 'plain_text', text: title } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ];
}

function errorBlock(message) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ ${message}` },
    },
  ];
}

function footer({ durationMs, cached, namespace }) {
  const parts = [];
  if (durationMs != null) parts.push(`${(durationMs / 1000).toFixed(1)}s`);
  parts.push(cached ? 'cached' : 'live');
  if (namespace) parts.push(`namespace: ${namespace}`);
  return {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: parts.join(' · ') }],
  };
}

function namespacePicker(intentName, namespaces) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Which namespace?' },
      accessory: {
        type: 'external_select',
        placeholder: { type: 'plain_text', text: 'Type to search namespaces...' },
        action_id: `ns_select_${intentName}`,
        min_query_length: 0,
      },
    },
  ];
}

function resourcePicker(intentName, namespace, resourceNames, label) {
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: label || 'Which one?' },
    },
  ];
  for (let i = 0; i < resourceNames.length; i += 20) {
    blocks.push({
      type: 'actions',
      elements: resourceNames.slice(i, i + 20).map((name) => ({
        type: 'button',
        text: { type: 'plain_text', text: name.length > 75 ? name.slice(0, 72) + '...' : name },
        action_id: `res_pick_${name}_${i}`,
        value: JSON.stringify({ intent: intentName, namespace, resourceName: name }),
      })),
    });
  }
  return blocks;
}

function htmlToMrkdwn(html) {
  if (!html || !html.includes('<')) return html || '';
  let text = html;
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, (_, content) => `*${content.trim()}*\n`);
  text = text.replace(/<strong>(.*?)<\/strong>/gi, '*$1*');
  text = text.replace(/<b>(.*?)<\/b>/gi, '*$1*');
  text = text.replace(/<em>(.*?)<\/em>/gi, '_$1_');
  text = text.replace(/<i>(.*?)<\/i>/gi, '_$1_');
  text = text.replace(/<code>(.*?)<\/code>/gi, '`$1`');
  text = text.replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '<$1|$2>');
  text = text.replace(/<hr\s*\/?>/gi, '---');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, items) => {
    let idx = 0;
    return items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, content) => {
      idx++;
      return `${idx}. ${content.replace(/<\/?p[^>]*>/gi, '').trim()}\n`;
    });
  });
  text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, items) =>
    items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (__, content) =>
      `• ${content.replace(/<\/?p[^>]*>/gi, '').trim()}\n`
    )
  );
  text = text.replace(/<\/?(?:p|div)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

module.exports = { table, statusLine, detailView, errorBlock, footer, namespacePicker, resourcePicker, htmlToMrkdwn };
