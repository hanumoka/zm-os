/**
 * AppRepository Local 어댑터 barrel (ADR-0019)
 *
 * 공개 진입점: `createLocalAppRepository(blob, opts?)`.
 * REFAC-02-P5의 Composition Root(`createLocalPorts`)가 이 팩토리를 호출해 주입한다.
 *
 * @module adapters-local/app-repository
 */

export {
  createLocalAppRepository,
  type CreateLocalAppRepositoryOptions,
} from './local-app-repository';
