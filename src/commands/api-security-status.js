module.exports = {
  meta: {
    name: 'api-security-status',
    description: 'API discovery and protection status',
    slashCommand: '/xc-api-sec',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'show api discovery findings', intent: 'api.security' },
    { utterance: 'api security status', intent: 'api.security' },
    { utterance: 'are there any shadow APIs', intent: 'api.security' },
    { utterance: 'check API discovery', intent: 'api.security' },
    { utterance: 'is API discovery enabled', intent: 'api.security' },
    { utterance: 'show API endpoints discovered', intent: 'api.security' },
    { utterance: 'API inventory scan', intent: 'api.security' },
    { utterance: 'is there an OpenAPI spec enforced', intent: 'api.security' },
    { utterance: 'show me the API protection status', intent: 'api.security' },
    { utterance: 'are APIs being discovered', intent: 'api.security' },
    { utterance: 'check for shadow APIs', intent: 'api.security' },
    { utterance: 'is OAS enforcement turned on', intent: 'api.security' },
    { utterance: 'API discovery status in prod', intent: 'api.security' },
    { utterance: 'what APIs have been discovered', intent: 'api.security' },
    { utterance: 'show me the API spec enforcement', intent: 'api.security' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('api.security', tenant.namespaces || []) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:api_security`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await say({ blocks: cached.blocks });
        return;
      }
    }

    const startTime = Date.now();
    const lbData = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers`);
    const lbs = lbData.items || [];

    const lines = [];
    for (const lb of lbs) {
      const name = lb.name || lb.metadata?.name;
      const spec = lb.spec || {};
      const apiDiscovery = spec.enable_api_discovery ? '🟢 Discovery' : '';
      const apiProtection = spec.api_protection_rules ? '🟢 Protection' : '';
      const apiDef = spec.api_specification ? '🟢 Spec' : '';
      const features = [apiDiscovery, apiProtection, apiDef].filter(Boolean).join(', ');
      const status = features || '⚪ None';
      lines.push(`*${name}* — ${status}`);
    }

    if (lines.length === 0) {
      await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${ns}\`.`) });
      return;
    }

    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `API Security — ${ns}` } },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
