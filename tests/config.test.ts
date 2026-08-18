import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureLocalConfig, localConfigPath, userConfigPath } from "../src/lib/config.js";

let sandbox = "";
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "dsh-zentao-cfg-"));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  delete process.env.ZENTAO_CONFIG_FILE;
});

describe("userConfigPath", () => {
  it("默认取 ~/.config/zentao/zentao.json", () => {
    expect(userConfigPath()).toContain(".config/zentao/zentao.json");
  });

  it("ZENTAO_CONFIG_FILE 环境变量优先", () => {
    process.env.ZENTAO_CONFIG_FILE = "/tmp/custom.json";
    expect(userConfigPath()).toBe("/tmp/custom.json");
  });
});

describe("ensureLocalConfig", () => {
  it("用户配置存在时复制到插件目录并返回副本路径", () => {
    const src = join(sandbox, "user.json");
    writeFileSync(src, '{"profiles":[]}');
    process.env.ZENTAO_CONFIG_FILE = src;
    const root = join(sandbox, "plugin");
    const result = ensureLocalConfig(root);
    expect(result).toBe(localConfigPath(root));
    expect(existsSync(result as string)).toBe(true);
    expect(statSync(result as string).mtimeMs).toBeGreaterThan(0);
  });

  it("用户配置不存在时返回 null（不阻塞）", () => {
    process.env.ZENTAO_CONFIG_FILE = join(sandbox, "missing.json");
    expect(ensureLocalConfig(join(sandbox, "plugin"))).toBeNull();
  });

  it("副本已最新时不重复复制", () => {
    const src = join(sandbox, "user.json");
    writeFileSync(src, '{"profiles":[]}');
    process.env.ZENTAO_CONFIG_FILE = src;
    const root = join(sandbox, "plugin");
    ensureLocalConfig(root);
    const mtime1 = statSync(localConfigPath(root)).mtimeMs;
    ensureLocalConfig(root);
    expect(statSync(localConfigPath(root)).mtimeMs).toBe(mtime1);
  });

  it("用户配置更新后重新复制", async () => {
    const src = join(sandbox, "user.json");
    writeFileSync(src, '{"a":1}');
    process.env.ZENTAO_CONFIG_FILE = src;
    const root = join(sandbox, "plugin");
    ensureLocalConfig(root);
    const oldMtime = statSync(localConfigPath(root)).mtimeMs;
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(src, '{"a":2}');
    ensureLocalConfig(root);
    expect(statSync(localConfigPath(root)).mtimeMs).toBeGreaterThan(oldMtime);
  });
});
