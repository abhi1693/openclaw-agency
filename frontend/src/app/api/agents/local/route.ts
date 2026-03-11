import { NextResponse } from 'next/server'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const AGENT_META: Record<string, { name: string; emoji: string; role: string; description: string }> = {
  main:      { name: 'Jarvis',  emoji: '🎯', role: 'Orchestrator',     description: '主控 Agent — 分发任务、协调团队、处理所有直接对话' },
  eng:       { name: 'Atlas',   emoji: '🏗️', role: 'Engineering Lead', description: '工程负责人 — 拆解任务、推进 PR、协调 dev / qa' },
  dev:       { name: 'Forge',   emoji: '🔨', role: 'Engineering',      description: '工程 Agent — 负责所有 ZOVIRO 技术项目的开发与维护' },
  qa:        { name: 'Probe',   emoji: '🧪', role: 'Quality',          description: 'QA Agent — 回归测试、验收验证、缺陷复现' },
  ppc:       { name: 'Pulse',   emoji: '📊', role: 'PPC & Ads',        description: '广告 Agent — Amazon PPC 分析与优化，未来扩展至 Google/Meta' },
  discovery: { name: 'Scout',   emoji: '🔭', role: 'Market Research',  description: '调研 Agent — 市场选品、竞品分析、需求缺口识别' },
  intel:     { name: 'Sage',    emoji: '🧠', role: 'Intel Lead',       description: '情报负责人 — 汇总调研、形成洞察、分配发现任务' },
  content:   { name: 'Quill',   emoji: '✍️', role: 'Content',          description: '内容 Agent — 品牌文案、邮件、社媒内容创作' },
  listing:   { name: 'Rank',    emoji: '🏆', role: 'Amazon Listings',  description: 'Listing Agent — Amazon 标题/Bullet/A+ 优化与关键词策略' },
  ops:       { name: 'Vigil',   emoji: '🛡️', role: 'Operations',       description: '运维 Agent — 基础设施监控、主动告警、自动化维护' },
  mktg:      { name: 'Beacon',  emoji: '📣', role: 'Marketing Lead',   description: '营销负责人 — 协调 listing / ppc / content' },
  strategy:  { name: 'North',   emoji: '🎯', role: 'Strategy',         description: '策略 Agent — 研究方向、评估机会、做长期规划' },
}

type ModelConfig = string | { primary: string; fallbacks?: string[] }

interface AgentConfig {
  id: string
  workspace?: string
  model?: ModelConfig
  skills?: string[]
}

function resolveModel(m: ModelConfig | undefined): string {
  if (!m) return 'default'
  if (typeof m === 'string') return m
  return m.primary ?? 'default'
}

function formatModel(fullId: string): string {
  const labels: Record<string, string> = {
    'anthropic/claude-opus-4-6':           'Claude Opus 4.6',
    'anthropic/claude-opus-4-5':           'Claude Opus 4.5',
    'anthropic/claude-sonnet-4-6':         'Claude Sonnet 4.6',
    'anthropic/claude-sonnet-4-5':         'Claude Sonnet 4.5',
    'anthropic/claude-haiku-4-5':          'Claude Haiku 4.5',
    'google-gemini-cli/gemini-3-pro-preview':   'Gemini 3 Pro',
    'google-gemini-cli/gemini-3-flash-preview': 'Gemini 3 Flash',
    'openai-codex/gpt-5.2':               'GPT-5.2',
    'openai-codex/gpt-5.2-codex':         'GPT-5.2 Codex',
    'openai-codex/gpt-5.3-codex':         'GPT-5.3 Codex',
    'openai-codex/gpt-5.3-codex-spark':   'GPT-5.3 Spark',
  }
  return labels[fullId] ?? fullId.split('/').pop() ?? fullId
}

export async function GET() {
  try {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const agentList: AgentConfig[] = config?.agents?.list ?? []
    const defaultModel = config?.agents?.defaults?.model?.primary ?? ''
    const agentsDir = join(homedir(), '.openclaw', 'agents')

    const agents = agentList.map((agent) => {
      const meta = AGENT_META[agent.id] ?? { name: agent.id, emoji: '🤖', role: 'Agent', description: '' }
      const modelId = resolveModel(agent.model) || defaultModel

      let lastActive: number | null = null
      let totalSessions = 0
      let activeSessions = 0
      const sessionsFile = join(agentsDir, agent.id, 'sessions', 'sessions.json')
      if (existsSync(sessionsFile)) {
        try {
          const sessData = JSON.parse(readFileSync(sessionsFile, 'utf-8')) as Record<string, Record<string, unknown>>
          const entries = Object.values(sessData)
          totalSessions = entries.length
          activeSessions = entries.filter(s => s.model).length
          const timestamps = entries.map(s => (s.updatedAt as number) ?? 0).filter(Boolean)
          if (timestamps.length) lastActive = Math.max(...timestamps)
        } catch { /* skip */ }
      }

      const skillCount = (agent.skills ?? []).length
      const wsSkillsDir = join(agent.workspace ?? '', 'skills')
      let wsSkills = 0
      try { wsSkills = readdirSync(wsSkillsDir).length } catch { /* none */ }

      return {
        id: agent.id,
        ...meta,
        modelId,
        modelLabel: formatModel(modelId),
        modelRaw: agent.model,
        skills: skillCount + wsSkills,
        lastActive,
        totalSessions,
        activeSessions,
        online: lastActive ? (Date.now() - lastActive) < 24 * 60 * 60 * 1000 : false,
      }
    })

    const availableModels = Object.keys(config?.agents?.defaults?.models ?? {})
    return NextResponse.json({ agents, defaultModel, availableModels })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
