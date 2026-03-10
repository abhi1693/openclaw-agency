/**
 * GET    /api/intel/reports                         — list all daily + weekly .md files
 * GET    /api/intel/reports?file=<name>&type=<daily|weekly> — return content of a specific file
 * DELETE /api/intel/reports?file=<name>&type=<daily|weekly> — delete a specific .md file
 *
 * Daily reports:  ~/.openclaw/workspace/reports/intel/daily/  YYYY-MM-DD.md
 * Weekly reports: ~/.openclaw/workspace/reports/intel/weekly/ YYYY-WXX.md
 */
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const BASE_DIR    = path.resolve(os.homedir(), '.openclaw/workspace/reports/intel')
const DAILY_DIR   = path.join(BASE_DIR, 'daily')
const WEEKLY_DIR  = path.join(BASE_DIR, 'weekly')

function ensureDirs() {
  if (!fs.existsSync(DAILY_DIR))  fs.mkdirSync(DAILY_DIR,  { recursive: true })
  if (!fs.existsSync(WEEKLY_DIR)) fs.mkdirSync(WEEKLY_DIR, { recursive: true })
}

function resolveDir(type: string) {
  return type === 'weekly' ? WEEKLY_DIR : DAILY_DIR
}

function extractDate(filename: string, mtime: Date): string {
  const base = filename.replace('.md', '')
  const daily = base.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (daily) return daily[1]
  const weekly = base.match(/^(\d{4}-W\d{2})$/)
  if (weekly) return weekly[1]
  return mtime.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  try {
    ensureDirs()

    const { searchParams } = new URL(request.url)
    const file = searchParams.get('file')
    const type = searchParams.get('type') ?? 'daily'

    if (file) {
      const safeName = path.basename(file)
      if (!safeName.endsWith('.md')) {
        return NextResponse.json({ error: 'Only .md files allowed' }, { status: 400 })
      }
      const dir = resolveDir(type)
      const filePath = path.join(dir, safeName)
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      return NextResponse.json({ file: safeName, type, content })
    }

    function listDir(dir: string, reportType: 'daily' | 'weekly') {
      if (!fs.existsSync(dir)) return []
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const stat = fs.statSync(path.join(dir, f))
          const date = extractDate(f, stat.mtime)
          return {
            filename: f,
            type: reportType,
            date,
            sizeKb: Math.ceil(stat.size / 1024),
            modifiedAt: stat.mtime.toISOString(),
          }
        })
    }

    const daily  = listDir(DAILY_DIR,  'daily')
    const weekly = listDir(WEEKLY_DIR, 'weekly')
    const files  = [...daily, ...weekly].sort((a, b) => b.date.localeCompare(a.date) || b.modifiedAt.localeCompare(a.modifiedAt))

    return NextResponse.json({
      dailyDir: DAILY_DIR,
      weeklyDir: WEEKLY_DIR,
      count: files.length,
      files,
    })
  } catch (e) {
    console.error('[intel/reports GET]', e)
    return NextResponse.json({ error: 'Failed to read intel reports' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const file = searchParams.get('file')
    const type = searchParams.get('type') ?? 'daily'

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

    const dir      = resolveDir(type)
    const filePath = path.join(dir, safeName)
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    fs.unlinkSync(filePath)
    return NextResponse.json({ deleted: safeName, type })
  } catch (e) {
    console.error('[intel/reports DELETE]', e)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
