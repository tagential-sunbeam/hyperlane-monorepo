import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

import { TestRecipient__factory } from '@hyperlane-xyz/core';
import {
  ChainMap,
  ChainNameToDomainId,
  MultiProvider,
  RouterConfig,
  TestChainNames,
  TestCoreApp,
  TestCoreDeployer,
  getChainToOwnerMap,
  getTestMultiProvider,
  testChainConnectionConfigs,
} from '@hyperlane-xyz/sdk';

import { InterchainAccountDeployer } from '../src/deploy';
import { InterchainAccountRouter } from '../types';

describe('InterchainAccountRouter', async () => {
  const localChain = 'test1';
  const remoteChain = 'test2';
  const localDomain = ChainNameToDomainId[localChain];
  const remoteDomain = ChainNameToDomainId[remoteChain];

  let signer: SignerWithAddress;
  let local: InterchainAccountRouter;
  let remote: InterchainAccountRouter;
  let multiProvider: MultiProvider<TestChainNames>;
  let coreApp: TestCoreApp;
  let config: ChainMap<TestChainNames, RouterConfig>;

  before(async () => {
    [signer] = await ethers.getSigners();

    multiProvider = getTestMultiProvider(signer);

    const coreDeployer = new TestCoreDeployer(multiProvider);
    const coreContractsMaps = await coreDeployer.deploy();
    coreApp = new TestCoreApp(coreContractsMaps, multiProvider);
    config = coreApp.extendWithConnectionClientConfig(
      getChainToOwnerMap(testChainConnectionConfigs, signer.address),
    );
  });

  beforeEach(async () => {
    const InterchainAccount = new InterchainAccountDeployer(
      multiProvider,
      config,
      coreApp,
    );
    const contracts = await InterchainAccount.deploy();

    local = contracts[localChain].router;
    remote = contracts[remoteChain].router;
  });

  it('forwards calls from interchain account', async () => {
    const recipientF = new TestRecipient__factory(signer);
    const recipient = await recipientF.deploy();
    const fooMessage = 'Test';
    const data = recipient.interface.encodeFunctionData('fooBar', [
      1,
      fooMessage,
    ]);
    const icaAddress = await remote.getInterchainAccount(
      localDomain,
      signer.address,
    );
    await local.dispatch(remoteDomain, [{ to: recipient.address, data }]);
    await coreApp.processMessages();
    expect(await recipient.lastCallMessage()).to.eql(fooMessage);
    expect(await recipient.lastCaller()).to.eql(icaAddress);
  });
});
