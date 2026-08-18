import { describe, it, expect } from "vitest";
import { apply } from "../src/index.js";
import { buildCliArgs } from "../src/schema.js";

function mockCtx() {
  const registered: unknown[] = [];
  const sections: unknown[] = [];
  return {
    registered,
    sections,
    ctx: {
      tools: {
        register: (def: unknown) => {
          registered.push(def);
          return () => {};
        },
      },
      systemPrompt: {
        section: (s: unknown) => { sections.push(s); },
      },
      webServer: {
        register: (route: unknown) => {
          registered.push(route);
          return () => {};
        },
      },
    },
  };
}

describe("apply", () => {
  it("注册 1 个 zentao 工具 + systemPrompt section", () => {
    const { registered, sections, ctx } = mockCtx();
    apply(ctx as never);
    const tool = registered.find((d) => (d as { name?: string }).name === "zentao");
    expect(tool).toBeDefined();
    const def = tool as { parameters?: Record<string, unknown>; execute?: (a: unknown) => Promise<unknown> };
    // parameters 是编译后的 JSON Schema（type/properties），属性在 properties 下
    const props = (def.parameters?.["properties"] ?? {}) as Record<string, unknown>;
    expect(props.module).toBeDefined();
    expect(props.action).toBeDefined();
    expect(def.execute).toBeTypeOf("function");
    expect(sections.length).toBe(1);
  });

  it("execute 走 buildCliArgs + 返回结构化结果", async () => {
    const { registered, ctx } = mockCtx();
    apply(ctx as never);
    const tool = registered.find((d) => (d as { name?: string }).name === "zentao") as {
      execute: (a: unknown) => Promise<unknown>;
    };
    // 工具 execute 内部会用真实 runZentao —— 这里只验证入参→错误路径可抛中文提示
    await expect(tool.execute({ module: "bug", action: "resolve", id: 1 })).rejects.toThrow(/resolvedBuild/);
  });
});
