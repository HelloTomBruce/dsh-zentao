import { describe, it, expect, vi } from "vitest";
import { runZentao } from "../src/lib/cli.js";

// 注入 fake execFile：runZentao 接受可注入的 exec，便于测试
function fakeExec(stdout: string, code = 0) {
  return vi.fn((_cmd: string, _args: string[], cb: (err: Error | null, so: string) => void) => {
    if (code !== 0) {
      cb(new Error(`exit ${code}`), stdout);
    } else {
      cb(null, stdout);
    }
  });
}

describe("runZentao", () => {
  it("拼接 CLI 参数并追加 --format=json", async () => {
    const exec = fakeExec('{"status":"success","data":[{"id":1}]}');
    const result = await runZentao(["bug", "--product=2", "--recPerPage=200"], exec as never);
    expect(exec).toHaveBeenCalledWith(
      "zentao",
      ["bug", "--product=2", "--recPerPage=200", "--format=json"],
      expect.any(Function),
    );
    expect(result).toEqual([{ id: 1 }]);
  });

  it("透传原始对象当列表无 data 时（详情返回对象）", async () => {
    const exec = fakeExec('{"status":"success","data":{"id":42,"title":"x"}}');
    const result = await runZentao(["bug", "42"], exec as never);
    expect(result).toEqual({ id: 42, title: "x" });
  });

  it("CLI 错误码映射为 cliError（带 code）", async () => {
    const exec = fakeExec('{"error":{"code":"2003","message":"缺少必要参数"}}', 1);
    await expect(runZentao(["task", "--execution=1"], exec as never)).rejects.toMatchObject({
      code: "2003",
      message: expect.stringContaining("缺少必要参数"),
    });
  });

  it("CLI 不存在（ENOENT）映射为安装引导错误", async () => {
    const exec = vi.fn((_cmd: string, _args: string[], cb: (err: Error) => void) => {
      const e = new Error("spawn zentao ENOENT") as NodeJS.ErrnoException;
      e.code = "ENOENT";
      cb(e);
    });
    await expect(runZentao(["bug"], exec as never)).rejects.toMatchObject({
      code: "ENOENT",
      message: expect.stringContaining("npm i -g zentao-cli"),
    });
  });

  it("exit code 非 0 且 stdout 非 JSON 时报 CLI 错误", async () => {
    const exec = fakeExec("some random error text", 1);
    await expect(runZentao(["bug"], exec as never)).rejects.toThrow(/zentao/);
  });
});
