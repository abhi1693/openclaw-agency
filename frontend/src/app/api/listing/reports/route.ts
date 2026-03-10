/**
 * GET    /api/listing/reports              — list all .md files
 * GET    /api/listing/reports?file=<name>  — return content of a specific file
 * DELETE /api/listing/reports?file=<name>  — delete a specific .md file
 *
 * Reads from: ~/.openclaw/workspace/reports/listing/
 */
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const REPORTS_DIR = path.resolve(os.homedir(), '.openclaw/workspace/reports/listing')

function ensureDir() {
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true })
}

function isAsin(s: string): boolean {
  return /^[A-Z0-9]{10}$/.test(s)
}

function parseFilename(filename: string): { asin: string; type: string; date: string } {
  const base = filename.replace(/\.md$/, '')
  const parts = base.split('-')

  if (parts.length >= 4 && isAsin(parts[0])) {
    const asin     = parts[0]
    const type     = parts.slice(1, -3).join('-')
    const datePart = parts.slice(-3).join('-')
    return { asin, type, date: datePart }
  }

  const dateMatch = base.match(/(\d{4}-\d{2}-\d{2})$/)
  if (dateMatch) {
    const date   = dateMatch[1]
    const prefix = base.slice(0, base.length - date.length - 1)
    return { asin: '', type: prefix, date }
  }

  return { asin: '', type: base, date: '' }
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
      const filePath = path.join(REPORTS_DIR, safeName)
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
      const content = fs.readFileSync(filePath, 'utf-8')
      return NextResponse.json({ file: safeName, content })
    }

    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.md') && !f.toLowerCase().includes('template'))
      .map(f => {
        const stat = fs.statSync(path.join(REPORTS_DIR, f))
        const { asin, type, date } = parseFilename(f)
        return {
          filename: f,
          asin,
          type,
          date,
          sizeKb: Math.ceil(stat.size / 1024),
          modifiedAt: stat.mtime.toISOString(),
        }
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

    return NextResponse.json({ reportsDir: REPORTS_DIR, count: files.length, files })
  } catch (e) {
    console.error('[listing/reports]', e)
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

    const filePath = path.join(REPORTS_DIR, safeName)
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    fs.unlinkSync(filePath)
    return NextResponse.json({ deleted: safeName })
  } catch (e) {
    console.error('[listing/reports DELETE]', e)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
