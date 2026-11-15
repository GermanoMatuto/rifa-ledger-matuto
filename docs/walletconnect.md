# WalletConnect

The separate WalletConnect project “Investidor Matuto — Checkout” is allowlisted for https://rifa-ledger-matuto.vercel.app. Its public Project ID is supplied as VITE_WALLETCONNECT_PROJECT_ID at build time. No private keys or seed phrases are collected.

The official Universal Provider SDK is loaded only after the visitor clicks WalletConnect. A local QR encodes the temporary pairing URI; it is distinct from the address-only payment QR. On the same phone the visitor can copy the pairing URI into the wallet's WalletConnect flow. Connecting does not transfer funds.

Only BNB Smart Chain (eip155:56), personal_sign, and eth_sendTransaction are requested. The existing server-issued signed order challenge and direct USDT transfer are used unchanged. No token allowance, permit, raw transaction or arbitrary signing method is requested. The adapter restricts all requests to the approved chain and checks the current session accounts. Declining or cancelling leaves the external-payment option available.

“Escolher outra carteira” disconnects the remote session. Reloading does not automatically reconnect or open wallet requests: the SDK is initialized after another explicit click, at which point a previously approved session can be reused. Pending transaction hashes and uncertain broadcast guards remain in place. Final payment verification is server-side and the existing review requirement remains.

The connection QR is tested against the live relay without moving funds. Actual wallet approval and a real USDT transfer require a user's wallet and are separate from mocked transaction tests. The regular raffle sales switch remains closed.
