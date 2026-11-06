/* Copyright (C) 2026 zm-os contributors. GPL-2.0-or-later.
 * Canvas, keyboard and suspension adapter for doomgeneric. */
#include <emscripten.h>
#include "doomgeneric.h"
#include "doomstat.h"
#include "g_game.h"
#include "doomkeys.h"

static unsigned short keys[256];
static unsigned int read_key, write_key;
static int suspended;
static double paused_at, paused_total;

EMSCRIPTEN_KEEPALIVE void zm_key(int code, int pressed) {
    unsigned int next = (write_key + 1) % 256;
    if (next != read_key) { keys[write_key] = (pressed << 8) | (code & 255); write_key = next; }
}
EMSCRIPTEN_KEEPALIVE void zm_pause(int value) {
    if (value && !suspended) paused_at = emscripten_get_now();
    if (!value && suspended) paused_total += emscripten_get_now() - paused_at;
    suspended = value;
}
EMSCRIPTEN_KEEPALIVE void zm_restart(void) { G_DeferedInitNew(sk_easy, 1, 1); }
void DG_Init(void) {}
void DG_SetWindowTitle(const char *title) { (void)title; }
void DG_SleepMs(uint32_t ms) { (void)ms; }
uint32_t DG_GetTicksMs(void) { return (uint32_t)((suspended ? paused_at : emscripten_get_now()) - paused_total); }
int DG_GetKey(int *pressed, unsigned char *key) {
    if (read_key == write_key) return 0;
    unsigned short value = keys[read_key]; read_key = (read_key + 1) % 256;
    *pressed = value >> 8; *key = value & 255; return 1;
}
EM_JS(void, present, (unsigned int ptr), {
    const canvas = Module.canvas;
    const context = Module.renderContext || (Module.renderContext = canvas.getContext('2d', {alpha:false}));
    const image = Module.frameImage || (Module.frameImage = context.createImageData(320, 200));
    const pixels = HEAPU32.subarray(ptr >>> 2, (ptr >>> 2) + 64000);
    for (let i = 0; i < pixels.length; i++) {
        const rgb = pixels[i], offset = i * 4;
        image.data[offset] = (rgb >>> 16) & 255;
        image.data[offset + 1] = (rgb >>> 8) & 255;
        image.data[offset + 2] = rgb & 255;
        image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
});
void DG_DrawFrame(void) { present((unsigned int)DG_ScreenBuffer); }
static void tick(void) { if (!suspended) doomgeneric_Tick(); }
int main(int argc, char **argv) {
    doomgeneric_Create(argc, argv);
    emscripten_set_main_loop(tick, 35, 1);
    return 0;
}
