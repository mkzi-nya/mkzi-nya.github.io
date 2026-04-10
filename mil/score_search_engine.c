#include <stdint.h>
#include <stddef.h>

#ifdef __wasm__
#define EXPORT __attribute__((visibility("default")))
#else
#define EXPORT
#endif

extern unsigned char __heap_base;

static uint32_t g_heap_base = 0;
static uint32_t g_perm_ptr = 0;
static uint32_t g_temp_ptr = 0;

static inline uint32_t align8(uint32_t x) { return (x + 7u) & ~7u; }
static inline int imin(int a, int b) { return a < b ? a : b; }
static inline int imax(int a, int b) { return a > b ? a : b; }

void *memset(void *dst, int v, size_t n) {
    unsigned char *d = (unsigned char*)dst;
    for (size_t i = 0; i < n; ++i) d[i] = (unsigned char)v;
    return dst;
}

void *memcpy(void *dst, const void *src, size_t n) {
    unsigned char *d = (unsigned char*)dst;
    const unsigned char *s = (const unsigned char*)src;
    for (size_t i = 0; i < n; ++i) d[i] = s[i];
    return dst;
}

static inline void heap_init(void) {
    if (g_heap_base == 0) {
        g_heap_base = (uint32_t)(uintptr_t)&__heap_base;
        g_perm_ptr = g_heap_base;
        g_temp_ptr = g_heap_base;
    }
}

#ifdef __wasm__
static inline uint32_t memory_size_bytes(void) {
    return (uint32_t)__builtin_wasm_memory_size(0) * 65536u;
}

static int ensure_capacity(uint32_t need_end) {
    uint32_t cur = memory_size_bytes();
    if (need_end <= cur) return 1;
    uint32_t extra = need_end - cur;
    uint32_t pages = (extra + 65535u) >> 16;
    int r = __builtin_wasm_memory_grow(0, (int)pages);
    return r >= 0;
}
#else
static inline uint32_t memory_size_bytes(void) { return 0xffffffffu; }
static int ensure_capacity(uint32_t need_end) { (void)need_end; return 1; }
#endif

static int alloc_range(uint32_t *ptr, uint32_t size, uint32_t *out) {
    heap_init();
    uint32_t p = align8(*ptr);
    uint32_t end = p + align8(size);
    if (end < p) return 0;
    if (!ensure_capacity(end + 8u)) return 0;
    *ptr = end;
    *out = p;
    return 1;
}

static int perm_alloc(uint32_t size, uint32_t *out) {
    if (!alloc_range(&g_perm_ptr, size, out)) return 0;
    if (g_temp_ptr < g_perm_ptr) g_temp_ptr = g_perm_ptr;
    return 1;
}

EXPORT void temp_reset(void) {
    heap_init();
    g_temp_ptr = g_perm_ptr;
}

EXPORT int temp_alloc(int size) {
    uint32_t out = 0;
    if (size < 0) return 0;
    if (!alloc_range(&g_temp_ptr, (uint32_t)size, &out)) return 0;
    return (int)out;
}

static void reset_search_heap(void) {
    heap_init();
    g_perm_ptr = g_heap_base;
    g_temp_ptr = g_perm_ptr;
}

// ==================== score core ====================

typedef struct {
    int noteAmount;
    int bMax;
    int gCap;
    int nCap;
    int bCap;
    int mCap;
} ScoreConfig;

static inline ScoreConfig make_cfg(int noteAmount) {
    ScoreConfig c;
    c.noteAmount = noteAmount;
    c.bMax = imin(192, imax((noteAmount * 12) / 50, 1));
    c.gCap = imin(128, imax((noteAmount * 8) / 50, 1));
    c.nCap = imin(96,  imax((noteAmount * 6) / 50, 1));
    c.bCap = imin(64,  imax((noteAmount * 5) / 50, 1));
    c.mCap = imin(64,  imax((noteAmount * 4) / 50, 1));
    return c;
}

typedef struct {
    int pos;
    int64_t acc;
    double comboSum;
    int currScore;
    int currCombo;
    int maxCombo;
    int allEP;
    unsigned char prevChar;
} SearchState;

