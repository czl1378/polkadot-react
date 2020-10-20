import React, { useEffect, useMemo, useState } from 'react';

import ApiPromise from '@polkadot/api/promise';
import { TypeRegistry } from '@polkadot/types';
import { formatBalance, isTestChain } from '@polkadot/util';
import { WsProvider } from '@polkadot/rpc-provider';
import { web3Accounts, web3Enable } from '@polkadot/extension-dapp';

import ApiContext from './ApiContext';

import { ApiState, ApiProps } from './types';

interface Props {
  children: React.ReactNode;
  url?: string;
  onReady?: (any) => void;
  customTypes?: Record<string, Record<string, string>>;
}

const registry = new TypeRegistry();

export const DEFAULT_DECIMALS = registry.createType('u32', 15);

let api: ApiPromise;

export { api };

async function retrieve (api: ApiPromise, injectedPromise: Promise<any>): Promise<any> {
  const [chainProperties, systemChain, systemChainType, systemName, systemVersion, injectedAccounts] = await Promise.all([
    api.rpc.system.properties(),
    api.rpc.system.chain(),
    api.rpc.system.chainType
      ? api.rpc.system.chainType()
      : Promise.resolve(registry.createType('ChainType', 'Live')),
    api.rpc.system.name(),
    api.rpc.system.version(),
    injectedPromise
      .then(() => web3Accounts())
      .then((accounts) => accounts.map(({ address, meta }, whenCreated): any => ({
        address,
        meta: {
          ...meta,
          name: `${meta.name || 'unknown'} (${meta.source === 'polkadot-js' ? 'extension' : meta.source})`,
          whenCreated
        }
      })))
      .catch((error) => {
        console.error('web3Enable', error);

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

async function loadOnReady (api: ApiPromise, injectedPromise: Promise<any>): Promise<any> {
  
  const { injectedAccounts, properties, systemChain, systemChainType, systemName, systemVersion } = await retrieve(api, injectedPromise);
 
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
    injectedAccounts,
    apiDefaultTx,
    apiDefaultTxSudo,
    isApiReady: true,
    isDevelopment,
    isSubstrateV2,
    systemChain,
    systemName,
    systemVersion,
    properties
  };
}

function Api ({ children, url, onReady, customTypes }: Props): React.ReactElement<any> | null {
 
  const [state, setState] = useState<ApiState>({ isApiReady: false } as unknown as ApiState);
  const [isApiConnected, setIsApiConnected] = useState(false);
  const [isApiInitialized, setIsApiInitialized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [extensions, setExtensions] = useState<any>();
  const value = useMemo<ApiProps>(
    () => ({ 
      ...state, api, extensions, isApiConnected, isApiInitialized, 
      isWaitingInjected: !extensions, errorMessage, 
    }),
    [extensions, isApiConnected, isApiInitialized, state, errorMessage]
  );

  // initial initialization
  useEffect((): void => {
    const provider = new WsProvider(url);
   
    api = new ApiPromise({ provider, registry, types: customTypes });

    api.on('connected', () => setIsApiConnected(true));
    api.on('disconnected', () => setIsApiConnected(false));
    api.on('error', (err) => {
      console.error('Api error', err);
      setErrorMessage(err.toString());
      setIsApiConnected(false);
    });
    api.on('ready', (): void => {
      const injectedPromise = web3Enable('polkadot-js/apps');

      injectedPromise
        .then(setExtensions)
        .catch(console.error);

      loadOnReady(api, injectedPromise)
        .then((state) => {
          setState(state);
          onReady && onReady({
            ...state, registry, api
          });
        })
        .catch((error) => {
          setErrorMessage(error.toString());
          console.error('Unable to load chain', error);
        });

    });

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
