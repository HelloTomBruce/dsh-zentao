import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { ZentaoToolView } from "./toolview.tsx";
import { ZentaoPanelBody, ZentaoPanelTitle } from "./panel.tsx";
import { ZentaoGuideIcon } from "./icons.tsx";

/** 右侧栏 Tab 定义 id/kind（正文与标题插槽以 TAB_ID 为 key 关联）。 */
export const TAB_ID = "dsh-zentao";
export const TAB_KIND = "zentao-overview";

/** ui-sidebar-right 的 Tab 注册服务（包由 dsh 客户端运行时注入，本地依赖中
 *  无类型声明，此处用最小结构类型；与 dsh-workspace-tasks 插件用法一致）。 */
interface SidebarRightTabsService {
  register: (definition: unknown) => () => void;
}

// workspaces/sessions/uiWorkspace：面板解析当前工作区用（同 dsh-workspace-tasks）。
export const inject = ["slots", "sidebarRight", "sidebarRightTabs", "workspaces", "sessions", "uiWorkspace"];

export function apply(ctx: ClientContext): void {
  // 面板经 window 引用读 workspaces/sessions/uiWorkspace 快照解析当前工作区
  //（服务不在本地类型声明中，结构同 workspace.ts 的 ZentaoClientCtx）。
  // SAFETY: 仅存引用不解构；读取全部经可选链，形状不符时安全降级为 undefined。
  if (typeof window !== "undefined") {
    (window as unknown as { __DSH_ZENTAO_CLIENT_CTX__?: unknown }).__DSH_ZENTAO_CLIENT_CTX__ = ctx;
  }
  // 1. 对话内工具卡：zentao 工具结果渲染为表格/键值列表。
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "zentao",
  }, ZentaoToolView));

  // 2. 右侧侧边栏引导页注册【禅道概览】入口卡片（order 40，位于工作区
  //    文件(10)/新建终端(20)/工作区任务(30)之后），点击以新开 Tab 打开。
  // SAFETY: ClientContext 上没有 sidebarRightTabs 的静态类型（ui-sidebar-right
  //    包不在本地依赖中，服务由 dsh 客户端运行时注入）；此处的结构类型与
  //    dsh-workspace-tasks 插件对同一服务的用法一致，register 定义为 unknown
  //    是刻意的——形状由运行时校验。
  const sidebarRightTabs = (ctx as unknown as { sidebarRightTabs?: SidebarRightTabsService }).sidebarRightTabs;
  if (sidebarRightTabs !== undefined) {
    ctx.effect(
      () =>
        sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          multiple: false,
          priority: "extension",
          title: () => "禅道概览",
          guide: [
            {
              id: "zentao-overview",
              order: 40,
              title: () => "禅道概览",
              description: () => "查看禅道进行中项目、我的任务与我的 Bug，可在面板内登录禅道",
              icon: ZentaoGuideIcon,
            },
          ],
        }),
      "dsh-zentao: right sidebar tab definition",
    );
  }

  // 3. 注入 Tab 正文与标题栏渲染插槽（key 与 Tab 定义 id 一致）。
  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
    name: "sidebar.right.pane.tab",
    key: TAB_ID,
  }, ZentaoPanelBody));
  ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({
    name: "sidebar.right.pane.tab.title",
    key: TAB_ID,
  }, ZentaoPanelTitle));
}
