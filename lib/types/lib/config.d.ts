/**
 * zentao 配置副本管理。插件安装/加载时把用户已有的 zentao.json
 * （默认 ~/.config/zentao/zentao.json，可由 ZENTAO_CONFIG_FILE 覆盖）
 * 复制到插件安装目录，后续 CLI 调用统一携带 ZENTAO_CONFIG_FILE 指向副本，
 * 使插件自包含、不依赖 ~/.config 全局状态。
 *
 * 凭证仍由 CLI 内部使用：本层只做文件复制，不读取、不解析内容。
 */
/** 从当前文件向上找 package.json 所在目录（兼容源码/构建两种形态）。 */
export declare function pluginRoot(): string;
/** 插件安装目录内的配置副本路径。 */
export declare function localConfigPath(root?: string): string;
/** 用户已有配置：ZENTAO_CONFIG_FILE 优先，否则 ~/.config/zentao/zentao.json。 */
export declare function userConfigPath(): string;
/**
 * 幂等复制：用户配置存在且（副本缺失或用户配置更新）时复制到插件目录。
 * @returns 副本路径（可用则返回，否则 null）。
 */
export declare function ensureLocalConfig(root?: string): string | null;
//# sourceMappingURL=config.d.ts.map