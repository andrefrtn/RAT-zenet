import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Receipt = { fingerprint: string; state: 'pending' | 'accepted' };

export function receiptStore(directory: string) {
  const path = (id: string) => join(directory, id + '.receipt');
  return {
    async claim(id: string, fingerprint: string): Promise<Receipt | null> {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        await writeFile(path(id), fingerprint + '\n', { flag: 'wx', mode: 0o600, flush: true });
        return null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          const [saved, marker, end] = (await readFile(path(id), 'utf8')).split('\n');
          return { fingerprint: saved, state: marker === 'accepted' && end === '' ? 'accepted' : 'pending' };
        } catch (readError) {
          // The writer may still be opening the file or removing a failed attempt.
          if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
            return { fingerprint, state: 'pending' };
          }
          throw readError;
        }
      }
    },
    async accept(id: string) {
      await appendFile(path(id), 'accepted\n', { mode: 0o600, flush: true });
    },
    async release(id: string) {
      await rm(path(id));
    },
  };
}
