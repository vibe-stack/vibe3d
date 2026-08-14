/**
 * Locate precompiled scene artifacts in both the browser and Node.
 *
 * This exists because of a bug that is invisible in Node and fatal in the
 * browser. Vite registers `new URL('./literal.vtopo', import.meta.url)` as an
 * asset, but a template literal with a dynamic segment is not statically
 * analysable, so the file is never emitted or served. A per-instance loader built
 * that way 404s, and a loader that falls back to compiling from source on a miss
 * then quietly ray marches for minutes - the tab simply appears to hang, with no
 * error anywhere.
 *
 * `import.meta.glob` is the fix: it is resolved statically at build time, so every
 * artifact is registered and reachable by name. In Node the glob does not exist,
 * and the filesystem is readable directly, so the two paths are separate on
 * purpose rather than sharing a lowest common denominator.
 */

export interface ArtifactSource {
  /** Byte payload for `<name>.<extension>`, or undefined if it is not cached. */
  read(name: string, extension: 'vtopo' | 'vbake'): Promise<Uint8Array | undefined>
  /** How many artifacts this source can see. Zero means nothing was precompiled. */
  readonly count: number
}

/**
 * Build a source from a Vite glob map and a base URL for the Node path.
 *
 * Callers must pass the glob themselves: `import.meta.glob` is rewritten in the
 * module where it appears, so it cannot be called on a caller's behalf from here.
 */
export function artifactSource(
  globbed: Record<string, string> | undefined,
  directoryUrl: URL,
  /** Dev-server route used when an already-transformed glob is stale. */
  developmentUrl?: string,
): ArtifactSource {
  const byName = new Map<string, string>()
  for (const [path, url] of Object.entries(globbed ?? {})) {
    const file = path.split('/').pop()
    if (file) byName.set(file, url)
  }

  const inBrowser = typeof window !== 'undefined'

  /**
   * Reject an HTML body served in place of an artifact.
   *
   * A dev server answers unknown paths with `index.html` at status 200, so
   * `response.ok` is true and the miss only surfaces later as
   * `Unexpected token '<', "<!doctype "...` from the decoder. Both artifact formats
   * are JSON objects, so the first non-whitespace byte must be `{`.
   */
  function looksLikeArtifact(bytes: Uint8Array): boolean {
    for (let index = 0; index < bytes.length && index < 64; index += 1) {
      const byte = bytes[index]!
      if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) continue
      return byte === 0x7b
    }
    return false
  }

  async function fetchBytes(url: string | URL): Promise<Uint8Array | undefined> {
    try {
      const response = await fetch(url)
      if (!response.ok) return undefined
      const bytes = new Uint8Array(await response.arrayBuffer())
      return looksLikeArtifact(bytes) ? bytes : undefined
    } catch {
      return undefined
    }
  }

  return {
    count: byName.size,
    async read(name, extension) {
      const file = `${name}.${extension}`
      const mapped = byName.get(file)
      if (mapped) {
        const bytes = await fetchBytes(mapped)
        if (bytes) return bytes
      }
      // An already-running Vite server can retain a stale import.meta.glob map
      // when a compiler adds or atomically replaces an artifact. The recorder's
      // narrowly scoped development route reads the exact requested filename and
      // avoids both a server restart and an accidental in-browser source compile.
      if (inBrowser) {
        if (!developmentUrl) return undefined
        const base = developmentUrl.endsWith('/') ? developmentUrl : `${developmentUrl}/`
        return fetchBytes(new URL(`${base}${file}`, window.location.origin))
      }

      const url = new URL(file, directoryUrl)
      if (url.protocol !== 'file:') return fetchBytes(url)
      try {
        const [{ readFile }, { fileURLToPath }] = await Promise.all([
          import(/* @vite-ignore */ 'node:fs/promises'),
          import(/* @vite-ignore */ 'node:url'),
        ])
        return await readFile(fileURLToPath(url))
      } catch {
        return undefined
      }
    },
  }
}

/**
 * Whether a compiling fallback is safe to take here.
 *
 * It never is in a browser. A source compile is minutes of ray marching on the
 * main thread, and the honest outcome is a clear error naming the compiler script
 * rather than a hang the user has to guess at.
 */
export const canCompileInline = typeof window === 'undefined'
