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
  const real = namespaces.filter((ns) => ns !== '*');
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: 'Which namespace?' },
    },
    {
      type: 'actions',
      elements: real.slice(0, 20).map((ns) => ({
        type: 'button',
        text: { type: 'plain_text', text: ns },
        action_id: `ns_pick_${ns}`,
        value: JSON.stringify({ intent: intentName, namespace: ns }),
      })),
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

module.exports = { table, statusLine, detailView, errorBlock, footer, namespacePicker, resourcePicker };
