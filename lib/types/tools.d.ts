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
        readonly description: "产品 ID（列表范围参数）。story/bug/testcase 用 --product，epic/requirement/release/feedback/ticket 等用 --productID，插件自动映射。";
    };
    readonly project: {
        readonly type: "number";
        readonly description: "项目 ID（列表范围参数，execution/build 需要）。";
    };
    readonly executionID: {
        readonly type: "number";
        readonly description: "执行 ID（task 列表的范围参数，注意是 executionID 不是 execution）。";
    };
    readonly fields: {
        readonly type: "object";
        readonly description: "字段键值对（create/update/状态动作），如 { title, assignedTo, pri, severity, status }。";
        readonly additionalProperties: true;
    };
};
export declare function applyTools(ctx: Context): () => void;
//# sourceMappingURL=tools.d.ts.map