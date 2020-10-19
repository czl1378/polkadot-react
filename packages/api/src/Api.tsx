import React, { useEffect, useMemo, useState } from 'react';

import ApiPromise from '@polkadot/api/promise';
import { web3Accounts, web3Enable } from '@polkadot/extension-dapp';
import { TypeRegistry } from '@polkadot/types';
import { formatBalance, isTestChain } from '@polkadot/util';
import { WsProvider } from '@polkadot/rpc-provider';

import ApiContext from './ApiContext';

import store from 'store';

import { ApiState, ApiProps } from './types';

const registry = new TypeRegistry();

export const DEFAULT_DECIMALS = registry.createType('u32', 15);

const injectedPromise = web3Enable('polkadot-js/apps');
let api: ApiPromise;

export { api };

function getDevTypes (): Record<string, Record<string, string>> {
  const types = store.get('types', {}) as Record<string, Record<string, string>>;
  const names = Object.keys(types);

  names.length && console.log('Injected types:', names.join(', '));

  return types;
}

async function retrieve (api: ApiPromise): Promise<any> {
  const [chainProperties, systemChain, systemChainType, systemName, systemVersion, injectedAccounts] = await Promise.all([
    api.rpc.chain.getHeader(),
    api.rpc.system.properties(),
    api.rpc.system.chain(),
    api.rpc.system.chainType
      ? api.rpc.system.chainType()
      : Promise.resolve(registry.createType('ChainType', 'Live')),
    api.rpc.system.name(),
    api.rpc.system.version(),
    injectedPromise
      .then(() => web3Accounts())
      .then((accounts) => accounts.map(({ address, meta }, whenCreated) => ({
        address,
        meta: {
          ...meta,
          name: `${meta.name || 'unknown'} (${meta.source === 'polkadot-js' ? 'extension' : meta.source})`,
          whenCreated
        }
      })))
      .catch((error) => {
        
        return [];
      })
  ]);

  // HACK Horrible hack to try and give some window to the DOT denomination
  const properties = chainProperties;

  return {
    injectedAccounts,
    properties,
    systemChain: (systemChain || '<unknown>').toString(),
    systemChainType,
    systemName: systemName.toString(),
    systemVersion: systemVersion.toString()
  };
}

async function loadOnReady (api: ApiPromise, types: Record<string, Record<string, string>>): Promise<any> {
  registry.register(types);

  const { injectedAccounts, properties, systemChain, systemChainType, systemName, systemVersion } = await retrieve(api);
 
  const tokenSymbol = properties.tokenSymbol.unwrapOr(undefined)?.toString();
  const tokenDecimals = properties.tokenDecimals.unwrapOr(DEFAULT_DECIMALS).toNumber();
  const isDevelopment = systemChainType.isDevelopment || systemChainType.isLocal || isTestChain(systemChain);

  // first setup the UI helpers
  formatBalance.setDefaults({
    decimals: tokenDecimals,
    unit: tokenSymbol
  });
 
  
  const defaultSection = Object.keys(api.tx)[0];
  const defaultMethod = Object.keys(api.tx[defaultSection])[0];
  const apiDefaultTx = api.tx[defaultSection][defaultMethod];
  const apiDefaultTxSudo = (api.tx.system && api.tx.system.setCode) || apiDefaultTx;
  const isSubstrateV2 = !!Object.keys(api.consts).length;

  return {
    apiDefaultTx,
    apiDefaultTxSudo,
    injectedAccounts,
    isApiReady: true,
    isDevelopment,
    isSubstrateV2,
    systemChain,
    systemName,
    systemVersion
  };
}

function Api ({ children, url }: any): React.ReactElement<any> | null {
 
  const [state, setState] = useState<ApiState>({ hasInjectedAccounts: false, isApiReady: false } as unknown as ApiState);
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [isApiInitialized, setIsApiInitialized] = useState(false);
  const [extensions, setExtensions] = useState<any>();
  const value = useMemo<ApiProps>(
    () => ({ ...state, api, extensions, isApiConnected, isApiInitialized, isWaitingInjected: !extensions }),
    [extensions, isApiConnected, isApiInitialized, state]
  );

  // initial initialization
  useEffect((): void => {
    const provider = new WsProvider(url);
    const types = getDevTypes();

    api = new ApiPromise({ provider, registry, types });

    api.on('connected', () => setIsApiConnected(true));
    api.on('disconnected', () => setIsApiConnected(false));
    api.on('ready', async (): Promise<void> => {
      try {
        setState(await loadOnReady(api, types));
      } catch (error) {
        console.error('Unable to load chain', error);
      }
    });

    injectedPromise
      .then(setExtensions)
      .catch((error: Error) => console.error(error));

    setIsApiInitialized(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!value.isApiInitialized) {
    return null;
  }

  return (
    <ApiContext.Provider value={value}>
      {children}
    </ApiContext.Provider>
  );
}

export default React.memo(Api);
