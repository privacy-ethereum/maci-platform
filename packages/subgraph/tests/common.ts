import { Address, ethereum, BigInt } from "@graphprotocol/graph-ts";
// eslint-disable-next-line import/no-extraneous-dependencies
import { createMockedFunction } from "matchstick-as";

export const DEFAULT_POLL_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000001");

export const DEFAULT_MESSAGE_PROCESSOR_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000002");

export const DEFAULT_TALLY_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000003");

export const DEFAULT_REGISTRY_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000004");

export const DEFAULT_REGISTRY_MANAGER_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000005");

export const DEFAULT_PAYOUT_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000006");

export function mockPollContract(): void {
  createMockedFunction(DEFAULT_POLL_ADDRESS, "treeDepths", "treeDepths():(uint8,uint8,uint8,uint8)").returns([
    ethereum.Value.fromI32(1),
    ethereum.Value.fromI32(2),
    ethereum.Value.fromI32(3),
    ethereum.Value.fromI32(4),
  ]);

  createMockedFunction(
    DEFAULT_POLL_ADDRESS,
    "getDeployTimeAndDuration",
    "getDeployTimeAndDuration():(uint256,uint256)",
  ).returns([ethereum.Value.fromI32(30), ethereum.Value.fromI32(40)]);
}

export function mockRegistryContract(): void {
  createMockedFunction(DEFAULT_REGISTRY_ADDRESS, "getRegistryMetadataUrl", "getRegistryMetadataUrl():(string)").returns(
    [ethereum.Value.fromString("url")],
  );
}

export function mockMaciContract(): void {
  createMockedFunction(
    Address.fromString("0xA16081F360e3847006dB660bae1c6d1b2e17eC2A"),
    "getPoll",
    "getPoll(uint256):((address,address,address))",
  )
    .withArgs([ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(1))])
    .returns([
      ethereum.Value.fromTuple(
        changetype<ethereum.Tuple>([
          ethereum.Value.fromAddress(DEFAULT_POLL_ADDRESS),
          ethereum.Value.fromAddress(DEFAULT_MESSAGE_PROCESSOR_ADDRESS),
          ethereum.Value.fromAddress(DEFAULT_TALLY_ADDRESS),
        ]),
      ),
    ]);
}

export function mockRegistryManager(): void {
  createMockedFunction(DEFAULT_REGISTRY_MANAGER_ADDRESS, "requestCount", "requestCount():(uint256)").returns([
    ethereum.Value.fromI32(1),
  ]);
}

export function mockTallyContract(): void {
  createMockedFunction(DEFAULT_TALLY_ADDRESS, "poll", "poll():(address)").returns([
    ethereum.Value.fromAddress(DEFAULT_POLL_ADDRESS),
  ]);

  createMockedFunction(DEFAULT_TALLY_ADDRESS, "depositWindow", "depositWindow():(uint256)").returns([
    ethereum.Value.fromI32(604800), // 1 week in seconds
  ]);
}
