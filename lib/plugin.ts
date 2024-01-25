import type { PluginOption } from 'vite'
import type { PluginConfig } from './config'
import { createSSRDevHandler } from './ssr/dev'

export function WucdbmViteVueSsr(options: PluginConfig = {}): PluginOption {
    return {
        name: PLUGIN_NAME,
        [PLUGIN_NAME]: options,
        config() {
            return {
                ssr: {
                    noExternal: [PLUGIN_NAME],
                },
            }
        },
        async configureServer(server) {
            if (process.env.DEV_SSR) {
                if (options.polyfills !== false && !globalThis.fetch) {
                    const fetch = await import('node-fetch')
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    globalThis.fetch = fetch.default || fetch
                }

                if (false === options.ssr?.nodeTlsRejectUnauthorized) {
                    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
                }

                const handler = await createSSRDevHandler(server, options)
                return () => server.middlewares.use(handler)
            }
        },
    } as PluginOption
}
