const RESOURCE_PATHS = {
  http_loadbalancer: 'http_loadbalancers',
  tcp_loadbalancer: 'tcp_loadbalancers',
  udp_loadbalancer: 'udp_loadbalancers',
  origin_pool: 'origin_pools',
  app_firewall: 'app_firewalls',
  service_policy: 'service_policys',
  certificate: 'certificates',
  healthcheck: 'healthchecks',
  rate_limiter: 'rate_limiters',
  dns_zone: 'dns_zones',
  dns_load_balancer: 'dns_load_balancers',
  route: 'routes',
  virtual_network: 'virtual_networks',
  network_policy: 'network_policys',
  ip_prefix_set: 'ip_prefix_sets',
};

const INVENTORY_TYPES = new Set(['http_loadbalancer', 'tcp_loadbalancer', 'udp_loadbalancer']);

const INVENTORY_RESULTS_KEY = {
  http_loadbalancer: { section: 'http_loadbalancers', items: 'httplb_results' },
  tcp_loadbalancer: { section: 'tcp_loadbalancers', items: 'tcplb_results' },
  udp_loadbalancer: { section: 'udp_loadbalancers', items: 'udplb_results' },
};

module.exports = {
  meta: {
    name: 'list-resources',
    description: 'List resources of a given type in a namespace',
    slashCommand: '/xc-list',
    cacheTTL: 300,
    category: 'core',
  },

  intents: [
    { utterance: 'list all load balancers in prod', intent: 'list.resources' },
    { utterance: 'show me all origin pools in staging', intent: 'list.resources' },
    { utterance: 'what resources are in namespace prod', intent: 'list.resources' },
    { utterance: 'list certificates in prod', intent: 'list.resources' },
    { utterance: 'show WAF policies in staging', intent: 'list.resources' },
    { utterance: 'show me all WAF policies', intent: 'list.resources' },
    { utterance: 'list all firewalls', intent: 'list.resources' },
    { utterance: 'list app firewalls', intent: 'list.resources' },
    { utterance: 'show me all service policies', intent: 'list.resources' },
    { utterance: 'list DNS zones', intent: 'list.resources' },
    { utterance: 'list rate limiters', intent: 'list.resources' },
    { utterance: 'list all load balancers', intent: 'list.resources' },
    { utterance: 'show me all LBs', intent: 'list.resources' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter, client }) => {
    if (args.namespace && !args.resourceName && !args.resourceType) {
      const resolved = resolveResourceType(args.namespace);
      if (RESOURCE_PATHS[resolved]) {
        args.resourceType = resolved;
        args.namespace = null;
      }
    }

    let resourceType = resolveResourceType(args.resourceType || args.resourceName || 'http_loadbalancer');
    const apiPath = RESOURCE_PATHS[resourceType];

    if (!apiPath) {
      const known = Object.keys(RESOURCE_PATHS).join(', ');
      await say({ blocks: formatter.errorBlock(`Unknown resource type: "${resourceType}". Known types: ${known}`) });
      return;
    }

    if (!args.namespace && INVENTORY_TYPES.has(resourceType)) {
      await handleInventory(say, tenant, cache, args, formatter, resourceType, client);
      return;
    }

    if (!args.namespace) {
      await say({ blocks: formatter.namespacePicker('list.resources', tenant.namespaces || []) });
      return;
    }

    const ns = args.namespace;
    const cacheKey = `${tenant.name}:${ns}:${resourceType}:list`;
    if (!args.fresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        await renderList(say, formatter, resourceType, ns, cached, true, undefined, client, args._channelId);
        return;
      }
    }

    const startTime = Date.now();
    const prefix = resourceType.startsWith('dns_') ? 'dns' : 'config';
    const data = await tenant.client.get(`/api/${prefix}/namespaces/${ns}/${apiPath}`);
    let items = data.items || [];

    if (resourceType.includes('loadbalancer') && items.length > 0) {
      const detailed = await Promise.allSettled(
        items.slice(0, formatter.TABLE_MAX_ROWS).map((item) => {
          const name = item.name || item.metadata?.name;
          return name ? tenant.client.get(`/api/${prefix}/namespaces/${ns}/${apiPath}/${name}`) : Promise.resolve(item);
        })
      );
      items = detailed.map((r, i) => (r.status === 'fulfilled' ? r.value : items[i]));
    }

    cache.set(cacheKey, items, 300);
    await renderList(say, formatter, resourceType, ns, items, false, Date.now() - startTime, client, args._channelId);
  },
};

function resolveResourceType(input) {
  if (RESOURCE_PATHS[input]) return input;
  const match = Object.keys(RESOURCE_PATHS).find(
    (k) => RESOURCE_PATHS[k] === input || k + 's' === input
  );
  if (match) return match;
  if (input.endsWith('ies')) {
    const yForm = input.replace(/ies$/, 'y');
    if (RESOURCE_PATHS[yForm]) return yForm;
  }
  return input;
}

