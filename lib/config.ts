import path from 'path'
import * as connect from 'connect'
// import fs from 'node:fs'
import { InlineConfig, resolveConfig, ResolvedConfig } from 'vite'

export interface PluginConfig {
    /**
     * Path to entry index.html
     * @default '<root>/index.html'
     */
    input?: string
    /**
     * Path to entry-server
     * @default '<root>/src/entry-server.ts'
     */
    entryServer?: string
    build?: BuildOptions
    polyfills?: boolean
    ssr?: {
        serverEntryData?: (request: connect.IncomingMessage) => any
        /**
         * Whether to set process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0' in DEV SSR
         */
        nodeTlsRejectUnauthorized?: boolean
    }
}

export interface BuildOptions {
    /**
     * Vite options applied only to the client build
     */
    clientOptions?: ClientBuildConfig
    /**
     * Vite options applied only to the server build + packageJson
     */
    serverOptions?: ServerBuildConfig
    /**
     * Remove the index.html generated in the client build
     * @default false
     */
    removeIndexHtml?: boolean
}

export interface ClientBuildConfig extends InlineConfig {}

export interface ServerBuildConfig extends InlineConfig {
    /**
     * Extra properties to include in the generated server package.json,
     * or 'false' to avoid generating it.
     */
    packageJson?: Record<string, unknown> | false
}

export interface CliConfig {
    mode?: string
    build: {
        watch?: true
    }
}

export function getPluginOptions(viteConfig: ResolvedConfig): PluginConfig {
    return ((
        viteConfig.plugins.find(
            (plugin) => plugin.name === 'wite-wue-ssr-test',
        ) as any
    )?.viteSsrOptions || {}) as PluginConfig
}

export async function resolveViteConfig(
    mode?: string,
): Promise<ResolvedConfig> {
    return resolveConfig(
        {},
        'build',
        mode || process.env.MODE || process.env.NODE_ENV,
    )
}

// export async function getClientEntryPoint(config: ResolvedConfig, indexHtml?: string): Promise<string> {
//     if (!indexHtml) {
//         indexHtml = fs.readFileSync(getPluginOptions(config).input || path.resolve(config.root, 'index.html'), 'utf-8')
//     }
//
//     const matches = indexHtml.substring(indexHtml.lastIndexOf('script type="module"')).match(/src="(.*)">/i)
//
//     return matches?.[1] || 'src/main'
// }

export async function resolveEntryServerAbsolute(
    config: ResolvedConfig,
    options: PluginConfig,
): Promise<string> {
    const entryServer = options.entryServer || '/src/entry-server.ts'

    return resolveEntryAbsolute(config, entryServer)
}

// export async function resolveEntryClientAbsolute(config: ResolvedConfig, indexHtml?: string): Promise<string> {
//     const entryFile = await getClientEntryPoint(config, indexHtml)
//
//     return resolveEntryAbsolute(config, entryFile)
// }

export function resolveEntryAbsolute(
    config: ResolvedConfig,
    entryFile: string,
): string {
    return path.join(config.root, entryFile)
}
