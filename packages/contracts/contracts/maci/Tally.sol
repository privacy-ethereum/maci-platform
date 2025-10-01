// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Tally as TallyBase } from "maci-contracts/contracts/Tally.sol";
import { ITally as ITallyBase } from "maci-contracts/contracts/interfaces/ITally.sol";

import { IPoll } from "../interfaces/IPoll.sol";
import { IPayoutStrategy } from "../interfaces/IPayoutStrategy.sol";
import { IRecipientRegistry } from "../interfaces/IRecipientRegistry.sol";

/// @title Tally - poll tally and payout strategy
/// @notice The Tally contract is used during votes tallying and by users to verify the tally results.
/// @notice Allows users to deposit and claim rewards for recipients
contract Tally is TallyBase, IPayoutStrategy, Pausable {
  using SafeERC20 for IERC20;

  /// @notice The max voice credits (MACI allows 2 ** 32 voice credits max)
  uint256 private constant MAX_VOICE_CREDITS = 10 ** 9;

  /// @notice The alpha precision (needed for allocated amount calculation)
  uint256 private constant ALPHA_PRECISION = 10 ** 18;

  /// @notice The payout token
  IERC20 public token;

  /// @notice The poll registry
  IRecipientRegistry public registry;

  /// @notice The max cap
  uint256 public maxCap;

  /// @notice The voice credit factor (needed for allocated amount calculation)
  uint256 public voiceCreditFactor;

  /// @notice The deposit window duration (in seconds) after poll ends
  uint256 public depositWindow;

  /// @notice The sum of tally result squares
  uint256 public totalVotesSquares;

  /// @notice The alpha used in quadratic funding formula
  uint256 public alpha;

  /// @notice Fixed recipient count for claim
  uint256 public recipientCount;

  /// @notice Track claims
  mapping(uint256 => bool) public claimed;

  /// @notice Initialized or not
  bool internal initialized;

  /// @notice events
  event Deposited(address indexed sender, uint256 indexed amount);
  event Claimed(uint256 indexed index, address indexed receiver, uint256 indexed amount);
  event ResultAdded(uint256 indexed index, uint256 indexed result);

  /// @notice custom errors
  error InvalidBudget();
  error NoProjectHasMoreThanOneVote();
  error AlreadyInitialized();
  error NotInitialized();
  error NotCompletedResults();
  error TooManyResults();
  error AlreadyClaimed();
  error DepositWindowClosed();
  error DepositWindowNotClosed();

  /// @notice Create a new Tally contract
  /// @param verifierContract The Verifier contract
  /// @param vkRegistryContract The VkRegistry contract
  /// @param pollContract The Poll contract
  /// @param mpContract The MessageProcessor contract
  /// @param tallyOwner The owner of the Tally contract
  /// @param pollMode The mode of the poll
  constructor(
    address verifierContract,
    address vkRegistryContract,
    address pollContract,
    address mpContract,
    address tallyOwner,
    Mode pollMode
  ) payable TallyBase(verifierContract, vkRegistryContract, pollContract, mpContract, tallyOwner, pollMode) {}

  /// @notice A modifier that causes the function to revert if the tallying is not over
  modifier afterTallying() {
    if (!isTallied() || tallyBatchNum == 0) {
      revert VotesNotTallied();
    }

    _;
  }

  /// @notice A modifier that causes the function to revert if not within deposit window
  modifier duringDepositWindow() {
    if (!isTallied() || tallyBatchNum == 0) {
      revert VotesNotTallied();
    }

    (uint256 deployTime, uint256 duration) = poll.getDeployTimeAndDuration();
    uint256 depositWindowEnd = deployTime + duration + depositWindow;

    if (block.timestamp > depositWindowEnd) {
      revert DepositWindowClosed();
    }

    _;
  }

  /// @notice A modifier that causes the function to revert if deposit window is not closed
  modifier afterDepositWindow() {
    if (!isTallied() || tallyBatchNum == 0) {
      revert VotesNotTallied();
    }

    (uint256 deployTime, uint256 duration) = poll.getDeployTimeAndDuration();
    uint256 depositWindowEnd = deployTime + duration + depositWindow;

    if (block.timestamp <= depositWindowEnd) {
      revert DepositWindowNotClosed();
    }

    _;
  }

  /// @notice A modifier that causes the function to revert if the strategy is not initialized
  modifier isInitialized() {
    if (!initialized) {
      revert NotInitialized();
    }

    _;
  }

  /// @notice Initialize tally with strategy params
  /// @param params The strategy initialization params
  function init(IPayoutStrategy.StrategyInit calldata params) public onlyOwner {
    if (initialized) {
      revert AlreadyInitialized();
    }

    initialized = true;
    registry = IPoll(address(poll)).getRegistry();
    token = IERC20(params.payoutToken);
    maxCap = params.maxCap;
    depositWindow = params.depositWindow;
    voiceCreditFactor = params.maxContribution / MAX_VOICE_CREDITS;
    voiceCreditFactor = voiceCreditFactor > 0 ? voiceCreditFactor : 1;
  }

  /// @notice Pause contract calls (deposit, claim, withdraw)
  function pause() public onlyOwner {
    _pause();
  }

  /// @notice Unpause contract calls (deposit, claim, withdraw)
  function unpause() public onlyOwner {
    _unpause();
  }

  /// @inheritdoc IPayoutStrategy
  function deposit(uint256 amount) public isInitialized whenNotPaused duringDepositWindow {
    emit Deposited(msg.sender, amount);

    token.safeTransferFrom(msg.sender, address(this), amount);
  }

  /// @inheritdoc IPayoutStrategy
  function totalAmount() public view override returns (uint256) {
    return token.balanceOf(address(this));
  }

  /// @inheritdoc TallyBase
  function addTallyResults(ITallyBase.AddTallyResultsArgs calldata args) public override isInitialized onlyOwner {
    if (recipientCount == 0) {
      recipientCount = registry.recipientCount();
    }

    if (recipientCount == totalTallyResults) {
      revert TooManyResults();
    }

    super.addTallyResults(args);

    if (recipientCount < totalTallyResults) {
      revert TooManyResults();
    }
  }

  /// @inheritdoc TallyBase
  function addTallyResult(
    uint256 voteOptionIndex,
    uint256 tallyResult,
    uint256[][] calldata tallyResultProof,
    uint256 tallyResultSalt,
    uint256 spentVoiceCreditsHash,
    uint256 perVOSpentVoiceCreditsHash,
    uint8 voteOptionTreeDepth
  ) internal override {
    super.addTallyResult(
      voteOptionIndex,
      tallyResult,
      tallyResultProof,
      tallyResultSalt,
      spentVoiceCreditsHash,
      perVOSpentVoiceCreditsHash,
      voteOptionTreeDepth
    );

    totalVotesSquares += tallyResult ** 2;

    emit ResultAdded(voteOptionIndex, tallyResult);
  }

  /// @inheritdoc IPayoutStrategy
  function claim(IPayoutStrategy.Claim calldata params) public override isInitialized whenNotPaused afterDepositWindow {
    if (alpha == 0) {
      alpha = calculateAlpha(totalAmount());
    }

    uint256 tallyResult = tallyResults[params.index].value;
    uint256 amount = getAllocatedAmount(params.index, params.voiceCreditsPerOption);

    IRecipientRegistry.Recipient memory recipient = registry.getRecipient(params.index);

    emit Claimed(params.index, recipient.recipient, amount);

    if (claimed[params.index]) {
      revert AlreadyClaimed();
    }

    claimed[params.index] = true;

    bool isValid = verifyTallyResult(
      params.index,
      tallyResult,
      params.tallyResultProof,
      params.tallyResultSalt,
      params.voteOptionTreeDepth,
      params.spentVoiceCreditsHash,
      params.perVOSpentVoiceCreditsHash
    );

    if (!isValid) {
      revert InvalidTallyVotesProof();
    }

    token.safeTransfer(recipient.recipient, amount);
  }

  /// @notice Get allocated token amounts (without verification).
  /// @param voiceCreditsPerOptions The voice credit options received for recipient
  function getAllocatedAmounts(
    uint256[] calldata voiceCreditsPerOptions
  ) public view afterTallying returns (uint256[] memory amounts) {
    uint256 length = voiceCreditsPerOptions.length;
    amounts = new uint256[](length);

    for (uint256 index = 0; index < length; ) {
      amounts[index] = getAllocatedAmount(index, voiceCreditsPerOptions[index]);

      unchecked {
        index++;
      }
    }

    return amounts;
  }

  /// @notice Get allocated token amount (without verification).
  /// @param index The vote option index
  /// @param voiceCreditsPerOption The voice credit options received for recipient
  function getAllocatedAmount(
    uint256 index,
    uint256 voiceCreditsPerOption
  ) public view afterTallying returns (uint256) {
    uint256 tallyResult = tallyResults[index].value;
    uint256 quadratic = alpha * voiceCreditFactor * tallyResult * tallyResult;
    uint256 totalSpentCredits = voiceCreditFactor * voiceCreditsPerOption;
    uint256 linearPrecision = ALPHA_PRECISION * totalSpentCredits;
    uint256 linearAlpha = alpha * totalSpentCredits;

    uint256 amount = ((quadratic + linearPrecision) - linearAlpha) / ALPHA_PRECISION;

    return amount > maxCap ? maxCap : amount;
  }

  /// @notice Calculate the alpha for the capital constrained quadratic formula
  /// @dev page 17 of https://arxiv.org/pdf/1809.06421.pdf
  /// @param budget The total budget for the recipients
  function calculateAlpha(uint256 budget) public view afterTallying returns (uint256) {
    uint256 contributions = totalSpent * voiceCreditFactor;

    if (budget < contributions) {
      revert InvalidBudget();
    }

    if (totalVotesSquares <= totalSpent) {
      revert NoProjectHasMoreThanOneVote();
    }

    if (recipientCount != totalTallyResults) {
      revert NotCompletedResults();
    }

    return ((budget - contributions) * ALPHA_PRECISION) / (voiceCreditFactor * (totalVotesSquares - totalSpent));
  }
}
