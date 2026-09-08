# Compression

Offloading memories saves context and CPU time on the agent side.

## Requesting

Set `cr: true` on `store_memory` (or `update_memory`). The request
cannot be recalled - this prevents interrupted-compression edge
cases.

## Lifecycle

1. Memory stored with `cr: 1`, server writes `cs: 0` (tbd)
2. The background compressor picks it up (checks every minute, up
   to 5 per tick)
3. An OpenAI-compatible endpoint compresses the content - same
   meaning, far fewer tokens
4. The compressed text is stored as a `compressed:` observation
   next to the original (kept as a safety net), `cs` flips to `1`
   (done), logged at debug level

Failures keep `cs: 0` and retry on the next tick.

## Bundled language model

The image ships with `llama-server` (llama.cpp). On first start it
downloads the model file into the data directory and serves it
locally, so no external service is needed:

| Variable         | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| `LLM_ENABLED`    | set `false` to skip the bundled model (default `true`) |
| `LLM_MODEL_URL`  | where to download the GGUF on first start              |
| `LLM_MODEL_PATH` | model file location (default `<DATA_DIR>/model.gguf`)  |
| `LLM_PORT`       | local llama-server port (default `8080`)               |
| `LLM_CONTEXT`    | context size (default `4096`, lower = less RAM)        |
| `LLM_THREADS`    | CPU threads (default `4`)                              |

The bundled model is Qwen2.5-3B-Instruct (4-bit, about 2 GB file,
roughly 2.5 GB RAM with the default context).

## External endpoints

Any OpenAI-compatible API works instead of the bundled model
(ollama, vllm, OpenAI, ...). The default endpoint is the bundled
llama-server at `http://127.0.0.1:8080/v1`.

| Variable                  | Meaning                                |
| ------------------------- | -------------------------------------- |
| `COMPRESSION_ENDPOINT`    | base URL incl. `/v1` (`none` disables) |
| `COMPRESSION_MODEL`       | model name sent with requests          |
| `COMPRESSION_INTERVAL_MS` | tick interval (default 60000)          |