static inline int64_t run_acc(unsigned char c, int len) {
    switch (c) {
        case 'e': return 1000000LL * len;
        case 'p': return  990000LL * len;
        case 'g': return  600000LL * len;
        case 'n': return  300000LL * len;
        case 'b': return  150000LL * len;
        default:  return 0;
    }
}

static inline double combo_future_all_e(int currScore, int rem, int bMax) {
    if (rem <= 0) return 0.0;
    if (currScore >= bMax) return (double)rem * (double)bMax;
    int u = (bMax - 1 - currScore) >> 1;
    if (u < 0) u = 0;
    if (u > rem) u = rem;
    double sum = 0.0;
    if (u) sum += (double)u * (double)(2 * (currScore + 2) + (u - 1) * 2) * 0.5;
    sum += (double)(rem - u) * (double)bMax;
    return sum;
}

static inline int calc_final_from_totals(const ScoreConfig* cfg, int64_t acc, double comboSum, int maxCombo, int apBonus, int currScore, int applyTail) {
    if (applyTail && currScore < cfg->bMax) {
        const double x = (double)(cfg->bMax - currScore - 1);
        comboSum += (1.0 - x * x) * 0.25;
        if (comboSum < 0.0) comboSum = 0.0;
    }
    const double accScore = (double)acc / (double)cfg->noteAmount;
    const double comboMult = comboSum / ((double)cfg->noteAmount * (double)cfg->bMax);
    const double comboBonus = 5000.0 * (double)maxCombo / (double)cfg->noteAmount;
    return (int)(accScore * (0.4 + 0.6 * comboMult)) + (int)comboBonus + apBonus;
}

static inline void apply_run(const ScoreConfig* cfg, const SearchState* in, unsigned char c, int len, SearchState* out) {
    *out = *in;
    out->pos += len;
    out->acc += run_acc(c, len);
    out->prevChar = c;

    switch (c) {
        case 'e': {
            out->currCombo += len;
            if (out->currCombo > out->maxCombo) out->maxCombo = out->currCombo;
            if (out->currScore < cfg->bMax) {
                int u = (cfg->bMax - 1 - out->currScore) >> 1;
                if (u < 0) u = 0;
                if (u > len) u = len;
                if (u) out->comboSum += (double)u * (double)(2 * (out->currScore + 2) + (u - 1) * 2) * 0.5;
                out->comboSum += (double)(len - u) * (double)cfg->bMax;
            } else {
                out->comboSum += (double)len * (double)cfg->bMax;
            }
            {
                int t = out->currScore + (len << 1);
                out->currScore = t < cfg->bMax ? t : cfg->bMax;
            }
            break;
        }
        case 'p': {
            out->currCombo += len;
            if (out->currCombo > out->maxCombo) out->maxCombo = out->currCombo;
            if (out->currScore < cfg->bMax) {
                int u = cfg->bMax - 1 - out->currScore;
                if (u < 0) u = 0;
                if (u > len) u = len;
                if (u) out->comboSum += (double)u * (double)(2 * (out->currScore + 1) + (u - 1)) * 0.5;
                out->comboSum += (double)(len - u) * (double)cfg->bMax;
            } else {
                out->comboSum += (double)len * (double)cfg->bMax;
            }
            {
                int t = out->currScore + len;
                out->currScore = t < cfg->bMax ? t : cfg->bMax;
            }
            break;
        }
        case 'g':
            out->currCombo += len;
            if (out->currCombo > out->maxCombo) out->maxCombo = out->currCombo;
            if (out->currScore > cfg->gCap) out->currScore = cfg->gCap;
            out->comboSum += (double)len * (double)out->currScore;
            out->allEP = 0;
            break;
        case 'n':
            out->currCombo += len;
            if (out->currCombo > out->maxCombo) out->maxCombo = out->currCombo;
            if (out->currScore > cfg->nCap) out->currScore = cfg->nCap;
            out->comboSum += (double)len * (double)out->currScore;
            out->allEP = 0;
            break;
        case 'b':
            out->currCombo = 0;
            if (out->currScore > cfg->bCap) out->currScore = cfg->bCap;
            out->comboSum += (double)len * (double)out->currScore;
            out->allEP = 0;
            break;
        case 'm':
            out->currCombo = 0;
            if (out->currScore > cfg->mCap) out->currScore = cfg->mCap;
            out->comboSum += (double)len * (double)out->currScore;
            out->allEP = 0;
            break;
    }
}

