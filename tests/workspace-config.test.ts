import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseWorkspaceConfig,
  bugScopeOf,
  readWorkspaceConfig,
  WORKSPACE_CONFIG_FILENAME,
} from "../src/lib/workspace-config.js";

describe("parseWorkspaceConfig", () => {
  it("完整配置（数字或数字字符串）", () => {
    expect(parseWorkspaceConfig('{"product":2,"execution":168,"project":5}'))
      .toEqual({ config: { product: 2, execution: 168, project: 5 } });
    expect(parseWorkspaceConfig('{"product":"2","execution":"168"}'))
      .toEqual({ config: { product: 2, execution: 168 } });
  });

  it("部分配置合法（至少一项）", () => {
    expect(parseWorkspaceConfig('{"execution":168}')).toEqual({ config: { execution: 168 } });
    expect(parseWorkspaceConfig('{"product":2}')).toEqual({ config: { product: 2 } });
  });

  it("非法 JSON 返回错误", () => {
    expect(parseWorkspaceConfig("{oops").error).toMatch(/JSON/);
  });

  it("非对象返回错误", () => {
    expect(parseWorkspaceConfig("[1,2]").error).toMatch(/对象/);
    expect(parseWorkspaceConfig("null").error).toMatch(/对象/);
  });

  it("字段非正整数返回错误（列出坏字段）", () => {
    expect(parseWorkspaceConfig('{"product":-2}').error).toMatch(/product/);
    expect(parseWorkspaceConfig('{"product":1.5}').error).toMatch(/product/);
    expect(parseWorkspaceConfig('{"execution":"abc"}').error).toMatch(/execution/);
  });

  it("三项全缺返回错误", () => {
    expect(parseWorkspaceConfig("{}").error).toMatch(/至少/);
  });

  it("多余字段被忽略", () => {
    expect(parseWorkspaceConfig('{"product":2,"foo":"bar"}')).toEqual({ config: { product: 2 } });
  });
});

describe("bugScopeOf", () => {
  it("product > project > execution 优先级", () => {
    expect(bugScopeOf({ product: 2, project: 5, execution: 168 })).toEqual({ flag: "--product", value: 2 });
    expect(bugScopeOf({ project: 5, execution: 168 })).toEqual({ flag: "--project", value: 5 });
    expect(bugScopeOf({ execution: 168 })).toEqual({ flag: "--execution", value: 168 });
  });

  it("无任何范围时返回 null", () => {
    expect(bugScopeOf({})).toBeNull();
  });
});

describe("readWorkspaceConfig", () => {
  it("文件不存在 → config:null（未配置是正常态）", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zentao-ws-"));
    try {
      const result = await readWorkspaceConfig(dir);
      expect(result).toEqual({ ok: true, config: null });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("合法配置文件读取成功", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zentao-ws-"));
    try {
      await writeFile(join(dir, WORKSPACE_CONFIG_FILENAME), '{"product":2,"execution":168}', "utf8");
      const result = await readWorkspaceConfig(dir);
      expect(result).toEqual({ ok: true, config: { product: 2, execution: 168 } });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("非法配置文件返回带原因的错误", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zentao-ws-"));
    try {
      await writeFile(join(dir, WORKSPACE_CONFIG_FILENAME), "{oops", "utf8");
      const result = await readWorkspaceConfig(dir);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("workspace 路径是文件（ENOTDIR）返回错误", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zentao-ws-"));
    try {
      const file = join(dir, "some-file");
      await writeFile(file, "x", "utf8");
      const result = await readWorkspaceConfig(file);
      expect(result.ok).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
