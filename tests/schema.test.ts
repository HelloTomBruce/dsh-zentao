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
});