EXPORT int calculate_score(const unsigned char* s, int len) {
    if (len <= 0) return 0;
    const ScoreConfig cfg = make_cfg(len);

    SearchState st;
    st.pos = 0;
    st.acc = 0;
    st.comboSum = 0.0;
    st.currScore = cfg.bMax;
    st.currCombo = 0;
    st.maxCombo = 0;
    st.allEP = 1;
    st.prevChar = 0;

    int i = 0;
    while (i < len) {
        unsigned char c = (unsigned char)(s[i] | 32u);
        int j = i + 1;
        while (j < len && ((unsigned char)(s[j] | 32u)) == c) ++j;
        int run = j - i;
        switch (c) {
            case 'e': case 'p': case 'g': case 'n': case 'b': case 'm': {
                SearchState next;
                apply_run(&cfg, &st, c, run, &next);
                st = next;
                break;
            }
            default:
                return -1;
        }
        i = j;
    }

    return calc_final_from_totals(&cfg, st.acc, st.comboSum, st.maxCombo, st.allEP ? 5000 : 0, st.currScore, 1);
}

// ==================== search engine ====================

static const unsigned char kChars[6] = { 'e', 'p', 'g', 'n', 'b', 'm' };

static ScoreConfig g_cfg;
static int g_target = 0;
static int g_running = 0;
static int g_done = 0;
static int g_depth = 0;
static double g_visited = 0.0;
static double g_root_total = 0.0;

static SearchState* g_frames = 0;
static unsigned char* g_seg_char = 0;
static int* g_seg_len = 0;
static int* g_next_char_idx = 0;
static int* g_next_len = 0;
static unsigned char* g_result_seq = 0;
static int g_result_len = 0;

static inline int score_lower_bound(const ScoreConfig* cfg, const SearchState* st) {
    const double accScore = (double)st->acc / (double)cfg->noteAmount;
    const double comboBonus = 5000.0 * (double)st->maxCombo / (double)cfg->noteAmount;
    return (int)(accScore * 0.4) + (int)comboBonus;
}

static inline int score_upper_bound(const ScoreConfig* cfg, const SearchState* st) {
    const int rem = cfg->noteAmount - st->pos;
    const int64_t acc = st->acc + 1000000LL * rem;
    const double combo = st->comboSum + combo_future_all_e(st->currScore, rem, cfg->bMax) + 0.25;
    const int maxCombo = imax(st->maxCombo, st->currCombo + rem);
    const int apBonus = st->allEP ? 5000 : 0;
    const double accScore = (double)acc / (double)cfg->noteAmount;
    const double comboMult = combo / ((double)cfg->noteAmount * (double)cfg->bMax);
    const double comboBonus = 5000.0 * (double)maxCombo / (double)cfg->noteAmount;
    return (int)(accScore * (0.4 + 0.6 * comboMult)) + (int)comboBonus + apBonus;
}

static inline double root_progress_estimate(void) {
    const int N = g_cfg.noteAmount;
    if (N <= 0) return 0.0;
    int charIdx = g_next_char_idx[0];
    int nextLen = g_next_len[0];
    if (charIdx < 0) charIdx = 0;
    if (charIdx > 6) charIdx = 6;
    int doneInChar = N - nextLen;
    if (doneInChar < 0) doneInChar = 0;
    if (doneInChar > N) doneInChar = N;
    return (double)charIdx * (double)N + (double)doneInChar;
}

static void serialize_current_result(void) {
    int p = 0;
    for (int d = 1; d <= g_depth; ++d) {
        unsigned char c = g_seg_char[d];
        int len = g_seg_len[d];
        for (int k = 0; k < len; ++k) g_result_seq[p++] = c;
    }
    g_result_seq[p] = 0;
    g_result_len = p;
}

static void backtrack_once(void) {
    if (g_depth > 0) {
        --g_depth;
    } else {
        g_done = 1;
        g_running = 0;
    }
}

