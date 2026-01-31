/**
 * Stacks Connect - Wallet Integration Helper
 * 
 * This module provides utilities for connecting to Stacks wallets
 * and interacting with the Stacks blockchain through user wallets.
 * 
 * @requires @stacks/connect
 * @requires @stacks/transactions
 * @requires @stacks/network
 */

const { showConnect, openContractCall, openSTXTransfer } = require('@stacks/connect');
const { 
  uintCV, 
  intCV, 
  bufferCV, 
  stringAsciiCV, 
  stringUtf8CV,
  standardPrincipalCV,
  contractPrincipalCV,
  PostConditionMode,
  makeStandardSTXPostCondition,
  FungibleConditionCode,
  makeContractSTXPostCondition,
} = require('@stacks/transactions');
const { StacksMainnet, StacksTestnet } = require('@stacks/network');

/**
 * Initialize Stacks Connect with app configuration
 * @param {Object} config - App configuration
 * @param {string} config.appName - Name of your application
 * @param {string} config.appIconUrl - URL to app icon
 * @returns {Promise<Object>} User data after connection
 */
async function connectWallet({ 
  appName = 'DefiLlama Adapter',
  appIconUrl = 'https://defillama.com/favicon.ico'
} = {}) {
  return new Promise((resolve, reject) => {
    showConnect({
      appDetails: {
        name: appName,
        icon: appIconUrl,
      },
      onFinish: (data) => {
        resolve({
          userAddress: data.userSession.loadUserData().profile.stxAddress.mainnet,
          userData: data.userSession.loadUserData(),
        });
      },
      onCancel: () => {
        reject(new Error('User cancelled wallet connection'));
      },
      userSession: null, // Optional: pass existing UserSession
    });
  });
}

/**
 * Call a read-only contract function
 * @param {Object} params
 * @param {string} params.contractAddress - Contract address
 * @param {string} params.contractName - Contract name
 * @param {string} params.functionName - Function name to call
 * @param {Array} params.functionArgs - Function arguments
 * @param {string} params.senderAddress - Sender address
 * @param {boolean} params.testnet - Use testnet (default: false)
 */
async function callReadOnlyFunction({
  contractAddress,
  contractName,
  functionName,
  functionArgs = [],
  senderAddress,
  testnet = false
}) {
  const { fetchCallReadOnlyFunction } = require('@stacks/transactions');
  const network = testnet ? new StacksTestnet() : new StacksMainnet();

  const result = await fetchCallReadOnlyFunction({
    network,
    contractAddress,
    contractName,
    functionName,
    functionArgs,
    senderAddress,
  });

  return result;
}

/**
 * Execute a contract call through user's wallet
 * @param {Object} params
 * @param {string} params.contractAddress - Contract address
 * @param {string} params.contractName - Contract name  
 * @param {string} params.functionName - Function to call
 * @param {Array} params.functionArgs - Function arguments as Clarity values
 * @param {Array} params.postConditions - Post conditions for the transaction
 * @param {boolean} params.testnet - Use testnet (default: false)
 * @param {Function} params.onFinish - Callback when transaction is broadcast
 * @param {Function} params.onCancel - Callback when user cancels
 */
async function executeContractCall({
  contractAddress,
  contractName,
  functionName,
  functionArgs = [],
  postConditions = [],
  testnet = false,
  onFinish,
  onCancel,
}) {
  const network = testnet ? new StacksTestnet() : new StacksMainnet();

  return new Promise((resolve, reject) => {
    openContractCall({
      network,
      contractAddress,
      contractName,
      functionName,
      functionArgs,
      postConditions,
      postConditionMode: PostConditionMode.Deny, // Strict mode
      onFinish: (data) => {
        if (onFinish) onFinish(data);
        resolve({
          txId: data.txId,
          txRaw: data.txRaw,
        });
      },
      onCancel: () => {
        if (onCancel) onCancel();
        reject(new Error('User cancelled transaction'));
      },
    });
  });
}

/**
 * Transfer STX tokens through user's wallet
 * @param {Object} params
 * @param {string} params.recipient - Recipient address
 * @param {string|number} params.amount - Amount in microSTX
 * @param {string} params.memo - Optional memo
 * @param {boolean} params.testnet - Use testnet (default: false)
 */
async function transferSTX({
  recipient,
  amount,
  memo = '',
  testnet = false,
  onFinish,
  onCancel,
}) {
  const network = testnet ? new StacksTestnet() : new StacksMainnet();

  return new Promise((resolve, reject) => {
    openSTXTransfer({
      network,
      recipient,
      amount: amount.toString(),
      memo,
      onFinish: (data) => {
        if (onFinish) onFinish(data);
        resolve({
          txId: data.txId,
          txRaw: data.txRaw,
        });
      },
      onCancel: () => {
        if (onCancel) onCancel();
        reject(new Error('User cancelled STX transfer'));
      },
    });
  });
}

/**
 * Example: Swap tokens on a DEX
 * This demonstrates a typical DeFi interaction pattern
 */
async function exampleSwapTokens({
  dexContract,
  tokenIn,
  tokenOut,
  amountIn,
  minAmountOut,
  userAddress,
}) {
  const [contractAddress, contractName] = dexContract.split('.');

  // Create post-condition to ensure token safety
  const postConditions = [
    makeStandardSTXPostCondition(
      userAddress,
      FungibleConditionCode.LessEqual,
      amountIn
    ),
  ];

  // Execute the swap
  return executeContractCall({
    contractAddress,
    contractName,
    functionName: 'swap',
    functionArgs: [
      contractPrincipalCV(tokenIn.split('.')[0], tokenIn.split('.')[1]),
      contractPrincipalCV(tokenOut.split('.')[0], tokenOut.split('.')[1]),
      uintCV(amountIn),
      uintCV(minAmountOut),
    ],
    postConditions,
    onFinish: (data) => {
      console.log('Swap successful!', data.txId);
    },
    onCancel: () => {
      console.log('Swap cancelled by user');
    },
  });
}

// Clarity value helper functions
const clarityHelpers = {
  /**
   * Convert JavaScript values to Clarity values
   */
  toUint: (value) => uintCV(value),
  toInt: (value) => intCV(value),
  toString: (value) => stringUtf8CV(value),
  toAscii: (value) => stringAsciiCV(value),
  toBuffer: (value) => bufferCV(Buffer.from(value)),
  toPrincipal: (address) => standardPrincipalCV(address),
  toContract: (address, name) => contractPrincipalCV(address, name),
};

module.exports = {
  connectWallet,
  callReadOnlyFunction,
  executeContractCall,
  transferSTX,
  exampleSwapTokens,
  clarityHelpers,
  
  // Re-export commonly used functions from @stacks/connect
  showConnect,
  openContractCall,
  openSTXTransfer,
  
  // Re-export Clarity value constructors
  uintCV,
  intCV,
  bufferCV,
  stringAsciiCV,
  stringUtf8CV,
  standardPrincipalCV,
  contractPrincipalCV,
  PostConditionMode,
  makeStandardSTXPostCondition,
  FungibleConditionCode,
  makeContractSTXPostCondition,
};
