module.exports = {
  meta: {
    name: 'malicious-user-status',
    description: 'Malicious user detection and mitigation status per LB',
    slashCommand: '/xc-maluser',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'check malicious user detection', intent: 'malicious.user.status' },
    { utterance: 'is MUD enabled', intent: 'malicious.user.status' },
    { utterance: 'mal user status', intent: 'malicious.user.status' },
    { utterance: 'malicious user mitigation status', intent: 'malicious.user.status' },
    { utterance: 'is MUM turned on', intent: 'malicious.user.status' },
    { utterance: 'check for malicious user detection', intent: 'malicious.user.status' },
    { utterance: 'is bad user detection enabled', intent: 'malicious.user.status' },
    { utterance: 'show me the MUD config', intent: 'malicious.user.status' },
    { utterance: 'malicious user config on the LB', intent: 'malicious.user.status' },
    { utterance: 'is malicious user mitigation configured', intent: 'malicious.user.status' },
    { utterance: 'check MUD on my load balancer', intent: 'malicious.user.status' },
    { utterance: 'mal user detection on my-lb', intent: 'malicious.user.status' },
    { utterance: 'is the LB detecting malicious users', intent: 'malicious.user.status' },
    { utterance: 'show me the malicious user settings', intent: 'malicious.user.status' },
    { utterance: 'check bad actor detection', intent: 'malicious.user.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      await say({ blocks: formatter.namespacePicker('malicious.user.status', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('malicious.user.status', args.namespace, names, `Check malicious user detection for which LB in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:malicious_user:${name}`;
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

    const mudEnabled = !!spec.enable_malicious_user_detection;
    const mudDisabled = !!spec.disable_malicious_user_detection;

    if (!mudEnabled) {
      const blocks = [
        ...formatter.errorBlock(`No malicious user detection configured on LB \`${name}\` in namespace \`${ns}\`.`),
        formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
      ];
      await say({ blocks });
      return;
    }

    const fields = [
      { label: 'LB', value: name },
      { label: 'Malicious User Detection', value: '🟢 Enabled' },
    ];

    // Check for mitigation policy
    const challengeMitigation = spec.enable_challenge?.malicious_user_mitigation;
    const policyMitigation = spec.policy_based_challenge?.malicious_user_mitigation;
    const mitigation = challengeMitigation || policyMitigation;

    if (mitigation) {
      fields.push({ label: 'Mitigation Policy', value: mitigation.name || 'Custom' });
      if (mitigation.namespace && mitigation.namespace !== ns) {
        fields.push({ label: 'Policy Namespace', value: mitigation.namespace });
      }
    } else if (spec.enable_challenge?.default_mitigation_settings || spec.policy_based_challenge?.default_mitigation_settings) {
      fields.push({ label: 'Mitigation', value: 'Default settings' });
    }

    const blocks = [
      ...formatter.detailView(`Malicious User Detection — ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
