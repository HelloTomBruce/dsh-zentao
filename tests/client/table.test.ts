import { describe, it, expect } from "vitest";
import { rowsToColumns, extractData, type ToolResultPayload } from "../../src/client/table.js";

describe("extractData", () => {
  it("从工具 result 文本提取 JSON payload", () => {
    const payload: ToolResultPayload = { module: "bug", action: "list", data: [{ id: 1, title: "x" }], count: 1 };
    expect(extractData(JSON.stringify(payload))).toEqual(payload);
  });

  it("非 JSON 返回 null", () => {
    expect(extractData("not json")).toBeNull();
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
