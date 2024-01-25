import { build, ResolvedConfig, mergeConfig } from 'vite'
import replace from '@rollup/plugin-replace'
import fs from 'fs'
import path from 'path'
import { JSDOM } from 'jsdom'
import type {
    RollupOutput,
    RollupWatcher,
    OutputAsset,
    OutputOptions,
    RollupWatcherEvent,
} from 'rollup'
import {
    getPluginOptions,
    resolveViteConfig,
    resolveEntryServerAbsolute,
    ServerBuildConfig,
    ClientBuildConfig,
    PluginConfig,
} from '../config.js'

export interface CliConfig {
    mode?: string
    build: {
        watch?: true
    }
}

export async function buildClientAndServer(config: CliConfig): Promise<void> {
    return new Promise((resolve, reject) => {
        doBuildClientAndServer(config, resolve).catch(reject)
    })
}

async function doBuildClientAndServer(
    cliConfig: CliConfig,
    onFirstBuild: () => void,
): Promise<void> {
    const viteConfig = await resolveViteConfig()

    const distDir =
        viteConfig.build?.outDir ?? path.resolve(process.cwd(), 'dist')

    const pluginOptions = getPluginOptions(viteConfig)

    const clientBuildOptions = await resolveClientOptions(
        distDir,
        viteConfig,
        pluginOptions,
        cliConfig,
    )

    // TODO Remove this line once https://github.com/vitejs/vite/pull/9741 is merged
    const NODE_ENV_OLD = process.env.NODE_ENV
    const clientResult = await build(clientBuildOptions)
    // TODO Remove this line once https://github.com/vitejs/vite/pull/9741 is merged
    process.env.NODE_ENV = NODE_ENV_OLD

    if (!isWatching(clientResult)) {
        // This is a normal one-off build
        const rollupOutputs = Array.isArray(clientResult)
            ? clientResult
            : [clientResult as RollupOutput]
        const clientOutputs = rollupOutputs.flatMap((result) => result.output)

        // Get the index.html from the resulting bundle.
        const indexHtmlTemplate = (
            clientOutputs.find(
                (file) =>
                    file.type === 'asset' && file.fileName === 'index.html',
            ) as OutputAsset
        )?.source as string

        const viteCoreDependencies: string[] = []
        const { document } = new JSDOM(indexHtmlTemplate).window

        const scripts = document.querySelectorAll('script')
        scripts.forEach((script) => {
            const src = script.getAttribute('src')
            if (src) {
                viteCoreDependencies.push(src)
            }
        })

        const links = document.querySelectorAll('link')
        links.forEach((link) => {
            const href = link.getAttribute('href')
            if (href) {
                viteCoreDependencies.push(href)
            }
        })

        const serverBuildOptions = await resolveServerOptions(
            distDir,
            viteConfig,
            pluginOptions,
            cliConfig,
            viteCoreDependencies,
        )
        await build(serverBuildOptions)

        if (pluginOptions.build?.removeIndexHtml) {
            fs.unlinkSync(
                path.join(
                    clientBuildOptions.build?.outDir as string,
                    'index.html',
                ),
            )
        }

        await generatePackageJson(
            viteConfig,
            clientBuildOptions,
            serverBuildOptions,
        )

        return onFirstBuild()
    }

    // This is a build watcher
    let resolved = false

    clientResult.on('event', async (event: RollupWatcherEvent) => {
        const code = event.code

        if ('BUNDLE_END' !== code) {
            return
        }

        const result = event.result

        // This piece runs everytime there is
        // an updated frontend bundle.
        result.close()

        // // Re-read the index.html in case it changed.
        // // This content is not included in the virtual bundle.
        // const indexHtmlTemplate = fs.readFileSync(
        //     (clientBuildOptions.build?.outDir as string) + '/index.html',
        //     'utf-8',
        // )

        const serverBuildOptions = await resolveServerOptions(
            distDir,
            viteConfig,
            pluginOptions,
            cliConfig,
            [],
        )

        // Build SSR bundle with the new index.html
        await build(serverBuildOptions)
        await generatePackageJson(
            viteConfig,
            clientBuildOptions,
            serverBuildOptions,
        )

        if (!resolved) {
            onFirstBuild()
            resolved = true
        }
    })
}

