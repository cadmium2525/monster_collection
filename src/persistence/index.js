import { resolveFirebaseConfig } from '../config/firebase-config.js';
import { FirebaseGameRepository } from './FirebaseGameRepository.js';
import { LocalGameRepository } from './LocalGameRepository.js';
import { ResilientGameRepository } from './ResilientGameRepository.js';

export function createGameRepository({ config = resolveFirebaseConfig(), storage } = {}) {
  const local = new LocalGameRepository({ storage });
  const cloud = config?.projectId ? new FirebaseGameRepository({ config }) : null;
  return new ResilientGameRepository({ local, cloud });
}

export { FirebaseGameRepository } from './FirebaseGameRepository.js';
export { LocalGameRepository } from './LocalGameRepository.js';
export { ResilientGameRepository } from './ResilientGameRepository.js';
export { MemoryStorage } from './memory-storage.js';
export { ChampionConflictError, RepositoryUnavailableError } from './errors.js';
