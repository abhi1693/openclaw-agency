import type { Language } from "./i18n";

export type TranslationKey = keyof (typeof translations)["en"];

export const translations = {
    en: {
        // Sidebar section headings
        navigation: "Navigation",
        overview: "Overview",
        boards_section: "Boards",
        skills_section: "Skills",
        administration: "Administration",
        // Sidebar links
        dashboard: "Dashboard",
        live_feed: "Live feed",
        board_groups: "Board groups",
        boards: "Boards",
        tags: "Tags",
        approvals: "Approvals",
        custom_fields: "Custom fields",
        marketplace: "Marketplace",
        packs: "Packs",
        organization: "Organization",
        gateways: "Gateways",
        agents: "Agents",
        // System status
        status_operational: "All systems operational",
        status_degraded: "System degraded",
        status_unknown: "System status unavailable",
        // Language button
        language_toggle: "中文",
    },
    zh: {
        // Sidebar section headings
        navigation: "导航",
        overview: "概览",
        boards_section: "看板",
        skills_section: "技能",
        administration: "管理",
        // Sidebar links
        dashboard: "仪表盘",
        live_feed: "实时动态",
        board_groups: "看板组",
        boards: "看板",
        tags: "标签",
        approvals: "审批",
        custom_fields: "自定义字段",
        marketplace: "技能市场",
        packs: "技能包",
        organization: "组织",
        gateways: "网关",
        agents: "Agent",
        // System status
        status_operational: "所有系统运行正常",
        status_degraded: "系统出现异常",
        status_unknown: "系统状态未知",
        // Language button
        language_toggle: "EN",
    },
} satisfies Record<Language, Record<string, string>>;

export function t(lang: Language, key: TranslationKey): string {
    return translations[lang][key];
}
