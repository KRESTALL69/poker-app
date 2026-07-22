import "server-only";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import type { AvatarStorageRepository } from "./Interface";
import { contentTypeToExtension } from "./contentTypeToExtension";

// Served straight out of Next's `public/` directory, which the standalone
// server reads from disk per-request rather than bundling at build time --
// files written here after the container has started are served
// immediately, no rebuild/restart required. On the VPS this directory is a
// bind mount (compose.yaml) so uploads survive `docker compose build`/`down`,
// and nginx also serves /storage/ directly from the same host path, bypassing
// Node entirely. Same pattern as ReRaise's LocalAvatarStorageRepository.
const STORAGE_ROOT = path.join(process.cwd(), "public", "storage", "avatars");

// Baked in at build time (see Dockerfile) and also available at runtime.
const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export class LocalAvatarStorageRepository implements AvatarStorageRepository {
  async uploadAvatar(playerId: string, file: File): Promise<string> {
    const extension = contentTypeToExtension(file.type);
    const filePath = `${playerId}/avatar.${extension}`;
    const destination = path.join(STORAGE_ROOT, filePath);

    const buffer = Buffer.from(await file.arrayBuffer());

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);

    return `${PUBLIC_BASE_URL}/storage/avatars/${filePath}`;
  }
}
