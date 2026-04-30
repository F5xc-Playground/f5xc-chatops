module.exports = {
  meta: {
    name: 'bot-defense-status',
    description: 'Bot defense configuration status per LB',
    slashCommand: '/xc-bot',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'is bot defense enabled', intent: 'bot.defense.status' },
    { utterance: 'check bot defense', intent: 'bot.defense.status' },
    { utterance: 'bot defense status', intent: 'bot.defense.status' },
    { utterance: 'show bot defense config', intent: 'bot.defense.status' },
    { utterance: 'is the bot defense turned on', intent: 'bot.defense.status' },
    { utterance: 'is bot mitigation active', intent: 'bot.defense.status' },
    { utterance: 'are bots being blocked', intent: 'bot.defense.status' },
    { utterance: 'is crawler defense on', intent: 'bot.defense.status' },
    { utterance: 'check if bot defense is configured', intent: 'bot.defense.status' },
    { utterance: 'is the LB defending against bots', intent: 'bot.defense.status' },
    { utterance: 'bot defense on my load balancer', intent: 'bot.defense.status' },
    { utterance: 'show me the bot config', intent: 'bot.defense.status' },
    { utterance: 'what is the bot defense setting', intent: 'bot.defense.status' },
    { utterance: 'is scraping prevention enabled', intent: 'bot.defense.status' },
    { utterance: 'check for bot defense on the LB', intent: 'bot.defense.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('bot.defense.status', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('bot.defense.status', args.namespace, names, `Check bot defense for which LB in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:bot_defense:${name}`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await say({ blocks: cached.blocks });
        return;
      }
    }

    const startTime = Date.now();
    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    const enabled = !!spec.bot_defense;

    const fields = [
      { label: 'LB', value: name },
      { label: 'Bot Defense', value: enabled ? 'Enabled' : 'Disabled' },
    ];

    if (enabled && spec.bot_defense.regional_endpoint) {
      fields.push({ label: 'Endpoint', value: spec.bot_defense.regional_endpoint });
    }

    const blocks = [
      ...formatter.detailView(`Bot Defense — ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