async function resolveClientOptions(
    distDir: string,
    viteConfig: ResolvedConfig,
    pluginConfig: PluginConfig,
    cliConfig: CliConfig,
): Promise<ClientBuildConfig> {
    const inputFilePath = pluginConfig.input || ''
    const defaultFilePath = path.resolve(viteConfig.root, 'index.html')
    const inputFileName = inputFilePath.split('/').pop() || 'index.html'

    const defaultConfig: ClientBuildConfig = {
        mode: viteConfig.mode,
        build: {
            outDir: path.resolve(distDir, 'client'),
            ssrManifest: true,
            emptyOutDir: false,

            // Custom input path
            rollupOptions:
                inputFilePath && inputFilePath !== defaultFilePath
                    ? {
                          input: inputFilePath,
                          plugins: [
                              inputFileName !== 'index.html'
                                  ? {
                                        name: 'wite-wue-ssr-name-resolver',
                                        generateBundle(_options, bundle) {
                                            // Rename custom name to index.html
                                            const htmlAsset =
                                                bundle[inputFileName]
                                            delete bundle[inputFileName]
                                            htmlAsset.fileName = 'index.html'
                                            bundle['index.html'] = htmlAsset
                                        },
                                    }
                                  : undefined,
                          ],
                      }
                    : {},
        },
    }

    return mergeConfig(
        defaultConfig,
        mergeConfig(pluginConfig.build?.clientOptions || {}, cliConfig),
    )
}

async function resolveServerOptions(
    distDir: string,
    viteConfig: ResolvedConfig,
    pluginConfig: PluginConfig,
    cliConfig: CliConfig,
    viteCoreDependencies: string[],
): Promise<ServerBuildConfig> {
    const defaultOptions: ServerBuildConfig = {
        mode: viteConfig.mode,
        publicDir: false, // No need to copy public files to SSR directory
        build: {
            outDir: path.resolve(distDir, 'server'),
            // The plugin is already changing the vite-ssr alias to point to the server-entry.
            // Therefore, here we can just use the same entry point as in the index.html
            ssr: await resolveEntryServerAbsolute(viteConfig, pluginConfig),
            // ssr: await getEntryPointAbsolute(viteConfig),
            emptyOutDir: false,
            rollupOptions: {
                plugins: [
                    // TODO W T F
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    replace({
                        preventAssignment: true,
                        values: {
                            // __HTML_TEMPLATE__: () => indexHtmlTemplate,
                            // __WITE_SSR_HTML__: () => buildHtmlDocument(indexHtmlTemplate),
                            '{"__WITE_CORE_DEPS__":[]}': () =>
                                JSON.stringify({
                                    __WITE_CORE_DEPS__: viteCoreDependencies,
                                }),
                        },
                    }),
                ],
            },
        },
    }

    return mergeConfig(
        defaultOptions,
        mergeConfig(pluginConfig.build?.serverOptions || {}, cliConfig),
    )
}

function isWatching(
    result: RollupOutput | RollupOutput[] | RollupWatcher,
): result is RollupWatcher {
    return Object.prototype.hasOwnProperty.call(result, '_maxListeners')
}

async function generatePackageJson(
    viteConfig: ResolvedConfig,
    clientConfig: ClientBuildConfig,
    serverConfig: ServerBuildConfig,
) {
    if (serverConfig.packageJson === false) {
        return
    }

    const outputFile = (
        serverConfig.build?.rollupOptions?.output as OutputOptions
    )?.file

    const ssrOutput = path.parse(
        outputFile ||
            ((viteConfig.build?.ssr || serverConfig.build?.ssr) as string),
    )

    const moduleFormat =
        (viteConfig.build?.rollupOptions?.output as OutputOptions)?.format ||
        (serverConfig.build?.rollupOptions?.output as OutputOptions)?.format

    const packageJson = {
        main: outputFile ? ssrOutput.base : ssrOutput.name + '.js',
        type: /^esm?$/i.test(moduleFormat || '') ? 'module' : 'commonjs',
        ssr: {
            // This can be used later to serve static assets
            assets: fs
                .readdirSync(clientConfig.build?.outDir as string)
                .filter((file) => !/(index\.html|manifest\.json)$/i.test(file)),
        },
        ...(serverConfig.packageJson || {}),
    }

    fs.writeFileSync(
        path.join(serverConfig.build?.outDir as string, 'package.json'),
        JSON.stringify(packageJson, null, 2),
        'utf-8',
    )
}
