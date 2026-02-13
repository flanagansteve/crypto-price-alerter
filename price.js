const { ethers } = require('ethers');

const ETH_RPC_URL = process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';
const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const FEE_TIERS = [3000, 500, 10000, 100];

const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);

const ERC20_ABI = ['function decimals() view returns (uint8)'];

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
];

const quoter = new ethers.Contract(QUOTER_V2, QUOTER_ABI, provider);

// --- Solana (Jupiter + DexScreener fallback) ---

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

async function getJupiterPrices(mintAddresses) {
  if (!JUPITER_API_KEY) return {};
  const ids = mintAddresses.join(',');
  const url = `https://api.jup.ag/price/v3?ids=${ids}`;
  const res = await fetch(url, {
    headers: { 'x-api-key': JUPITER_API_KEY },
  });
  if (!res.ok) throw new Error(`Jupiter API error: ${res.status}`);
  const json = await res.json();
  const prices = {};
  for (const mint of mintAddresses) {
    const entry = json.data?.[mint];
    if (entry && entry.price != null) {
      prices[mint] = parseFloat(entry.price);
    }
  }
  return prices;
}

async function getDexScreenerPrice(tokenAddress) {
  const url = `https://api.dexscreener.com/tokens/v1/solana/${tokenAddress}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const pairs = await res.json();
  if (!Array.isArray(pairs) || pairs.length === 0) return null;
  // Use the pair with the highest liquidity
  const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
  return best.priceUsd ? parseFloat(best.priceUsd) : null;
}

async function getSolanaPrices(mintAddresses) {
  if (mintAddresses.length === 0) return {};

  let prices = {};

  // Try Jupiter first
  try {
    prices = await getJupiterPrices(mintAddresses);
  } catch (err) {
    console.warn('[price] Jupiter API failed, falling back to DexScreener:', err.message);
  }

  // Fall back to DexScreener for any tokens Jupiter couldn't price
  const missing = mintAddresses.filter((m) => prices[m] == null);
  for (const mint of missing) {
    try {
      const price = await getDexScreenerPrice(mint);
      if (price != null) {
        prices[mint] = price;
        console.log(`[price] DexScreener fallback for ${mint}: $${price}`);
      }
    } catch (err) {
      console.warn(`[price] DexScreener fallback failed for ${mint}:`, err.message);
    }
  }

  return prices;
}

// --- Ethereum (Uniswap V3 QuoterV2) ---

async function getTokenDecimals(tokenAddress) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return await token.decimals();
}

async function tryDirectQuote(tokenAddress, amountIn, fee) {
  try {
    const result = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: tokenAddress,
      tokenOut: USDC,
      amountIn,
      fee,
      sqrtPriceLimitX96: 0,
    });
    return result.amountOut;
  } catch {
    return null;
  }
}

async function tryMultiHopQuote(tokenAddress, amountIn, feeIn, feeOut) {
  try {
    const path = ethers.solidityPacked(
      ['address', 'uint24', 'address', 'uint24', 'address'],
      [tokenAddress, feeIn, WETH, feeOut, USDC]
    );
    const result = await quoter.quoteExactInput.staticCall(path, amountIn);
    return result.amountOut;
  } catch {
    return null;
  }
}

async function getEthereumPrice(tokenAddress) {
  const decimals = await getTokenDecimals(tokenAddress);
  const amountIn = ethers.parseUnits('1', decimals);

  // Try direct token → USDC across fee tiers
  for (const fee of FEE_TIERS) {
    const amountOut = await tryDirectQuote(tokenAddress, amountIn, fee);
    if (amountOut) {
      return Number(amountOut) / 1e6;
    }
  }

  // Fallback: token → WETH → USDC multi-hop
  for (const feeIn of FEE_TIERS) {
    for (const feeOut of FEE_TIERS) {
      const amountOut = await tryMultiHopQuote(tokenAddress, amountIn, feeIn, feeOut);
      if (amountOut) {
        return Number(amountOut) / 1e6;
      }
    }
  }

  return null;
}

module.exports = { getSolanaPrices, getEthereumPrice };
