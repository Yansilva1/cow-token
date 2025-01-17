import type { TransactionResponse } from "@ethersproject/abstract-provider";
import type { MetaTransaction } from "@gnosis.pm/safe-contracts";
import type { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import {
  BigNumber,
  BigNumberish,
  BytesLike,
  constants,
  Signer,
  utils,
} from "ethers";

import { SafeOperation, multisend } from "./deploy/safe";

/**
 * The salt used when deterministically deploying smart contracts.
 */
export const SALT = utils.formatBytes32String("Mattresses in Berlin!");

/**
 * The contract used to deploy contracts deterministically with CREATE2.
 * The address is chosen by the hardhat-deploy library.
 * It is the same in any EVM-based network.
 *
 * https://github.com/Arachnid/deterministic-deployment-proxy
 */
export const DEPLOYER_CONTRACT = "0x4e59b44847b379578588920ca78fbf26c0b4956c";

/**
 * The information needed to deploy a contract.
 */
export interface DeterministicDeploymentInfo {
  /**
   * The *deployment* bytecode for the contract.
   */
  bytecode: BytesLike;
  /**
   * Deterministic deployment salt, defaults to the zero word if none is
   * specified.
   */
  salt?: BytesLike;
}

export interface RealTokenDeployParams {
  cowDao: string;
  totalSupply: BigNumberish;
}

export interface VirtualTokenDeployParams {
  merkleRoot: string;
  realToken: string;
  communityFundsTarget: string;
  investorFundsTarget: string;
  usdcToken: string;
  usdcPrice: BigNumberish;
  gnoToken: string;
  gnoPrice: BigNumberish;
  wethToken: string;
  wethPrice: BigNumberish;
  teamController: string;
}

export enum ContractName {
  RealToken = "CowSwapToken",
  VirtualToken = "CowSwapVirtualToken",
}
export interface DeployParams {
  [ContractName.RealToken]: RealTokenDeployParams;
  [ContractName.VirtualToken]: VirtualTokenDeployParams;
}
export type ContructorInput = {
  [ContractName.RealToken]: [string, BigNumberish];
  [ContractName.VirtualToken]: [
    string,
    string,
    string,
    string,
    string,
    BigNumber,
    string,
    BigNumber,
    string,
    BigNumber,
    string,
  ];
};

export function constructorInput<T extends ContractName>(
  contract: T,
  params: DeployParams[T],
): ContructorInput[T] {
  // Note: the type signature of the function should be enough to guarantee that
  // the type assertions are correct. Not sure why this isn't done automatically
  // by TS.
  switch (contract) {
    case ContractName.RealToken: {
      const { cowDao, totalSupply } =
        params as DeployParams[ContractName.RealToken];
      const result: ContructorInput[ContractName.RealToken] = [
        cowDao,
        totalSupply,
      ];
      return result as ContructorInput[T];
    }
    case ContractName.VirtualToken: {
      const {
        merkleRoot,
        realToken,
        communityFundsTarget,
        investorFundsTarget,
        usdcToken,
        usdcPrice,
        gnoToken,
        gnoPrice,
        wethToken,
        wethPrice,
        teamController,
      } = params as DeployParams[ContractName.VirtualToken];
      const result: ContructorInput[ContractName.VirtualToken] = [
        merkleRoot,
        realToken,
        communityFundsTarget,
        investorFundsTarget,
        usdcToken,
        BigNumber.from(usdcPrice),
        gnoToken,
        BigNumber.from(gnoPrice),
        wethToken,
        BigNumber.from(wethPrice),
        teamController,
      ];
      return result as ContructorInput[T];
    }
    default: {
      throw new Error(`Invalid contract name: ${contract}`);
    }
  }
}

export interface DeterministicDeploymentTransaction {
  data: string;
  to: string;
}

export async function deterministicallyDeploy(
  deploymentInfo: DeterministicDeploymentInfo,
  sender: Signer,
): Promise<TransactionResponse> {
  return await sender.sendTransaction(
    deterministicDeploymentTransaction(deploymentInfo),
  );
}

export function deterministicDeploymentTransaction({
  bytecode,
  salt,
}: DeterministicDeploymentInfo): DeterministicDeploymentTransaction {
  salt = utils.arrayify(salt ?? utils.hexZeroPad("0x", 32));
  if (salt.length != 32) {
    throw new Error("Deterministic deployment salt must have 32 bytes");
  }
  return {
    to: DEPLOYER_CONTRACT,
    data: utils.hexConcat([salt, bytecode]),
  };
}

export function deterministicDeploymentAddress({
  bytecode,
  salt,
}: DeterministicDeploymentInfo): string {
  salt = utils.arrayify(salt ?? utils.hexZeroPad("0x", 32));
  return utils.getCreate2Address(
    DEPLOYER_CONTRACT,
    salt,
    utils.keccak256(bytecode),
  );
}

function deterministicDeploymentToSafeTransaction(
  deploymentInfo: DeterministicDeploymentInfo,
): MetaTransaction {
  return {
    value: constants.Zero,
    operation: SafeOperation.Call,
    ...deterministicDeploymentTransaction(deploymentInfo),
  };
}

async function getDeploymentTransaction<T extends ContractName>(
  contract: T,
  params: DeployParams[T],
  ethers: HardhatEthersHelpers,
  salt?: string,
): Promise<{ safeTransaction: MetaTransaction; address: string }> {
  const factory = await ethers.getContractFactory(contract);
  const deployTransaction = factory.getDeployTransaction(
    ...constructorInput(contract, params),
  );
  if (deployTransaction.data === undefined) {
    throw new Error(
      `Unable to determine deployment transaction for contract ${contract}`,
    );
  }
  const deployment = { bytecode: deployTransaction.data, salt };
  const safeTransaction = deterministicDeploymentToSafeTransaction(deployment);
  const address = deterministicDeploymentAddress(deployment);
  return { safeTransaction, address };
}

export async function prepareSafeDeployment(
  realTokenDeployParams: RealTokenDeployParams,
  virtualTokenDeployParams: Omit<VirtualTokenDeployParams, "realToken">,
  multisendAddress: string,
  ethers: HardhatEthersHelpers,
  salt?: string,
): Promise<{
  realTokenDeployTransaction: MetaTransaction;
  virtualTokenDeployTransaction: MetaTransaction;
  deployTransaction: MetaTransaction;
  realTokenAddress: string;
  virtualTokenAddress: string;
}> {
  const { safeTransaction: realTokenDeployment, address: realTokenAddress } =
    await getDeploymentTransaction(
      ContractName.RealToken,
      realTokenDeployParams,
      ethers,
      salt,
    );
  const {
    safeTransaction: virtualTokenDeployment,
    address: virtualTokenAddress,
  } = await getDeploymentTransaction(
    ContractName.VirtualToken,
    { ...virtualTokenDeployParams, realToken: realTokenAddress },
    ethers,
    salt,
  );

  return {
    realTokenDeployTransaction: realTokenDeployment,
    virtualTokenDeployTransaction: virtualTokenDeployment,
    deployTransaction: multisend(
      [realTokenDeployment, virtualTokenDeployment],
      multisendAddress,
    ),
    realTokenAddress,
    virtualTokenAddress,
  };
}
