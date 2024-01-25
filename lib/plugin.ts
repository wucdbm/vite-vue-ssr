import type { PluginOption } from 'vite'
import type { PluginConfig } from './config.js'
// import { createSSRDevHandler } from './ssr-dev.js'

export function WiteWueSsrPlugin(options: PluginConfig = {}): PluginOption {
    return {
        name: 'wite-wue-ssr-test',
        viteSsrOptions: options,
        config() {
            return {
                ssr: {
                    noExternal: ['wite-wue-ssr-test'],
                },
            }
        },
        // async configureServer(server) {
        //     if (process.env.DEV_SSR) {
        //         if (options.polyfills !== false && !globalThis.fetch) {
        //             const fetch = await import('node-fetch')
        //             // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //             // @ts-ignore
        //             globalThis.fetch = fetch.default || fetch
        //         }
        //
        //         if (false === options.nodeTlsRejectUnauthorized) {
        //             process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
        //         }
        //
        //         const handler = await createSSRDevHandler(server, options)
        //         return () => server.middlewares.use(handler)
        //     }
        // },
    } as PluginOption
}
