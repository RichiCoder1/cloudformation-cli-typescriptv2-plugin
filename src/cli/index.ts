#!/usr/bin/env node
import { program } from './program.js';
import { generate } from './commands/generate.js';

const nodeVersion = process.versions.node;
if (Number(nodeVersion.split('.')[0]) < 18) {
    throw new Error(
        `Node.js version ${nodeVersion} is not supported by the cloudformation-cli-typescript-plugin. Please upgrade to Node.js 18 or later.`
    );
}

generate(program);

(program.parse() as Promise<any>).catch((e) => {
    console.error(e);
    process.exit(1);
});
