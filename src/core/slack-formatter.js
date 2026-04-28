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
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title } },
  ];

  const fieldPairs = [];
  for (const { label, value } of fields) {
    fieldPairs.push({ type: 'mrkdwn', text: `*${label}*\n${value}` });
  }

  for (let i = 0; i < fieldPairs.length; i += 10) {
    blocks.push({
      type: 'section',
      fields: fieldPairs.slice(i, i + 10),
    });
  }

  return blocks;
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
    },
    {
      type: 'actions',
      elements: namespaces.slice(0, 20).map((ns) => ({
        type: 'button',
        text: { type: 'plain_text', text: ns },
        action_id: `ns_pick_${ns}`,
        value: JSON.stringify({ intent: intentName, namespace: ns }),
      })),
    },
  ];
}

module.exports = { table, statusLine, detailView, errorBlock, footer, namespacePicker };
