import type { Context } from "@deepseek-ai/cordis";
export declare const ZENTAO_PARAMETERS: {
    readonly module: {
        readonly type: "string";
        readonly required: true;
        readonly enum: readonly import("./schema.ts").ZentaoModule[];
        readonly description: "禅道模块：program/product/project/execution/story/epic/requirement/bug/task/testcase/testtask/productplan/build/release/feedback/ticket/system/user/file/my（地盘，指派给我的）";
    };
    readonly action: {
        readonly type: "string";
        readonly required: true;
        readonly enum: readonly ["list", "get", "create", "update", "delete", "activate", "close", "resolve", "confirm", "start", "finish", "change", "todos", "tasks", "bugs", "stories", "epics", "requirements", "testtasks", "projects", "feedbacks", "tickets", "testcases", "meetings", "issues", "risks"];
        readonly description: "动作：list 列表 / get 详情 / create 创建 / update 更新 / delete 删除 / 状态流转（activate/close/resolve/confirm/start/finish/change，按模块校验）；模块为 my 时动作即资源名（tasks/bugs/stories… 指派给我的）";
    };
    readonly id: {
        readonly type: "number";
        readonly description: "对象 ID（get/update/delete/状态动作需要）。";
    };
    readonly product: {
        readonly type: "number";
        readonly description: "产品 ID（列表范围参数）。story/bug/testcase/epic/requirement/testtask/productplan/release/feedback/ticket/system 的列表用此参数。";
    };
    readonly project: {
        readonly type: "number";
        readonly description: "项目 ID（列表范围参数，execution/build 需要；bug 列表也可用它作范围）。";
    };
    readonly executionID: {
        readonly type: "number";
        readonly description: "执行 ID（task 列表的范围参数；bug 列表也可用它作范围）。";
    };
    readonly fields: {
        readonly type: "object";
        readonly description: "字段键值对（create/update/状态动作），camelCase API 字段名，如 { title, assignedTo, pri, severity }；数组字段直接给数组（如 bug 的 openedBuild: [\"trunk\"]）；create 时 scope 字段（product/executionID/project）也放这里，插件自动映射为对应 CLI flag。";
        readonly additionalProperties: true;
    };
    readonly maxItems: {
        readonly type: "number";
        readonly description: "最多返回条数（list/my 生效）；不给则 --all 拉全量。给定时结果带 truncated=true 表示截断（total 为全集条数）。";
    };
    readonly browseType: {
        readonly type: "string";
        readonly description: "列表状态过滤（list/my 生效），取值随模块：task 默认 unclosed，还有 doing/done/all 等；bug 有 unclosed/unresolved/all 等。";
    };
    readonly filter: {
        readonly type: "string";
        readonly description: "条件过滤表达式（list/my 生效，拉取范围内过滤），逗号分隔为 AND，如 status=active,pri=1。";
    };
    readonly search: {
        readonly type: "string";
        readonly description: "关键词搜索（list/my 生效，拉取范围内），逗号分隔关键词为 AND。";
    };
    readonly searchFields: {
        readonly type: "string";
        readonly description: "限定 search 的字段（list/my 生效，逗号分隔），缺省搜全部字段。";
    };
    readonly sort: {
        readonly type: "string";
        readonly description: "排序（list/my 生效），如 id:desc、pri:asc。";
    };
    readonly pick: {
        readonly type: "string";
        readonly description: "返回字段裁剪（list/my 生效，逗号分隔）——大列表先用它只拿需要的列（如 id,title,status,assignedTo），显著省 token。";
    };
    readonly htmlToMarkdown: {
        readonly type: "boolean";
        readonly description: "把富文本字段（desc/steps 等）转为 Markdown（list/my 生效），默认 false 原样返回 HTML。";
    };
};
export declare function applyTools(ctx: Context): () => void;
//# sourceMappingURL=tools.d.ts.map