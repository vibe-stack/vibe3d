import type { Registry, RegistryItem } from '@vibe3djs/schema'

export interface ParsedRegistryAddress {
  namespace: string
  item?: string
}

export interface ResolvedRegistryItem {
  address: string
  item: RegistryItem
}

export function parseRegistryAddress(address: string): ParsedRegistryAddress {
  const match = /^(@[a-z0-9][a-z0-9-]*)(?:\/([a-z0-9][a-z0-9-]*))?$/.exec(address)
  if (!match?.[1]) {
    throw new Error(`Invalid Vibe3D address: ${address}`)
  }
  return { namespace: match[1], item: match[2] }
}

export function resolveRegistryItems(
  registry: Registry,
  requestedItem?: string,
): ResolvedRegistryItem[] {
  const items = new Map(registry.items.map((item) => [item.name, item]))
  const rootName = requestedItem ?? registry.defaultItem
  const root = items.get(rootName)
  if (!root) throw new Error(`Registry ${registry.namespace} has no item named ${rootName}`)

  const resolved: ResolvedRegistryItem[] = []
  const visited = new Set<string>()
  const active = new Set<string>()

  const visit = (item: RegistryItem): void => {
    const address = `${registry.namespace}/${item.name}`
    if (visited.has(address)) return
    if (active.has(address)) throw new Error(`Registry dependency cycle at ${address}`)
    active.add(address)
    for (const dependency of item.registryDependencies) {
      const parsed = parseRegistryAddress(dependency)
      if (parsed.namespace !== registry.namespace) continue
      if (!parsed.item) throw new Error(`Dependency must name an item: ${dependency}`)
      const dependencyItem = items.get(parsed.item)
      if (!dependencyItem) throw new Error(`${address} depends on missing item ${dependency}`)
      visit(dependencyItem)
    }
    active.delete(address)
    visited.add(address)
    resolved.push({ address, item })
  }

  visit(root)
  return resolved
}
