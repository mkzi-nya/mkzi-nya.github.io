export async function createScoreEngine(wasmUrl = new URL('./score_search_engine.wasm', import.meta.url)) {
  const response = await fetch(wasmUrl);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const ex = instance.exports;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function calculateScore(input) {
    const bytes = encoder.encode(String(input));
    ex.temp_reset();
    const ptr = ex.temp_alloc(bytes.length);
    if (!ptr) throw new Error('WASM 临时内存分配失败');
    new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
    return ex.calculate_score(ptr, bytes.length) | 0;
  }

  function createSearcher(noteCount, targetScore) {
    const rc = ex.search_init(noteCount | 0, targetScore | 0);
    if (rc !== 0) {
      throw new Error(rc === -1 ? '物量必须大于 0' : 'WASM 搜索内存分配失败');
    }
    return {
      step(nodeBudget = 20000) {
        const status = ex.search_step(nodeBudget | 0) | 0;
        const result = status === 1
          ? decoder.decode(new Uint8Array(ex.memory.buffer, ex.search_get_result_ptr(), ex.search_get_result_len()))
          : null;
        return {
          status,
          result,
          done: status === 2,
          visited: Number(ex.search_get_visited()),
          depth: ex.search_get_depth() | 0,
          rootDone: Number(ex.search_get_root_done()),
          rootTotal: Number(ex.search_get_root_total()),
        };
      },
      stats() {
        return {
          visited: Number(ex.search_get_visited()),
          depth: ex.search_get_depth() | 0,
          rootDone: Number(ex.search_get_root_done()),
          rootTotal: Number(ex.search_get_root_total()),
        };
      }
    };
  }

  return { calculateScore, createSearcher, exports: ex };
}
