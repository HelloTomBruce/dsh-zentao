import { describe, it, expect } from "vitest";
import { buildCliArgs, MODULE_INFO, type ZentaoArgs } from "../src/schema.js";

describe("buildCliArgs（zentao-cli 0.5.0 命令面）", () => {
  it("list：module list + 范围参数 + --all", () => {
    const args: ZentaoArgs = { module: "bug", action: "list", product: 2 };
    expect(buildCliArgs(args)).toEqual(["bug", "list", "--product=2", "--all"]);
  });

  it("list 用 executionID（task 模块 --execution-id）", () => {
    const args: ZentaoArgs = { module: "task", action: "list", executionID: 168 };
    expect(buildCliArgs(args)).toEqual(["task", "list", "--execution-id=168", "--all"]);
  });

  it("get：module get + id（显式子命令）", () => {
    const args: ZentaoArgs = { module: "bug", action: "get", id: 3395 };
    expect(buildCliArgs(args)).toEqual(["bug", "get", "3395"]);
  });

  it("create：字段经 --data JSON 透传（camelCase 保留）", () => {
    const args: ZentaoArgs = { module: "bug", action: "create", fields: { title: "t", severity: 2 } };
    expect(buildCliArgs(args)).toEqual(["bug", "create", "--data", '{"title":"t","severity":2}']);
  });

  it("create：数组字段原样保留（bug 的 openedBuild 须为数组）", () => {
    const args = buildCliArgs({ module: "bug", action: "create", fields: { product: 2, title: "t", openedBuild: ["trunk"] } });
    expect(args).toEqual(["bug", "create", "--product-id=2", "--data", '{"title":"t","openedBuild":["trunk"]}']);
  });

  it("create：scope 字段从 fields 提取为独立 flag（bug --product-id）", () => {
    const args: ZentaoArgs = { module: "bug", action: "create", fields: { product: 2, title: "t", openedBuild: "trunk" } };
    expect(buildCliArgs(args)).toEqual(["bug", "create", "--product-id=2", "--data", '{"title":"t","openedBuild":"trunk"}']);
  });

  it("create：task 的 executionID 映射 --execution-id；execution 别名同效", () => {
    expect(buildCliArgs({ module: "task", action: "create", fields: { executionID: 168, name: "n" } }))
      .toEqual(["task", "create", "--execution-id=168", "--data", '{"name":"n"}']);
    expect(buildCliArgs({ module: "task", action: "create", fields: { execution: 168, name: "n" } }))
      .toEqual(["task", "create", "--execution-id=168", "--data", '{"name":"n"}']);
  });

  it("create：build 双 scope（--execution-id + --product）", () => {
    const args = buildCliArgs({ module: "build", action: "create", fields: { executionID: 11, product: 2, name: "v1" } });
    expect(args).toEqual(["build", "create", "--execution-id=11", "--product=2", "--data", '{"name":"v1"}']);
  });

  it("create：feedback/ticket 的 scope flag 是 --product（非 --product-id）", () => {
    expect(buildCliArgs({ module: "feedback", action: "create", fields: { product: 2, title: "f" } }))
      .toEqual(["feedback", "create", "--product=2", "--data", '{"title":"f"}']);
  });

  it("file create：multipart 不走 --data，字段转 kebab-case flag", () => {
    const args = buildCliArgs({ module: "file", action: "create", fields: { file: "/a.png", objectType: "bug", objectID: 1 } });
    expect(args).toEqual(["file", "create", "--file=/a.png", "--object-type=bug", "--object-id=1"]);
  });

  it("update：module update id + --data", () => {
    const args: ZentaoArgs = { module: "bug", action: "update", id: 1, fields: { status: "active" } };
    expect(buildCliArgs(args)).toEqual(["bug", "update", "1", "--data", '{"status":"active"}']);
  });

  it("delete：module delete id --yes", () => {
    expect(buildCliArgs({ module: "bug", action: "delete", id: 1 })).toEqual(["bug", "delete", "1", "--yes"]);
  });

  it("resolve 缺 resolvedBuild 时报错（4 字段必填）", () => {
    const args: ZentaoArgs = {
      module: "bug", action: "resolve", id: 1,
      fields: { resolution: "fixed", assignedTo: "admin", comment: "ok" },
    };
    expect(() => buildCliArgs(args)).toThrow(/resolvedBuild/);
  });

  it("resolve：4 字段经 --data 透传", () => {
    const args = buildCliArgs({
      module: "bug", action: "resolve", id: 1,
      fields: { resolution: "fixed", assignedTo: "admin", resolvedBuild: "trunk", comment: "ok" },
    });
    expect(args).toEqual(["bug", "resolve", "1", "--data", '{"resolution":"fixed","assignedTo":"admin","resolvedBuild":"trunk","comment":"ok"}']);
  });

  it("未知 module 报错", () => {
    expect(() => buildCliArgs({ module: "nope", action: "list" } as never)).toThrow(/模块/);
  });

  it("未知 action 报错", () => {
    expect(() => buildCliArgs({ module: "bug", action: "nope" } as never)).toThrow(/动作/);
  });

  it("productID 家族（feedback）list 统一 --product 别名", () => {
    const args: ZentaoArgs = { module: "feedback", action: "list", product: 2 };
    expect(buildCliArgs(args)).toEqual(["feedback", "list", "--product=2", "--all"]);
  });

  it("testcase list 需要 product（scopeFlag 非 null）", () => {
    const args: ZentaoArgs = { module: "testcase", action: "list", product: 2 };
    expect(buildCliArgs(args)).toEqual(["testcase", "list", "--product=2", "--all"]);
    expect(() => buildCliArgs({ module: "testcase", action: "list" })).toThrow(/product/);
  });

  it("file 动作集为 create/delete（不含 update）", () => {
    expect(MODULE_INFO.file.actions.has("create")).toBe(true);
    expect(MODULE_INFO.file.actions.has("delete")).toBe(true);
    expect(MODULE_INFO.file.actions.has("update")).toBe(false);
    expect(() => buildCliArgs({ module: "file", action: "update", id: 1 } as never)).toThrow(/动作/);
  });

  it("execution list 无 scope flag；提供 project 时经 --filter 过滤", () => {
    expect(buildCliArgs({ module: "execution", action: "list" })).toEqual(["execution", "list", "--all"]);
    expect(buildCliArgs({ module: "execution", action: "list", project: 60 }))
      .toEqual(["execution", "list", "--filter=project=60", "--all"]);
  });

  it("task start 缺 realStarted 时报错（必填）", () => {
    expect(() => buildCliArgs({ module: "task", action: "start", id: 1 })).toThrow(/realStarted/);
    expect(buildCliArgs({ module: "task", action: "start", id: 1, fields: { realStarted: "2026-08-18" } }))
      .toEqual(["task", "start", "1", "--data", '{"realStarted":"2026-08-18"}']);
  });

  it("task finish 缺 currentConsumed/realStarted/finishedDate 时报错（必填）", () => {
    expect(() => buildCliArgs({ module: "task", action: "finish", id: 1 })).toThrow(/currentConsumed/);
    const ok = buildCliArgs({
      module: "task", action: "finish", id: 1,
      fields: { currentConsumed: 2, realStarted: "2026-08-18", finishedDate: "2026-08-18" },
    });
    expect(ok).toEqual(["task", "finish", "1", "--data", '{"currentConsumed":2,"realStarted":"2026-08-18","finishedDate":"2026-08-18"}']);
  });
});

