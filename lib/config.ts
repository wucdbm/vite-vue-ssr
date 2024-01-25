import * as connect from 'connect'
// import fs from 'node:fs'
import { InlineConfig } from 'vite'

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
