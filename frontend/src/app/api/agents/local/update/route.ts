import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

interface ModelChange {
  agentId: string
  model: {
    primary: string
    fallbacks?: string[]
  }
}

interface UpdateBody {
  changes: ModelChange[]
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as UpdateBody
    const { changes } = body

    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    const raw = readFileSync(configPath, 'utf-8')

    // Strip single-line // comments and trailing commas for lenient JSON parse
    const cleaned = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/,(\s*[}\]])/g, '$1')

    const config = JSON.parse(cleaned) as {
      agents?: {
        list?: Array<{ id: string; model?: unknown }>
      }
      gateway?: {
        auth?: {
          token?: string
        }
      }
    }

    const agentList = config?.agents?.list ?? []
    let agentsUpdated = 0

    for (const change of changes) {
      const agent = agentList.find((a) => a.id === change.agentId)
      if (!agent) continue
      agent.model = change.model
      agentsUpdated++
    }

    // Write back (format nicely)
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // Restart gateway
    const token = config?.gateway?.auth?.token ?? ''
    let restarted = false
    try {
      execSync(
        `curl -s -X POST http://localhost:18789/api/restart -H "Authorization: Bearer ${token}"`,
        { timeout: 10000 }
      )
      restarted = true
    } catch {
      // Gateway might not be running or restart might fail — that's non-fatal
    }

    return NextResponse.json({ ok: true, restarted, agentsUpdated })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
