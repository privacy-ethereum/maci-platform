/* eslint-disable no-console */
import { isAddress, Signer, ZeroAddress } from "ethers";
import { task, types } from "hardhat/config";
import * as z from "zod";

import fs from "fs";

import type { IDistributeArgs } from "../helpers/constants";

const addressSchema = z.string().refine((value) => isAddress(value) && value !== ZeroAddress, {
  message: "Invalid Address",
});

const projectsSchema = z.array(
  z.object({
    recipientIndex: z.coerce.number(),
    payoutAddress: addressSchema,
  }),
);

const amountsSchema = z.array(z.coerce.bigint());

// erc20,0x82aF49447D8a07e3bd95BD0d56f35241523fBab1,receiver,amount

/**
 * Distribute unallocated amounts among the specified projects
 */
task("distribute", "Command to distribute unallocated amounts among the specified projects")
  .addParam("projectsFile", "The file with projects", undefined, types.string)
  .addParam("amountsFile", "The file with amounts in wei to transfer", undefined, types.string)
  .addOptionalParam("tokenAddress", "ERC-20 token address", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", types.string)
  .addOptionalParam("startIndex", "The index of the recipient to start sending transactions from", 0, types.int)
  .addFlag("dryRun", "Run distribute command on fork and impersonate WETH account")
  .setAction(async ({ projectsFile, amountsFile, tokenAddress, startIndex, dryRun }: IDistributeArgs, hre) => {
    const address = addressSchema.parse(tokenAddress);

    const projects = await fs.promises
      .readFile(projectsFile, "utf8")
      .then((result) => projectsSchema.parse(JSON.parse(result)));

    const amounts = await fs.promises
      .readFile(amountsFile, "utf8")
      .then((result) => amountsSchema.parse(JSON.parse(result)));

    if (projects.length !== amounts.length) {
      throw new Error("Projects and amounts arrays must be the same length");
    }

    const data = amounts.map((amount, index) => ({ ...projects[index], amount }));

    let signer: Signer;

    if (dryRun) {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [tokenAddress],
      });

      signer = await hre.ethers.getSigner(tokenAddress);
    } else {
      [signer] = await hre.ethers.getSigners();
    }

    console.log(`Using signer: ${await signer.getAddress()}`);

    const contract = await hre.ethers.getContractAt("IERC20", address, signer);
    const startSignerBalance = await contract.balanceOf(signer);
    const startBalance = await signer.provider!.getBalance(signer);
    const totalAmount = data.reduce((acc, x) => acc + x.amount, 0n);

    console.log(`Total allocated: ${totalAmount.toString()} wei`);
    console.log(`Signer balance: ${startBalance.toString()} wei`);
    console.log(`Signer token balance: ${startSignerBalance.toString()} wei`);

    if (startSignerBalance <= totalAmount) {
      throw new Error("Not enough balance");
    }

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = startIndex; index < data.length; index += 1) {
      const { payoutAddress, amount } = data[index];

      console.log(`Recipeint ${index}: transferring ${amount} wei to ${payoutAddress}`);

      // eslint-disable-next-line no-await-in-loop
      const receipt = await contract.transfer(payoutAddress, amount).then((tx) => tx.wait());

      console.log(`Sent ${amount} wei to ${payoutAddress} (recipient index ${index}) (tx: ${receipt?.hash})\n`);
    }

    const endSignerBalance = await contract.balanceOf(signer);
    const endBalance = await signer.provider!.getBalance(signer);

    const totalTransferred = startSignerBalance - endSignerBalance;

    if (totalAmount !== totalTransferred) {
      console.warn(
        `Transferred amount (${totalTransferred} wei) doesn't match with total allocated amount (${totalAmount} wei)`,
      );
    }

    console.log(`Total transferred: ${totalTransferred.toString()} wei`);
    console.log(`Signer balance: ${endBalance.toString()} wei`);
    console.log(`Signer token balance: ${endSignerBalance.toString()} wei`);
    console.log(`Total transaction cost: ${(startBalance - endBalance).toString()} wei`);
  });
