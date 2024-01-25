import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
    plugins: [
        dts({
            rollupTypes: true,
            include: ['lib'],
            exclude: ['lib/cli'],
        }),
    ],
    build: {
        minify: false,
        copyPublicDir: false,
        lib: {
            entry: resolve(__dirname, 'lib/index.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            external: [
                // Node Builtins
                'node:path',
                'node:http',
                'node:fs',
                // Libs
                '@unhead/ssr',
                '@unhead/vue',
                '@unhead/head',
                'chalk',
                'connect',
                'node-fetch',
                'vite',
                'vue',
                '@vue/server-renderer',
                'vue-router',
            ],
            output: {
                assetFileNames: 'assets/[name][extname]',
                entryFileNames: '[name].js',
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve('lib/'),
        },
    },
})
