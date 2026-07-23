import { describe, it, expect, vi, afterEach } from "vitest";
import { getDriveClient } from "@/lib/drive";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getDriveClient().uploadFile", () => {
  it("uploads a file and returns the Drive fileId", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "drive-file-123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = getDriveClient("fake-access-token");
    const result = await client.uploadFile({
      name: "thumb.png",
      mimeType: "image/png",
      data: Buffer.from("fake-image-bytes"),
    });

    expect(result).toEqual({ fileId: "drive-file-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("uploadType=multipart");
    expect(options.headers.Authorization).toBe("Bearer fake-access-token");
  });

  it("throws when the upload request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" });
    vi.stubGlobal("fetch", fetchMock);

    const client = getDriveClient("fake-access-token");
    await expect(
      client.uploadFile({ name: "thumb.png", mimeType: "image/png", data: Buffer.from("x") })
    ).rejects.toThrow();
  });
});
