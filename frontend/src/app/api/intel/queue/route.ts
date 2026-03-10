/**
 * Intel Queue API
 *
 * GET    /api/intel/queue           — return current queue state
 * POST   /api/intel/queue           — add new topic  { topic, priority? }
 * PUT    /api/intel/queue           — update item    { index, topic?, priority? }
 * DELETE /api/intel/queue?index=<N> — delete item at index N
 *
 * Reads/writes: ~/.openclaw/workspace/config/intel-queue.json
 */
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const QUEUE_FILE = path.resolve(os.homedir(), '.openclaw/workspace/config/intel-queue.json')

interface QueueItem {
  topic:     string
  priority:  number
  addedAt:   string
  addedBy:   string
}

interface CompletedItem extends QueueItem {
  completedAt: string
  reportPath:  string
}

interface QueueData {
  items:     QueueItem[]
  completed: CompletedItem[]
}

function ensureFile(): QueueData {
  const dir = path.dirname(QUEUE_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(QUEUE_FILE)) {
    const empty: QueueData = { items: [], completed: [] }
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(empty, null, 2), 'utf-8')
    return empty
  }
  try {
    const raw = fs.readFileSync(QUEUE_FILE, 'utf-8')
    return JSON.parse(raw) as QueueData
  } catch {
    const empty: QueueData = { items: [], completed: [] }
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(empty, null, 2), 'utf-8')
    return empty
  }
}

function saveQueue(data: QueueData) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

export async function GET() {
  try {
    const data = ensureFile()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[intel/queue GET]', e)
    return NextResponse.json({ error: 'Failed to read queue' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/reorder')) {
      const { order } = await request.json() as { order: number[] }
      const data = ensureFile()
      const reordered = order
        .filter(i => i >= 0 && i < data.items.length)
        .map(i => data.items[i])
      data.items = reordered
      saveQueue(data)
      return NextResponse.json(data)
    }

    const body = await request.json() as { topic?: string; priority?: number }
    if (!body.topic || typeof body.topic !== 'string' || !body.topic.trim()) {
      return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
    }

    const data = ensureFile()
    const maxPriority = data.items.length > 0
      ? Math.max(...data.items.map(i => i.priority))
      : 0
    const newItem: QueueItem = {
      topic:    body.topic.trim(),
      priority: typeof body.priority === 'number' ? body.priority : maxPriority + 1,
      addedAt:  new Date().toISOString().slice(0, 10),
      addedBy:  'Wei',
    }
    data.items.push(newItem)
    data.items.sort((a, b) => a.priority - b.priority)
    saveQueue(data)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[intel/queue POST]', e)
    return NextResponse.json({ error: 'Failed to update queue' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { index?: number; topic?: string; priority?: number }
    if (typeof body.index !== 'number') {
      return NextResponse.json({ error: 'Missing index' }, { status: 400 })
    }

    const data = ensureFile()
    if (body.index < 0 || body.index >= data.items.length) {
      return NextResponse.json({ error: 'Index out of range' }, { status: 400 })
    }

    const item = data.items[body.index]
    if (body.topic   !== undefined) item.topic    = body.topic.trim()
    if (body.priority !== undefined) item.priority = body.priority

    data.items.sort((a, b) => a.priority - b.priority)
    saveQueue(data)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[intel/queue PUT]', e)
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const indexStr = searchParams.get('index')

    if (indexStr === null) {
      return NextResponse.json({ error: 'Missing index parameter' }, { status: 400 })
    }
    const index = parseInt(indexStr, 10)
    if (isNaN(index)) {
      return NextResponse.json({ error: 'Invalid index' }, { status: 400 })
    }

    const data = ensureFile()
    if (index < 0 || index >= data.items.length) {
      return NextResponse.json({ error: 'Index out of range' }, { status: 400 })
    }

    data.items.splice(index, 1)
    saveQueue(data)
    return NextResponse.json(data)
  } catch (e) {
    console.error('[intel/queue DELETE]', e)
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }
}
