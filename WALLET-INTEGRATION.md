# Wallet connection dependencies

RainbowKit is loaded only after the visitor chooses to connect. The checkout uses BNB Smart Chain only, does not reconnect automatically, and preserves server-side wallet proof, receipt validation, transaction uniqueness and recovery after an uncertain send.

`@walletconnect/ethereum-provider` is overridden to 2.26.0, with patched `ws` and `decode-uri-component` versions. `cuer` is pinned to the current QR encoder and patched by `scripts/patch-cuer.mjs`: request one padding module and strip it from the raw matrix. This accommodates the encoder's positive-border requirement while preserving cuer's own quiet zone. Installation fails if the patch target changes. The QR regression test decodes the generated matrix back to the WalletConnect URI.

The npm production dependency audit still reports 20 inherited findings (8 moderate, 12 high), chiefly Zod and UUID in wallet SDK dependencies. These are not a clean security audit. Do not blindly force major upgrades: RainbowKit currently requires wagmi 2, and SDKs still depend on Zod 3 APIs. Review compatible upstream fixes before enabling public sales. No seed, private key, unlimited token approval, or payment execution is added by connecting.
