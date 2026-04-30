module.exports = {
  meta: {
    name: 'whoami',
    description: 'Show bot identity, accessible namespaces, and roles',
    slashCommand: '/xc-whoami',
    category: 'core',
  },
  intents: [
    { utterance: 'who am I', intent: 'whoami' },
    { utterance: 'what namespaces can you see', intent: 'whoami' },
    { utterance: 'what roles do you have', intent: 'whoami' },
    { utterance: 'show me your identity', intent: 'whoami' },
    { utterance: 'what tenant are you connected to', intent: 'whoami' },
    { utterance: 'bot identity', intent: 'whoami' },
    { utterance: 'what access do you have', intent: 'whoami' },
    { utterance: 'which namespaces can you access', intent: 'whoami' },
    { utterance: 'show me your credentials', intent: 'whoami' },
    { utterance: 'what account are you using', intent: 'whoami' },
    { utterance: 'show me the bot identity', intent: 'whoami' },
    { utterance: 'what permissions does the bot have', intent: 'whoami' },
    { utterance: 'tell me about the bot account', intent: 'whoami' },
    { utterance: 'show me your roles and namespaces', intent: 'whoami' },
    { utterance: 'what can you access', intent: 'whoami' },
  ],
  entities: [],
  handler: async ({ say, tenant, formatter }) => {
    const whoami = tenant.cachedWhoami;
    if (!whoami) {
      await say({ blocks: formatter.errorBlock('No whoami data available. Bot may not be fully initialized.') });
      return;
    }

    const namespaces = tenant.namespaces || [];
    const fields = [
      { label: 'Tenant', value: tenant.name },
      { label: 'Email', value: whoami.email || 'N/A' },
      { label: 'Namespaces', value: String(namespaces.length) },
    ];

    const blocks = formatter.detailView('Bot Identity', fields);

    if (namespaces.length > 0) {
      const rows = namespaces.map((ns) => ({ namespace: ns }));
      blocks.push({ type: 'divider' });
      blocks.push(formatter.tableBlock(['namespace'], rows));
    }

    await say({ blocks });
  },
};
