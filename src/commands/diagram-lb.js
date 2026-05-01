const { log } = require('../core/logger');
const { buildDot, injectIcons } = require('../core/diagram-renderer-graphviz');

module.exports = {
  meta: {
    name: 'diagram-lb',
    description: 'Generate a visual diagram of an LB chain',
    slashCommand: '/xc-diagram',
    category: 'app-delivery',
  },

  intents: [
    { utterance: 'diagram the load balancer chain', intent: 'diagram.lb' },
    { utterance: 'show me a diagram of demo-shop-fe', intent: 'diagram.lb' },
    { utterance: 'visualize the load balancer', intent: 'diagram.lb' },
    { utterance: 'draw the LB architecture', intent: 'diagram.lb' },
    { utterance: 'generate a diagram', intent: 'diagram.lb' },
    { utterance: 'show me an XC diagram of my-lb', intent: 'diagram.lb' },
    { utterance: 'show the LB chain as a picture', intent: 'diagram.lb' },
    { utterance: 'show me the traffic flow for the LB', intent: 'diagram.lb' },
    { utterance: 'graph the load balancer', intent: 'diagram.lb' },
    { utterance: 'render the LB diagram', intent: 'diagram.lb' },
    { utterance: 'map the load balancer chain', intent: 'diagram.lb' },
    { utterance: 'create a visual of the LB', intent: 'diagram.lb' },
    { utterance: 'show me a picture of the load balancer flow', intent: 'diagram.lb' },
    { utterance: 'LB architecture diagram', intent: 'diagram.lb' },
    { utterance: 'visualize the traffic path', intent: 'diagram.lb' },
  ],

  entities: [],

  buildDot,

  handler: async ({ say, client, tenant, cache, args, formatter, diagramRenderer }) => {
    if (!args.namespace) {
      
      await say({ blocks: formatter.namespacePicker('diagram.lb', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('diagram.lb', args.namespace, names, `Which load balancer to diagram in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;

    await say(`Generating diagram for \`${name}\` in namespace \`${ns}\`...`);

    const lb = await tenant.client.get(`/api/config/namespaces/${ns}/http_loadbalancers/${name}`);
    const spec = lb.spec || {};

    // Collect unique pool names
    const poolNames = new Set();
    for (const p of (spec.default_route_pools || [])) {
      if (p.pool?.name) poolNames.add(p.pool.name);
    }
    for (const route of (spec.routes || [])) {
      const sr = route.simple_route || route;
      for (const p of (sr.origin_pools || [])) {
        if (p.pool?.name) poolNames.add(p.pool.name);
      }
    }

    // Fetch pools in parallel
    const pools = {};
    const poolResults = await Promise.allSettled(
      [...poolNames].map(async (poolName) => {
        const poolData = await tenant.client.get(`/api/config/namespaces/${ns}/origin_pools/${poolName}`);
        pools[poolName] = poolData;
      })
    );

    let outputPath;
    try {
      log('info', 'Diagram render requested', { lb: name, namespace: ns, channelId: args._channelId });
      outputPath = await diagramRenderer.renderToFile(lb, pools);
      const fs = require('fs');
      if (client) {
        log('info', 'Uploading diagram', { lb: name, channelId: args._channelId });
        await client.files.uploadV2({
          file: fs.createReadStream(outputPath),
          filename: `${name}-diagram.png`,
          channel_id: args._channelId,
          initial_comment: `LB diagram: ${name} (${ns})`,
        });
        log('info', 'Diagram uploaded', { lb: name });
      } else {
        await say(`Diagram rendered but file upload requires Slack client. Use a slash command or @mention.`);
      }
    } catch (err) {
      log('error', 'Diagram failed', { lb: name, error: err.message });
      await say({ blocks: formatter.errorBlock(`Diagram render failed: ${err.message}. Try \`/xc-lb ${ns} ${name}\` for a text summary.`) });
    } finally {
      if (outputPath) diagramRenderer.cleanup(outputPath);
    }
  },
};
