import * as path from 'node:path'
import * as fs from 'node:fs'
import type { ServerResponse } from 'node:http'
import { IncomingMessage, NextHandleFunction } from 'connect'
import { PreviewServer, ViteDevServer } from 'rolldown-vite'
import { AppEntryPoint } from '../types'
import { isRedirect } from '../plugins/redirect'
import { PluginConfig } from '../../config'
import { getExpressPath } from '../index.ts'

export const createSSRDevHandler = async (
    server: ViteDevServer,
    options: PluginConfig,
): Promise<NextHandleFunction> => {
    const resolveFilePath = (p: string) => path.resolve(server.config.root, p)

    async function getIndexTemplate(url: string) {
        // Template should be fresh in every request
        const indexHtml = fs.readFileSync(
            options.input || resolveFilePath('index.html'),
            'utf-8',
        )
        return await server.transformIndexHtml(url, indexHtml)
    }

    return async (request: IncomingMessage, response: ServerResponse, next) => {
        if (
            request.method !== 'GET' ||
            request.originalUrl === '/favicon.ico'
        ) {
            return next()
        }

        if (request.originalUrl?.startsWith('/@vite')) {
            return next()
        }

        if (request.originalUrl?.startsWith('/src')) {
            return next()
        }

        if (request.originalUrl?.startsWith('/node_modules')) {
            return next()
        }

        if (request.originalUrl?.startsWith('/@id')) {
            return next()
        }

        if (request.originalUrl?.startsWith('/_hmr')) {
            return next()
        }

        let template: string

        try {
            template = await getIndexTemplate(request.originalUrl as string)
        } catch (error) {
            logServerError(error as Error, server)
            return next(error)
        }

        try {
            const entryPoint = resolveFilePath(
                options.entryServer || '/src/entry-server.ts',
            )

            let resolvedEntryPoint = await server.ssrLoadModule(
                resolveFilePath(entryPoint),
            )
            resolvedEntryPoint =
                resolvedEntryPoint.default || resolvedEntryPoint
            const render: AppEntryPoint =
                resolvedEntryPoint.render || resolvedEntryPoint

            const entryData =
                (options.ssr?.serverEntryData &&
                    options.ssr.serverEntryData(request)) ||
                undefined
            const path = getExpressPath(request)
            const rendered = await render(path, entryData, template)
            const { redirectLocation, status, cookies, ssrContext } = rendered
            let { html } = rendered

            if (isRedirect(redirectLocation)) {
                response.statusCode = redirectLocation.status
                response.setHeader('Location', redirectLocation.url)

                return response.end()
            }

            if (ssrContext.teleports) {
                Object.entries(ssrContext.teleports).forEach((v) => {
                    if (v[0].indexOf('#teleport-') !== 0) {
                        return
                    }

                    const id = v[0].substring(1)

                    const regExString = `<div id="${id}"([a-zA-Z\\s]+)*([^>]+)*(?:>(.*?)</div>)`
                    const regExp = new RegExp(regExString, 'g')

                    html = html.replaceAll(
                        regExp,
                        `<div id="${id}"$1$2>$3${v[1]}</div>`,
                    )
                })
            }

            if (cookies) {
                response.setHeader('Set-Cookie', cookies)
            }

            response.writeHead(status || 200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache',
            })

            response.end(html)
        } catch (error) {
            // Send back template HTML to inject ViteErrorOverlay
            response.setHeader('Content-Type', 'text/html')
            response.end(template)
            logServerError(error as Error, server)
        }
    }
}

