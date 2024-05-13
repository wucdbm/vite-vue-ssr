import { App, inject } from 'vue'
import { defer, Deferred } from '../utils/defer.ts'

export function isRedirect(
    redirect: RedirectLocation,
): redirect is Required<RedirectLocation> {
    return Boolean(
        redirect.status && redirect.status >= 300 && redirect.status < 400,
    )
}

export type ServerRedirect = {
    deferred: Deferred<string>
    redirectLocation: RedirectLocation
    isRedirect: () => boolean
    redirect: RedirectFunction
}

export type RedirectLocation = {
    url?: string
    status?: number
}

export type RedirectFunction = (
    location: string,
    status?: number,
) => Promise<void>

export function useServerRedirect(): ServerRedirect {
    const deferred = defer<string>()
    const redirectLocation: RedirectLocation = {} as RedirectLocation

    return {
        deferred,
        redirectLocation,
        isRedirect: () => isRedirect(redirectLocation),
        redirect: async (location: string, status = 302): Promise<void> => {
            const newLocation: RedirectLocation = {
                url: location,
                status: status,
            }
            Object.assign(redirectLocation, newLocation)
            if (isRedirect(redirectLocation)) {
                // Stop waiting for rendering when redirecting
                deferred.resolve('')
            }
        },
    }
}

export function useClientRedirect(
    spaRedirect: (location: string, status?: number) => Promise<void>,
): RedirectFunction {
    return async (location: string, status?: number): Promise<void> => {
        if (location.startsWith('/')) {
            await spaRedirect(location, status)
        } else {
            window.location.href = location
        }
    }
}

export const REDIRECT_SYMBOL_WANNABE = `${PLUGIN_NAME}.redirect` // Symbol()

export function provideRedirect(app: App, redirect: RedirectFunction): void {
    app.provide(REDIRECT_SYMBOL_WANNABE, redirect)
}

export function useRedirect(): RedirectFunction {
    return inject(REDIRECT_SYMBOL_WANNABE) as RedirectFunction
}
