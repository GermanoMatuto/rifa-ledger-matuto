# WalletConnect

The separate WalletConnect project “Investidor Matuto — Checkout” is allowlisted for https://rifa-ledger-matuto.vercel.app. Its public Project ID is supplied as VITE_WALLETCONNECT_PROJECT_ID at build time. No private keys or seed phrases are collected.

The official Universal Provider SDK is loaded only after the visitor clicks WalletConnect. A local QR encodes the temporary pairing URI; it is distinct from the address-only payment QR. On the same phone the visitor can copy the pairing URI into the wallet's WalletConnect flow. Connecting does not transfer funds.

Only BNB Smart Chain (eip155:56), personal_sign, and eth_sendTransaction are requested. The existing server-issued signed order challenge and direct USDT transfer are used unchanged. No token allowance, permit, raw transaction or arbitrary signing method is requested. The adapter restricts all requests to the approved chain and checks the current session accounts. Declining or cancelling leaves the external-payment option available.

“Escolher outra carteira” disconnects the remote session. Reloading does not automatically reconnect or open wallet requests: the SDK is initialized after another explicit click, at which point a previously approved session can be reused. Pending transaction hashes and uncertain broadcast guards remain in place. Final payment verification is server-side and the existing review requirement remains.

The connection QR is tested against the live relay without moving funds. Actual wallet approval and a real USDT transfer require a user's wallet and are separate from mocked transaction tests. The regular raffle sales switch remains closed. Confirmation and receipt delivery are described in [administracao-e-recibos.md](administracao-e-recibos.md): valid signed-wallet payments are now approved automatically; exceptions remain in review.

## Checkout interaction

The wallet option is selected by default, alongside a visible external-transfer alternative. A single “Conectar carteira” button opens a native dialog listing WalletConnect and discovered browser wallets. The dialog supports Escape, keyboard focus containment and return to the opener. No wallet or relay request is started merely by displaying the dialog. The visitor explicitly selects a connection method first.

The summary is compact, with the total and network always visible. Order identifiers, contract address and explanatory text are in expandable details. No payment-validation or ownership-review requirement was relaxed.

Design references: [RainbowKit ConnectButton](https://rainbowkit.com/en-US/docs/connect-button), [RainbowKit modal hooks](https://rainbowkit.com/en-US/docs/modal-hooks), [Stripe stablecoin payment flow](https://docs.stripe.com/payments/stablecoin-payments), [Reown checkout UX](https://reown.com/blog/ux-roundup-june-2025). These are interaction references, not integrations or endorsements.
