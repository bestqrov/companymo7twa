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

  it("builds a correctly structured multipart body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "drive-file-123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const client = getDriveClient("fake-access-token");
    await client.uploadFile({ name: "thumb.png", mimeType: "image/png", data: Buffer.from("fake-image-bytes") });

    const [, options] = fetchMock.mock.calls[0];
    const bodyText = (options.body as Buffer).toString("utf-8");

    expect(bodyText).toContain('"name":"thumb.png"');
    expect(bodyText).toContain('"mimeType":"image/png"');
    expect(bodyText).toContain("Content-Type: application/json");
    expect(bodyText).toContain("Content-Type: image/png");
    expect(bodyText).toContain("fake-image-bytes");
    expect(options.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);
  });
});