export const createPreviewHandler = (
    server: PreviewServer,
    options: PluginConfig,
): NextHandleFunction => {
    const outDir =
        server.config.build?.outDir ??
        path.resolve(server.config.root, 'dist/client')
    const indexHtmlPath = path.resolve(outDir, 'index.html')
    let indexHtmlContents = fs.readFileSync(indexHtmlPath, 'utf-8')

    if (options.preview?.replacer) {
        indexHtmlContents = options.preview.replacer(indexHtmlContents)
    }

    return async (request: IncomingMessage, response: ServerResponse, next) => {
        if (
            request.method !== 'GET' ||
            request.originalUrl === '/favicon.ico'
        ) {
            return next()
        }

        const fileOnDisk = path.resolve(
            outDir,
            request.originalUrl?.substring(1) || '',
        )

        if (
            '/index.html' !== request.originalUrl &&
            fs.existsSync(fileOnDisk)
        ) {
            const stat = fs.lstatSync(fileOnDisk)

            if (!stat.isDirectory()) {
                return next()
            }
        }

        response.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
        })

        return response.end(indexHtmlContents)
    }
}

export const createLivenessAndReadinessHandler = (
    options: PluginConfig,
): NextHandleFunction => {
    return async (request: IncomingMessage, response: ServerResponse, next) => {
        const readiness = options.probes?.readiness

        if (request.originalUrl === readiness?.path) {
            response.writeHead(readiness?.statusCode || 204)
            return response.end()
        }

        const liveness = options.probes?.liveness

        if (request.originalUrl === liveness?.path) {
            response.writeHead(liveness?.statusCode || 204)
            return response.end()
        }

        return next()
    }
}

// This code is copied directly from Vite source (it is not exported)

import chalk from 'chalk'
import type { RollupError } from 'rolldown'
import type { ErrorPayload /* ViteDevServer */ } from 'rolldown-vite'

function logServerError(
    error: Error | RollupError,
    server: ViteDevServer,
): void {
    server.ssrFixStacktrace(error as Error)

    const msg = buildErrorMessage(error, [
        chalk.red(`Internal server error: ${error.message}`),
    ])

    server.config.logger.error(msg, {
        clear: true,
        timestamp: true,
        error,
    })

    const sendError = () =>
        server.ws.send({ type: 'error', err: prepareError(error) })

    // Wait until browser injects ViteErrorOverlay custom element
    setTimeout(sendError, 100)
    setTimeout(sendError, 250)
}

const splitRE = /\r?\n/

function pad(source: string, n = 2): string {
    const lines = source.split(splitRE)
    return lines.map((l) => ' '.repeat(n) + l).join('\n')
}

function prepareError(err: Error | RollupError): ErrorPayload['err'] {
    return {
        message: stripAnsi(err.message),
        stack: stripAnsi(cleanStack(err.stack || '')),
        id: (err as RollupError).id,
        frame: stripAnsi((err as RollupError).frame || ''),
        plugin: (err as RollupError).plugin,
        pluginCode: (err as RollupError).pluginCode as string | undefined,
        loc: (err as RollupError).loc,
    }
}

function buildErrorMessage(
    err: RollupError,
    args: string[] = [],
    includeStack = true,
): string {
    if (err.plugin) {
        args.push(`  Plugin: ${chalk.magenta(err.plugin)}`)
    }
    if (err.id) {
        args.push(`  File: ${chalk.cyan(err.id)}`)
    }
    if (err.frame) {
        args.push(chalk.yellow(pad(err.frame)))
    }
    if (includeStack && err.stack) {
        args.push(pad(cleanStack(err.stack)))
    }
    return args.join('\n')
}

function cleanStack(stack: string) {
    return stack
        .split(/\n/g)
        .filter((l) => /^\s*at/.test(l))
        .join('\n')
}

// "ansi-regex": "^7.0.1",
function ansiRegex({ onlyFirst = false } = {}) {
    const pattern = [
        '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
        '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
    ].join('|')

    return new RegExp(pattern, onlyFirst ? undefined : 'g')
}

// "strip-ansi": "^7.0.1",
function stripAnsi(string: unknown) {
    if (typeof string !== 'string') {
        throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``)
    }

    return string.replace(ansiRegex(), '')
}
