/**
 * Interface that represents distribute hardhat task params
 */
export interface IDistributeArgs {
  /**
   * Project list filepath
   */
  projectsFile: string;

  /**
   * Amounts list filepath
   */
  amountsFile: string;

  /**
   * ERC-20 token address
   */
  tokenAddress: string;

  /**
   * The index of the recipient to start sending transactions from
   */
  startIndex: number;

  /**
   * Whether run command on fork or not
   */
  dryRun: boolean;
}
