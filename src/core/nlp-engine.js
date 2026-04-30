const { containerBootstrap } = require('@nlpjs/core');
const { Nlp } = require('@nlpjs/nlp');
const { LangEn } = require('@nlpjs/lang-en');

const FRESH_MODIFIERS = [
  'with force refresh', 'with no cache', 'with live data', 'with fresh',
  'force refresh', 'no cache', 'live data', 'fresh', 'live',
];

class NLPEngine {
  constructor({ threshold = 0.75 } = {}) {
    this._threshold = threshold;
    this._intents = [];
    this._namespaces = [];
    this._resourceTypes = [];
    this._nlp = null;
  }

  addIntents(intents) {
    this._intents.push(...intents);
  }

  addNamespaceEntities(namespaces) {
    this._namespaces = namespaces;
  }

  addResourceTypeEntities(resourceTypes) {
    this._resourceTypes = resourceTypes;
  }

  async train() {
    const container = await containerBootstrap();
    container.use(Nlp);
    container.use(LangEn);

    const nlp = container.get('nlp');
    nlp.settings.autoSave = false;
    nlp.settings.log = false;

    nlp.addLanguage('en');

    for (const { utterance, intent } of this._intents) {
      nlp.addDocument('en', utterance, intent);
    }

    await nlp.train();
    this._nlp = nlp;
  }

  async process(text) {
    const fresh = FRESH_MODIFIERS.some((mod) => text.toLowerCase().includes(mod));
    const cleanText = FRESH_MODIFIERS.reduce(
      (t, mod) => t.replace(new RegExp(mod, 'gi'), ''),
      text
    ).trim();

    let classifyText = cleanText;
    const lowerText = text.toLowerCase();
    for (const ns of this._namespaces) {
      const nsLower = ns.toLowerCase();
      if (nsLower.includes('-') && lowerText.includes(nsLower)) {
        classifyText = classifyText.replace(new RegExp(ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), 'prod').trim();
      }
    }

    const result = await this._nlp.process('en', classifyText);

    const entities = {};

    // Pass 1: explicit prepositional patterns (high confidence)
    for (const ns of this._namespaces) {
      const nsLower = ns.toLowerCase();
      const nsPatterns = [
        `in namespace ${nsLower}`,
        `in ns ${nsLower}`,
        `namespace ${nsLower}`,
        `ns ${nsLower}`,
        ` in ${nsLower}`,
      ];
      for (const pattern of nsPatterns) {
        if (lowerText.includes(pattern)) {
          entities.namespace = ns;
          break;
        }
      }
      if (entities.namespace) break;
    }

    // Pass 2: word-boundary fallback only if no prepositional match found
    if (!entities.namespace) {
      for (const ns of this._namespaces) {
        const nsLower = ns.toLowerCase();
        if (nsLower.length >= 4) {
          const regex = new RegExp(`(?:^|\\s)${nsLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
          if (regex.test(lowerText)) {
            entities.namespace = ns;
            break;
          }
        }
      }
    }

    for (const rt of this._resourceTypes) {
      const allNames = [rt.name, ...rt.synonyms].map((s) => s.toLowerCase());
      for (const name of allNames) {
        if (lowerText.includes(name)) {
          entities.resourceType = rt.name;
          break;
        }
      }
      if (entities.resourceType) break;
    }

    const FILLER = new Set([
      'show', 'me', 'the', 'a', 'an', 'of', 'for', 'in', 'on', 'about',
      'tell', 'get', 'check', 'list', 'all', 'my', 'is', 'are', 'what',
      'how', 'do', 'does', 'which', 'can', 'has', 'have', 'any', 'that',
      'load', 'balancer', 'balancers', 'lb', 'lbs', 'origin', 'pool',
      'pools', 'diagram', 'status', 'waf', 'xc', 'namespace', 'ns',
      'details', 'detail', 'describe', 'summary', 'summarize', 'config',
      'configuration', 'service', 'policies', 'policy', 'firewall',
      'blocking', 'monitoring', 'mode', 'using',
      'bot', 'defense', 'protection',
      'enabled', 'disabled', 'configured', 'attached', 'applied',
    ]);

    if (!entities.resourceName) {
      let remaining = lowerText;
      if (entities.namespace) {
        const nsEsc = entities.namespace.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        remaining = remaining.replace(new RegExp(`(in\\s+)?(namespace\\s+|ns\\s+)?(?<![\\w-])${nsEsc}(?![\\w-])`, 'g'), ' ');
      }
      if (entities.resourceType) {
        const rtNames = [entities.resourceType, ...this._resourceTypes.find((r) => r.name === entities.resourceType)?.synonyms || []];
        for (const n of rtNames) {
          remaining = remaining.replace(new RegExp(n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
        }
      }
      const candidates = remaining.split(/\s+/).filter((t) => t.length >= 3 && !FILLER.has(t) && /^[a-z0-9][\w-]*[a-z0-9]$/i.test(t));
      if (candidates.length === 1) {
        entities.resourceName = candidates[0];
      }
    }

    // When NLP.js classifies as 'None', nluAnswer.classifications holds the real
    // per-intent scores (all 0 for gibberish). Use those for an honest confidence.
    const classifications =
      result.intent === 'None'
        ? result.nluAnswer?.classifications || []
        : result.classifications || [];

    const topIntents = classifications
      .filter((c) => c.score > 0)
      .slice(0, 3)
      .map((c) => ({ intent: c.intent, confidence: c.score }));

    // For 'None' intent, derive confidence from the top known-intent score
    const confidence =
      result.intent === 'None'
        ? (result.nluAnswer?.classifications?.[0]?.score || 0)
        : (result.score || 0);

    return {
      intent: result.intent !== 'None' && confidence >= this._threshold ? result.intent : null,
      confidence,
      entities,
      fresh,
      topIntents,
      raw: result,
    };
  }
}

module.exports = { NLPEngine };
