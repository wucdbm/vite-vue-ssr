import * as connect from 'connect'
import { renderToString, SSRContext } from '@vue/server-renderer'
import type { SSRHeadPayload } from '@unhead/ssr'
import { renderSSRHead } from '@unhead/ssr'

import { serializeState } from './utils/state'
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

export async function renderApp<R = Record<string, unknown>>({
    factory,
    replacer,
    request,
    ssrManifest,
    hooks,
}: {
    factory: AppFactory
    replacer: HtmlReplacer
    request: connect.IncomingMessage
    ssrManifest?: SSRManifest
    hooks?: Hooks<R>
}): Promise<ServerSideResponse<R>> {
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

    let path = getPath(request)

    if (baseUrl && path.startsWith(baseUrl)) {
        path = path.slice(baseUrl.length)
    }
    await router.push(path)
    await router.isReady()

    if (isRedirect()) {
        const responseData =
            hooks && hooks.getResponseData && (await hooks.getResponseData())

        return returnRedirect(redirectLocation, responseData)
    }

    if (hooks && hooks.onRouterReady) {
        await hooks.onRouterReady()
    }

    const ssrContext: SSRContext = {}
    renderToString(app, ssrContext)
        .then(deferred.resolve)
        .catch(deferred.reject)
    const body = await deferred.promise

    if (isRedirect()) {
        const responseData =
            hooks && hooks.getResponseData && (await hooks.getResponseData())

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

    const initialState = serializeState(getState())
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

function getPath(request: connect.IncomingMessage): string {
    if (request.originalUrl) {
        return request.originalUrl
        // return new URL(request.originalUrl, `${protocol}://${request.headers.host}`)
    }

    if (request.url) {
        return request.url
        // return new URL(request.url, `${protocol}://${request.headers.host}`)
    }

    return '/'
    // return new URL(`${protocol}://${request.headers.host}`)
}

// function getUrl(request: connect.IncomingMessage): URL {
//     const protocol = getProtocol(request)
//
//     if (request.originalUrl) {
//         return new URL(request.originalUrl, `${protocol}://${request.headers.host}`)
//     }
//
//     if (request.url) {
//         return new URL(request.url, `${protocol}://${request.headers.host}`)
//     }
//
//     return new URL(`${protocol}://${request.headers.host}`)
// }

// type ObjectAndProp<T, P extends string, PT> = T & {
//     [Z in P]: PT
// }

// function hasProperty<T, PT>(object: T, prop: string): object is ObjectAndProp<T, typeof prop, PT> {
//     return prop in object
// }

// function getProtocol(request: connect.IncomingMessage): string {
//     if (hasProperty<connect.IncomingMessage, string>(request, 'protocol')) {
//         return request.protocol
//     }
//
//     const headers = request.headers
//
//     if (headers.referer) {
//         const parts = headers.referer.split(':')
//
//         if (parts[0]) {
//             return parts[0]
//         }
//     }
//
//     return 'http'
// }
