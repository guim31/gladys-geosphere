// -----------------------------------------------------------------------------
// The little the integration keeps across restarts, in /data (the only
// writable volume of the sandbox): the warnings already announced to the
// scenes, so that a restart does not fire the "new warning" trigger again for
// every warning in force. Written atomically (temporary file, then rename).
// -----------------------------------------------------------------------------

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class Store {
  /** @param {string} dir the data directory, /data in the container */
  constructor(dir) {
    this.file = join(dir, 'state.json');
    this.dir = dir;
  }

  /** @returns {Promise<object | null>} null when nothing was ever saved */
  async load() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      // A corrupt file is a fresh start, not a crash loop.
      return null;
    }
  }

  /** @param {object} data */
  async save(data) {
    await mkdir(this.dir, { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(data), 'utf8');
    await rename(temporary, this.file);
  }
}

/** A store in memory, for the tests and when /data is not writable. */
export class MemoryStore {
  constructor(data = null) {
    this.data = data;
  }

  async load() {
    return this.data === null ? null : structuredClone(this.data);
  }

  async save(data) {
    this.data = structuredClone(data);
  }
}
