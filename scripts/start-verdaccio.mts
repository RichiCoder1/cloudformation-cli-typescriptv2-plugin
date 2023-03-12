#!/usr/bin/env tsx

import { $, argv, os, path, ProcessPromise } from "zx";
import { watch } from "chokidar";

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

let activePublish: ProcessPromise | null = null;
function publish() {
  if (activePublish !== null) {
    return activePublish;
  }
  activePublish = $`npm publish --registry ${registryUrl}`;
  return activePublish.finally(() => {
    activePublish = null;
  });
}

await publish();

if (argv.watch) {
  console.error("Watching for changes...");
  const watcher = watch("src/**/*", {
    persistent: true,
  });

  watcher.on("change", async () => {
    await publish();
  });
}
