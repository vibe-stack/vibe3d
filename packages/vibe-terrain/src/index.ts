#!/usr/bin/env node
import { cp, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import pc from 'picocolors'

const moduleDirectory = dirname(fileURLToPath(import.meta.url))
const bundledSkill = join(moduleDirectory, 'skill')

async function packageVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(join(moduleDirectory, '..', 'package.json'), 'utf8')) as { version: string }
  return manifest.version
}

async function validateBundle(): Promise<void> {
  const skill = await readFile(join(bundledSkill, 'SKILL.md'), 'utf8')
  if (!skill.startsWith('---\nname: vibe-terrain\n')) {
    throw new Error('The bundled vibe-terrain skill is incomplete')
  }
}

async function install(options: { cwd: string; global?: boolean; force?: boolean }): Promise<void> {
  await validateBundle()
  const base = options.global
    ? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills')
    : join(resolve(options.cwd), '.agents', 'skills')
  const destination = join(base, 'vibe-terrain')
  await mkdir(base, { recursive: true })
  await cp(bundledSkill, destination, {
    recursive: true,
    force: options.force ?? false,
    errorOnExist: !(options.force ?? false),
  })
  console.log(`${pc.green('Installed')} vibe-terrain to ${destination}`)
}

const program = new Command()
  .name('vibe-terrain')
  .description('Install the Vibe Terrain skill for procedural WebGPU terrain work.')
  .version(await packageVersion())

program.command('install', { isDefault: true })
  .description('Install the skill in the current project or Codex home.')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--global', 'install in the Codex skills directory')
  .option('--force', 'replace an existing installation')
  .action(install)

program.command('doctor')
  .description('Verify that the packaged skill is complete.')
  .action(async () => {
    await validateBundle()
    console.log(pc.green('The packaged vibe-terrain skill is ready.'))
  })

program.parseAsync().catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})
