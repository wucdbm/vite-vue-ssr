import { App, inject } from 'vue'

export type SetStatusState = {
    readonly status: number | undefined
    setStatus(status: number): void
}

export function createSetStatusState(): SetStatusState {
    let status: number | undefined = undefined

    const setStatus = (s: number) => {
        status = s
    }

    return {
        get status(): number | undefined {
            return status
        },
        setStatus,
    }
}

export const STATUS_SYMBOL_WANNABE = '__wite-wue-ssr-new-status' // Symbol()

export function provideSetStatus(app: App, statusState: SetStatusState): void {
    app.provide(STATUS_SYMBOL_WANNABE, statusState)
}

export function useSetStatus(): SetStatusState {
    return inject(STATUS_SYMBOL_WANNABE) as SetStatusState
}
