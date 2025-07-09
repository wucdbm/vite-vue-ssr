import * as connect from 'connect'
import {
    renderToNodeStream,
    renderToString,
    SSRContext,
} from '@vue/server-renderer'
import type { SSRHeadPayload } from '@unhead/ssr'
import { renderSSRHead } from '@unhead/ssr'
import { serializeState, StateSerializer } from './utils/state'

import {
    AppFactory,
    Hooks,
    HtmlReplacer,
    PreLoaders,
    ServerSideResponse,
    SSRManifest,
} from './types'
import {
    provideRedirect,
    RedirectLocation,
    useServerRedirect,
} from './plugins/redirect'
import { createSetStatusState, provideSetStatus } from './plugins/status'
import { Unhead } from '@unhead/schema'
import { App } from 'vue'
import { Deferred } from './utils/defer.ts'
import { Readable } from 'node:stream'

export type RenderAppArgs<R> = {
    factory: AppFactory
    stateSerializer?: StateSerializer
    replacer: HtmlReplacer
    path: string
    ssrManifest?: SSRManifest
    hooks?: Hooks<R>
    abortController?: AbortController
}

export async function renderApp<R = Record<string, unknown>>({
    factory,
    stateSerializer,
    replacer,
    path,
    ssrManifest,
    hooks,
    abortController,
}: RenderAppArgs<R>): Promise<ServerSideResponse<R>> {
    const {
        app,
        router,
        baseUrl,
        getState,
        head,
        preload,
        preLoaders,
        getCookies,
    } = await factory()
    const preLoadersWithDefault = createPreLoaders(preLoaders || {})

    const { deferred, redirectLocation, redirect, isRedirect } =
        useServerRedirect()

    provideRedirect(app, redirect)

    const statusState = createSetStatusState()
    provideSetStatus(app, statusState)

    if (baseUrl && path.startsWith(baseUrl)) {
        path = path.slice(baseUrl.length)
    }
    await router.push(path)
    await router.isReady()

    if (isRedirect()) {
        const responseData = await hooks?.getResponseData?.()

        return returnRedirect(redirectLocation, responseData)
    }

    await hooks?.onRouterReady?.()

    const ssrContext: SSRContext = {}

    if (abortController) {
        renderAppToStream(app, ssrContext, deferred, abortController)
    } else {
        renderAppToString(app, ssrContext, deferred)
    }

    const body = await deferred.promise

    if (isRedirect()) {
        const responseData = await hooks?.getResponseData?.()

        return returnRedirect(redirectLocation, responseData)
    }

    let headHtmlResult = await renderHead(head)

    const dependencies = ssrManifest
        ? findDependencies(ssrContext.modules, ssrManifest)
        : []

    if (preload && dependencies.length > 0) {
        const preloadLinks = createPreloadLinks(
            dependencies,
            preLoadersWithDefault,
        ).join('\n')

        headHtmlResult = {
            ...headHtmlResult,
            headTags: `${headHtmlResult.headTags}\n${preloadLinks}`,
        }
    }

    if (!stateSerializer) {
        stateSerializer = serializeState
    }

    const initialState = stateSerializer(getState())
    const coreDependencies = JSON.parse(
        '{"__WITE_CORE_DEPS__":[]}',
    ).__WITE_CORE_DEPS__

    const responseData =
        hooks && hooks.getResponseData && (await hooks.getResponseData())

    return {
        redirectLocation,
        dependencies,
        coreDependencies,
        preLoaders: preLoadersWithDefault,
        headHtmlResult: headHtmlResult,
        body,
        initialState,

        status: statusState.status,

        html: replacer(headHtmlResult, body, initialState),
        data: responseData,
        ssrContext,

        cookies: getCookies?.(),
    }
}

function renderAppToString(
    app: App,
    ssrContext: SSRContext,
    deferred: Deferred<string>,
): void {
    renderToString(app, ssrContext)
        .then(deferred.resolve)
        .catch(deferred.reject)
}

function renderAppToStream(
    app: App,
    ssrContext: SSRContext,
    deferred: Deferred<string>,
    abortController: AbortController,
): void {
    const readable: Readable = renderToNodeStream(app, ssrContext)

    let stop = false
    const promise = Promise.resolve().then(async () => {
        const chunks = []
        // By default, exiting the loop will also cancel the stream, so that it can no longer be used.
        // To continue to use a stream after exiting the loop, pass { preventCancel: true } to the stream's values() method.
        for await (const chunk of readable) {
            chunks.push(chunk)

            if (stop) {
                break
            }
        }

        return Buffer.concat(chunks).toString()
    })

    promise
        .then((r) => {
            if (stop) {
                return
            }

            deferred.resolve(r)
        })
        .catch((e) => {
            if (stop) {
                return
            }

            deferred.reject(e)
        })

    deferred.promise.then(() => {
        stop = true
        abortController.abort()
    })
}

async function renderHead(head: Unhead | undefined): Promise<SSRHeadPayload> {
    if (head) {
        return await renderSSRHead(head)
    }

    return {
        headTags: '',
        htmlAttrs: '',
        bodyAttrs: '',
        bodyTags: '',
        bodyTagsOpen: '',
    }
}

function returnRedirect<RD = Record<string, unknown>>(
    redirectLocation: RedirectLocation,
    data: RD | undefined,
): ServerSideResponse<RD> {
    return {
        redirectLocation,
        status: redirectLocation.status,
        dependencies: [],
        coreDependencies: [],
        preLoaders: {},
        headHtmlResult: {
            htmlAttrs: '',
            headTags: '',
            bodyAttrs: '',
            bodyTags: '',
            bodyTagsOpen: '',
        },
        body: '',
        initialState: 'undefined',
        html: '',
        data: data,
        ssrContext: {},
        cookies: undefined,
    }
}

export function findDependencies(
    modules: string[],
    manifest: Record<string, string[]>,
): string[] {
    const files = new Set<string>()

    for (const id of modules || []) {
        for (const file of manifest[id] || []) {
            files.add(file)
        }
    }

    return [...files]
}

export const defaultPreLoaders: PreLoaders = {
    js: {
        link: (path) => `<link rel="modulepreload" crossorigin href="${path}">`,
        header: (path) => `<${path}>; rel=preload; as=script`,
    },
    css: {
        link: (path) => `<link rel="stylesheet" href="${path}">`,
        header: (path) => `<${path}>; rel=preload; as=style`,
    },
    svg: {
        link: (path) =>
            `<link rel="preload" href="${path}" as="image" type="image/svg+xml" />`,
        header: (path) => `<${path}>; rel=preload; as=image`,
    },
}

export function createPreLoaders(loaders: PreLoaders): PreLoaders {
    return {
        ...defaultPreLoaders,
        ...loaders,
    }
}

export function createPreloadLinks(
    files: string[],
    loaders: PreLoaders,
): string[] {
    return createLinks(files, loaders, 'link')
}

export function createPreloadHeaders(
    files: string[],
    loaders: PreLoaders,
): string[] {
    return createLinks(files, loaders, 'header')
}

export function createLinks(
    files: string[],
    loaders: PreLoaders,
    func: 'link' | 'header',
): string[] {
    const links = []

    for (const file of files || []) {
        const parts = file.split('.')
        const extension = parts[parts.length - 1]

        const loader = loaders[extension]

        if (loader) {
            links.push(loader[func](file))
        }
    }

    return links
}

export function getExpressPath(request: connect.IncomingMessage): string {
    if (request.originalUrl) {
        return request.originalUrl
    }

    if (request.url) {
        return request.url
    }

    return '/'
}