async function handleInventory(say, tenant, cache, args, formatter, resourceType, client) {
  const cacheKey = `${tenant.name}:inventory:${resourceType}`;
  if (!args.fresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      await renderInventory(say, formatter, resourceType, cached, true, undefined, client, args._channelId);
      return;
    }
  }

  const startTime = Date.now();
  const body = {
    http_load_balancer_filter: {},
    tcp_load_balancer_filter: {},
  };
  const data = await tenant.client.post(
    '/api/config/namespaces/system/all_application_inventory',
    body
  );

  const mapping = INVENTORY_RESULTS_KEY[resourceType];
  const section = data[mapping.section] || {};
  const items = section[mapping.items] || [];

  cache.set(cacheKey, items, 600);
  await renderInventory(say, formatter, resourceType, items, false, Date.now() - startTime, client, args._channelId);
}

function buildRows(items, resourceType, isInventory) {
  const isHTTP = resourceType === 'http_loadbalancer';
  const isLB = resourceType.includes('loadbalancer');

  return items.map((item) => {
    const row = { name: item.name || item.metadata?.name || 'unknown' };
    if (isInventory) row.namespace = item.namespace || '?';
    if (isHTTP && isInventory) {
      const domains = item.domains || [];
      row.domains = domains.length > 0 ? domains.join(', ') : '-';
      row.waf = item.waf_enforcement_mode || '-';
    } else if (isLB && !isInventory) {
      const domains = item.spec?.domains || item.get_spec?.domains || [];
      row.domains = domains.length > 0 ? domains.join(', ') : '-';
    }
    return row;
  });
}

function getColumns(resourceType, isInventory) {
  const isHTTP = resourceType === 'http_loadbalancer';
  const isLB = resourceType.includes('loadbalancer');
  if (isInventory && isHTTP) return ['namespace', 'name', 'domains', 'waf'];
  if (isInventory) return ['namespace', 'name'];
  if (isLB) return ['name', 'domains'];
  return ['name'];
}

async function uploadCsv(client, channelId, columns, rows, resourceType, scope) {
  if (!client || !channelId) return;
  const csv = require('../core/slack-formatter').csvString(columns, rows);
  try {
    await client.files.uploadV2({
      content: csv,
      filename: `${resourceType}-${scope}.csv`,
      channel_id: channelId,
      initial_comment: `Full list: ${rows.length} ${resourceType} resources`,
    });
  } catch {
    // file upload is best-effort
  }
}

async function renderInventory(say, formatter, resourceType, items, cached, durationMs, client, channelId) {
  if (items.length === 0) {
    await say({
      blocks: [
        ...formatter.errorBlock(`No ${resourceType} resources found.`),
        formatter.footer({ durationMs, cached }),
      ],
    });
    return;
  }

  const columns = getColumns(resourceType, true);
  const rows = buildRows(items, resourceType, true);
  rows.sort((a, b) => (a.namespace || '').localeCompare(b.namespace || '') || (a.name || '').localeCompare(b.name || ''));
  const displayed = rows.slice(0, formatter.TABLE_MAX_ROWS);
  const overflow = rows.length > formatter.TABLE_MAX_ROWS;

  const title = overflow
    ? `${resourceType} — all namespaces (showing ${formatter.TABLE_MAX_ROWS} of ${items.length})`
    : `${resourceType} — all namespaces (${items.length})`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    formatter.tableBlock(columns, displayed),
    formatter.footer({ durationMs, cached }),
  ];

  await say({ blocks });
  await uploadCsv(client, channelId, columns, rows, resourceType, 'all-namespaces');
}

async function renderList(say, formatter, resourceType, namespace, items, cached, durationMs, client, channelId) {
  if (items.length === 0) {
    await say({
      blocks: [
        ...formatter.errorBlock(`No ${resourceType} resources found in namespace \`${namespace}\`.`),
        formatter.footer({ durationMs, cached, namespace }),
      ],
    });
    return;
  }

  const columns = getColumns(resourceType, false);
  const rows = buildRows(items, resourceType, false);
  rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const displayed = rows.slice(0, formatter.TABLE_MAX_ROWS);
  const overflow = rows.length > formatter.TABLE_MAX_ROWS;

  const title = overflow
    ? `${resourceType} — ${namespace} (showing ${formatter.TABLE_MAX_ROWS} of ${items.length})`
    : `${resourceType} — ${namespace}`;

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title } },
    formatter.tableBlock(columns, displayed),
    formatter.footer({ durationMs, cached, namespace }),
  ];

  await say({ blocks });

  if (overflow) {
    await uploadCsv(client, channelId, columns, rows, resourceType, namespace);
  }
}
