---
"adamantite": patch
---

Accept the lowercase hex literals that `adamantite fix` writes

The core lint preset no longer enables `unicorn/number-literal-case`. The rule requires uppercase hex digits, such as `0xFF`, and Oxfmt always writes them in lowercase, such as `0xff`. A hex literal now passes both `adamantite fix` and `adamantite check`. Oxfmt still writes the `0x` prefix and the exponent in lowercase.