describe("buildCliArgs — 模块范围细节", () => {
  it("bug list 三选一：--project / --execution 也可", () => {
    expect(buildCliArgs({ module: "bug", action: "list", project: 5 }))
      .toEqual(["bug", "list", "--project=5", "--all"]);
    expect(buildCliArgs({ module: "bug", action: "list", executionID: 168 }))
      .toEqual(["bug", "list", "--execution=168", "--all"]);
  });

  it("bug list 缺任意范围时报错并列出可选项", () => {
    expect(() => buildCliArgs({ module: "bug", action: "list" })).toThrow(/product \/ project \/ execution/);
  });

  it("my 模块：动作即资源名，无需 id 与范围", () => {
    expect(buildCliArgs({ module: "my", action: "tasks" })).toEqual(["my", "tasks", "--all"]);
    expect(buildCliArgs({ module: "my", action: "bugs" })).toEqual(["my", "bugs", "--all"]);
  });

  it("my 模块不支持 list 动作（动作即资源名）", () => {
    expect(() => buildCliArgs({ module: "my", action: "list" as never })).toThrow(/不支持动作/);
  });

  it("bug confirm 动作透传（无字段时无 --data）", () => {
    expect(buildCliArgs({ module: "bug", action: "confirm", id: 42, fields: {} }))
      .toEqual(["bug", "confirm", "42"]);
  });

  it("状态动作带字段时经 --data（如 story close 的 closedReason）", () => {
    expect(buildCliArgs({ module: "story", action: "close", id: 100, fields: { closedReason: "done" } }))
      .toEqual(["story", "close", "100", "--data", '{"closedReason":"done"}']);
  });
});

describe("buildCliArgs — 查询参数（browseType/filter/search/sort/pick/maxItems/htmlToMarkdown）", () => {
  it("list 携带全部查询参数", () => {
    const args = buildCliArgs({
      module: "bug", action: "list", product: 2,
      browseType: "unclosed", filter: "status=active", search: "登录", searchFields: "title,steps",
      sort: "id:desc", pick: "id,title,status", maxItems: 50, htmlToMarkdown: true,
    });
    expect(args).toEqual([
      "bug", "list", "--product=2",
      "--browse-type=unclosed", "--filter=status=active", "--search=登录", "--search-fields=title,steps",
      "--sort=id:desc", "--fields=id,title,status", "--max-items=50", "--html-to-markdown",
      "--all",
    ]);
  });

  it("my 地盘动作同样支持查询参数", () => {
    expect(buildCliArgs({ module: "my", action: "tasks", browseType: "doing", pick: "id,name" }))
      .toEqual(["my", "tasks", "--browse-type=doing", "--fields=id,name", "--all"]);
  });

  it("查询参数在非 list/my 动作上报错（防止被静默忽略）", () => {
    expect(() => buildCliArgs({ module: "bug", action: "get", id: 1, pick: "id" })).toThrow(/仅在列表式动作/);
    expect(() => buildCliArgs({ module: "bug", action: "create", fields: { title: "t" }, maxItems: 5 } as never)).toThrow(/仅在列表式动作/);
  });

  it("execution 的项目范围与显式 filter 合并为一个 --filter（避免 OR 语义）", () => {
    expect(buildCliArgs({ module: "execution", action: "list", project: 60, filter: "status=doing" }))
      .toEqual(["execution", "list", "--filter=project=60,status=doing", "--all"]);
  });
});

