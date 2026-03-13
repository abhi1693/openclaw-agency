/**
 * GET    /api/strategy/reports              — list all .md files from multiple sources
 * GET    /api/strategy/reports?file=<name>  — return content of a specific file
 * DELETE /api/strategy/reports?file=<name>  — delete a specific .md file
 *
 * Reads from (in priority order):
 *   1. ~/.openclaw/workspace/reports/strategy/  (primary — wins on dedup)
 *   2. ~/.openclaw/workspace/reports/research/  (research subdirectory)
 *   3. ~/.openclaw/workspace-intel/reports/
 *   4. ~/.openclaw/workspace-strategy/reports/
 */
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const STRATEGY_DIR = path.resolve(os.homedir(), '.openclaw/workspace/reports/strategy')
const RESEARCH_DIR = path.resolve(os.homedir(), '.openclaw/workspace/reports/research')
const EXTRA_DIRS = [
  path.resolve(os.homedir(), '.openclaw/workspace-intel/reports'),
  path.resolve(os.homedir(), '.openclaw/workspace-strategy/reports'),
]

function ensureDir() {
  if (!fs.existsSync(STRATEGY_DIR)) fs.mkdirSync(STRATEGY_DIR, { recursive: true })
  if (!fs.existsSync(RESEARCH_DIR)) fs.mkdirSync(RESEARCH_DIR, { recursive: true })
}

function parseFilename(filename: string, mtime?: Date) {
  const base = filename.replace('.md', '')
  const dateMatch = base.match(/(\d{4}-\d{2}-\d{2})$/)
  if (dateMatch) {
    const date = dateMatch[1]
    const prefix = base.slice(0, base.length - date.length - 1)
    return { prefix, date }
  }
  const fallbackDate = mtime
    ? mtime.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10)
  return { prefix: base, date: fallbackDate }
}

function extractTitle(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const match = content.match(/^#\s+(.+)$/m)
    return match ? match[1].trim() : null
  } catch { return null }
}

function listDir(dir: string): Array<{ filename: string; dir: string; stat: fs.Stats }> {
  if (!fs.existsSync(dir)) return []
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ filename: f, dir, stat: fs.statSync(path.join(dir, f)) }))
  } catch {
    return []
  }
}

export async function GET(request: Request) {
  try {
    ensureDir()

    const { searchParams } = new URL(request.url)
    const file = searchParams.get('file')

    if (file) {
      const safeName = path.basename(file)
      if (!safeName.endsWith('.md')) {
        return NextResponse.json({ error: 'Only .md files allowed' }, { status: 400 })
      }
      for (const dir of [STRATEGY_DIR, RESEARCH_DIR, ...EXTRA_DIRS]) {
        const filePath = path.join(dir, safeName)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8')
          return NextResponse.json({ file: safeName, content })
        }
      }
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const seen = new Map<string, { filename: string; dir: string; stat: fs.Stats }>()
    for (const dir of [...EXTRA_DIRS].reverse()) {
      for (const item of listDir(dir)) seen.set(item.filename, item)
    }
    for (const item of listDir(RESEARCH_DIR)) seen.set(item.filename, item)
    for (const item of listDir(STRATEGY_DIR)) seen.set(item.filename, item)

    const files = Array.from(seen.values())
      .map(({ filename, dir, stat }) => {
        const { prefix, date } = parseFilename(filename, stat.mtime)
        return {
          filename,
          prefix,
          date,
          sizeKb: Math.ceil(stat.size / 1024),
          modifiedAt: stat.mtime.toISOString(),
          title: extractTitle(path.join(dir, filename)) ?? null,
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.modifiedAt.localeCompare(a.modifiedAt))

    return NextResponse.json({ reportsDir: STRATEGY_DIR, count: files.length, files })
  } catch (e) {
    console.error('[strategy/reports]', e)
    return NextResponse.json({ error: 'Failed to read reports directory' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const file = searchParams.get('file')

    if (!file) {
      return NextResponse.json({ error: 'Missing file parameter' }, { status: 400 })
    }

    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }
    const safeName = path.basename(file)
    if (!safeName.endsWith('.md')) {
      return NextResponse.json({ error: 'Only .md files allowed' }, { status: 400 })
    }

    for (const dir of [STRATEGY_DIR, RESEARCH_DIR, ...EXTRA_DIRS]) {
      const filePath = path.join(dir, safeName)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        return NextResponse.json({ deleted: safeName })
      }
    }
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  } catch (e) {
    console.error('[strategy/reports DELETE]', e)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
