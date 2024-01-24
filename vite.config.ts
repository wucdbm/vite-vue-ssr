import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
    plugins: [dts({ include: ['lib'] })],
    build: {
        copyPublicDir: false,
        lib: {
            entry: resolve(__dirname, 'lib/main.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            external: ['vue', 'vue-router'],
        },
    },
    resolve: {
        alias: {
            src: resolve('src/'),
        },
    },
})
