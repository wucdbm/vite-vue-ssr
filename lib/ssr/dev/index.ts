import path from 'node:path'
import fs from 'node:fs'
import { ServerResponse } from 'node:http'
import { IncomingMessage, NextHandleFunction } from 'connect'
import { ViteDevServer } from 'vite'
import { AppEntryPoint } from '../types'
import { isRedirect } from '../plugins/redirect'
import { PluginConfig } from '../../config'

export const createSSRDevHandler = async (
    server: ViteDevServer,
    options: PluginConfig = {},
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
            const rendered = await render(request, entryData, template)
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

                    html = html.replace(
                        `<div id="${id}"></div>`,
                        `<div id="${id}">${v[1]}</div>`,
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

// This code is copied directly from Vite source (it is not exported)

import chalk from 'chalk'
import type { RollupError } from 'rollup'
import type { ErrorPayload /* ViteDevServer */ } from 'vite'

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
