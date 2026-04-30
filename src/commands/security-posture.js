module.exports = {
  meta: {
    name: 'security-posture',
    description: 'Summary of all security controls on a load balancer',
    slashCommand: '/xc-security',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'what security is on this LB', intent: 'security.posture' },
    { utterance: 'security posture for my load balancer', intent: 'security.posture' },
    { utterance: 'how secure is this LB', intent: 'security.posture' },
    { utterance: 'security summary for the load balancer', intent: 'security.posture' },
    { utterance: 'show me all security controls on the LB', intent: 'security.posture' },
    { utterance: 'what security features are enabled', intent: 'security.posture' },
    { utterance: 'security overview for my-lb', intent: 'security.posture' },
    { utterance: 'how hardened is the load balancer', intent: 'security.posture' },
    { utterance: 'is the LB fully secured', intent: 'security.posture' },
    { utterance: 'security controls on my load balancer', intent: 'security.posture' },
    { utterance: 'show me the security config for the LB', intent: 'security.posture' },
    { utterance: 'security audit for the load balancer', intent: 'security.posture' },
    { utterance: 'check all security features on the LB', intent: 'security.posture' },
    { utterance: 'what security is configured', intent: 'security.posture' },
    { utterance: 'give me the security posture', intent: 'security.posture' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      await say({ blocks: formatter.namespacePicker('security.posture', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('security.posture', args.namespace, names, `Security posture for which LB in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:security_posture:${name}`;
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

    const on = '🟢';
    const off = '⚪';

    // WAF
    let wafStatus;
    if (spec.disable_waf) {
      wafStatus = `${off} Disabled`;
    } else if (spec.app_firewall) {
      wafStatus = `${on} ${spec.app_firewall.name || 'Enabled'}`;
    } else {
      wafStatus = `${off} None`;
    }

    // Bot Defense
    const botStatus = (spec.bot_defense || spec.bot_defense_advanced)
      ? `${on} Enabled`
      : `${off} Disabled`;

    // Rate Limiting
    let rlStatus;
    if (spec.rate_limit) {
      const threshold = spec.rate_limit.rate_limiter?.total_number;
      rlStatus = threshold
        ? `${on} ${threshold} req/${(spec.rate_limit.rate_limiter?.unit || 'SECOND').toLowerCase()}`
        : `${on} Configured`;
    } else if (spec.api_rate_limit) {
      rlStatus = `${on} API-level`;
    } else {
      rlStatus = `${off} None`;
    }

    // Malicious User Detection
    const mudStatus = spec.enable_malicious_user_detection
      ? `${on} Enabled`
      : `${off} None`;

    // Service Policies
    let policyStatus;
    if (spec.service_policies_from_namespace) {
      policyStatus = `${on} From namespace`;
    } else if (spec.active_service_policies?.policies?.length) {
      const count = spec.active_service_policies.policies.length;
      const names = spec.active_service_policies.policies.map((p) => p.name).join(', ');
      policyStatus = `${on} ${count} (${names})`;
    } else {
      policyStatus = `${off} None`;
    }

    // API Security
    const apiFeatures = [];
    if (spec.enable_api_discovery) apiFeatures.push('Discovery');
    if (spec.api_specification) apiFeatures.push('OAS Enforcement');
    const apiStatus = apiFeatures.length > 0
      ? `${on} ${apiFeatures.join(', ')}`
      : `${off} None`;

    // IP Reputation
    const ipRepStatus = spec.enable_ip_reputation
      ? `${on} Enabled`
      : `${off} None`;

    // DDoS Protection
    const ddosStatus = spec.l7_ddos_protection
      ? `${on} Enabled`
      : `${off} None`;

    const fields = [
      { label: 'WAF', value: wafStatus },
      { label: 'Bot Defense', value: botStatus },
      { label: 'Rate Limiting', value: rlStatus },
      { label: 'Malicious User', value: mudStatus },
      { label: 'Service Policies', value: policyStatus },
      { label: 'API Security', value: apiStatus },
      { label: 'IP Reputation', value: ipRepStatus },
      { label: 'DDoS Protection', value: ddosStatus },
    ];

    const enabledCount = fields.filter((f) => f.value.startsWith(on)).length;
    const scoreLabel = `${enabledCount}/${fields.length} controls active`;

    const blocks = [
      ...formatter.detailView(`Security Posture — ${name}`, fields),
      { type: 'section', text: { type: 'mrkdwn', text: `_${scoreLabel}_` } },
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
