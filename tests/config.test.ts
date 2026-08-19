import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dshHome, localConfigPath } from "../src/lib/config.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dshHome", () => {
  it("尊重 DSH_HOME 环境变量", () => {
    vi.stubEnv("DSH_HOME", "/tmp/dsh-test-home");
    expect(dshHome()).toBe("/tmp/dsh-test-home");
  });

  it("默认落在用户目录 .dsh", () => {
    const original = process.env.DSH_HOME;
    delete process.env.DSH_HOME;
    try {
      expect(dshHome()).toMatch(/\.dsh$/);
    } finally {
      if (original !== undefined) process.env.DSH_HOME = original;
    }
  });
});

describe("localConfigPath", () => {
  it("指向 dsh 用户目录下的 zentao.json（稳定位置，不在 node_modules 内）", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-home-"));
    vi.stubEnv("DSH_HOME", home);
    try {
      expect(localConfigPath("/tmp/plugin")).toBe(join(home, "zentao.json"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("旧位置（插件目录）配置存在且新位置缺失时自动迁移", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-home-"));
    const legacyRoot = mkdtempSync(join(tmpdir(), "dsh-plugin-"));
    vi.stubEnv("DSH_HOME", home);
    try {
      writeFileSync(join(legacyRoot, "zentao.json"), '{"server":"http://z"}', { mode: 0o600 });
      const stable = localConfigPath(legacyRoot);
      expect(stable).toBe(join(home, "zentao.json"));
      expect(readFileSync(stable, "utf8")).toBe('{"server":"http://z"}');
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(legacyRoot, { recursive: true, force: true });
    }
  });

  it("新位置已有配置时不迁移、不覆盖", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-home-"));
    const legacyRoot = mkdtempSync(join(tmpdir(), "dsh-plugin-"));
    vi.stubEnv("DSH_HOME", home);
    try {
      writeFileSync(join(home, "zentao.json"), '{"server":"http://new"}');
      writeFileSync(join(legacyRoot, "zentao.json"), '{"server":"http://old"}');
      localConfigPath(legacyRoot);
      expect(readFileSync(join(home, "zentao.json"), "utf8")).toBe('{"server":"http://new"}');
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(legacyRoot, { recursive: true, force: true });
    }
  });

  it("新旧位置都没有配置时返回新位置路径（不创建文件）", () => {
    const home = mkdtempSync(join(tmpdir(), "dsh-home-"));
    vi.stubEnv("DSH_HOME", home);
    try {
      const stable = localConfigPath("/tmp/nonexistent-plugin-root");
      expect(stable).toBe(join(home, "zentao.json"));
      expect(existsSync(stable)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
