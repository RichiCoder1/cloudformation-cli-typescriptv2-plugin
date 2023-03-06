#!/usr/bin/env tsx

import { $, os, path } from "zx";

const verdaccioContainer = "verdaccio";

if (os.platform() === "win32") {
  $.shell = "powershell";
  $.prefix = "";
  $.quote = (s) => `${s}`;
}

const cwd = process.cwd();
const config = path
  .join(cwd, "scripts/verdaccio/config.yaml")
  .replace(/\\/g, "/");

const running = await $`docker ps`;
if (running.stdout.includes(verdaccioContainer)) {
  await $`docker stop ${verdaccioContainer}`;
}

await $`docker run -d --rm --name ${verdaccioContainer} -p 4873:4873 --mount type=bind,source=${config},target=/verdaccio/conf/config.yaml verdaccio/verdaccio:latest`;

const registryUrl = "http://localhost:4873";
process.env["npm_config_//localhost:4873/:_authToken"] = "test";
$`npm publish --registry ${registryUrl}`;
