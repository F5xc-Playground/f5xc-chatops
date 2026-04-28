const fs = require('fs');
const path = require('path');

async function loadCommands(commandsDir) {
  const files = fs.readdirSync(commandsDir).filter((f) => {
    return f.endsWith('.js') && !f.startsWith('_');
  });

  const commands = [];
  const intentMap = {};
  const slashMap = {};
  const allIntents = [];
  const errors = [];

  for (const file of files) {
    const filePath = path.join(commandsDir, file);
    let mod;

    try {
      mod = require(filePath);
    } catch (err) {
      errors.push({ file, error: `Failed to require: ${err.message}` });
      continue;
    }

    if (!mod.meta || !mod.meta.name || !mod.intents || !mod.handler) {
      errors.push({ file, error: 'Missing required exports: meta, intents, handler' });
      continue;
    }

    commands.push(mod);

    for (const intent of mod.intents) {
      intentMap[intent.intent] = mod;
      allIntents.push(intent);
    }

    if (mod.meta.slashCommand) {
      slashMap[mod.meta.slashCommand] = mod;
    }
  }

  return { commands, intentMap, slashMap, allIntents, errors };
}

module.exports = { loadCommands };
