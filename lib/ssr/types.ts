import type { App } from 'vue'
import type { Router } from 'vue-router'
import * as connect from 'connect'
import { RedirectLocation } from './plugins/redirect.js'
import { SSRContext } from '@vue/server-renderer'
import { Unhead } from '@unhead/schema'
import { SSRHeadPayload } from '@unhead/ssr'

export interface ServerSideResponse<RD = Record<string, unknown>> {
    redirectLocation: RedirectLocation
    status: number | undefined
    dependencies: string[]
    coreDependencies: string[]
    preLoaders: PreLoaders
    headHtmlResult: SSRHeadPayload
    initialState: string
    body: string
    html: string
    data: RD | undefined
    ssrContext: SSRContext
    cookies: string | string[] | undefined
}

export interface AppFactoryResult {
    app: App
    router: Router
    baseUrl: string | undefined
    getState: () => Record<string, unknown>
    head?: Unhead
    preload: boolean
    preLoaders?: PreLoaders
    getCookies?: () => string | string[] | undefined
}

export interface PreLoader {
    link: (path: string) => string
    header: (path: string) => string
}

export type PreLoaders = {
    [key: string]: PreLoader
}
export type HtmlReplacer = (
    headHtmlResult: SSRHeadPayload,
    body: string,
    initialState: string,
) => string
export type AppFactory = () => AppFactoryResult | Promise<AppFactoryResult>
export type Hooks<RD = Record<string, unknown>> = {
    onRouterReady?: () => void
    getResponseData?: () => Promise<RD>
}
export type SSRManifest = Record<string, string[]>
export type AppEntryPoint<
    T = unknown | ((request: connect.IncomingMessage) => unknown),
    RD = Record<string, unknown>,
> = (
    path: string,
    data: T,
    template: string,
    ssrManifest?: SSRManifest,
    options?: {
        preLoaders: PreLoaders
    },
) => Promise<ServerSideResponse<RD>>
