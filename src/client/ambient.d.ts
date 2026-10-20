/**
 * 本地补齐右侧栏 Tab 渲染席位的类型声明。席位真正的 owner 是
 * @deepseek-ai/dsh-client-ui-sidebar-right 包（由 dsh 客户端运行时经
 * package.json 的 dsh.client.inject 注入），该包不在本地依赖与 tsconfig
 * paths 中，故按 ui-slots 的声明合并机制本地补 seat 声明——与
 * dsh-workspace-tasks 插件的注册用法一致（keyed 席位，key = Tab 定义 id，
 * 组件不消费 owner props）。
 */
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    /** 右侧栏 Tab 正文（key = sidebarRightTabs 注册的 Tab id）。 */
    "sidebar.right.pane.tab": {
      kind: "keyed";
      scope: "root";
    };
    /** 右侧栏 Tab 标题栏（key = sidebarRightTabs 注册的 Tab id）。 */
    "sidebar.right.pane.tab.title": {
      kind: "keyed";
      scope: "root";
    };
  }
}
