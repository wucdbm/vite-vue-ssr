import type { ConfigEnv, PluginOption, UserConfig } from 'vite'
import type { PluginConfig } from './config'
import {
    createLivenessAndReadinessHandler,
    createPreviewHandler,
    createSSRDevHandler,
} from './ssr/dev'
import path from 'node:path'

export function WucdbmViteVueSsr(options: PluginConfig = {}): PluginOption {
    return {
        name: PLUGIN_NAME,
        [PLUGIN_NAME]: options,

        config(config: UserConfig, env: ConfigEnv) {
            const conf: UserConfig = {
                ssr: {
                    noExternal: [PLUGIN_NAME],
                },
            }

            if ('serve' === env.command && env.isPreview) {
                if (!conf.build) {
                    conf.build = {}
                }

                const distDir =
                    config.build?.outDir ?? path.resolve(process.cwd(), 'dist')
                conf.build.outDir = path.resolve(distDir, 'client')

                conf.preview = options.preview?.options
            }

            return conf
        },
        configurePreviewServer(server) {
            return () => {
                server.middlewares.use(
                    createLivenessAndReadinessHandler(options),
                )
                server.middlewares.use(createPreviewHandler(server, options))
            }
        },
        async configureServer(server) {
            server.middlewares.use(createLivenessAndReadinessHandler(options))

            if (process.env.DEV_SSR) {
                if (false === options.ssr?.nodeTlsRejectUnauthorized) {
                    process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0'
                }

                const handler = await createSSRDevHandler(server, options)
                server.middlewares.use(handler)
            }
        },
    } as PluginOption
}
