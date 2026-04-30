# NLP Enhancement & Security Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve NLP intent classification accuracy with expanded utterances and better entity extraction, then add three new security commands (rate-limit-status, malicious-user-status, security-posture).

**Architecture:** Three sequential phases — (A) refactor the NLP extraction pipeline to be more robust, (B) expand utterance sets to 15-20 per command with automated regression tests, (C) add new commands on the clean foundation. All security controls are read from the HTTP LB spec object (single GET call).

**Tech Stack:** NLP.js, Node.js, Slack Block Kit, F5 XC REST API

---

### Task 1: Text normalization in NLP engine

**Files:**
- Modify: `src/core/nlp-engine.js`
- Test: `tests/core/nlp-engine.test.js`

Add a `normalizeText()` step at the top of `process()` that runs before anything else. This eliminates an entire class of bugs where contractions and punctuation prevent matches.

- [ ] **Step 1: Write failing tests for normalization**

```js
// In tests/core/nlp-engine.test.js, new describe block
describe('NLPEngine — text normalization', () => {
  let engine;

  beforeAll(async () => {
    engine = new NLPEngine({ threshold: 0.75 });
    engine.addIntents([
      { utterance: 'what is in namespace prod', intent: 'namespace.summary' },
      { utterance: 'show me all sites', intent: 'site.status' },
      { utterance: 'are there any alerts', intent: 'alert.status' },
      { utterance: 'what quotas are critical', intent: 'quota.check' },
    ]);
    engine.addNamespaceEntities(['prod', 'staging']);
    await engine.train();
  });

  test('expands contractions before classification', async () => {
    const result = await engine.process("what's in namespace prod");
    expect(result.intent).toBe('namespace.summary');
  });

  test('strips trailing punctuation before classification', async () => {
    const result = await engine.process('what quotas are critical?');
    expect(result.intent).toBe('quota.check');
  });

  test('handles "aren\'t" contraction', async () => {
    const result = await engine.process("aren't there any alerts?");
    expect(result.intent).toBe('alert.status');
  });

  test('normalizes multiple spaces', async () => {
    const result = await engine.process('show  me   all  sites');
    expect(result.intent).toBe('site.status');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/core/nlp-engine.test.js --no-coverage -t "text normalization"`
Expected: FAIL — contractions and punctuation prevent matching

- [ ] **Step 3: Implement normalizeText()**

Add to the top of `src/core/nlp-engine.js`, before the class definition:

```js
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
  // Expand contractions
  for (const [contraction, expansion] of Object.entries(CONTRACTIONS)) {
    result = result.replace(new RegExp(`\\b${contraction.replace("'", "'")}\\b`, 'g'), expansion);
    // Also handle curly apostrophes
    result = result.replace(new RegExp(`\\b${contraction.replace("'", "’")}\\b`, 'g'), expansion);
  }
  // Strip trailing punctuation from words
  result = result.replace(/[?!.,;:]+(\s|$)/g, '$1');
  // Normalize whitespace
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}
```

Then in `process()`, add as the very first line:

```js
async process(text) {
    const normalized = normalizeText(text);
    const fresh = FRESH_MODIFIERS.some((mod) => normalized.includes(mod));
    const cleanText = FRESH_MODIFIERS.reduce(
      (t, mod) => t.replace(new RegExp(mod, 'gi'), ''),
      normalized
    ).trim();
    // ... rest uses normalized/cleanText instead of raw text
```

Update `lowerText` (used for entity extraction) to use `normalized` instead of `text.toLowerCase()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/nlp-engine.test.js --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/nlp-engine.js tests/core/nlp-engine.test.js
git commit -m "feat: add text normalization to NLP engine (contractions, punctuation)"
```

---

### Task 2: Restructure entity extraction flow

**Files:**
- Modify: `src/core/nlp-engine.js`
- Test: `tests/core/nlp-engine.test.js`

Currently we classify first, then extract entities. Restructure so entity extraction (namespace, resourceType) happens first. The classification text has entities replaced with neutral placeholders, giving NLP.js a cleaner signal.

The resourceName extraction stays after classification since it relies on the FILLER set approach — but improve it by building the FILLER set dynamically from the extracted entities rather than maintaining a static denylist.

- [ ] **Step 1: Write failing tests for improved extraction**

```js
describe('NLPEngine — extraction-first flow', () => {
  let engine;

  beforeAll(async () => {
    engine = new NLPEngine({ threshold: 0.75 });
    engine.addIntents([
      { utterance: 'what is in namespace prod', intent: 'namespace.summary' },
      { utterance: 'summarize namespace staging', intent: 'namespace.summary' },
      { utterance: 'namespace overview for prod', intent: 'namespace.summary' },
      { utterance: 'show me a namespace summary for prod', intent: 'namespace.summary' },
      { utterance: 'tell me about the load balancer in prod', intent: 'lb.summary' },
      { utterance: 'show load balancer details', intent: 'lb.summary' },
      { utterance: 'LB summary', intent: 'lb.summary' },
      { utterance: 'describe the load balancer', intent: 'lb.summary' },
      { utterance: 'is the WAF in blocking mode', intent: 'waf.status' },
      { utterance: 'show WAF status', intent: 'waf.status' },
      { utterance: 'what mode is the WAF in', intent: 'waf.status' },
      { utterance: 'check bot defense', intent: 'bot.defense.status' },
      { utterance: 'is bot defense enabled', intent: 'bot.defense.status' },
      { utterance: 'bot defense status', intent: 'bot.defense.status' },
    ]);
    engine.addNamespaceEntities(['prod', 'demo-shop', 'staging', 'my-app-ns']);
    engine.addResourceTypeEntities([
      { name: 'http_loadbalancer', synonyms: ['load balancer', 'LB', 'lbs', 'load balancers'] },
      { name: 'app_firewall', synonyms: ['WAF', 'firewall', 'app firewall'] },
    ]);
    await engine.train();
  });

  test('classifies with doubly-hyphenated namespace', async () => {
    const result = await engine.process('what is in the my-app-ns namespace');
    expect(result.intent).toBe('namespace.summary');
    expect(result.entities.namespace).toBe('my-app-ns');
  });

  test('extracts LB name when namespace is a prefix of the LB name', async () => {
    const result = await engine.process('tell me about the load balancer demo-shop-fe in demo-shop');
    expect(result.entities.namespace).toBe('demo-shop');
    expect(result.entities.resourceName).toBe('demo-shop-fe');
  });

  test('extracts LB name for WAF query with hyphenated namespace', async () => {
    const result = await engine.process('is the WAF in blocking mode for my-app-lb in my-app-ns');
    expect(result.entities.namespace).toBe('my-app-ns');
    expect(result.entities.resourceName).toBe('my-app-lb');
  });

  test('does not extract namespace from within resource name', async () => {
    const result = await engine.process('describe the load balancer prod-api-gateway in prod');
    expect(result.entities.namespace).toBe('prod');
    expect(result.entities.resourceName).toBe('prod-api-gateway');
  });
});
```

- [ ] **Step 2: Run tests to verify behavior**

Run: `npx jest tests/core/nlp-engine.test.js --no-coverage -t "extraction-first"`
Expected: Some tests may pass already, note which ones fail

- [ ] **Step 3: Refactor process() method**

