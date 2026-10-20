export interface ActiveWorkspace {
    /** 工作区绝对路径（解析失败为空串，面板显示"未识别到工作区"）。 */
    path: string;
    /** 工作区标题（缺省用路径末段）。 */
    title: string;
}
/** 解析当前活跃工作区（纯读取快照，无订阅；refresh 时重算即可）。 */
export declare function resolveActiveWorkspace(): ActiveWorkspace;
/** 面板用钩子：挂载与每次 refresh（手动刷新）时重算活跃工作区。 */
export declare function useActiveWorkspace(): ActiveWorkspace & {
    refresh: () => void;
};
//# sourceMappingURL=workspace.d.ts.map