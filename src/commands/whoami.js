module.exports = {
  meta: {
    name: 'whoami',
    description: 'Show bot identity, accessible namespaces, and roles',
    slashCommand: '/xc-whoami',
    category: 'core',
  },
  intents: [
    { utterance: 'what namespaces can you see', intent: 'whoami' },
    { utterance: 'who are you', intent: 'whoami' },
    { utterance: 'show me your access', intent: 'whoami' },
    { utterance: 'what can you access', intent: 'whoami' },
    { utterance: 'what roles do you have', intent: 'whoami' },
  ],
  entities: [],
  handler: async ({ say, tenant, formatter }) => {
    const whoami = tenant.cachedWhoami;
    if (!whoami) {
      await say({ blocks: formatter.errorBlock('No whoami data available. Bot may not be fully initialized.') });
      return;
    }

    const nsRoleMap = whoami.namespace_access?.namespace_role_map || {};
    const fields = [
      { label: 'Tenant', value: tenant.name },
      { label: 'Email', value: whoami.email || 'N/A' },
      { label: 'Namespaces', value: String(Object.keys(nsRoleMap).length) },
    ];

    const blocks = formatter.detailView('🤖 Bot Identity', fields);

    const nsEntries = Object.entries(nsRoleMap);
    if (nsEntries.length > 0) {
      const rows = nsEntries.map(([ns, info]) => ({
        namespace: ns,
        roles: (info.roles || []).join(', '),
      }));
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: formatter.table(['namespace', 'roles'], rows) },
      });
    }

    await say({ blocks });
  },
};