EXPORT int search_init(int noteCount, int targetScore) {
    if (noteCount <= 0) return -1;

    reset_search_heap();

    uint32_t p = 0;
    if (!perm_alloc((uint32_t)(noteCount + 1) * (uint32_t)sizeof(SearchState), &p)) return -2;
    g_frames = (SearchState*)(uintptr_t)p;

    if (!perm_alloc((uint32_t)(noteCount + 1), &p)) return -2;
    g_seg_char = (unsigned char*)(uintptr_t)p;

    if (!perm_alloc((uint32_t)(noteCount + 1) * (uint32_t)sizeof(int), &p)) return -2;
    g_seg_len = (int*)(uintptr_t)p;

    if (!perm_alloc((uint32_t)(noteCount + 1) * (uint32_t)sizeof(int), &p)) return -2;
    g_next_char_idx = (int*)(uintptr_t)p;

    if (!perm_alloc((uint32_t)(noteCount + 1) * (uint32_t)sizeof(int), &p)) return -2;
    g_next_len = (int*)(uintptr_t)p;

    if (!perm_alloc((uint32_t)(noteCount + 1), &p)) return -2;
    g_result_seq = (unsigned char*)(uintptr_t)p;

    g_cfg = make_cfg(noteCount);
    g_target = targetScore;
    g_running = 1;
    g_done = 0;
    g_depth = 0;
    g_visited = 0.0;
    g_root_total = 6.0 * (double)noteCount;
    g_result_len = 0;

    g_frames[0].pos = 0;
    g_frames[0].acc = 0;
    g_frames[0].comboSum = 0.0;
    g_frames[0].currScore = g_cfg.bMax;
    g_frames[0].currCombo = 0;
    g_frames[0].maxCombo = 0;
    g_frames[0].allEP = 1;
    g_frames[0].prevChar = 0;
    g_next_char_idx[0] = 0;
    g_next_len[0] = noteCount;
    return 0;
}

EXPORT int search_step(int budget) {
    if (!g_running) return g_done ? 2 : -1;
    if (budget <= 0) budget = 1;

    while (budget-- > 0) {
        SearchState* cur = &g_frames[g_depth];

        if (cur->pos == g_cfg.noteAmount) {
            int score = calc_final_from_totals(&g_cfg, cur->acc, cur->comboSum, cur->maxCombo, cur->allEP ? 5000 : 0, cur->currScore, 1);
            if (score == g_target) {
                serialize_current_result();
                backtrack_once();
                return 1;
            }
            backtrack_once();
            if (g_done) return 2;
            continue;
        }

        const int rem = g_cfg.noteAmount - cur->pos;
        int advanced = 0;

        while (g_next_char_idx[g_depth] < 6) {
            unsigned char c = kChars[g_next_char_idx[g_depth]];

            if (c == cur->prevChar) {
                ++g_next_char_idx[g_depth];
                g_next_len[g_depth] = rem;
                continue;
            }

            if (cur->currScore == g_cfg.bMax && cur->prevChar == 'p' && c == 'e') {
                ++g_next_char_idx[g_depth];
                g_next_len[g_depth] = rem;
                continue;
            }

            if (g_next_len[g_depth] <= 0) {
                ++g_next_char_idx[g_depth];
                g_next_len[g_depth] = rem;
                continue;
            }

            const int len = g_next_len[g_depth]--;
            g_visited += 1.0;

            SearchState child;
            apply_run(&g_cfg, cur, c, len, &child);

            const int lb = score_lower_bound(&g_cfg, &child);
            if (g_target < lb) continue;
            const int ub = score_upper_bound(&g_cfg, &child);
            if (g_target > ub) continue;

            int nd = g_depth + 1;
            g_frames[nd] = child;
            g_seg_char[nd] = c;
            g_seg_len[nd] = len;
            g_next_char_idx[nd] = 0;
            g_next_len[nd] = g_cfg.noteAmount - child.pos;
            g_depth = nd;
            advanced = 1;
            break;
        }

        if (advanced) continue;

        backtrack_once();
        if (g_done) return 2;
    }

    return 0;
}

EXPORT int search_get_result_ptr(void) { return (int)(uintptr_t)g_result_seq; }
EXPORT int search_get_result_len(void) { return g_result_len; }
EXPORT int search_get_done(void) { return g_done; }
EXPORT int search_get_depth(void) { return g_depth; }
EXPORT double search_get_root_done(void) { return root_progress_estimate(); }
EXPORT double search_get_root_total(void) { return g_root_total; }
EXPORT double search_get_visited(void) { return g_visited; }
