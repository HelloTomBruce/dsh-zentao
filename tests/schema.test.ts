import { describe, it, expect } from "vitest";
import { buildCliArgs, MODULE_INFO, type ZentaoArgs } from "../src/schema.js";

describe("buildCliArgs", () => {
  it("list：拼接 module + 范围参数 + recPerPage=200", () => {
    const args: ZentaoArgs = { module: "bug", action: "list", product: 2 };
    expect(buildCliArgs(args)).toEqual(["bug", "--product=2", "--recPerPage=200"]);
  });

  it("list 用 executionID（task 模块强制 --executionID）", () => {
    const args: ZentaoArgs = { module: "task", action: "list", executionID: 168 };
    expect(buildCliArgs(args)).toEqual(["task", "--executionID=168", "--recPerPage=200"]);
  });

  it("get：module + id", () => {
    const args: ZentaoArgs = { module: "bug", action: "get", id: 3395 };
    expect(buildCliArgs(args)).toEqual(["bug", "3395"]);
  });

  it("create：module create + 字段参数", () => {
    const args: ZentaoArgs = { module: "bug", action: "create", fields: { title: "t", severity: 2 } };
    expect(buildCliArgs(args)).toEqual(["bug", "create", "--title=t", "--severity=2"]);
  });

  it("update：module update id + 字段", () => {
    const args: ZentaoArgs = { module: "bug", action: "update", id: 1, fields: { status: "active" } };
    expect(buildCliArgs(args)).toEqual(["bug", "update", "1", "--status=active"]);
  });

  it("resolve 缺 resolvedBuild 时报错（4 字段必填）", () => {
    const args: ZentaoArgs = {
      module: "bug", action: "resolve", id: 1,
      fields: { resolution: "fixed", assignedTo: "admin", comment: "ok" },
    };
    expect(() => buildCliArgs(args)).toThrow(/resolvedBuild/);
  });

  it("未知 module 报错", () => {
    expect(() => buildCliArgs({ module: "nope", action: "list" } as never)).toThrow(/模块/);
  });

  it("未知 action 报错", () => {
    expect(() => buildCliArgs({ module: "bug", action: "nope" } as never)).toThrow(/动作/);
  });

  it("productID 模块（feedback）list 用 --productID=", () => {
    const args: ZentaoArgs = { module: "feedback", action: "list", product: 2 };
    expect(buildCliArgs(args)).toEqual(["feedback", "--productID=2", "--recPerPage=200"]);
  });

  it("testcase list 需要 product（scopeFlag 非 null）", () => {
    const args: ZentaoArgs = { module: "testcase", action: "list", product: 2 };
    expect(buildCliArgs(args)).toEqual(["testcase", "--product=2", "--recPerPage=200"]);
    expect(() => buildCliArgs({ module: "testcase", action: "list" })).toThrow(/product/);
  });

  it("file 动作集为 create/delete（不含 update）", () => {
    expect(MODULE_INFO.file.actions.has("create")).toBe(true);
    expect(MODULE_INFO.file.actions.has("delete")).toBe(true);
    expect(MODULE_INFO.file.actions.has("update")).toBe(false);
    expect(() => buildCliArgs({ module: "file", action: "update", id: 1 } as never)).toThrow(/动作/);
  });

  it("execution list 无 project 也可（scope 可选）", () => {
    expect(buildCliArgs({ module: "execution", action: "list" })).toEqual(["execution", "--recPerPage=200"]);
    expect(buildCliArgs({ module: "execution", action: "list", project: 60 })).toEqual(["execution", "--project=60", "--recPerPage=200"]);
  });

  it("task start 缺 realStarted 时报错（必填）", () => {
    expect(() => buildCliArgs({ module: "task", action: "start", id: 1 })).toThrow(/realStarted/);
    expect(buildCliArgs({ module: "task", action: "start", id: 1, fields: { realStarted: "2026-08-18" } })).toEqual(["task", "start", "1", "--realStarted=2026-08-18"]);
  });

  it("task finish 缺 currentConsumed/realStarted/finishedDate 时报错（必填）", () => {
    expect(() => buildCliArgs({ module: "task", action: "finish", id: 1 })).toThrow(/currentConsumed/);
    const ok = buildCliArgs({
      module: "task", action: "finish", id: 1,
      fields: { currentConsumed: 2, realStarted: "2026-08-18", finishedDate: "2026-08-18" },
    });
    expect(ok).toEqual(["task", "finish", "1", "--currentConsumed=2", "--realStarted=2026-08-18", "--finishedDate=2026-08-18"]);
  });
});

describe("buildCliArgs — CLI 0.3.1 新能力", () => {
  it("bug list 三选一：--project / --execution 也可", () => {
    expect(buildCliArgs({ module: "bug", action: "list", project: 5 }))
      .toEqual(["bug", "--project=5", "--recPerPage=200"]);
    expect(buildCliArgs({ module: "bug", action: "list", executionID: 168 }))
      .toEqual(["bug", "--execution=168", "--recPerPage=200"]);
  });

  it("bug list 缺任意范围时报错并列出可选项", () => {
    expect(() => buildCliArgs({ module: "bug", action: "list" })).toThrow(/product \/ project \/ execution/);
  });

  it("my 模块：动作即资源名，无需 id 与范围", () => {
    expect(buildCliArgs({ module: "my", action: "tasks" })).toEqual(["my", "tasks", "--recPerPage=200"]);
    expect(buildCliArgs({ module: "my", action: "bugs" })).toEqual(["my", "bugs", "--recPerPage=200"]);
  });

  it("my 模块不支持 list 动作（动作即资源名）", () => {
    expect(() => buildCliArgs({ module: "my", action: "list" as never })).toThrow(/不支持动作/);
  });

  it("bug confirm 动作透传（0.3.1 新增）", () => {
    expect(buildCliArgs({ module: "bug", action: "confirm", id: 42, fields: {} }))
      .toEqual(["bug", "confirm", "42"]);
  });
});
