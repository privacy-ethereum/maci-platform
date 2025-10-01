/* eslint-disable no-underscore-dangle */
import { BigInt as GraphBN, Bytes, ethereum, Address } from "@graphprotocol/graph-ts";

import {
  Account,
  Claim,
  Deposit,
  MACI,
  Recipient,
  Registry,
  RegistryManager,
  TallyResult,
  Tally,
  User,
} from "../../generated/schema";
import { Registry as RegistryTemplate } from "../../generated/templates";

export const createOrLoadMACI = (event: ethereum.Event, stateTreeDepth: GraphBN = GraphBN.fromI32(10)): MACI => {
  let maci = MACI.load(event.address);

  if (!maci) {
    maci = new MACI(event.address);
    maci.stateTreeDepth = stateTreeDepth;
    maci.updatedAt = event.block.timestamp;
    maci.numPoll = GraphBN.zero();
    maci.numSignUps = GraphBN.zero();
    maci.latestPoll = Bytes.empty();
    maci.save();
  }

  return maci;
};

export const createOrLoadRegistryManager = (event: ethereum.Event): RegistryManager => {
  let registryManager = RegistryManager.load(event.address);

  if (!registryManager) {
    registryManager = new RegistryManager(event.address);
    registryManager.save();
  }

  return registryManager;
};

export const createOrLoadUser = (publicKeyX: GraphBN, publicKeyY: GraphBN, event: ethereum.Event): User => {
  const publicKey = `${publicKeyX.toString()} ${publicKeyY.toString()}`;
  let user = User.load(publicKey);

  if (!user) {
    user = new User(publicKey);
    user.createdAt = event.block.timestamp;
    user.save();
  }

  return user;
};

export const createOrLoadAccount = (
  stateIndex: GraphBN,
  event: ethereum.Event,
  owner: string,
  voiceCreditBalance: GraphBN = GraphBN.zero(),
): Account => {
  const id = stateIndex.toString();
  let account = Account.load(id);

  if (!account) {
    account = new Account(id);
    account.owner = owner;
    account.voiceCreditBalance = voiceCreditBalance;
    account.createdAt = event.block.timestamp;
    account.save();
  }

  return account;
};

export const createOrLoadRegistry = (id: Address): Registry => {
  let registry = Registry.load(id);

  if (!registry) {
    registry = new Registry(id);
    registry.save();
    RegistryTemplate.create(id);
  }

  return registry;
};

export const createOrLoadRecipient = (
  id: Bytes,
  metadataUrl: string,
  index: GraphBN,
  payout: Address,
  registry: Address,
): Recipient => {
  createOrLoadRegistry(registry);
  let recipient = Recipient.load(id);

  if (!recipient) {
    recipient = new Recipient(id);
    recipient.metadataUrl = metadataUrl;
    recipient.index = index;
    recipient.payout = payout;
    recipient.registry = registry;
    recipient.initialized = false;
    recipient.deleted = false;
    recipient.save();
  }

  return recipient;
};

export const createOrLoadTally = (tally: Bytes, poll: Bytes, depositWindow: GraphBN): Tally => {
  let entity = Tally.load(tally);

  if (!entity) {
    entity = new Tally(tally);
    entity.poll = poll;
    entity.depositWindow = depositWindow;
    entity.save();
  }

  return entity;
};

export const createOrLoadDeposit = (sender: Bytes, amount: GraphBN, tally: Bytes): Deposit => {
  let deposit = Deposit.load(sender);

  if (!deposit) {
    deposit = new Deposit(sender);
    deposit.amount = amount;
    deposit.tally = tally;
    deposit.save();
  }

  return deposit;
};

export const createOrLoadClaim = (index: GraphBN, recipient: Bytes, amount: GraphBN, tally: Bytes): Claim => {
  let claim = Claim.load(index.toString());

  if (!claim) {
    claim = new Claim(index.toString());
    claim.recipient = recipient;
    claim.amount = amount;
    claim.tally = tally;
    claim.save();
  }

  return claim;
};

export const createOrLoadTallyResult = (index: GraphBN, result: GraphBN, tally: Bytes): TallyResult => {
  // Create composite key by combining tally address and index
  const compositeId = `${tally.toHexString()}-${index.toString()}`;
  let tallyResult = TallyResult.load(compositeId);

  if (!tallyResult) {
    tallyResult = new TallyResult(compositeId);
    tallyResult.result = result;
    tallyResult.tally = tally;
    tallyResult.save();
  }

  return tallyResult;
};
