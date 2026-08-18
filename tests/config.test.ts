import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { localConfigPath, pluginRoot } from "../src/lib/config.js";

describe("localConfigPath", () => {
  it("指向插件根目录下的 zentao.json", () => {
    expect(localConfigPath("/tmp/plugin")).toBe(join("/tmp/plugin", "zentao.json"));
  });

  it("默认基于 pluginRoot（能找到 package.json）", () => {
    expect(localConfigPath()).toBe(join(pluginRoot(), "zentao.json"));
  });
});
