#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { runCheck, runList, runStart } from './commands.js';
import { LocalError } from '../core/errors.js';

const USAGE = `Usage: fas <command> [options]

Commands:
  start   Start the HTTP proxy server
  check   Validate configuration files
  list    List all profiles

Options:
  --json  Output in JSON format (only for list command)
`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false, short: 'h' },
    },
  });

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const command = positionals[0];

  try {
    switch (command) {
      case 'start':
        await runStart();
        break;
      case 'check':
        await runCheck();
        break;
      case 'list':
        await runList(values.json as boolean);
        break;
      default:
        console.error(`Unknown command: ${command ?? '(none)'}`);
        console.error(USAGE);
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof LocalError) {
      console.error(`Error [${err.code}]: ${err.message}`);
    } else {
      console.error('Error:', err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }
}

main();
