import { defineConfig, type Options } from 'tsup';
export const defaultConfig = defineConfig({
    entry: ['src/**/*'],
    format: ['esm'],
    platform: 'node',
    skipNodeModulesBundle: true,
    noExternal: [
        /* Make sure we bundle generated code */
        /^\$cfn/,
        /^\.cfn/,
        /* Bundle app code that's using paths */ /^@\//,
        /* Bundle esbuild shims too */
        /tsup.*shims\.js$/,
    ],
    dts: false,
    bundle: true,
    clean: true,
    sourcemap: true,
    shims: true,
    define: {
        'process.env.NODE_ENV': process.env.NODE_ENV
            ? `"${process.env.NODE_ENV}"`
            : '"development"',
    },
}) as Options;
