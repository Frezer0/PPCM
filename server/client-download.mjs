import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
export function clientDownloads(root, env = process.env) {
  let cached;
  const repository = env.GITHUB_REPOSITORY || "Frezer0/PPCM";
  const localDir = path.join(root, "desktop", "release");
  async function resolve() {
    if (cached && cached.until > Date.now()) return cached.value;
    let value = { available: false, version: "", architecture: "x64" };
    try {
      const manifest = JSON.parse(
        await readFile(path.join(localDir, "client-manifest.json"), "utf8"),
      );
      if (/^PPCM-Setup-[\d.]+-x64\.exe$/.test(manifest.filename)) {
        const file = path.join(localDir, manifest.filename);
        const info = await stat(file);
        value = { ...manifest, size: info.size, available: true, file };
      }
    } catch {
      /* Render obtains the installer from GitHub Releases. */
    }
    if (!value.available && /^[\w.-]+\/[\w.-]+$/.test(repository)) {
      try {
        const headers = {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(env.GITHUB_RELEASE_TOKEN
            ? { Authorization: `Bearer ${env.GITHUB_RELEASE_TOKEN}` }
            : {}),
        };
        const response = await fetch(
          `https://api.github.com/repos/${repository}/releases/latest`,
          { headers, signal: AbortSignal.timeout(10000) },
        );
        if (response.ok) {
          const release = await response.json();
          const asset = release.assets?.find((a) =>
            /^PPCM-Setup-[\d.]+-x64\.exe$/.test(a.name),
          );
          if (asset)
            value = {
              available: true,
              filename: asset.name,
              version: release.tag_name.replace(/^v/, ""),
              size: asset.size,
              sha256: asset.digest?.replace(/^sha256:/, "") || "",
              architecture: "x64",
              assetId: asset.id,
            };
        }
      } catch {
        /* The UI shows an unavailable state and can retry later. */
      }
    }
    cached = { until: Date.now() + (value.available ? 300000 : 15000), value };
    return value;
  }
  return {
    async info() {
      const { file, assetId, ...value } = await resolve();
      return {
        ...value,
        downloadUrl: value.available ? "/api/client/download" : null,
      };
    },
    async download(_req, res, next) {
      const value = await resolve();
      if (!value.available)
        return res
          .status(404)
          .json({ error: "El instalador todavía no está publicado." });
      res.set("Content-Type", "application/vnd.microsoft.portable-executable");
      res.set(
        "Content-Disposition",
        `attachment; filename="${value.filename}"`,
      );
      if (value.file) return res.sendFile(value.file);
      const response = await fetch(
        `https://api.github.com/repos/${repository}/releases/assets/${value.assetId}`,
        {
          headers: {
            Accept: "application/octet-stream",
            ...(env.GITHUB_RELEASE_TOKEN
              ? { Authorization: `Bearer ${env.GITHUB_RELEASE_TOKEN}` }
              : {}),
          },
          signal: AbortSignal.timeout(120000),
        },
      );
      if (
        !response.ok ||
        response.headers.get("content-type")?.includes("json")
      )
        throw Object.assign(
          new Error(
            "No se pudo descargar el instalador desde GitHub. Inténtalo nuevamente.",
          ),
          { status: 502 },
        );
      res.set("Content-Length", String(value.size));
      Readable.fromWeb(response.body).on("error", next).pipe(res);
    },
  };
}