Restructure `process()` to this order:

```js
async process(text) {
  // 1. Normalize
  const normalized = normalizeText(text);

  // 2. Detect fresh modifier
  const fresh = FRESH_MODIFIERS.some((mod) => normalized.includes(mod));
  const cleanText = FRESH_MODIFIERS.reduce(
    (t, mod) => t.replace(new RegExp(mod, 'gi'), ''),
    normalized
  ).trim();

  // 3. Extract entities FIRST
  const entities = {};
  this._extractNamespace(cleanText, entities);
  this._extractResourceType(cleanText, entities);

  // 4. Build classification text: replace entities with placeholders
  let classifyText = cleanText;
  if (entities.namespace) {
    const nsEsc = entities.namespace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    classifyText = classifyText.replace(new RegExp(`(in\\s+)?(namespace\\s+|ns\\s+)?(?<![\\w-])${nsEsc}(?![\\w-])`, 'gi'), ' prod ');
  }
  if (entities.resourceType) {
    const rtNames = [entities.resourceType, ...(this._resourceTypes.find((r) => r.name === entities.resourceType)?.synonyms || [])];
    for (const name of rtNames) {
      classifyText = classifyText.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
    }
  }
  classifyText = classifyText.replace(/\s+/g, ' ').trim();

  // 5. Classify on cleaned skeleton
  const result = await this._nlp.process('en', classifyText);

  // 6. Extract resourceName (post-classification, uses FILLER)
  this._extractResourceName(cleanText, entities);

  // 7. Build return value
  // ... (same as current)
}
```

Extract the namespace/resourceType/resourceName extraction logic into private methods `_extractNamespace()`, `_extractResourceType()`, `_extractResourceName()` for clarity.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/nlp-engine.test.js --no-coverage`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/nlp-engine.js tests/core/nlp-engine.test.js
git commit -m "refactor: restructure NLP to extract-then-classify flow"
```

---

### Task 3: Remove FILLER from quota-check parseArgs

**Files:**
- Modify: `src/commands/quota-check.js`
- Test: `tests/commands/resource-commands.test.js`

Now that normalization happens in the NLP engine, quota's `parseArgs` no longer needs its own punctuation stripping. But it still needs its QUOTA_FILLER for slash-command parsing. Simplify by leveraging the fact that NLP-routed calls arrive pre-normalized.

- [ ] **Step 1: Verify existing quota tests still pass after Task 1-2 changes**

Run: `npx jest tests/commands/resource-commands.test.js --no-coverage`
Expected: PASS

- [ ] **Step 2: Remove redundant punctuation stripping from parseArgs**

The `.map((t) => t.replace(/[?!.,;:]+$/, ''))` in `parseArgs` is now redundant for NLP-routed calls since `normalizeText()` handles it. However, slash-command calls (`/xc-quota critical?`) bypass NLP. Keep the punctuation stripping in `parseArgs` as defense-in-depth — it's cheap and harmless.

No code change needed. Mark complete.

- [ ] **Step 3: Commit** (skip if no changes)

---

### Task 4: Verify LB spec fields for rate limiting and malicious user

**Files:**
- No code changes — research task

Before implementing the new commands, verify the exact field names on the HTTP LB spec object for rate limiting and malicious user mitigation.

- [ ] **Step 1: Fetch a real LB and inspect the spec**

Run against the bot's own tenant (or use curl):

```bash
# From the running bot, or manually:
curl -s -H "Authorization: APIToken $F5XC_API_TOKEN" \
  "$F5XC_API_URL/api/config/namespaces/demo-shop/http_loadbalancers/demo-shop-fe" | \
  jq '.spec | keys'
```

- [ ] **Step 2: Document the security-relevant fields**

Expected fields (verify exact names):

```
spec.app_firewall                    → WAF reference {name, namespace, tenant}
spec.disable_waf                     → boolean
spec.bot_defense                     → object {policy, regional_endpoint}
spec.rate_limiter                    → rate limiter reference {name, namespace}
  OR spec.rate_limit                 → inline rate limit config
spec.malicious_user_mitigation       → reference {name, namespace}
spec.active_service_policies         → {policies: [{name, namespace}...]}
spec.service_policies_from_namespace → boolean/object
spec.enable_api_discovery            → object (presence = enabled)
spec.api_protection_rules            → object
spec.api_specification               → object
spec.data_guard_rules                → object (bonus — include in security-posture)
```

- [ ] **Step 3: Note any discrepancies and update the plan**

If field names differ from expected, update Tasks 6-8 accordingly before implementing.

---

### Task 5: Expand utterances — balanced 15-20 per command

**Files:**
- Modify: All 20 files in `src/commands/` (except `_template.js`)
- Create: `tests/core/nlp-intent-coverage.test.js`

This is the highest-impact task. Generate distinctive utterances for each command, test for cross-intent collisions, and verify balanced coverage.

**Principles:**
- Every utterance must contain at least one **anchor word** unique to its intent
- Vary structure: questions, imperatives, casual, fragments, shorthand
- Include contractions (NLP engine now normalizes them)
- Keep counts balanced: 15-20 each
- Total target: ~350-400 utterances (up from 148)

- [ ] **Step 1: Create the intent coverage test harness**

Create `tests/core/nlp-intent-coverage.test.js`:

