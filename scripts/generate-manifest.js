#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { loadCommands } = require('../src/loader');

async function main() {
  const commandsDir = path.join(__dirname, '../src/commands');
  const { commands } = await loadCommands(commandsDir);

  const slashCommands = commands
    .filter((cmd) => cmd.meta.slashCommand)
    .map((cmd) => ({
      command: cmd.meta.slashCommand,
      description: cmd.meta.description,
      should_escape: false,
    }))
    .sort((a, b) => a.command.localeCompare(b.command));

  const manifest = {
    _metadata: { major_version: 2, minor_version: 1 },
    display_information: {
      name: 'XC Bot',
      description: 'Operational visibility into F5 Distributed Cloud',
      background_color: '#1a1a2e',
    },
    features: {
      bot_user: {
        display_name: 'XC Bot',
        always_online: true,
      },
      slash_commands: slashCommands,
    },
    oauth_config: {
      scopes: {
        bot: [
          'chat:write',
          'commands',
          'files:write',
          'app_mentions:read',
          'im:history',
          'reactions:read',
        ],
      },
    },
    settings: {
      event_subscriptions: {
        bot_events: ['app_mention', 'message.im', 'reaction_added'],
      },
      interactivity: { is_enabled: true },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  };

  const outPath = path.join(__dirname, '../slack-manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`Generated slack-manifest.json with ${slashCommands.length} slash commands`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
