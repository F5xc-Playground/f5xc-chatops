module.exports = {
  meta: {
    name: 'waf-status',
    description: 'WAF policy details for a load balancer',
    slashCommand: '/xc-waf',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'what mode is the WAF in', intent: 'waf.status' },
    { utterance: 'show WAF status', intent: 'waf.status' },
    { utterance: 'is the WAF in blocking mode', intent: 'waf.status' },
    { utterance: 'WAF configuration', intent: 'waf.status' },
    { utterance: 'check the web application firewall', intent: 'waf.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('waf.status', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('waf.status', args.namespace, names, `Check WAF status for which LB in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:waf:${name}`;
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

    if (spec.disable_waf || !spec.app_firewall) {
      await say({
        blocks: [
          ...formatter.errorBlock(`No WAF configured on LB \`${name}\` in namespace \`${ns}\`.`),
          formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
        ],
      });
      return;
    }

    const fwName = spec.app_firewall.name;
    const fw = await tenant.client.get(`/api/config/namespaces/${ns}/app_firewalls/${fwName}`);
    const fwSpec = fw.spec || {};

    const mode = fwSpec.blocking ? 'Blocking' : 'Monitoring';
    const detectionLevel = fwSpec.detection_settings?.signature_selection_setting?.default_attack_type_settings
      ? 'Default' : 'Custom';

    const fields = [
      { label: 'LB', value: name },
      { label: 'Firewall', value: fwName },
      { label: 'Mode', value: mode },
      { label: 'Detection Level', value: detectionLevel },
    ];

    const blocks = [
      ...formatter.detailView(`WAF Status — ${ns}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
