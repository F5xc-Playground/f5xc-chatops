const { containerBootstrap } = require('@nlpjs/core');
const { Nlp } = require('@nlpjs/nlp');
const { LangEn } = require('@nlpjs/lang-en');

const FRESH_MODIFIERS = ['force refresh', 'fresh', 'no cache', 'live data', 'live'];

class NLPEngine {
  constructor({ threshold = 0.65 } = {}) {
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

    const result = await this._nlp.process('en', cleanText);

    const entities = {};

    const lowerText = text.toLowerCase();
    for (const ns of this._namespaces) {
      const nsPatterns = [
        `in namespace ${ns}`,
        `in ns ${ns}`,
        `namespace ${ns}`,
        `ns ${ns}`,
        ` in ${ns}`,
        ` ${ns}`,
      ];
      for (const pattern of nsPatterns) {
        if (lowerText.includes(pattern.toLowerCase())) {
          entities.namespace = ns;
          break;
        }
      }
      if (entities.namespace) break;
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
