import { describe, it, expect } from "vitest";
import { rowsToColumns, cellValue, parseMeta, type ToolResultPayload } from "../../src/client/table.js";

describe("parseMeta", () => {
  it("从 block.meta（presentationMeta 返回值）解析 payload", () => {
    const payload: ToolResultPayload = { module: "bug", action: "list", data: [{ id: 1, title: "x" }], count: 1 };
    expect(parseMeta(payload)).toEqual(payload);
  });

  it("meta 为 undefined / null / 非对象 返回 null", () => {
    expect(parseMeta(undefined)).toBeNull();
    expect(parseMeta(null)).toBeNull();
    expect(parseMeta("x")).toBeNull();
  });

  it("meta 缺 data 字段返回 null（降级纯文本）", () => {
    expect(parseMeta({ module: "bug", action: "list" })).toBeNull();
  });

  it("meta 缺 module/action 返回 null", () => {
    expect(parseMeta({ data: [1], count: 1 })).toBeNull();
  });
});

describe("rowsToColumns", () => {
  it("把行数组转成列定义（key/label/type）", () => {
    const cols = rowsToColumns([{ id: 1, title: "x", status: "active" }]);
    expect(cols.map((c) => c.key)).toEqual(["id", "title", "status"]);
  });

  it("空数组返回空列", () => {
    expect(rowsToColumns([])).toEqual([]);
  });

  it("对象（详情）也转成两列 key/value", () => {
    const cols = rowsToColumns({ id: 1, title: "x" } as never);
    expect(cols.length).toBe(2);
  });
});

describe("cellValue", () => {
  it("对象行取 key；非对象行原样返回", () => {
    expect(cellValue({ id: 1, title: "x" }, "title")).toBe("x");
    expect(cellValue("x", "title")).toBe("x");
  });
});