describe("buildCliArgs — 0.5.0 新模块（knowledge/doc/weekly/relation）与附件", () => {
  it("knowledge list：id 即 libID；查询参数可用", () => {
    expect(buildCliArgs({ module: "knowledge", action: "list", id: 12, pick: "id,title" }))
      .toEqual(["knowledge", "list", "12", "--fields=id,title", "--all"]);
    expect(buildCliArgs({ module: "knowledge", action: "list", fields: { libID: 12 } }))
      .toEqual(["knowledge", "list", "12", "--all"]);
  });

  it("knowledge search/embeddingsSearch：--data 透传（keywords/libIDs 数组）", () => {
    expect(buildCliArgs({ module: "knowledge", action: "search", fields: { keywords: ["登录"], libIDs: [12] } }))
      .toEqual(["knowledge", "search", "--data", '{"keywords":["登录"],"libIDs":[12]}']);
    expect(buildCliArgs({ module: "knowledge", action: "embeddingsSearch", fields: { keyword: "登录", libIDs: [12], minSimilarity: 0.6 } }))
      .toEqual(["knowledge", "embeddings-search", "--data", '{"keyword":"登录","libIDs":[12],"minSimilarity":0.6}']);
  });

  it("doc：动作转 kebab 子命令，spaceID/libID 提为 flag，无 --all", () => {
    expect(buildCliArgs({ module: "doc", action: "myDocs", fields: { spaceID: 3, libID: 8 } }))
      .toEqual(["doc", "my-docs", "--space-id=3", "--lib-id=8"]);
    expect(buildCliArgs({ module: "doc", action: "productDocs", fields: { libID: 8 }, pick: "id,title" }))
      .toEqual(["doc", "product-docs", "--lib-id=8", "--fields=id,title"]);
    expect(buildCliArgs({ module: "doc", action: "get", id: 12 })).toEqual(["doc", "get", "12"]);
  });

  it("weekly：标准 CRUD，list 用 --project scope", () => {
    expect(buildCliArgs({ module: "weekly", action: "list", project: 5 }))
      .toEqual(["weekly", "list", "--project=5", "--all"]);
    expect(buildCliArgs({ module: "weekly", action: "create", fields: { project: 5, name: "w1" } }))
      .toEqual(["weekly", "create", "--project-id=5", "--data", '{"name":"w1"}']);
  });

  it("relation list：objectType 位置参数 + --object-id；多余字段报错", () => {
    expect(buildCliArgs({ module: "relation", action: "list", id: 123, fields: { objectType: "story" } }))
      .toEqual(["relation", "list", "story", "--object-id=123"]);
    expect(() => buildCliArgs({ module: "relation", action: "list", id: 123 }))
      .toThrow(/objectType/);
    expect(() => buildCliArgs({ module: "relation", action: "list", id: 123, fields: { objectType: "story", foo: 1 } }))
      .toThrow(/不支持字段/);
  });

  it("relation candidates：需 relatedObjectType，带 --all", () => {
    expect(buildCliArgs({ module: "relation", action: "candidates", id: 123, fields: { objectType: "story", relatedObjectType: "task" } }))
      .toEqual(["relation", "candidates", "story", "--object-id=123", "--related-object-type=task", "--all"]);
    expect(() => buildCliArgs({ module: "relation", action: "candidates", id: 123, fields: { objectType: "story" } }))
      .toThrow(/relatedObjectType/);
  });

  it("file read：默认落盘路径与 fields.saveTo", () => {
    expect(buildCliArgs({ module: "file", action: "read", id: 9 }))
      .toEqual(["file", "read", "9", "--output", ".dsh-zentao/attachments/file-9"]);
    expect(buildCliArgs({ module: "file", action: "read", id: 9, fields: { saveTo: "docs/a.png" } }))
      .toEqual(["file", "read", "9", "--output", "docs/a.png"]);
  });

  it("file get 透传；新模块查询参数误用于 get 报错", () => {
    expect(buildCliArgs({ module: "file", action: "get", id: 9 })).toEqual(["file", "get", "9"]);
    expect(() => buildCliArgs({ module: "knowledge", action: "get", id: 5, pick: "id" })).toThrow(/列表式动作/);
    expect(() => buildCliArgs({ module: "doc", action: "get", id: 5, sort: "id:asc" })).toThrow(/列表式动作/);
  });
});