```js
const { NLPEngine } = require('../../src/core/nlp-engine');
const { loadCommands } = require('../../src/loader');
const path = require('path');

describe('NLP intent coverage', () => {
  let engine;
  let intentMap;

  beforeAll(async () => {
    const commandsDir = path.join(__dirname, '../../src/commands');
    const { allIntents, commands } = await loadCommands(commandsDir);

    intentMap = {};
    for (const { intent } of allIntents) {
      intentMap[intent] = true;
    }

    engine = new NLPEngine({ threshold: 0.75 });
    engine.addIntents(allIntents);
    engine.addNamespaceEntities(['prod', 'staging', 'demo-shop', 'system']);
    engine.addResourceTypeEntities([
      { name: 'http_loadbalancer', synonyms: ['load balancer', 'LB', 'lbs', 'load balancers', 'http lb'] },
      { name: 'app_firewall', synonyms: ['WAF', 'firewall', 'app firewall'] },
      { name: 'origin_pool', synonyms: ['origin pool', 'pool', 'pools'] },
      { name: 'service_policy', synonyms: ['service policy', 'policy'] },
      { name: 'certificate', synonyms: ['cert', 'certs', 'certificates'] },
      { name: 'dns_zone', synonyms: ['DNS zone', 'dns zones'] },
    ]);
    await engine.train();
  });

  test('utterance counts are balanced (15-20 per command)', async () => {
    const commandsDir = path.join(__dirname, '../../src/commands');
    const { commands } = await loadCommands(commandsDir);
    for (const cmd of commands) {
      const count = cmd.intents.length;
      expect(count).toBeGreaterThanOrEqual(15);
      expect(count).toBeLessThanOrEqual(25);
    }
  });

  // Smoke tests: each intent's own utterances should classify correctly
  test('each command\'s first utterance classifies to its own intent', async () => {
    const commandsDir = path.join(__dirname, '../../src/commands');
    const { commands } = await loadCommands(commandsDir);
    const failures = [];
    for (const cmd of commands) {
      if (cmd.intents.length === 0) continue;
      const utterance = cmd.intents[0].utterance;
      const expectedIntent = cmd.intents[0].intent;
      const result = await engine.process(utterance);
      if (result.intent !== expectedIntent) {
        failures.push({
          command: cmd.meta.name,
          utterance,
          expected: expectedIntent,
          got: result.intent,
          confidence: result.confidence,
        });
      }
    }
    if (failures.length > 0) {
      console.table(failures);
    }
    expect(failures).toEqual([]);
  });

  // Cross-intent collision tests: key phrases must route correctly
  const SMOKE_PHRASES = [
    // Sites
    { phrase: 'show me all sites', expected: 'site.status' },
    { phrase: 'show CE sites', expected: 'site.status' },
    { phrase: 'details on site dallas-ce', expected: 'site.detail' },
    { phrase: 'describe site my-site', expected: 'site.detail' },
    // Namespace
    { phrase: 'what is in the prod namespace', expected: 'namespace.summary' },
    { phrase: 'summarize namespace staging', expected: 'namespace.summary' },
    // LB
    { phrase: 'tell me about the load balancer', expected: 'lb.summary' },
    { phrase: 'LB summary', expected: 'lb.summary' },
    // Security - specific controls
    { phrase: 'is the WAF in blocking mode', expected: 'waf.status' },
    { phrase: 'check the web application firewall', expected: 'waf.status' },
    { phrase: 'is bot defense enabled', expected: 'bot.defense.status' },
    { phrase: 'check bot defense', expected: 'bot.defense.status' },
    { phrase: 'what service policies are on the LB', expected: 'service.policies' },
    { phrase: 'show rate limiting config', expected: 'rate.limit.status' },
    { phrase: 'is rate limiting enabled on my LB', expected: 'rate.limit.status' },
    { phrase: 'check malicious user detection', expected: 'malicious.user.status' },
    { phrase: 'is MUD enabled', expected: 'malicious.user.status' },
    { phrase: 'mal user status', expected: 'malicious.user.status' },
    // Security - posture (broad)
    { phrase: 'what security is on this LB', expected: 'security.posture' },
    { phrase: 'security posture for my load balancer', expected: 'security.posture' },
    { phrase: 'how secure is this LB', expected: 'security.posture' },
    // Quota
    { phrase: 'show me critical quotas', expected: 'quota.check' },
    { phrase: 'what quotas are running hot', expected: 'quota.check' },
    // Diagram
    { phrase: 'diagram the load balancer chain', expected: 'diagram.lb' },
    { phrase: 'show me a diagram of my-lb', expected: 'diagram.lb' },
    // Help
    { phrase: 'what can you do', expected: 'help' },
    { phrase: 'how do I use this', expected: 'help' },
    // Alerts
    { phrase: 'any alerts firing', expected: 'alert.status' },
    { phrase: 'are there active alerts', expected: 'alert.status' },
    // List
    { phrase: 'list all load balancers', expected: 'list.resources' },
    { phrase: 'show me all LBs', expected: 'list.resources' },
    // DNS
    { phrase: 'show DNS zones', expected: 'dns.status' },
    // Certs
    { phrase: 'any certs expiring soon', expected: 'cert.status' },
    // Origins
    { phrase: 'show origin pool health', expected: 'origin.health' },
    // AI
    { phrase: 'how do I configure rate limiting for my API', expected: 'ai.query' },
    { phrase: 'suggest improvements for the load balancer', expected: 'ai.suggest' },
    // Whoami
    { phrase: 'what namespaces can you see', expected: 'whoami' },
  ];

  test.each(SMOKE_PHRASES)('$phrase → $expected', async ({ phrase, expected }) => {
    const result = await engine.process(phrase);
    expect(result.intent).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the coverage test to see current baseline**

Run: `npx jest tests/core/nlp-intent-coverage.test.js --no-coverage`
Expected: Some failures — this establishes the baseline. Note which phrases misroute.

- [ ] **Step 3: Expand utterances for all 20 existing commands**

Replace the `intents` array in each command file. Below are the expanded utterances per command. Each set is designed with distinct anchor words to avoid cross-intent collisions.

**`help.js`** (intent: `help`):
```js
intents: [
  { utterance: 'what can you do', intent: 'help' },
  { utterance: 'how do I use this', intent: 'help' },
  { utterance: 'show me the help', intent: 'help' },
  { utterance: 'help me', intent: 'help' },
  { utterance: 'list available commands', intent: 'help' },
  { utterance: 'what commands are available', intent: 'help' },
  { utterance: 'what are your capabilities', intent: 'help' },
  { utterance: 'show me what you can do', intent: 'help' },
  { utterance: 'give me a list of commands', intent: 'help' },
  { utterance: 'what do you know how to do', intent: 'help' },
  { utterance: 'what features do you have', intent: 'help' },
  { utterance: 'show me the menu', intent: 'help' },
  { utterance: 'how does this bot work', intent: 'help' },
  { utterance: 'I need help', intent: 'help' },
  { utterance: 'usage instructions', intent: 'help' },
],
```

**`whoami.js`** (intent: `whoami`):
```js
intents: [
  { utterance: 'who am I', intent: 'whoami' },
  { utterance: 'what namespaces can you see', intent: 'whoami' },
  { utterance: 'what roles do you have', intent: 'whoami' },
  { utterance: 'show me your identity', intent: 'whoami' },
  { utterance: 'what tenant are you connected to', intent: 'whoami' },
  { utterance: 'bot identity', intent: 'whoami' },
  { utterance: 'what access do you have', intent: 'whoami' },
  { utterance: 'which namespaces can you access', intent: 'whoami' },
  { utterance: 'show me your credentials', intent: 'whoami' },
  { utterance: 'what account are you using', intent: 'whoami' },
  { utterance: 'show me the bot identity', intent: 'whoami' },
  { utterance: 'what permissions does the bot have', intent: 'whoami' },
  { utterance: 'tell me about the bot account', intent: 'whoami' },
  { utterance: 'show me your roles and namespaces', intent: 'whoami' },
  { utterance: 'what can you access', intent: 'whoami' },
],
```

**`namespace-summary.js`** (intent: `namespace.summary`):
```js
intents: [
  { utterance: 'summarize namespace prod', intent: 'namespace.summary' },
  { utterance: 'what is in namespace staging', intent: 'namespace.summary' },
  { utterance: 'what is in the prod namespace', intent: 'namespace.summary' },
  { utterance: "what's in namespace prod", intent: 'namespace.summary' },
  { utterance: "what's in the staging namespace", intent: 'namespace.summary' },
  { utterance: 'namespace overview for prod', intent: 'namespace.summary' },
  { utterance: 'give me a summary of namespace system', intent: 'namespace.summary' },
  { utterance: 'show me a namespace summary for prod', intent: 'namespace.summary' },
  { utterance: 'how many resources are in namespace prod', intent: 'namespace.summary' },
  { utterance: 'show me resource counts in staging', intent: 'namespace.summary' },
  { utterance: 'break down namespace prod', intent: 'namespace.summary' },
  { utterance: 'show me what is deployed in prod', intent: 'namespace.summary' },
  { utterance: 'namespace resource breakdown', intent: 'namespace.summary' },
  { utterance: 'give me the namespace overview', intent: 'namespace.summary' },
  { utterance: 'how much is in the prod namespace', intent: 'namespace.summary' },
  { utterance: 'show namespace contents for staging', intent: 'namespace.summary' },
],
```

**`list-resources.js`** (intent: `list.resources`):
```js
intents: [
  { utterance: 'list all load balancers in prod', intent: 'list.resources' },
  { utterance: 'show me all origin pools in staging', intent: 'list.resources' },
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
  { utterance: 'show me the inventory', intent: 'list.resources' },
  { utterance: 'what LBs are configured', intent: 'list.resources' },
  { utterance: 'how many load balancers are deployed', intent: 'list.resources' },
  { utterance: 'show me all resources of type origin pool', intent: 'list.resources' },
],
```

**`lb-summary.js`** (intent: `lb.summary`):
```js
intents: [
  { utterance: 'tell me about the load balancer', intent: 'lb.summary' },
  { utterance: 'show load balancer details', intent: 'lb.summary' },
  { utterance: 'LB summary', intent: 'lb.summary' },
  { utterance: 'describe the load balancer', intent: 'lb.summary' },
  { utterance: 'what is configured on the LB', intent: 'lb.summary' },
  { utterance: 'show me details for my-lb in prod', intent: 'lb.summary' },
  { utterance: 'summarize load balancer demo-shop-fe', intent: 'lb.summary' },
  { utterance: 'show me the config of the load balancer', intent: 'lb.summary' },
  { utterance: 'give me the LB detail', intent: 'lb.summary' },
  { utterance: 'what domains are on the load balancer', intent: 'lb.summary' },
  { utterance: 'what pools does the LB use', intent: 'lb.summary' },
  { utterance: 'show me the LB configuration', intent: 'lb.summary' },
  { utterance: 'load balancer overview', intent: 'lb.summary' },
  { utterance: 'tell me about my-lb', intent: 'lb.summary' },
  { utterance: 'pull up the load balancer config', intent: 'lb.summary' },
  { utterance: 'what routes are on the LB', intent: 'lb.summary' },
],
```

**`diagram-lb.js`** (intent: `diagram.lb`):
```js
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
```

**`waf-status.js`** (intent: `waf.status`):
```js
intents: [
  { utterance: 'what mode is the WAF in', intent: 'waf.status' },
  { utterance: 'show WAF status', intent: 'waf.status' },
  { utterance: 'is the WAF in blocking mode', intent: 'waf.status' },
  { utterance: 'WAF configuration', intent: 'waf.status' },
  { utterance: 'check the web application firewall', intent: 'waf.status' },
  { utterance: 'show me the WAF config for my-lb', intent: 'waf.status' },
  { utterance: 'what WAF mode is my load balancer using', intent: 'waf.status' },
  { utterance: 'is WAF blocking or monitoring on my-lb', intent: 'waf.status' },
  { utterance: 'is the firewall in blocking mode', intent: 'waf.status' },
  { utterance: 'what app firewall is on the LB', intent: 'waf.status' },
  { utterance: 'is the WAF set to monitor or block', intent: 'waf.status' },
  { utterance: 'what WAF policy is applied', intent: 'waf.status' },
  { utterance: 'show me the WAF mode', intent: 'waf.status' },
  { utterance: 'is traffic being blocked by the WAF', intent: 'waf.status' },
  { utterance: 'WAF blocking status', intent: 'waf.status' },
],
```

**`bot-defense-status.js`** (intent: `bot.defense.status`):
```js
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
```

**`service-policies.js`** (intent: `service.policies`):
```js
intents: [
  { utterance: 'what service policies are on the LB', intent: 'service.policies' },
  { utterance: 'show service policies', intent: 'service.policies' },
  { utterance: 'list attached service policies', intent: 'service.policies' },
  { utterance: 'what service policies are applied', intent: 'service.policies' },
  { utterance: 'show me service policies on my-lb in prod', intent: 'service.policies' },
  { utterance: 'what service policies are attached to the load balancer', intent: 'service.policies' },
  { utterance: 'check service policy on my LB', intent: 'service.policies' },
  { utterance: 'which service policies are active', intent: 'service.policies' },
  { utterance: 'are there any service policies on this LB', intent: 'service.policies' },
  { utterance: 'show the service policy list for the LB', intent: 'service.policies' },
  { utterance: 'what svc policies are configured', intent: 'service.policies' },
  { utterance: 'list the service policies', intent: 'service.policies' },
  { utterance: 'service policy configuration', intent: 'service.policies' },
  { utterance: 'show me the svc policies on the load balancer', intent: 'service.policies' },
  { utterance: 'what service policies does this LB have', intent: 'service.policies' },
],
```

**`cert-status.js`** (intent: `cert.status`):
```js
intents: [
  { utterance: 'any certs expiring soon', intent: 'cert.status' },
  { utterance: 'are any certificates expired', intent: 'cert.status' },
  { utterance: 'certificate expiration check', intent: 'cert.status' },
  { utterance: 'show me TLS certificate status', intent: 'cert.status' },
  { utterance: 'check cert expiry', intent: 'cert.status' },
  { utterance: 'when do our certs expire', intent: 'cert.status' },
  { utterance: 'are any TLS certs about to expire', intent: 'cert.status' },
  { utterance: 'SSL certificate status', intent: 'cert.status' },
  { utterance: 'show certificate expiration dates', intent: 'cert.status' },
  { utterance: 'check for expiring certificates', intent: 'cert.status' },
  { utterance: 'which certs are expiring', intent: 'cert.status' },
  { utterance: 'certificate health check', intent: 'cert.status' },
  { utterance: 'are there any expired certs', intent: 'cert.status' },
  { utterance: 'TLS cert expiry scan', intent: 'cert.status' },
  { utterance: 'show me certs that need renewal', intent: 'cert.status' },
],
```

**`origin-health.js`** (intent: `origin.health`):
```js
intents: [
  { utterance: 'show origin pool health', intent: 'origin.health' },
  { utterance: 'which origins are down', intent: 'origin.health' },
  { utterance: 'origin pool status', intent: 'origin.health' },
  { utterance: 'check backend servers', intent: 'origin.health' },
  { utterance: 'are the origins healthy', intent: 'origin.health' },
  { utterance: 'show me the origin servers', intent: 'origin.health' },
  { utterance: 'what is in the origin pool', intent: 'origin.health' },
  { utterance: 'are any upstream servers down', intent: 'origin.health' },
  { utterance: 'check origin pool endpoints', intent: 'origin.health' },
  { utterance: 'what origins are configured', intent: 'origin.health' },
  { utterance: 'show me the backend IPs', intent: 'origin.health' },
  { utterance: 'origin server list', intent: 'origin.health' },
  { utterance: 'are the pool members healthy', intent: 'origin.health' },
  { utterance: 'check the upstream health', intent: 'origin.health' },
  { utterance: 'origin pool endpoints', intent: 'origin.health' },
],
```

**`quota-check.js`** (intent: `quota.check`):
```js
intents: [
  { utterance: 'what quotas are running high', intent: 'quota.check' },
  { utterance: 'what quotas are running hot', intent: 'quota.check' },
  { utterance: 'show me quota usage', intent: 'quota.check' },
  { utterance: 'are we near any quota limits', intent: 'quota.check' },
  { utterance: 'check quota utilization', intent: 'quota.check' },
  { utterance: 'how much quota capacity do we have left', intent: 'quota.check' },
  { utterance: 'which quotas are heavily consumed', intent: 'quota.check' },
  { utterance: 'are any quotas maxed out', intent: 'quota.check' },
  { utterance: 'show me critical quotas', intent: 'quota.check' },
  { utterance: 'show me warning quotas', intent: 'quota.check' },
  { utterance: 'show all quotas', intent: 'quota.check' },
  { utterance: 'show me quotas for load balancers', intent: 'quota.check' },
  { utterance: 'quota usage for dns', intent: 'quota.check' },
  { utterance: 'what do I need to worry about for quotas', intent: 'quota.check' },
  { utterance: 'are we close to any quota limits', intent: 'quota.check' },
  { utterance: 'tenant quota overview', intent: 'quota.check' },
],
```

**`site-status.js`** (intent: `site.status`):
```js
intents: [
  { utterance: 'show me all sites', intent: 'site.status' },
  { utterance: 'what is the status of sites', intent: 'site.status' },
  { utterance: 'list sites', intent: 'site.status' },
  { utterance: 'are all sites online', intent: 'site.status' },
  { utterance: 'site health overview', intent: 'site.status' },
  { utterance: 'show me customer edge sites', intent: 'site.status' },
  { utterance: 'show CE sites', intent: 'site.status' },
  { utterance: 'show me regional edge sites', intent: 'site.status' },
  { utterance: 'show RE sites', intent: 'site.status' },
  { utterance: 'are any sites offline', intent: 'site.status' },
  { utterance: 'which sites are down', intent: 'site.status' },
  { utterance: 'site connectivity status', intent: 'site.status' },
  { utterance: 'show me all CE and RE sites', intent: 'site.status' },
  { utterance: 'list all edge sites', intent: 'site.status' },
  { utterance: 'are the sites connected', intent: 'site.status' },
],
```

**`site-detail.js`** (intent: `site.detail`):
```js
intents: [
  { utterance: 'details on site dallas-ce', intent: 'site.detail' },
  { utterance: 'show site detail for my-site', intent: 'site.detail' },
  { utterance: 'site info for dallas-ce', intent: 'site.detail' },
  { utterance: 'describe site my-site', intent: 'site.detail' },
  { utterance: 'tell me about site dallas-ce', intent: 'site.detail' },
  { utterance: 'what version is site my-site running', intent: 'site.detail' },
  { utterance: 'show me the detail for site dallas-ce', intent: 'site.detail' },
  { utterance: 'what is the state of site my-site', intent: 'site.detail' },
  { utterance: 'site dallas-ce info', intent: 'site.detail' },
  { utterance: 'give me detail on site my-site', intent: 'site.detail' },
  { utterance: 'pull up site dallas-ce', intent: 'site.detail' },
  { utterance: 'check on site my-site', intent: 'site.detail' },
  { utterance: 'show the software version for site dallas-ce', intent: 'site.detail' },
  { utterance: 'site detail my-site', intent: 'site.detail' },
  { utterance: 'inspect site dallas-ce', intent: 'site.detail' },
],
```

**`dns-status.js`** (intent: `dns.status`):
```js
intents: [
  { utterance: 'show DNS zones', intent: 'dns.status' },
  { utterance: 'what DNS zones are configured', intent: 'dns.status' },
  { utterance: 'list DNS zones in prod', intent: 'dns.status' },
  { utterance: 'show me the DNS configuration', intent: 'dns.status' },
  { utterance: 'are there any DNS zones', intent: 'dns.status' },
  { utterance: 'DNS zone status', intent: 'dns.status' },
  { utterance: 'check DNS zones', intent: 'dns.status' },
  { utterance: 'show me GSLB config', intent: 'dns.status' },
  { utterance: 'what DNS load balancers exist', intent: 'dns.status' },
  { utterance: 'DNS overview', intent: 'dns.status' },
  { utterance: 'show me the DNS records', intent: 'dns.status' },
  { utterance: 'list domain delegations', intent: 'dns.status' },
  { utterance: 'what zones are configured', intent: 'dns.status' },
  { utterance: 'show me the GSLB setup', intent: 'dns.status' },
  { utterance: 'DNS configuration in prod', intent: 'dns.status' },
],
```

**`alert-status.js`** (intent: `alert.status`):
```js
intents: [
  { utterance: 'any alerts firing', intent: 'alert.status' },
  { utterance: 'are there any active alerts', intent: 'alert.status' },
  { utterance: 'show me alerts', intent: 'alert.status' },
  { utterance: 'check for alerts', intent: 'alert.status' },
  { utterance: 'are any alarms going off', intent: 'alert.status' },
  { utterance: 'show me firing alerts', intent: 'alert.status' },
  { utterance: 'alert status', intent: 'alert.status' },
  { utterance: 'are there any incidents', intent: 'alert.status' },
  { utterance: 'what alerts are active', intent: 'alert.status' },
  { utterance: 'is anything alerting right now', intent: 'alert.status' },
  { utterance: 'check the alerts', intent: 'alert.status' },
  { utterance: 'any critical alerts', intent: 'alert.status' },
  { utterance: 'show me active alarms', intent: 'alert.status' },
  { utterance: 'are there problems right now', intent: 'alert.status' },
  { utterance: 'what is firing', intent: 'alert.status' },
],
```

**`api-security-status.js`** (intent: `api.security`):
```js
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
```

**`security-event.js`** (intent: `security.event`):
```js
intents: [
  { utterance: 'explain security event abc-123', intent: 'security.event' },
  { utterance: 'look up request id abc-123', intent: 'security.event' },
  { utterance: 'what happened with support id xyz', intent: 'security.event' },
  { utterance: 'investigate security event', intent: 'security.event' },
  { utterance: 'explain this security log', intent: 'security.event' },
  { utterance: 'analyze event abc-123', intent: 'security.event' },
  { utterance: 'what triggered this security event', intent: 'security.event' },
  { utterance: 'look up this support ticket id', intent: 'security.event' },
  { utterance: 'explain why this request was blocked', intent: 'security.event' },
  { utterance: 'security event details for abc-123', intent: 'security.event' },
  { utterance: 'tell me about event abc-123', intent: 'security.event' },
  { utterance: 'what caused this WAF block', intent: 'security.event' },
  { utterance: 'investigate this blocked request', intent: 'security.event' },
  { utterance: 'look up security event by id', intent: 'security.event' },
  { utterance: 'explain support id abc-123', intent: 'security.event' },
],
```

**`ai-query.js`** (intent: `ai.query`):
```js
intents: [
  { utterance: 'how do I configure rate limiting for my API', intent: 'ai.query' },
  { utterance: 'ask the assistant about DDoS protection', intent: 'ai.query' },
  { utterance: 'ask the AI a question', intent: 'ai.query' },
  { utterance: 'I have a question about XC', intent: 'ai.query' },
  { utterance: 'how do I set up a load balancer', intent: 'ai.query' },
  { utterance: 'explain how WAF rules work', intent: 'ai.query' },
  { utterance: 'how do I create an origin pool', intent: 'ai.query' },
  { utterance: 'ask the AI assistant about networking', intent: 'ai.query' },
  { utterance: 'what is the best practice for rate limiting', intent: 'ai.query' },
  { utterance: 'tell me about service mesh in XC', intent: 'ai.query' },
  { utterance: 'how do I configure mTLS', intent: 'ai.query' },
  { utterance: 'ask about multi-cloud networking', intent: 'ai.query' },
  { utterance: 'how does distributed cloud DNS work', intent: 'ai.query' },
  { utterance: 'what is an app firewall in XC', intent: 'ai.query' },
  { utterance: 'explain XC service policies', intent: 'ai.query' },
],
```

**`ai-suggest.js`** (intent: `ai.suggest`):
```js
intents: [
  { utterance: 'suggest improvements for the load balancer', intent: 'ai.suggest' },
  { utterance: 'how can I optimize my LB', intent: 'ai.suggest' },
  { utterance: 'give me suggestions for my-lb', intent: 'ai.suggest' },
  { utterance: 'what should I improve on the load balancer', intent: 'ai.suggest' },
  { utterance: 'suggest optimizations', intent: 'ai.suggest' },
  { utterance: 'recommendations for the LB', intent: 'ai.suggest' },
  { utterance: 'how can I make the LB better', intent: 'ai.suggest' },
  { utterance: 'what should I tune on the load balancer', intent: 'ai.suggest' },
  { utterance: 'LB optimization suggestions', intent: 'ai.suggest' },
  { utterance: 'analyze and suggest improvements', intent: 'ai.suggest' },
  { utterance: 'what is the AI recommendation for my LB', intent: 'ai.suggest' },
  { utterance: 'give me tuning advice for the load balancer', intent: 'ai.suggest' },
  { utterance: 'suggest security improvements for my-lb', intent: 'ai.suggest' },
  { utterance: 'how can I harden the load balancer', intent: 'ai.suggest' },
  { utterance: 'any recommendations for load balancer config', intent: 'ai.suggest' },
],
```

- [ ] **Step 4: Run the coverage test suite**

Run: `npx jest tests/core/nlp-intent-coverage.test.js --no-coverage`
Expected: Most smoke phrases should now pass. Note any failures.

- [ ] **Step 5: Fix any cross-intent collisions**

If a smoke phrase misroutes, adjust utterances for the colliding intents:
- Add more anchor words to the weaker intent
- Remove overlapping generic phrases from the stronger intent
- Re-run the coverage test until all smoke phrases pass

- [ ] **Step 6: Run full test suite for regressions**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/commands/ tests/core/nlp-intent-coverage.test.js
git commit -m "feat: expand utterances to 15-20 per command with coverage tests"
```

