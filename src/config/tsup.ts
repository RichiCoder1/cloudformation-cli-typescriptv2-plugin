import { defineConfig, type Options } from 'tsup';

const requirePatch = `
const { require, __filename, __dirname } = await (async () => {
	const { createRequire } = await import("node:module");
	const { fileURLToPath } = await import("node:url");

	return {
		require: createRequire(import.meta.url),
		__filename: fileURLToPath(import.meta.url),
		__dirname: fileURLToPath(new URL(".", import.meta.url)),
	};
})();`.trim();

export const defaultConfig = defineConfig({
    entry: ['src/**/*'],
    format: ['esm'],
    platform: 'node',
    dts: false,
    bundle: true,
    clean: true,
    sourcemap: true,
    minify: true,
    banner: {
        js: requirePatch,
    },
}) as Options;
