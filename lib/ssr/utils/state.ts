// https://github.com/yahoo/serialize-javascript
const UNSAFE_CHARS_REGEXP = /[<>'/\u2028\u2029]/g
const ESCAPED_CHARS = {
    // eslint-disable-next-line quotes
    "'": "\\'",
    '<': '\\u003C',
    '>': '\\u003E',
    '/': '\\u002F',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
}

function escapeUnsafeChars(unsafeChar: string) {
    return ESCAPED_CHARS[unsafeChar as keyof typeof ESCAPED_CHARS]
}

export function serializeState(state: any) {
    try {
        // Wrap the serialized JSON in quotes so that it's parsed by the browser as a string for better performance.
        return JSON.stringify(JSON.stringify(state || {})).replace(
            UNSAFE_CHARS_REGEXP,
            escapeUnsafeChars,
        )
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[SSR] On state serialization -', error, state)
        return '{}'
    }
}

export function deserializeState(state: string) {
    try {
        return JSON.parse(state || '{}')
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[SSR] On state deserialization -', error, state)
        return {}
    }
}
