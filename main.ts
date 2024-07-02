import { ethers, TransactionRequest } from "npm:ethers@6.13.1"
import { delay } from "https://deno.land/std@0.81.0/async/delay.ts"
import { randomNumber } from "https://deno.land/x/random_number@2.0.0/mod.ts"
import process from "node:process"
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts"

load()

const ERC20_ABI = [
	"function balanceOf(address owner) view returns (uint256)",
	"function transfer(address to, uint256 value) returns (bool)",
]

const {
	ERC20_CONTRACT_ADDR,
	EXPLORER_TX_BASE_URL,
	WALLET_PRIVATE_KEY,

	ETH_RPC_HTTP_URL,
	ETH_RPC_WS_URL,

	USDC_AMOUNT = "0.02",

	TRANSFERS_COUNT = "10",

	RECIPIENT_ADDR,
} = process.env

function track(event: Record<string, any>) {
	console.log(
		"\t" + JSON.stringify({ t: new Date().toISOString(), ...event }).replaceAll(
			"\t",
			"",
		),
	)
}

const httpProvider = new ethers.JsonRpcProvider(ETH_RPC_HTTP_URL!)
const wsProvider = new ethers.WebSocketProvider(ETH_RPC_WS_URL!)

const httpProviderOrigin = new URL(ETH_RPC_HTTP_URL!).hostname

const wsProviderOrigin = new URL(ETH_RPC_WS_URL!).hostname

const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY!, httpProvider)

console.log("Wallet address:", wallet.address)

/**
 * Manually build and broadcast transaction.
 * We do it to seperate all necessary RPC calls to sign a transaction
 * in order to be able to measure how long each step takes.
 */
async function broadcastUSDC_lowlevel(
	wallet: ethers.Wallet,
	to: string,
	amount: string,
	contractAddress: string,
	provider: ethers.WebSocketProvider | ethers.JsonRpcProvider,
) {
	const network = await provider.getNetwork()
	const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet)

	const value = ethers.parseUnits(amount, 6)
	const data = contract.interface.encodeFunctionData("transfer", [to, value])
	const nonce = await wallet.getNonce()

	const feeData = await provider.getFeeData()
	// const gasLimit = await provider.estimateGas({
	//   to: contractAddress,
	//   data: data,
	// })

	const tx: TransactionRequest = {
		from: wallet.address,
		to: contractAddress,
		nonce: nonce,

		// or gasLimit before EIP 1559
		// gasLimit: gasLimit,

		maxFeePerGas: feeData.maxFeePerGas,
		maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,

		data: data,
		chainId: network.chainId,
	}

	// Herer we ensure population is properly constructed
	const pop = await wallet.populateTransaction(tx)
	delete pop.from

	const txObj = ethers.Transaction.from(pop)
	const signedTx = await wallet.signTransaction(txObj)

	const t = performance.now()
	const txHash = await httpProvider.send("eth_sendRawTransaction", [
		signedTx,
	])

	track({
		e: "Time",
		s: "eth_sendRawTransaction",
		n: performance.now() - t,
		o: httpProviderOrigin,
		txHash,
	})

	return txHash
}

/**
 * Sign and broadcast transaction using ethers
 * that automatically makes all necessary RPC calls
 * to build and broadcast the transaction.
 */
async function broadcastUSDC_highlevel(
	wallet: ethers.Wallet,
	to: string,
	amount: string,
	contractAddress: string,
) {
	const value = ethers.parseUnits(amount, 6)

	const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet)
	const txResponse = await contract.transfer(to, value)

	console.log(`Tx: ${txResponse.hash}`)
	console.log(`Explorer: ${EXPLORER_TX_BASE_URL}/${txResponse.hash}`)

	return txResponse.hash
}

function waitForTransaction(
	wsProvider: ethers.WebSocketProvider,
	txHash: string,
	timeout = 0,
) {
	return new Promise((resolve, reject) => {
		const timeoutId = timeout > 0
			? setTimeout(() => {
				reject(new Error("Timeout"))
			}, timeout)
			: null

		const onBlock = async (blockNumber: number) => {
			const t0 = performance.now()
			const tx = await wsProvider.getTransactionReceipt(txHash)

			track({
				e: "Time",
				s: "getTransactionReceipt",
				n: performance.now() - t0,
				o: wsProviderOrigin,
				blockNumber,
				txHash,
			})

			if (tx && tx.blockNumber) {
				resolve(tx)

				wsProvider.removeListener("block", onBlock)

				timeoutId && clearTimeout(timeoutId)
			}
		}

		wsProvider.on("block", onBlock)
	})
}

async function main() {
	wsProvider.on("block", (blockNumber) => {
		track({
			e: "NewBlock",
			o: wsProviderOrigin,
			blockNumber,
		})
		const t0 = performance.now()

		wsProvider.getBlock(blockNumber).then((block) => {
			track({
				e: "NewBlockData",
				o: wsProviderOrigin,
				blockNumber,
				blockTransactions: block!.transactions,
				blockTimestamp: new Date(block!.timestamp * 1000).toISOString(),
			})

			track({
				e: "Time",
				s: "GetBlock",
				n: t0,
				o: wsProviderOrigin,
				blockNumber,
			})
		})
	})

	// ensure http connection is open
	await httpProvider.getBlockNumber()
	await delay(2000)

	const count = parseInt(TRANSFERS_COUNT)

	for (let i = 0; i < count; i++) {
		const amount = USDC_AMOUNT

		const txHash = await broadcastUSDC_lowlevel(
			wallet,
			RECIPIENT_ADDR,
			amount,
			ERC20_CONTRACT_ADDR,
			httpProvider,
		)

		await waitForTransaction(wsProvider, txHash, 15_000)

		await delay(randomNumber({ min: 0, max: 2_000 }))
	}

	await delay(2000)

	Deno.exit(0)
}

if (import.meta.main) {
	await main()
}
