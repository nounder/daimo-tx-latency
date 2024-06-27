Measure latency from broadcasting a transaction to its inclusion in a block:

```
(broadcast tx) -> (first appeareance of a block) -> (block timestamp)
```

Transaction is sent directly with `eth_sendRawTransaction` RPC call. All related 
calls necessary to make a transaction (gas, block number, nonce) were done
outside of timing window for higher measurement accuracy.


# Configure

```sh
# setup dotenv file
cp .env.example .env

# edit the config according to comments inside
vim .env
```

Make sure you have `deno` and `duckdb` installed

# Usage

```sh
# start broadcasting and tracking transactions
deno run -A main.ts | tee /dev/tty | rg -r '' '\t' > out/events.jsonl

# dump stats
duckdb < events.sql
```

