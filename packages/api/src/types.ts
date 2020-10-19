import { InjectedExtension } from '@polkadot/extension-inject/types';
import { SubmittableExtrinsicFunction } from '@polkadot/api/promise/types';

import ApiPromise from '@polkadot/api/promise';

export interface ApiState {
  apiDefaultTx: SubmittableExtrinsicFunction;
  apiDefaultTxSudo: SubmittableExtrinsicFunction;
  hasInjectedAccounts: boolean;
  isApiReady: boolean;
  isDevelopment: boolean;
  isSubstrateV2: boolean;
  systemChain: string;
  systemName: string;
  systemVersion: string;
}

export interface ApiProps extends ApiState {
  api: ApiPromise;
  extensions?: InjectedExtension[];
  isApiConnected: boolean;
  isApiInitialized: boolean;
  isWaitingInjected: boolean;
}
