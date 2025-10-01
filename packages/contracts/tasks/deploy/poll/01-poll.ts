/* eslint-disable no-console */
import { ZeroAddress } from "ethers";
import { ContractStorage, Deployment, EMode, MockERC20__factory as MockERC20Factory } from "maci-contracts";
import { PubKey } from "maci-domainobjs";

import { type Poll, type MACI, type Tally } from "../../../typechain-types";
import {
  EContracts,
  EDeploySteps,
  REGISTRY_TYPES,
  TRegistryManager,
  TRegistry,
  ONE_WEEK_IN_SECONDS,
} from "../../helpers/constants";

const deployment = Deployment.getInstance({ contractNames: EContracts });
const storage = ContractStorage.getInstance();

/**
 * Deploy step registration and task itself
 */
deployment.deployTask(EDeploySteps.Poll, "Deploy poll").then((task) =>
  task.setAction(async (_, hre) => {
    deployment.setHre(hre);
    deployment.setContractNames(EContracts);

    const maciContractAddress = storage.getAddress(EContracts.MACI, hre.network.name);
    const verifierContractAddress = storage.getAddress(EContracts.Verifier, hre.network.name);
    const vkRegistryContractAddress = storage.getAddress(EContracts.VkRegistry, hre.network.name);

    if (!maciContractAddress) {
      throw new Error("Need to deploy MACI contract first");
    }

    if (!verifierContractAddress) {
      throw new Error("Need to deploy Verifier contract first");
    }

    if (!vkRegistryContractAddress) {
      throw new Error("Need to deploy VkRegistry contract first");
    }

    const {
      MACI__factory: MACIFactory,
      Poll__factory: PollFactory,
      Tally__factory: TallyFactory,
    } = await import("../../../typechain-types");

    const maciContract = await deployment.getContract<MACI>({ name: EContracts.MACI, abi: MACIFactory.abi });
    const pollId = await maciContract.nextPollId();
    const deployerAddress = await deployment.getDeployer().then((deployer) => deployer.getAddress());

    const coordinatorPubkey = deployment.getDeployConfigField<string>(EContracts.Poll, "coordinatorPubkey");
    const pollDuration = deployment.getDeployConfigField<number>(EContracts.Poll, "pollDuration");
    const intStateTreeDepth = deployment.getDeployConfigField<number>(EContracts.VkRegistry, "intStateTreeDepth");
    const messageTreeSubDepth = deployment.getDeployConfigField<number>(EContracts.VkRegistry, "messageBatchDepth");
    const messageTreeDepth = deployment.getDeployConfigField<number>(EContracts.VkRegistry, "messageTreeDepth");
    const voteOptionTreeDepth = deployment.getDeployConfigField<number>(EContracts.VkRegistry, "voteOptionTreeDepth");

    const useQuadraticVoting =
      deployment.getDeployConfigField<boolean | null>(EContracts.Poll, "useQuadraticVoting") ?? false;
    const unserializedKey = PubKey.deserialize(coordinatorPubkey);
    const mode = useQuadraticVoting ? EMode.QV : EMode.NON_QV;

    const registryManagerType =
      deployment.getDeployConfigField<TRegistryManager | null>(EContracts.MACI, "registryManager") ||
      EContracts.EASRegistryManager;
    const registryManagerAddress = storage.getAddress(registryManagerType, hre.network.name);

    const registryType =
      deployment.getDeployConfigField<TRegistry | null>(EContracts.MACI, "registry") || EContracts.EASRegistry;

    const maxRecipients = deployment.getDeployConfigField<number, keyof typeof EContracts>(
      registryType,
      "maxRecipients",
    );
    const metadataUrl = deployment.getDeployConfigField<string, keyof typeof EContracts>(registryType, "metadataUrl");
    const easAddress = deployment.getDeployConfigField<string, keyof typeof EContracts>(registryType, "easAddress");

    const registryArgs =
      registryType === EContracts.EASRegistry
        ? [maxRecipients, metadataUrl, easAddress, registryManagerAddress]
        : [maxRecipients, metadataUrl, registryManagerAddress];
    const pollRegistry = await deployment.deployContract(
      { name: REGISTRY_TYPES[registryManagerType] },
      ...registryArgs,
    );

    const deployPollReceipt = await maciContract
      .deployPoll(
        pollDuration,
        {
          intStateTreeDepth,
          messageTreeSubDepth,
          messageTreeDepth,
          voteOptionTreeDepth,
        },
        unserializedKey.asContractParam(),
        verifierContractAddress,
        vkRegistryContractAddress,
        mode,
      )
      .then((tx) => tx.wait());

    if (deployPollReceipt?.status !== 1) {
      throw new Error("Deploy poll transaction is failed");
    }

    const pollContracts = await maciContract.getPoll(pollId);
    const pollContractAddress = pollContracts.poll;
    const messageProcessorContractAddress = pollContracts.messageProcessor;
    const tallyContractAddress = pollContracts.tally;

    const pollContract = await deployment.getContract<Poll>({
      name: EContracts.Poll,
      abi: PollFactory.abi,
      address: pollContractAddress,
    });
    const extContracts = await pollContract.extContracts();

    await maciContract
      .setPollRegistry(pollId, await pollRegistry.getAddress())
      .then((transaction) => transaction.wait());

    const messageProcessorContract = await deployment.getContract({
      name: EContracts.MessageProcessor,
      address: messageProcessorContractAddress,
    });

    const tallyContract = await deployment.getContract<Tally>({
      name: EContracts.Tally,
      abi: TallyFactory.abi,
      address: tallyContractAddress,
    });

    const messageAccQueueContract = await deployment.getContract({
      name: EContracts.AccQueueQuinaryMaci,
      address: extContracts[1],
    });

    // get the empty ballot root
    const emptyBallotRoot = await pollContract.emptyBallotRoot();

    const maxContribution = deployment.getDeployConfigField<string>(EContracts.Tally, "maxContribution", true);
    const maxCap = deployment.getDeployConfigField<string>(EContracts.Tally, "maxCap", true);
    const depositWindow =
      deployment.getDeployConfigField<string | null>(EContracts.Tally, "depositWindow") ?? ONE_WEEK_IN_SECONDS;
    const withPause = deployment.getDeployConfigField<boolean | null>(EContracts.Tally, "withPause") ?? true;
    let payoutToken = deployment.getDeployConfigField<string>(EContracts.Tally, "payoutToken", true);

    if (hre.network.name === "localhost") {
      const mockERC20 = await deployment.deployContract(
        { name: EContracts.MockERC20, abi: MockERC20Factory.abi },
        "Token",
        "TEST",
      );
      payoutToken = await mockERC20.getAddress();

      await storage.register({
        id: EContracts.MockERC20,
        key: `poll-${pollId}`,
        contract: mockERC20,
        args: ["Token", "TEST"],
        network: hre.network.name,
      });
    }

    if (payoutToken === ZeroAddress) {
      throw new Error("Payout token is a zero address");
    }

    await tallyContract
      .init({
        maxContribution,
        payoutToken,
        maxCap,
        depositWindow,
      })
      .then((tx) => tx.wait());

    // Need to pause deposits/withdrawals/claims for now
    // When feature is ready, this code can be removed
    if (withPause) {
      await tallyContract.pause().then((tx) => tx.wait());
    }

    await Promise.all([
      storage.register({
        id: EContracts.Poll,
        name: "contracts/maci/Poll.sol:Poll",
        key: `poll-${pollId}`,
        contract: pollContract,
        args: [
          pollDuration,
          {
            intStateTreeDepth,
            messageTreeSubDepth,
            messageTreeDepth,
            voteOptionTreeDepth,
          },
          unserializedKey.asContractParam(),
          extContracts,
          emptyBallotRoot.toString(),
        ],
        network: hre.network.name,
      }),

      storage.register({
        id: REGISTRY_TYPES[registryManagerType],
        key: `poll-${pollId}`,
        contract: pollRegistry,
        args: registryArgs,
        network: hre.network.name,
      }),

      storage.register({
        id: EContracts.MessageProcessor,
        key: `poll-${pollId}`,
        contract: messageProcessorContract,
        args: [verifierContractAddress, vkRegistryContractAddress, pollContractAddress, deployerAddress, mode],
        network: hre.network.name,
      }),

      storage.register({
        id: EContracts.Tally,
        key: `poll-${pollId}`,
        name: "contracts/maci/Tally.sol:Tally",
        contract: tallyContract,
        args: [
          verifierContractAddress,
          vkRegistryContractAddress,
          pollContractAddress,
          messageProcessorContractAddress,
          deployerAddress,
          mode,
        ],
        network: hre.network.name,
      }),

      storage.register({
        id: EContracts.AccQueueQuinaryMaci,
        key: `poll-${pollId}`,
        name: "maci-contracts/contracts/trees/AccQueueQuinaryMaci.sol:AccQueueQuinaryMaci",
        contract: messageAccQueueContract,
        args: [messageTreeSubDepth],
        network: hre.network.name,
      }),
    ]);
  }),
);
