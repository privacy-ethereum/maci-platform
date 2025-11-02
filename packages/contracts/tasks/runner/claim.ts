/* eslint-disable no-console */
import { task, types } from "hardhat/config";
import { ContractStorage, Deployment, type TallyData } from "maci-contracts";
import { genTreeProof } from "maci-crypto";

import fs from "fs";

import { type MACI, type Poll, type Tally } from "../../typechain-types";
import { EContracts } from "../helpers/constants";

/**
 * Interface that represents claim task arguments
 */
interface IClaimParams {
  poll: string;
  tallyFile: string;
  index: number;
}

/**
 * Claim hardhat task for claiming payout for a specific project
 */
task("claim", "Command to claim payout for a project")
  .addParam("poll", "The poll id", undefined, types.string)
  .addParam("tallyFile", "The file containing the tally data", undefined, types.string)
  .addParam("index", "The index of the project to claim for", undefined, types.int)
  .setAction(async ({ poll, tallyFile, index }: IClaimParams, hre) => {
    const deployment = Deployment.getInstance();

    deployment.setHre(hre);
    deployment.setContractNames(EContracts);

    const storage = ContractStorage.getInstance();
    const signer = await deployment.getDeployer();
    const { network } = hre;

    const startBalance = await signer.provider.getBalance(signer);

    console.log("Start balance: ", Number(startBalance / 10n ** 12n) / 1e6);

    const {
      MACI__factory: MACIFactory,
      Poll__factory: PollFactory,
      Tally__factory: TallyFactory,
    } = await import("../../typechain-types");

    // Get MACI contract
    const maciContractAddress = storage.mustGetAddress(EContracts.MACI, network.name);
    const maciContract = await deployment.getContract<MACI>({
      name: EContracts.MACI,
      address: maciContractAddress,
      abi: MACIFactory.abi,
    });

    // Get Poll and Tally contracts
    const pollContracts = await maciContract.polls(poll);
    const [pollContract, tallyContract] = await Promise.all([
      deployment.getContract<Poll>({
        name: EContracts.Poll,
        address: pollContracts.poll,
        abi: PollFactory.abi,
      }),
      deployment.getContract<Tally>({
        name: EContracts.Tally,
        address: pollContracts.tally,
        abi: TallyFactory.abi,
      }),
    ]);

    // Check if already claimed
    const isClaimed = await tallyContract.claimed(index);

    if (isClaimed) {
      throw new Error(`Project at index ${index} has already claimed their payout`);
    }

    // Read tally data from file
    if (!fs.existsSync(tallyFile)) {
      throw new Error(`Tally file ${tallyFile} does not exist`);
    }

    const tallyData = await fs.promises
      .readFile(tallyFile, "utf8")
      .then((result) => JSON.parse(result) as unknown as TallyData);

    // Get tree depths from poll contract
    const treeDepths = await pollContract.treeDepths();
    const voteOptionTreeDepth = Number(treeDepths[3]);

    // Prepare claim parameters
    const tallyResults = tallyData.results.tally.map((x) => BigInt(x));

    // Validate index
    if (index < 0 || index >= tallyResults.length) {
      throw new Error(`Invalid project index ${index}. Must be between 0 and ${tallyResults.length - 1}`);
    }

    // Generate merkle proof for the tally result
    const tallyResultProof = genTreeProof(index, tallyResults, voteOptionTreeDepth);

    const claimParams = {
      index,
      voiceCreditsPerOption: tallyData.perVOSpentVoiceCredits!.tally[index],
      tallyResultProof,
      tallyResultSalt: tallyData.results.salt,
      voteOptionTreeDepth,
      spentVoiceCreditsHash: tallyData.totalSpentVoiceCredits.commitment,
      perVOSpentVoiceCreditsHash: tallyData.perVOSpentVoiceCredits!.commitment,
    };

    console.log(`\nClaiming payout for project at index ${index}...`);
    console.log(`Tally result: ${tallyResults[index]}`);
    console.log(`Voice credits per option: ${claimParams.voiceCreditsPerOption}`);

    // Get allocated amount before claiming
    const allocatedAmount = await tallyContract.getAllocatedAmount(
      claimParams.index,
      claimParams.voiceCreditsPerOption,
    );

    console.log(`Allocated amount: ${allocatedAmount.toString()}`);

    // Execute claim transaction
    const tx = await tallyContract.claim(claimParams);
    const receipt = await tx.wait();

    if (receipt?.status === 1) {
      console.log(`\n✅ Successfully claimed payout for project at index ${index}`);
      console.log(`Transaction hash: ${receipt.hash}`);
      console.log(`Amount claimed: ${allocatedAmount.toString()}`);
    } else {
      console.log(`\n❌ Claim transaction failed`);
    }

    const endBalance = await signer.provider.getBalance(signer);

    console.log("\nEnd balance: ", Number(endBalance / 10n ** 12n) / 1e6);
    console.log("Claim expenses: ", Number((startBalance - endBalance) / 10n ** 12n) / 1e6);
  });