---

### Task 6: Create rate-limit-status command

**Files:**
- Create: `src/commands/rate-limit-status.js`
- Test: `tests/commands/security-commands.test.js`

Per-LB command that shows the rate limiter configuration. Uses the same handler pattern as waf-status (namespace → LB picker → detail).

**LB spec field (verify in Task 4):** `spec.rate_limiter` (reference to a rate_limiter object with `name` and `namespace`).

- [ ] **Step 1: Write the test**

Add to `tests/commands/security-commands.test.js`:

```js
const rateLimitStatus = require('../../src/commands/rate-limit-status');

// In plugin contracts describe block:
test('rate-limit-status', () => {
  expect(rateLimitStatus.meta.name).toBe('rate-limit-status');
  expect(rateLimitStatus.meta.slashCommand).toBe('/xc-ratelimit');
  expect(rateLimitStatus.intents.length).toBeGreaterThanOrEqual(15);
});

// Handler tests:
describe('rate-limit-status handler', () => {
  test('shows rate limiter config when present', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockImplementation((path) => {
          if (path.includes('/http_loadbalancers/my-lb')) {
            return Promise.resolve({
              metadata: { name: 'my-lb' },
              spec: {
                rate_limiter: { name: 'my-rate-limiter', namespace: 'prod' },
              },
            });
          }
          if (path.includes('/rate_limiters/my-rate-limiter')) {
            return Promise.resolve({
              metadata: { name: 'my-rate-limiter' },
              spec: {
                threshold: 100,
                unit: 'MINUTE',
              },
            });
          }
          return Promise.resolve({ items: [] });
        }),
      },
    };
    await rateLimitStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('my-rate-limiter');
    expect(text).toContain('Rate Limit');
  });

  test('shows disabled when no rate limiter configured', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {},
        }),
      },
    };
    await rateLimitStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toMatch(/not configured|disabled|none/i);
  });

  test('prompts for namespace when missing', async () => {
    const messages = [];
    const tenant = { name: 'test', namespaces: ['prod', 'staging'] };
    await rateLimitStatus.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: {},
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('namespace');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/security-commands.test.js --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement rate-limit-status.js**

Create `src/commands/rate-limit-status.js`:

```js
module.exports = {
  meta: {
    name: 'rate-limit-status',
    description: 'Rate limiting configuration on a load balancer',
    slashCommand: '/xc-ratelimit',
    cacheTTL: 300,
    category: 'security',
  },

  intents: [
    { utterance: 'show rate limiting config', intent: 'rate.limit.status' },
    { utterance: 'is rate limiting enabled on my LB', intent: 'rate.limit.status' },
    { utterance: 'check rate limiter', intent: 'rate.limit.status' },
    { utterance: 'what rate limit is set', intent: 'rate.limit.status' },
    { utterance: 'show me the rate limiting policy', intent: 'rate.limit.status' },
    { utterance: 'is there a rate limit on the load balancer', intent: 'rate.limit.status' },
    { utterance: 'rate limiter status', intent: 'rate.limit.status' },
    { utterance: 'check throttling on the LB', intent: 'rate.limit.status' },
    { utterance: 'is request throttling enabled', intent: 'rate.limit.status' },
    { utterance: 'what is the rate limit threshold', intent: 'rate.limit.status' },
    { utterance: 'show me the request rate limit', intent: 'rate.limit.status' },
    { utterance: 'is there rate limiting configured', intent: 'rate.limit.status' },
    { utterance: 'rate limit settings on the LB', intent: 'rate.limit.status' },
    { utterance: 'check if rate limiting is on', intent: 'rate.limit.status' },
    { utterance: 'show me the RPS limit', intent: 'rate.limit.status' },
  ],

  entities: [],

  handler: async ({ say, tenant, cache, args, formatter }) => {
    if (!args.namespace) {
      await say({ blocks: formatter.namespacePicker('rate.limit.status', tenant.namespaces || []) });
      return;
    }
    if (!args.resourceName) {
      const data = await tenant.client.get(`/api/config/namespaces/${args.namespace}/http_loadbalancers`);
      const names = (data.items || []).map((lb) => lb.name || lb.metadata?.name).filter(Boolean);
      if (names.length === 0) {
        await say({ blocks: formatter.errorBlock(`No load balancers found in namespace \`${args.namespace}\`.`) });
      } else {
        await say({ blocks: formatter.resourcePicker('rate.limit.status', args.namespace, names, `Check rate limiting for which LB in *${args.namespace}*?`) });
      }
      return;
    }

    const ns = args.namespace;
    const name = args.resourceName;
    const cacheKey = `${tenant.name}:${ns}:rate_limit:${name}`;
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

    // Field name: verify in Task 4 — likely spec.rate_limiter or spec.rate_limit
    const rateLimiterRef = spec.rate_limiter || spec.rate_limit;

    if (!rateLimiterRef) {
      const blocks = [
        ...formatter.errorBlock(`No rate limiter configured on LB \`${name}\` in namespace \`${ns}\`.`),
        formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
      ];
      await say({ blocks });
      return;
    }

    const fields = [
      { label: 'LB', value: name },
      { label: 'Rate Limiter', value: rateLimiterRef.name || 'configured' },
    ];

    // Try to fetch the rate limiter object for details
    if (rateLimiterRef.name) {
      try {
        const rlNs = rateLimiterRef.namespace || ns;
        const rl = await tenant.client.get(`/api/config/namespaces/${rlNs}/rate_limiters/${rateLimiterRef.name}`);
        const rlSpec = rl.spec || {};
        if (rlSpec.threshold) fields.push({ label: 'Threshold', value: String(rlSpec.threshold) });
        if (rlSpec.unit) fields.push({ label: 'Unit', value: rlSpec.unit });
      } catch {
        // Rate limiter detail fetch is best-effort
      }
    }

    const blocks = [
      ...formatter.detailView(`Rate Limiting — ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/commands/security-commands.test.js --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/rate-limit-status.js tests/commands/security-commands.test.js
git commit -m "feat: add rate-limit-status command"
```

---

### Task 7: Create malicious-user-status command

**Files:**
- Create: `src/commands/malicious-user-status.js`
- Test: `tests/commands/security-commands.test.js`

Per-LB command that shows malicious user detection/mitigation config. Common abbreviations: MUD, MUM, mal user.

**LB spec field (verify in Task 4):** `spec.malicious_user_mitigation` (reference to a malicious_user_mitigation object).

- [ ] **Step 1: Write the test**

Add to `tests/commands/security-commands.test.js`:

```js
const maliciousUser = require('../../src/commands/malicious-user-status');

// Plugin contract:
test('malicious-user-status', () => {
  expect(maliciousUser.meta.name).toBe('malicious-user-status');
  expect(maliciousUser.meta.slashCommand).toBe('/xc-maluser');
  expect(maliciousUser.intents.length).toBeGreaterThanOrEqual(15);
});

// Handler tests:
describe('malicious-user-status handler', () => {
  test('shows MUD config when present', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {
            malicious_user_mitigation: { name: 'my-mud-policy', namespace: 'prod' },
          },
        }),
      },
    };
    await maliciousUser.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('my-mud-policy');
    expect(text).toContain('Malicious User');
  });

  test('shows disabled when no MUD configured', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {},
        }),
      },
    };
    await maliciousUser.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toMatch(/not configured|disabled|none/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/security-commands.test.js --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement malicious-user-status.js**

Create `src/commands/malicious-user-status.js`:

```js
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

    const mudRef = spec.malicious_user_mitigation;

    if (!mudRef) {
      const blocks = [
        ...formatter.errorBlock(`No malicious user detection configured on LB \`${name}\` in namespace \`${ns}\`.`),
        formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
      ];
      await say({ blocks });
      return;
    }

    const fields = [
      { label: 'LB', value: name },
      { label: 'Malicious User Policy', value: mudRef.name || 'configured' },
    ];

    if (mudRef.namespace && mudRef.namespace !== ns) {
      fields.push({ label: 'Policy Namespace', value: mudRef.namespace });
    }

    const blocks = [
      ...formatter.detailView(`Malicious User Detection — ${name}`, fields),
      formatter.footer({ durationMs: Date.now() - startTime, cached: false, namespace: ns }),
    ];

    cache.set(cacheKey, { blocks }, 300);
    await say({ blocks });
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/commands/security-commands.test.js --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/malicious-user-status.js tests/commands/security-commands.test.js
git commit -m "feat: add malicious-user-status command (MUD/MUM)"
```

---

### Task 8: Create security-posture command

**Files:**
- Create: `src/commands/security-posture.js`
- Test: `tests/commands/security-commands.test.js`

Per-LB command that reads the LB spec and reports the status of all security controls in a single card. One GET call, reads all fields.

- [ ] **Step 1: Write the test**

Add to `tests/commands/security-commands.test.js`:

```js
const securityPosture = require('../../src/commands/security-posture');

// Plugin contract:
test('security-posture', () => {
  expect(securityPosture.meta.name).toBe('security-posture');
  expect(securityPosture.meta.slashCommand).toBe('/xc-security');
  expect(securityPosture.intents.length).toBeGreaterThanOrEqual(15);
});

// Handler tests:
describe('security-posture handler', () => {
  test('shows all security controls for an LB', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'my-lb' },
          spec: {
            app_firewall: { name: 'my-waf' },
            bot_defense: { regional_endpoint: 'US' },
            rate_limiter: { name: 'my-rl' },
            malicious_user_mitigation: { name: 'my-mud' },
            active_service_policies: { policies: [{ name: 'pol-1' }] },
            enable_api_discovery: {},
            api_protection_rules: {},
            data_guard_rules: {},
          },
        }),
      },
    };
    await securityPosture.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'my-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    expect(text).toContain('WAF');
    expect(text).toContain('my-waf');
    expect(text).toContain('Bot Defense');
    expect(text).toContain('Rate Limit');
    expect(text).toContain('Malicious User');
    expect(text).toContain('Service Policies');
    expect(text).toContain('API Discovery');
    expect(text).toContain('Data Guard');
  });

  test('shows disabled controls clearly', async () => {
    const messages = [];
    const tenant = {
      name: 'test',
      client: {
        get: jest.fn().mockResolvedValue({
          metadata: { name: 'bare-lb' },
          spec: { disable_waf: true },
        }),
      },
    };
    await securityPosture.handler({
      say: (msg) => messages.push(msg),
      tenant,
      cache: new Cache(),
      args: { namespace: 'prod', resourceName: 'bare-lb' },
      formatter,
    });
    const text = JSON.stringify(messages[0]);
    // All controls should show as disabled/none
    expect(text).toContain('Security Posture');
    expect(text).toMatch(/none|disabled/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/commands/security-commands.test.js --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement security-posture.js**

Create `src/commands/security-posture.js`:

```js
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
      wafStatus = `${on} ${spec.app_firewall.name}`;
    } else {
      wafStatus = `${off} None`;
    }

    // Bot Defense
    const botStatus = spec.bot_defense
      ? `${on} Enabled`
      : `${off} Disabled`;

    // Rate Limiting
    const rlRef = spec.rate_limiter || spec.rate_limit;
    const rlStatus = rlRef
      ? `${on} ${rlRef.name || 'Configured'}`
      : `${off} None`;

    // Malicious User
    const mudRef = spec.malicious_user_mitigation;
    const mudStatus = mudRef
      ? `${on} ${mudRef.name || 'Configured'}`
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
    if (spec.api_protection_rules) apiFeatures.push('Protection');
    if (spec.api_specification) apiFeatures.push('Spec Enforcement');
    const apiStatus = apiFeatures.length > 0
      ? `${on} ${apiFeatures.join(', ')}`
      : `${off} None`;

    // Data Guard
    const dgStatus = spec.data_guard_rules
      ? `${on} Enabled`
      : `${off} None`;

    const fields = [
      { label: 'WAF', value: wafStatus },
      { label: 'Bot Defense', value: botStatus },
      { label: 'Rate Limiting', value: rlStatus },
      { label: 'Malicious User', value: mudStatus },
      { label: 'Service Policies', value: policyStatus },
      { label: 'API Security', value: apiStatus },
      { label: 'Data Guard', value: dgStatus },
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/commands/security-commands.test.js --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/security-posture.js tests/commands/security-commands.test.js
git commit -m "feat: add security-posture command (all controls summary)"
```

---

### Task 9: Register new slash commands in SETUP.md and update docs

**Files:**
- Modify: `SETUP.md`
- Modify: `README.md`

- [ ] **Step 1: Add new slash commands to SETUP.md table**

Add these rows to the slash command registration table:

```
| `/xc-ratelimit` | Rate limiting status |
| `/xc-maluser` | Malicious user detection status |
| `/xc-security` | Security posture summary |
```

Update the "Loaded N commands" line to reflect the new total (23).

- [ ] **Step 2: Add new commands to README.md**

Add to the "Review security posture" section:

```markdown
`/xc-ratelimit <namespace> <lb>` — Rate limiting configuration
> *"is rate limiting enabled"* · *"show me the rate limit on my LB"*

`/xc-maluser <namespace> <lb>` — Malicious user detection/mitigation
> *"is MUD enabled"* · *"check malicious user detection"* · *"mal user status"*

`/xc-security <namespace> <lb>` — Security posture summary (all controls at a glance)
> *"what security is on this LB"* · *"security posture for my load balancer"*
```

- [ ] **Step 3: Commit**

```bash
git add SETUP.md README.md
git commit -m "docs: add rate-limit, malicious-user, security-posture commands"
```

---

### Task 10: Add NLP FILLER words for new commands

**Files:**
- Modify: `src/core/nlp-engine.js`
- Test: `tests/core/nlp-engine.test.js`

Add new FILLER words so resourceName extraction works for the new intents. Words like "rate", "limit", "limiting", "throttle", "malicious", "user", "mud", "mum", "mal", "posture", "secure", "hardened", "audit", "controls".

- [ ] **Step 1: Write failing tests**

Add to `tests/core/nlp-engine.test.js` in the hyphenated namespaces describe block:

```js
test('extracts LB name for rate limit query', async () => {
  const result = await engine.process('is rate limiting enabled on demo-shop-fe in demo-shop');
  expect(result.entities.namespace).toBe('demo-shop');
  expect(result.entities.resourceName).toBe('demo-shop-fe');
});

test('extracts LB name for malicious user query', async () => {
  const result = await engine.process('check MUD on demo-shop-fe in demo-shop');
  expect(result.entities.namespace).toBe('demo-shop');
  expect(result.entities.resourceName).toBe('demo-shop-fe');
});

test('extracts LB name for security posture query', async () => {
  const result = await engine.process('what security is on demo-shop-fe in demo-shop');
  expect(result.entities.namespace).toBe('demo-shop');
  expect(result.entities.resourceName).toBe('demo-shop-fe');
});
```

- [ ] **Step 2: Add FILLER words to nlp-engine.js**

Add to the FILLER set:

```js
'rate', 'limit', 'limiting', 'limiter', 'throttle', 'throttling', 'rps',
'malicious', 'user', 'mud', 'mum', 'mal', 'bad', 'actor', 'detection', 'mitigation',
'posture', 'secure', 'secured', 'hardened', 'audit', 'controls', 'features',
'security', 'overview',
```

- [ ] **Step 3: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/nlp-engine.js tests/core/nlp-engine.test.js
git commit -m "feat: add FILLER words for rate-limit, malicious-user, security-posture"
```

---

### Task 11: Update lb-summary to show new security fields

**Files:**
- Modify: `src/commands/lb-summary.js`
- Test: `tests/commands/lb-commands.test.js`

The lb-summary already shows WAF and Bot Defense. Add Rate Limiting, Malicious User, and API Security to the detail card.

- [ ] **Step 1: Write the test**

```js
test('lb-summary shows rate limiting and malicious user fields', async () => {
  const messages = [];
  const tenant = {
    name: 'test',
    client: {
      get: jest.fn().mockResolvedValue({
        metadata: { name: 'my-lb' },
        spec: {
          domains: ['example.com'],
          app_firewall: { name: 'my-waf' },
          bot_defense: {},
          rate_limiter: { name: 'my-rl' },
          malicious_user_mitigation: { name: 'my-mud' },
          default_route_pools: [],
          routes: [],
        },
      }),
    },
  };
  await lbSummary.handler({
    say: (msg) => messages.push(msg),
    tenant,
    cache: new Cache(),
    args: { namespace: 'prod', resourceName: 'my-lb' },
    formatter,
  });
  const text = JSON.stringify(messages[0]);
  expect(text).toContain('Rate Limiting');
  expect(text).toContain('my-rl');
  expect(text).toContain('Malicious User');
  expect(text).toContain('my-mud');
});
```

- [ ] **Step 2: Add fields to renderLb()**

In `src/commands/lb-summary.js`, in the `renderLb` function, after the bot defense field:

```js
const rateLimiter = spec.rate_limiter?.name || spec.rate_limit?.name || 'None';
const malUser = spec.malicious_user_mitigation?.name || 'None';

// Add to fields array after botDefense:
{ label: 'Rate Limiting', value: rateLimiter },
{ label: 'Malicious User', value: malUser },
```

- [ ] **Step 3: Run tests**

Run: `npx jest --no-coverage`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/lb-summary.js tests/commands/lb-commands.test.js
git commit -m "feat: show rate limiting and malicious user in lb-summary"
```

---

### Task 12: Final integration test and version bump

**Files:**
- Modify: `package.json`
- Modify: `SETUP.md` (image tags)

- [ ] **Step 1: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests PASS. Note total test count (should be ~160+).

- [ ] **Step 2: Run the intent coverage test**

Run: `npx jest tests/core/nlp-intent-coverage.test.js --no-coverage --verbose`
Expected: All smoke phrases route correctly. Zero cross-intent collisions.

- [ ] **Step 3: Verify command count**

Run: `ls src/commands/*.js | grep -v _template | wc -l`
Expected: 23

- [ ] **Step 4: Bump version to 0.5.0**

This is a minor bump — new features (3 commands) + NLP improvements.

```bash
# package.json: "version": "0.4.0" → "0.5.0"
# SETUP.md: update image tags from 0.4 to 0.5
```

- [ ] **Step 5: Commit and push**

```bash
git add package.json SETUP.md
git commit -m "chore: bump version to 0.5.0"
git push
```

---

## Execution order summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| A — Extraction | 1, 2, 3 | Text normalization, extract-then-classify, cleanup |
| B — Utterances | 4, 5 | Verify LB fields, expand to 15-20 per command |
| C — New Commands | 6, 7, 8, 9, 10, 11 | rate-limit, malicious-user, security-posture, docs, FILLER, lb-summary |
| Ship | 12 | Integration test, version bump, push |

**Estimated total: ~350-400 new utterances, 3 new commands, 1 NLP refactor, ~20 new tests.**
