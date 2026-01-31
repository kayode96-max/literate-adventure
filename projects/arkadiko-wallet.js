/**
 * Example: Arkadiko Protocol Integration with Wallet Support
 * 
 * This demonstrates how to integrate @stacks/connect for user interactions
 * with the Arkadiko protocol (lending/vaults)
 */

const { sumTokens } = require('./helper/chain/stacks');
const {
  connectWallet,
  executeContractCall,
  callReadOnlyFunction,
  clarityHelpers,
  PostConditionMode,
  makeStandardSTXPostCondition,
  FungibleConditionCode,
} = require('./helper/chain/stacks-connect');

// Arkadiko contract addresses
const ARKADIKO_CONTRACTS = {
  vaultsPool: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-vaults-pool-active-v1-1',
  swap: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-swap-v2-1',
  vaultsManager: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-freddie-v1-1',
  oracle: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-oracle-v2-3',
  dikoToken: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token',
  usdaToken: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token',
};

/**
 * TVL calculation (existing functionality)
 */
async function tvl() {
  return sumTokens({
    owners: [
      'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-vaults-pool-active-v1-1',
      'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-swap-v2-1',
    ],
    blacklistedTokens: [
      'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.wrapped-stx-token::wstx',
      'stacks:SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.arkadiko-token::diko',
      'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token::usda',
    ]
  });
}

/**
 * Get vault information for a user
 * @param {string} userAddress - Stacks address
 * @param {number} vaultId - Vault ID
 */
async function getUserVault(userAddress, vaultId) {
  const [contractAddress, contractName] = ARKADIKO_CONTRACTS.vaultsManager.split('.');
  
  const result = await callReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: 'get-vault-by-id',
    functionArgs: [clarityHelpers.toUint(vaultId)],
    senderAddress: userAddress,
  });
  
  return result;
}

/**
 * Open a new vault (collateralized debt position)
 * @param {Object} params
 * @param {number} params.collateralAmount - Amount of STX to deposit (in microSTX)
 * @param {number} params.debtAmount - Amount of USDA to mint
 * @param {string} params.userAddress - User's Stacks address
 */
async function openVault({ collateralAmount, debtAmount, userAddress }) {
  const [contractAddress, contractName] = ARKADIKO_CONTRACTS.vaultsManager.split('.');

  // Create post-condition to protect user's STX
  const postConditions = [
    makeStandardSTXPostCondition(
      userAddress,
      FungibleConditionCode.LessEqual,
      collateralAmount
    ),
  ];

  return executeContractCall({
    contractAddress,
    contractName,
    functionName: 'collateralize-and-mint',
    functionArgs: [
      clarityHelpers.toUint(collateralAmount),
      clarityHelpers.toUint(debtAmount),
      clarityHelpers.toAscii('STX-A'), // Collateral type
      clarityHelpers.toPrincipal(userAddress),
    ],
    postConditions,
    postConditionMode: PostConditionMode.Deny,
    onFinish: (data) => {
      console.log('Vault opened successfully! TX ID:', data.txId);
      return data;
    },
    onCancel: () => {
      console.log('Vault opening cancelled by user');
    },
  });
}

/**
 * Deposit additional collateral to existing vault
 * @param {Object} params
 * @param {number} params.vaultId - Vault ID
 * @param {number} params.amount - Amount of STX to deposit (in microSTX)
 * @param {string} params.userAddress - User's Stacks address
 */
async function depositCollateral({ vaultId, amount, userAddress }) {
  const [contractAddress, contractName] = ARKADIKO_CONTRACTS.vaultsManager.split('.');

  const postConditions = [
    makeStandardSTXPostCondition(
      userAddress,
      FungibleConditionCode.Equal,
      amount
    ),
  ];

  return executeContractCall({
    contractAddress,
    contractName,
    functionName: 'deposit',
    functionArgs: [
      clarityHelpers.toUint(vaultId),
      clarityHelpers.toUint(amount),
    ],
    postConditions,
    onFinish: (data) => {
      console.log('Collateral deposited! TX ID:', data.txId);
      return data;
    },
  });
}

/**
 * Swap tokens on Arkadiko DEX
 * @param {Object} params
 * @param {string} params.tokenX - Input token contract
 * @param {string} params.tokenY - Output token contract
 * @param {number} params.amountIn - Amount to swap
 * @param {number} params.minAmountOut - Minimum output amount (slippage protection)
 * @param {string} params.userAddress - User's Stacks address
 */
async function swapTokens({ tokenX, tokenY, amountIn, minAmountOut, userAddress }) {
  const [contractAddress, contractName] = ARKADIKO_CONTRACTS.swap.split('.');
  const [tokenXAddress, tokenXName] = tokenX.split('.');
  const [tokenYAddress, tokenYName] = tokenY.split('.');

  return executeContractCall({
    contractAddress,
    contractName,
    functionName: 'swap-x-for-y',
    functionArgs: [
      clarityHelpers.toContract(tokenXAddress, tokenXName),
      clarityHelpers.toContract(tokenYAddress, tokenYName),
      clarityHelpers.toUint(amountIn),
      clarityHelpers.toUint(minAmountOut),
    ],
    postConditions: [], // Add appropriate token post-conditions
    onFinish: (data) => {
      console.log('Swap executed! TX ID:', data.txId);
      return data;
    },
  });
}

/**
 * Get current STX price from oracle
 * @param {string} senderAddress - Address to call from
 */
async function getStxPrice(senderAddress) {
  const [contractAddress, contractName] = ARKADIKO_CONTRACTS.oracle.split('.');
  
  const result = await callReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: 'get-price',
    functionArgs: [clarityHelpers.toAscii('STX')],
    senderAddress,
  });
  
  return result;
}

/**
 * Example: Complete user flow
 */
async function exampleUserFlow() {
  try {
    // Step 1: Connect wallet
    console.log('Step 1: Connecting wallet...');
    const { userAddress, userData } = await connectWallet({
      appName: 'Arkadiko Protocol',
      appIconUrl: 'https://arkadiko.finance/favicon.ico',
    });
    console.log('Connected:', userAddress);

    // Step 2: Check STX price
    console.log('\nStep 2: Checking STX price...');
    const stxPrice = await getStxPrice(userAddress);
    console.log('STX Price:', stxPrice);

    // Step 3: Open a vault with 1000 STX collateral, mint 500 USDA
    console.log('\nStep 3: Opening vault...');
    const vaultTx = await openVault({
      collateralAmount: 1000000000, // 1000 STX in microSTX
      debtAmount: 500000000, // 500 USDA
      userAddress,
    });
    console.log('Vault created:', vaultTx.txId);

    // Step 4: Check vault details
    console.log('\nStep 4: Fetching vault details...');
    const vaultDetails = await getUserVault(userAddress, 1);
    console.log('Vault details:', vaultDetails);

    return {
      userAddress,
      vaultTx,
      vaultDetails,
    };
  } catch (error) {
    console.error('Error in user flow:', error.message);
    throw error;
  }
}

module.exports = {
  // Existing export for DefiLlama TVL
  stacks: {
    tvl,
  },
  
  // New wallet interaction functions
  wallet: {
    connectWallet,
    getUserVault,
    openVault,
    depositCollateral,
    swapTokens,
    getStxPrice,
    exampleUserFlow,
  },
  
  // Constants
  ARKADIKO_CONTRACTS,
};
