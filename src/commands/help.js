module.exports = {
  meta: {
    name: 'help',
    description: 'List all commands or get detail on a specific command',
    slashCommand: '/xc-help',
    category: 'core',
  },
  intents: [
    { utterance: 'what can you do', intent: 'help' },
    { utterance: 'show me the help', intent: 'help' },
    { utterance: 'help me', intent: 'help' },
    { utterance: 'list commands', intent: 'help' },
    { utterance: 'how do I use this', intent: 'help' },
  ],
  entities: [],
  handler: async ({ say, args, commandRegistry, formatter }) => {
    const query = (args.raw || '').trim();

    if (query && !query.includes(' ')) {
      const cmd = commandRegistry.commands.find((c) => c.meta.name === query);
      if (!cmd) {
        await say({ blocks: formatter.errorBlock(`Unknown command: "${query}". Try \`/xc-help\` to see all commands.`) });
        return;
      }
      const fields = [
        { label: 'Description', value: cmd.meta.description },
      ];
      if (cmd.meta.slashCommand) {
        fields.push({ label: 'Slash Command', value: `\`${cmd.meta.slashCommand}\`` });
      }
      if (cmd.intents && cmd.intents.length > 0) {
        fields.push({
          label: 'Example Phrases',
          value: cmd.intents.map((i) => `"${i.utterance}"`).join('\n'),
        });
      }
      await say({ blocks: formatter.detailView(`📖 ${cmd.meta.name}`, fields) });
      return;
    }

    const grouped = {};
    for (const cmd of commandRegistry.commands) {
      const cat = cmd.meta.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(cmd);
    }

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '📖 Available Commands' } },
    ];

    for (const [category, cmds] of Object.entries(grouped)) {
      const lines = cmds.map((c) => {
        const slash = c.meta.slashCommand ? `\`${c.meta.slashCommand}\`` : '';
        return `*${c.meta.name}* ${slash} — ${c.meta.description}`;
      });
      blocks.push(
        { type: 'section', text: { type: 'mrkdwn', text: `*${category.toUpperCase()}*\n${lines.join('\n')}` } },
        { type: 'divider' }
      );
    }

    await say({ blocks });
  },
};
