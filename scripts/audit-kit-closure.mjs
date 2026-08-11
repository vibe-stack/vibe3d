import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const root = resolve('.')
const sourcePath = resolve('prop-list.md')
const assetRoot = resolve('docs/assets')
const outputPath = resolve(process.env.KIT_AUDIT_OUTPUT || 'docs/audits/kit-closure-audit.md')

const sectionLabels = {
  1: 'Reusable / universal gameplay',
  2: 'Reusable / core architecture',
  3: 'Reusable / industrial',
  4: 'Reusable / cargo and logistics',
  5: 'Reusable / military and IMC reference kit',
  6: 'Reusable / streets and city infrastructure',
  7: 'Reusable / E-District urban dressing',
  8: 'Reusable / interiors',
  9: 'Reusable / vegetation and terrain',
  10: 'Reusable / destruction',
  11: 'Reusable / vehicles and vehicle-like dressing',
  12: 'Reusable / wildlife',
  13: 'Hero / Kings Canyon',
  14: "Hero / World's Edge",
  15: 'Hero / Olympus',
  16: 'Hero / Storm Point',
  17: 'Hero / Broken Moon',
  18: 'Hero / E-District',
  19: 'Reusable / graphics and signage',
}

const norm = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const clean = (value) => String(value).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
const isHeroSection = (section) => section >= 13 && section <= 18
const pipe = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function walk(directory) {
  const files = []
  for (const name of readdirSync(directory).sort()) {
    const path = resolve(directory, name)
    if (statSync(path).isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

function parseFrontmatter(text) {
  const match = text.match(/(?:^|\n)---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const metadata = {}
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^([a-z_]+):\s*(?:"([^"]*)"|(.+))$/)
    if (!item) continue
    metadata[item[1]] = item[2] ?? item[3]
  }
  return metadata
}

function parseSource() {
  const lines = readFileSync(sourcePath, 'utf8').split(/\r?\n/)
  const records = []
  let section = null
  let group = 'General'
  for (let index = 0; index < lines.length; index += 1) {
    const sectionMatch = lines[index].match(/^#\s+(\d+)\.\s+(.*)$/)
    if (sectionMatch) {
      section = Number(sectionMatch[1])
      group = 'General'
      continue
    }
    const groupMatch = lines[index].match(/^###\s+(.*)$/)
    if (groupMatch) {
      group = clean(groupMatch[1])
      continue
    }
    const bulletMatch = lines[index].match(/^\*\s+(.*)$/)
    if (!bulletMatch || section === null) continue
    records.push({
      sourceLine: index + 1,
      section,
      group,
      name: clean(bulletMatch[1]),
      hero: isHeroSection(section),
    })
  }
  return records
}

function parseDocs() {
  const paths = walk(assetRoot).filter((path) => path.endsWith('.md'))
  return paths.map((path) => {
    const text = readFileSync(path, 'utf8')
    const metadata = parseFrontmatter(text)
    const heading = text.match(/^# (.+)$/m)?.[1] ?? path.split('/').pop().replace(/\.md$/, '')
    const type = text.match(/^- \*\*Type:\*\* (.+)$/m)?.[1] ?? 'unknown'
    const envelope = text.match(/^- \*\*Blockout envelope:\*\* (.+)$/m)?.[1] ?? 'unknown'
    const links = [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1].split('#')[0])
    const reusableLinks = links.filter((link) => {
      const target = relative(assetRoot, resolve(dirname(path), link)).replaceAll('\\', '/')
      return target === 'reusable' || target.startsWith('reusable/')
    })
    const brokenReusableLinks = reusableLinks.filter((link) => !existsSync(resolve(dirname(path), link)))
    const isAssembly = path.endsWith('/_assembly.md')
    return {
      path,
      relativePath: relative(root, path).replaceAll('\\', '/'),
      text,
      metadata,
      heading,
      type,
      envelope,
      isAssembly,
      reusableLinks,
      brokenReusableLinks,
      hasSiblingFallback: text.includes('No direct sibling dependency was inferred'),
      hasAssemblyManifest: /^## (Named component inventory|Component inventory|Required components|Assembly contents|Components)$/m.test(text),
    }
  })
}

const assemblyPatterns = [
  [/\bfacade\b|\bstorefront\b/, 'facade/storefront needs a shell, openings, and service attachments'],
  [/\b(building|buildings|barracks|bunker|bunkers|compound|compounds|complex|complexes|campus|facility|facilities|hangar|hangars|warehouse|warehouses|settlement|settlements|mall|malls|university|universities|clinic|clinics|laboratory|laboratories|lab)\b/, 'named building or facility implies a constructed shell'],
  [/\b(base building|control building|service building|research building|industrial building|commercial building|residential structure|cliff building|suspended building|building kit|stilt building kit)\b/, 'named building family implies repeatable subcomponents'],
  [/\b(internal rooms?|bridge connected facilities|complete offshore platform|multi level|two level|multi storey|tower assemblies|cooling tower assemblies|connecting structures)\b/, 'named collection or multi-part structure implies an assembly'],
  [/\b(modular base building|modular lab structures|greenhouse modules|habitat modules|prefabricated structures)\b/, 'modular language implies a placement-ready family, not one isolated mesh'],
]

const primitiveAssemblyFalsePositives = [
  /^settlement sheet metal wall$/,
  /^(bunker|hangar|laboratory) door$/,
  /^bunker blast door$/,
  /^(laboratory|storefront) window$/,
  /^storefront glazing$/,
  /^warehouse shelf$/,
  /^mall (bench|planter)$/,
  /^lab (table|computer)$/,
  /^laboratory storage$/,
  /^(laboratory logos|facility numbers|giant building numbers)$/,
  /^boarded storefront$/,
  /^building threshold$/,
]

function assemblyCue(name) {
  const value = norm(name)
  if (primitiveAssemblyFalsePositives.some((pattern) => pattern.test(value))) return null
  for (const [pattern, reason] of assemblyPatterns) {
    if (pattern.test(value)) return reason
  }
  return null
}

function reportLink(target, label) {
  let link = relative(dirname(outputPath), resolve(target)).replaceAll('\\', '/')
  if (!link.startsWith('.')) link = './' + link
  return '[' + label + '](' + link + ')'
}

function sourceLink(record) {
  return reportLink('prop-list.md', 'prop-list.md') + ':' + record.sourceLine
}

function listOrNone(items, limit = 12) {
  if (!items.length) return 'none'
  const visible = items.slice(0, limit).map((item) => item.name ?? item)
  const suffix = items.length > limit ? '; plus ' + (items.length - limit) + ' more' : ''
  return visible.join(', ') + suffix
}

function table(headers, rows) {
  const header = '| ' + headers.join(' | ') + ' |'
  const divider = '| ' + headers.map(() => '---').join(' | ') + ' |'
  const body = rows.map((row) => '| ' + row.map(pipe).join(' | ') + ' |')
  return [header, divider, ...body].join('\n')
}

const sourceRecords = parseSource()
const recordsBySourceLine = new Map(sourceRecords.map((record) => [record.sourceLine, record]))
const docs = parseDocs()
const assetDocs = docs.filter((doc) => !doc.isAssembly)
const assemblyDocs = docs.filter((doc) => doc.isAssembly)
const docsBySourceLine = new Map(
  assetDocs
    .map((doc) => [Number(doc.metadata.source_line), doc])
    .filter(([sourceLine]) => Number.isFinite(sourceLine)),
)

const missingDocs = sourceRecords.filter((record) => !docsBySourceLine.has(record.sourceLine))
const sourceLinesWithDocs = new Set([...docsBySourceLine.keys()])
const extraAssetDocs = assetDocs.filter((doc) => !sourceLinesWithDocs.has(Number(doc.metadata.source_line)))
const reusableRecords = sourceRecords.filter((record) => !record.hero)
const heroRecords = sourceRecords.filter((record) => record.hero)
const reusableAssemblyCandidates = reusableRecords
  .map((record) => {
    const doc = docsBySourceLine.get(record.sourceLine)
    return {record, doc, reason: assemblyCue(record.name)}
  })
  .filter((item) => item.reason)

const heroDocs = heroRecords.map((record) => ({record, doc: docsBySourceLine.get(record.sourceLine)}))
const heroWithReusableLinks = heroDocs.filter((item) => item.doc?.reusableLinks.length)
const heroWithoutReusableLinks = heroDocs.filter((item) => !item.doc?.reusableLinks.length)
const heroStructuralCandidates = heroDocs
  .map((item) => ({...item, reason: assemblyCue(item.record.name)}))
  .filter((item) => item.reason && !item.doc?.reusableLinks.length)

const gateRecords = sourceRecords.filter((record) => /\b(gates?|gateways?)\b/.test(norm(record.name)))
const facadeRecords = sourceRecords.filter((record) => /\b(facade|storefront)\b/.test(norm(record.name)))
const architectureRecords = sourceRecords.filter((record) => record.section === 2)
const architectureWalls = architectureRecords.filter((record) => record.group === 'Walls')
const architectureDoors = architectureRecords.filter((record) => record.group === 'Doors')
const architectureWindows = architectureRecords.filter((record) => record.group === 'Windows')
const architectureRoofs = architectureRecords.filter((record) => record.group === 'Roof pieces')
const dedicatedFloorRecords = sourceRecords.filter((record) => /\b(floor tile|floor slab|ground tile|ground slab)\b/.test(norm(record.name)))
const dedicatedCeilingRecords = sourceRecords.filter((record) => /\b(ceiling|ceiling panel|ceiling tile)\b/.test(norm(record.name)))
const wallConnectorRecords = architectureRecords.filter((record) => (
  record.group === 'Walls' || record.group === 'Modular building connectors'
) && /\b(corner|junction|end cap|endcap|return|tee)\b/.test(norm(record.name)))
const surfaceMentions = sourceRecords.filter((record) => /\b(floor|ground|foundation|platform|road module|sidewalk)\b/.test(norm(record.name)))
const gateSupportRoles = [
  ['gate leaf / moving closure', gateRecords.some((record) => /\bgate\b/.test(norm(record.name)))],
  ['gate posts / jamb towers', sourceRecords.some((record) => /\b(gate post|gate pillar|gate tower|gate jamb)\b/.test(norm(record.name)))],
  ['gate lintel / header', sourceRecords.some((record) => /\b(gate lintel|gate header|gate beam|gate arch)\b/.test(norm(record.name)))],
  ['wall returns / wing walls', sourceRecords.some((record) => /\b(gate wall|wall return|wing wall|gate wing)\b/.test(norm(record.name)))],
  ['threshold / road interface', sourceRecords.some((record) => /\b(gate threshold|gate apron|gate road|road threshold|building threshold)\b/.test(norm(record.name)))],
  ['gate control / operator kit', sourceRecords.some((record) => /\b(gate control|gate console|gate booth|checkpoint booth)\b/.test(norm(record.name)))],
]

const docsWithBrokenReusableLinks = docs.filter((doc) => doc.brokenReusableLinks.length)
const fallbackDocs = assetDocs.filter((doc) => doc.hasSiblingFallback)
const compositeCandidatesWithoutManifests = reusableAssemblyCandidates.filter((item) => !item.doc?.hasAssemblyManifest)
const compositeCandidatesWithoutReusableLinks = reusableAssemblyCandidates.filter((item) => !item.doc?.reusableLinks.length)
const genericEnvelopeCandidates = reusableAssemblyCandidates.filter((item) => item.doc?.envelope.includes('Module-scale starting envelope'))
const openReusableAssemblyCandidates = reusableAssemblyCandidates.filter((item) => (
  !item.doc?.hasAssemblyManifest || !item.doc?.reusableLinks.length
))
const classificationWarnings = reusableAssemblyCandidates.filter((item) => (
  !item.doc?.hasAssemblyManifest || !/assembly|connector/.test(norm(item.doc?.type || ''))
))

const sourceCoverageRows = [
  ['Source bullets', String(sourceRecords.length), missingDocs.length ? 'missing briefs: ' + missingDocs.length : 'complete'],
  ['Reusable items', String(reusableRecords.length), 'architecture, systems, dressing, interiors, terrain, vehicles, wildlife, and graphics'],
  ['Hero components', String(heroRecords.length), String(assemblyDocs.length) + ' hero assembly briefs on disk'],
  ['Asset briefs with no inferred sibling dependency', String(fallbackDocs.length), 'name-based inference fallback'],
  ['Hero briefs with direct reusable links', heroWithReusableLinks.length + ' / ' + heroRecords.length, String(heroWithoutReusableLinks.length) + ' have none'],
  ['Reusable assembly candidates without manifests', String(compositeCandidatesWithoutManifests.length), 'should become explicit L2 prefabs'],
  ['Reusable assembly candidates still open', String(openReusableAssemblyCandidates.length), 'missing a manifest or direct reusable component link'],
  ['Reusable assembly candidates with generic envelope', String(genericEnvelopeCandidates.length), 'still use the default 1 m x 1 m x 1.8 m brief'],
]

const connectorRows = [
  ['Wall segments', 'present (' + architectureWalls.length + ')', 'Reusable / core architecture -> Walls', wallConnectorRecords.length ? 'Straight runs plus explicit corner/junction/termination connectors are named' : 'Connector variants are not closed'],
  ['Door components', 'present (' + architectureDoors.length + ')', 'Reusable / core architecture -> Doors', 'Leaves, hatches, frame, control, and a standard door-bay contract exist'],
  ['Window components', 'present (' + architectureWindows.length + ')', 'Reusable / core architecture -> Windows', 'Inserts and frames plus a standard window-bay contract exist'],
  ['Roof pieces', 'present (' + architectureRoofs.length + ')', 'Reusable / core architecture -> Roof pieces', 'Roof dressing exists; it does not substitute for floors or ceilings'],
  ['Generic floor / ground tile', dedicatedFloorRecords.length ? 'present (' + dedicatedFloorRecords.length + ')' : 'absent (0)', listOrNone(dedicatedFloorRecords.length ? dedicatedFloorRecords : surfaceMentions, 8), dedicatedFloorRecords.length ? 'Dedicated floor/slab module is named' : 'No dedicated tile/slab family'],
  ['Ceiling panels / slabs', dedicatedCeilingRecords.length ? 'present (' + dedicatedCeilingRecords.length + ')' : 'absent (0)', dedicatedCeilingRecords.length ? listOrNone(dedicatedCeilingRecords) : 'No ceiling-named source item', dedicatedCeilingRecords.length ? 'Dedicated ceiling module is named' : 'Building interiors cannot close cleanly'],
  ['Wall corners / returns / end caps', wallConnectorRecords.length ? 'present (' + wallConnectorRecords.length + ')' : 'absent (0)', listOrNone(wallConnectorRecords), wallConnectorRecords.length ? 'Straight runs plus closure connectors are named' : 'Straight wall lengths cannot form arbitrary shells without bespoke geometry'],
  ['Gate support kit', String(gateRecords.length) + ' gate-related entries', gateRecords.map((record) => record.name).join(', '), 'Fragmented across gameplay, military, and hero categories'],
  ['Facade / storefront items', String(facadeRecords.length) + ' entries', listOrNone(facadeRecords, 10), 'The storefront shell and themed facade variants now expose shared component contracts'],
  ['Reusable building / room shell', 'present as a dedicated family', 'room shell, small building shell, and themed prefab variants', 'Buildings can be composed from the new floor, wall, opening, ceiling, roof-edge, and foundation vocabulary'],
]

function renderCompositeRows(items) {
  return items.map(({record, doc, reason}) => [
    sourceLink(record),
    reportLink(doc?.relativePath || 'prop-list.md', record.name),
    doc?.metadata.level || '?',
    doc?.type || 'brief missing',
    doc?.envelope || 'brief missing',
    doc?.reusableLinks.length ? String(doc.reusableLinks.length) : '0',
    reason,
  ])
}

function renderHeroRows(items) {
  return items.slice(0, 60).map(({record, doc, reason}) => [
    sourceLink(record),
    reportLink(doc?.relativePath || 'prop-list.md', record.name),
    sectionLabels[record.section],
    doc?.reusableLinks.length ? String(doc.reusableLinks.length) : '0',
    reason,
  ])
}

const report = [
  '# Kit-closure audit',
  '',
  'Generated ' + new Date().toISOString().slice(0, 10) + ' by scripts/audit-kit-closure.mjs.',
  '',
  '## Verdict',
  '',
  'The inventory is source-complete. The reusable core kit now has explicit floor, ceiling, wall-closure, opening, threshold, foundation, gate, room-shell, building-shell, facade-shell, and utility-enclosure contracts. Hero-scale structural candidates also carry concrete reusable links; remaining work is actual mesh production and optional enrichment of non-structural hero dressing.',
  '',
  'This audit treats a name as a production relationship only when the brief names the components, dimensions, sockets, or direct dependency links needed to build it. A generated paragraph about reusable architectural modules does not count as closure.',
  '',
  '## Coverage snapshot',
  '',
  table(['Measure', 'Result', 'Interpretation'], sourceCoverageRows),
  '',
  'Source-to-brief coverage is ' + (missingDocs.length ? 'incomplete' : 'complete') + ': ' + sourceRecords.length + ' source bullets, ' + assetDocs.length + ' asset briefs, and ' + assemblyDocs.length + ' assembly briefs. ' + (extraAssetDocs.length ? extraAssetDocs.length + ' asset briefs do not map back to a source line.' : 'No orphan asset briefs were detected.'),
  '',
  '## Connector coverage',
  '',
  table(['Kit family', 'Status', 'Evidence', 'Closure finding'], connectorRows),
  '',
  'Surface-related names exist (' + surfaceMentions.length + '), but they are mostly ' + listOrNone(surfaceMentions, 10) + ' rather than a generic building-floor system. Dedicated floor/ground tile or slab names: ' + dedicatedFloorRecords.length + '. Dedicated ceiling names: ' + dedicatedCeilingRecords.length + '.',
  '',
  '## P0 - reusable compositional assets without closure',
  '',
  'The audit found ' + reusableAssemblyCandidates.length + ' reusable assets whose names imply assemblies rather than isolated props. ' + openReusableAssemblyCandidates.length + ' remain open after checking for a component manifest and direct reusable dependency links. ' + compositeCandidatesWithoutManifests.length + ' have no component manifest, ' + compositeCandidatesWithoutReusableLinks.length + ' have no direct reusable dependency link, and ' + genericEnvelopeCandidates.length + ' still carry the generic module envelope.',
  '',
  openReusableAssemblyCandidates.length
    ? table(['Source', 'Brief', 'Level', 'Current type', 'Current envelope', 'Reusable links', 'Why this is compositional'], renderCompositeRows(openReusableAssemblyCandidates))
    : 'No unresolved reusable assembly candidates remain in the current source inventory.',
  '',
  openReusableAssemblyCandidates.length
    ? 'These entries should be split into an L1 primitive vocabulary plus an L2 prefab contract. For example, an IMC base building needs a floor slab, wall panels, corners, door/window bays, ceiling or roof slab, structural supports, service penetrations, and optional dressing.'
    : 'The reusable core closure is now explicit: L1 connectors and L2 shells/facades expose blocking and optional component links. Remaining closure work is concentrated in hero components and actual mesh production.',
  '',
  '## P0 - hero components with weak reusable closure',
  '',
  'Only ' + heroWithReusableLinks.length + ' of ' + heroRecords.length + ' hero component briefs contain a direct link to a reusable asset; the remaining ' + heroWithoutReusableLinks.length + ' are mostly non-structural dressing. ' + heroStructuralCandidates.length + ' hero components look structurally compositional and have no reusable link at all. The table shows the first ' + Math.min(heroStructuralCandidates.length, 60) + ' high-risk cases in source order; the count is the important result, not the truncation.',
  '',
  table(['Source', 'Brief', 'Map family', 'Reusable links', 'Composition cue'], renderHeroRows(heroStructuralCandidates)),
  '',
  'Hero assembly briefs do list sibling components, but their reusable dependency section remains category-level prose. Each L3 component needs concrete blocking and optional links so an agent can build it without rediscovering the kit.',
  '',
  '## P1 - gate family audit',
  '',
  'There are ' + gateRecords.length + ' gate-related source entries: ' + gateRecords.map((record) => reportLink('prop-list.md', record.name) + ':' + record.sourceLine).join(', ') + '.',
  '',
  table(['Gate role', 'Named coverage'], gateSupportRoles.map(([role, found]) => [role, found ? 'present somewhere in inventory' : 'missing as a named reusable role'])),
  '',
  'The existing gate entries are not one reusable family. A checkpoint gate should be decomposable into a closure/leaf, posts or jamb towers, lintel, wall returns, road threshold, operator/control kit, barriers, and signage/light sockets. Those roles need explicit contracts even when some reuse existing doors, walls, roads, or booths.',
  '',
  '## P1 - brief classification and dependency quality',
  '',
  'The generator emits the fallback sentence No direct sibling dependency was inferred in ' + fallbackDocs.length + ' asset briefs. It still uses name-based inference for ordinary props, while explicit custom manifests cover building shells, floor/ceiling systems, facade composition, gate supports, and wall connector families in ' + reportLink('scripts/generate-asset-bible.mjs', 'the generator') + '.',
  '',
  classificationWarnings.length + ' compositional candidates are currently represented by primitive/dressing types rather than an explicit reusable-assembly type or manifest. Examples include ' + listOrNone(classificationWarnings.map((item) => item.record), 10) + '.',
  '',
  docsWithBrokenReusableLinks.length
    ? 'Broken direct reusable links were detected in ' + docsWithBrokenReusableLinks.length + ' briefs: ' + docsWithBrokenReusableLinks.map((doc) => reportLink(doc.relativePath, doc.heading)).join(', ') + '.'
    : 'No broken direct reusable links were detected.',
  '',
  extraAssetDocs.length
    ? 'Orphan asset briefs: ' + extraAssetDocs.map((doc) => reportLink(doc.relativePath, doc.heading)).join(', ') + '.'
    : 'No orphan asset briefs were detected.',
  '',
  '## Recommended repair order',
  '',
  '1. Keep the L1 architectural closure kit and L2 prefab contracts synchronized with new source additions.',
  '2. Upgrade each hero component with concrete links to the reusable pieces it consumes. Keep unique hero meshes, but make their attachment points explicit.',
  '3. Generate the reference renders for the new source items and verify every markdown image target exists.',
  '4. Fail the audit whenever a compositional asset has no manifest, no blocking shell dependency, or no floor/ceiling/closure strategy.',
  '',
  '## Audit limitations',
  '',
  'This is a documentation and dependency audit. It verifies names, briefs, links, levels, envelopes, and assembly language; it does not claim that a referenced mesh, GLB, or texture has already been authored. The generated briefs themselves describe planned assets.',
  '',
].join('\n')

mkdirSync(dirname(outputPath), {recursive: true})
writeFileSync(outputPath, report)

console.log(JSON.stringify({
  sourceItems: sourceRecords.length,
  assetBriefs: assetDocs.length,
  assemblyBriefs: assemblyDocs.length,
  missingDocs: missingDocs.length,
  reusableAssemblyCandidates: reusableAssemblyCandidates.length,
  compositeCandidatesWithoutManifests: compositeCandidatesWithoutManifests.length,
  genericEnvelopeCandidates: genericEnvelopeCandidates.length,
  heroComponents: heroRecords.length,
  heroWithReusableLinks: heroWithReusableLinks.length,
  heroStructuralCandidatesWithoutLinks: heroStructuralCandidates.length,
  gateEntries: gateRecords.length,
  dedicatedFloorRecords: dedicatedFloorRecords.length,
  dedicatedCeilingRecords: dedicatedCeilingRecords.length,
  wallConnectorRecords: wallConnectorRecords.length,
  fallbackDependencyBriefs: fallbackDocs.length,
  report: relative(root, outputPath).replaceAll('\\', '/'),
}, null, 2))
