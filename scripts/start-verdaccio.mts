#!/usr/bin/env tsx

import { $, argv, os, path } from "zx";
import { watch } from "chokidar";
import { asyncExitHook } from "exit-hook";

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

let activePublish: PromiseLike<any> | null = null;
function publish() {
  if (activePublish !== null) {
    return activePublish;
  }
  activePublish = $`npm unpublish --registry ${registryUrl} --force`.catch(
    (e) => console.warn("No package published, continuing:", e)
  );
  activePublish = $`npm publish --registry ${registryUrl}`;
  return activePublish.then(() => {
    activePublish = null;
  });
}

await publish();

if (argv.watch) {
  console.error("Watching for changes...");
  const watcher = watch(["src/**/*", "package.json"], {
    persistent: true,
  });

  watcher.on("change", async () => {
    await publish();
  });

  asyncExitHook(
    async () => {
      await watcher.close();
      await $`docker stop ${verdaccioContainer}`.catch((e) =>
        console.warn("Failed to stop verdaccio", e)
      );
    },
    { minimumWait: 1000 }
  );
}
