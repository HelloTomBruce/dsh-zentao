/**
 * 当前工作区解析（精简自 dsh-workspace-tasks 插件的实现）：
 * 概览面板按"当前工作区"读取 .dsh-zentao.json 绑定配置，需要把工作区
 * 绝对路径传给 /overview 端点。解析链（由准到宽）：
 *   uiWorkspace.mainReference 当前会话 → 工作区 items[].sessionIds 命中
 *   → 会话 cwd 最长前缀匹配 → 最近活跃（updatedAt）→ 第一个工作区。
 * client ctx 由 index.ts 挂到 window.__DSH_ZENTAO_CLIENT_CTX__。
 */
import { useCallback, useState } from "react";
function ctx() {
    if (typeof window === "undefined")
        return undefined;
    // SAFETY: window 上的 ctx 引用由本插件 client/index.ts 唯一写入，
    // 结构类型与上方 ZentaoClientCtx 一致；读取均经可选链，形状不符时安全降级为 undefined。
    return window.__DSH_ZENTAO_CLIENT_CTX__;
}
/** 归一化尾部斜杠后的最长前缀匹配（带分隔符边界，防子目录误配父目录）。 */
function matchByPath(items, cwd) {
    const target = cwd.replace(/[/\\]+$/, "");
    const prefixMatches = items.filter((w) => {
        const p = w.path.replace(/[/\\]+$/, "");
        return p === target || target.startsWith(p + "/") || target.startsWith(p + "\\");
    });
    prefixMatches.sort((a, b) => b.path.length - a.path.length);
    return prefixMatches[0];
}
/** 解析当前活跃工作区（纯读取快照，无订阅；refresh 时重算即可）。 */
export function resolveActiveWorkspace() {
    try {
        const c = ctx();
        const items = c?.workspaces?.list?.getSnapshot?.()?.items ?? [];
        const sessionsById = c?.sessions?.list?.getSnapshot?.()?.byId ?? {};
        // 1. 主视图当前会话（最准）：在工作区 items[].sessionIds 中命中
        const sid = c?.uiWorkspace?.mainReference?.sessionId ?? c?.uiWorkspace?.selection?.getSnapshot?.()?.sessionId;
        if (sid !== undefined && items.length > 0) {
            const found = items.find((w) => w.sessionIds?.includes(sid));
            if (found)
                return { path: found.path, title: found.title || found.path };
        }
        // 2. 会话 cwd 与工作区路径做最长前缀匹配
        if (sid !== undefined) {
            const sessionCwd = sessionsById[sid]?.cwd;
            if (sessionCwd) {
                const matched = items.length > 0 ? matchByPath(items, sessionCwd) : undefined;
                if (matched)
                    return { path: matched.path, title: matched.title || matched.path };
                const title = sessionCwd.split("/").filter(Boolean).pop() || sessionCwd;
                return { path: sessionCwd, title };
            }
        }
        // 3. 最近活跃工作区（session.updatedAt 优先，回退工作区自身时间戳）
        if (items.length > 0) {
            const latestOf = (w) => {
                let latest = Number.NEGATIVE_INFINITY;
                for (const s of w.sessionIds ?? []) {
                    const t = sessionsById[s]?.updatedAt;
                    if (t !== undefined)
                        latest = Math.max(latest, typeof t === "number" ? t : Number(t) || Date.parse(t));
                }
                if (latest === Number.NEGATIVE_INFINITY && w.updatedAt !== undefined)
                    latest = Date.parse(w.updatedAt);
                if (latest === Number.NEGATIVE_INFINITY && w.createdAt !== undefined)
                    latest = Date.parse(w.createdAt);
                return latest;
            };
            let selected;
            let selectedTime = Number.NEGATIVE_INFINITY;
            for (const w of items) {
                const t = latestOf(w);
                if (selected === undefined || t > selectedTime) {
                    selected = w;
                    selectedTime = t;
                }
            }
            if (selected)
                return { path: selected.path, title: selected.title || selected.path };
        }
    }
    catch {
        // 解析失败走空态，面板显示"未识别到工作区"
    }
    return { path: "", title: "" };
}
/** 面板用钩子：挂载与每次 refresh（手动刷新）时重算活跃工作区。 */
export function useActiveWorkspace() {
    const [workspace, setWorkspace] = useState(() => resolveActiveWorkspace());
    const refresh = useCallback(() => setWorkspace(resolveActiveWorkspace()), []);
    return { ...workspace, refresh };
}
//# sourceMappingURL=workspace.js.map