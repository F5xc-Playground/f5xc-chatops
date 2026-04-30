const { containerBootstrap } = require('@nlpjs/core');
const { Nlp } = require('@nlpjs/nlp');
const { LangEn } = require('@nlpjs/lang-en');

const FRESH_MODIFIERS = [
  'with force refresh', 'with no cache', 'with live data', 'with fresh',
  'force refresh', 'no cache', 'live data', 'fresh', 'live',
];

const CONTRACTIONS = {
  "what's": 'what is',
  "where's": 'where is',
  "who's": 'who is',
  "how's": 'how is',
  "that's": 'that is',
  "there's": 'there is',
  "here's": 'here is',
  "it's": 'it is',
  "isn't": 'is not',
  "aren't": 'are not',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "can't": 'cannot',
  "couldn't": 'could not',
  "won't": 'will not',
  "wouldn't": 'would not',
  "shouldn't": 'should not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "i'm": 'i am',
  "we're": 'we are',
  "they're": 'they are',
  "you're": 'you are',
  "i've": 'i have',
  "we've": 'we have',
  "they've": 'they have',
  "you've": 'you have',
  "i'll": 'i will',
  "we'll": 'we will',
  "gimme": 'give me',
  "gonna": 'going to',
  "wanna": 'want to',
  "lemme": 'let me',
};

function normalizeText(text) {
  let result = text.toLowerCase();
  for (const [contraction, expansion] of Object.entries(CONTRACTIONS)) {
    result = result.replace(new RegExp(`\\b${contraction.replace("'", "'")}\\b`, 'g'), expansion);
    result = result.replace(new RegExp(`\\b${contraction.replace("'", "'")}\\b`, 'g'), expansion);
  }
  result = result.replace(/[?!.,;:]+(\s|$)/g, '$1');
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

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
    const normalized = normalizeText(text);
    const fresh = FRESH_MODIFIERS.some((mod) => normalized.includes(mod));
    const cleanText = FRESH_MODIFIERS.reduce(
      (t, mod) => t.replace(new RegExp(mod, 'gi'), ''),
      normalized
    ).trim();

    const lowerText = cleanText;
    const entities = {};

    // 1. Extract entities FIRST
    this._extractNamespace(lowerText, entities);
    this._extractResourceType(lowerText, entities);

    // 2. Build classification text: replace entities with placeholders
    let classifyText = cleanText;
    if (entities.namespace) {
      const nsEsc = entities.namespace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      classifyText = classifyText.replace(new RegExp(`(in\\s+)?(namespace\\s+|ns\\s+)?(?<![\\w-])${nsEsc}(?![\\w-])`, 'gi'), ' prod ');
    }
    if (entities.resourceType) {
      const rtEntry = this._resourceTypes.find((r) => r.name === entities.resourceType);
      const rtNames = [entities.resourceType, ...(rtEntry?.synonyms || [])];
      for (const name of rtNames) {
        classifyText = classifyText.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
      }
    }
    classifyText = classifyText.replace(/\s+/g, ' ').trim();

    // 3. Classify on cleaned skeleton
    const result = await this._nlp.process('en', classifyText);

    // 4. Extract resourceName (post-classification, uses FILLER)
    this._extractResourceName(lowerText, entities);

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

  _extractNamespace(lowerText, entities) {
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
          return;
        }
      }
    }

    // Pass 2: word-boundary fallback
    for (const ns of this._namespaces) {
      const nsLower = ns.toLowerCase();
      if (nsLower.length >= 4) {
        const regex = new RegExp(`(?:^|\\s)${nsLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
        if (regex.test(lowerText)) {
          entities.namespace = ns;
          return;
        }
      }
    }
  }

  _extractResourceType(lowerText, entities) {
    for (const rt of this._resourceTypes) {
      const allNames = [rt.name, ...rt.synonyms].map((s) => s.toLowerCase());
      for (const name of allNames) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|[^\\w-])${escaped}(?:[^\\w-]|$)`);
        if (regex.test(lowerText)) {
          entities.resourceType = rt.name;
          return;
        }
      }
    }
  }

  _extractResourceName(lowerText, entities) {
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
      'rate', 'limit', 'limiting', 'limiter', 'throttle', 'throttling', 'rps',
      'malicious', 'user', 'mud', 'mum', 'mal', 'bad', 'actor', 'detection', 'mitigation',
      'posture', 'secure', 'secured', 'hardened', 'audit', 'controls', 'features',
      'security', 'overview',
    ]);

    let remaining = lowerText;
    if (entities.namespace) {
      const nsEsc = entities.namespace.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      remaining = remaining.replace(new RegExp(`(in\\s+)?(namespace\\s+|ns\\s+)?(?<![\\w-])${nsEsc}(?![\\w-])`, 'g'), ' ');
    }
    if (entities.resourceType) {
      const rtEntry = this._resourceTypes.find((r) => r.name === entities.resourceType);
      const rtNames = [entities.resourceType, ...(rtEntry?.synonyms || [])];
      for (const n of rtNames) {
        remaining = remaining.replace(new RegExp(n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
      }
    }
    const candidates = remaining.split(/\s+/).filter((t) => t.length >= 3 && !FILLER.has(t) && /^[a-z0-9][\w-]*[a-z0-9]$/i.test(t));
    if (candidates.length === 1) {
      entities.resourceName = candidates[0];
    }
  }
}

module.exports = { NLPEngine };
