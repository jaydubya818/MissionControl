#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assessBedrockPrerequisites } from './lib/fdlc-bedrock-prerequisites.mjs';
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=="--config")) throw new Error("Use --config APPROVED_SAFE_CONFIG.json");
const path = args[1] ?? fileURLToPath(new URL('../docs/software-factory/fdlc-bedrock-qualification-inputs.json', import.meta.url));
const result = assessBedrockPrerequisites(JSON.parse(readFileSync(path, 'utf8')));
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
// Exit 2 denotes unresolved prerequisites, never a successful admission.
process.exitCode = result.prerequisiteDocumentComplete ? 0 : 2;
