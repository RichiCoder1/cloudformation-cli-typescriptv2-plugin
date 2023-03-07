import { defineConfig, type Options } from "tsup";
export const defaultConfig = defineConfig({
    entry: ["src/**/*"],
    format: ["esm"],
    platform: "node",
    dts: false,
    bundle: false,
    clean: true,
    sourcemap: true,
}) as Options;